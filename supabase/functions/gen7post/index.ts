const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const V="7.9.14";
function extractSourceBody(script:string):string{const lines=script.split("\n");let inSource=false;const body:string[]=[];for(const line of lines){const cl=line.replace(/\r$/,"");if(!inSource){if(cl.endsWith('source="')){inSource=true;continue;}continue;}if(cl==='"'){break;}body.push(cl);}return body.join("\n").replace(/\\\\/g,'\x00').replace(/\\"/g,'"').replace(/\\\$/g,'$').replace(/\x00/g,'\\');}
function replaceSourceWithFetch(script:string,scriptName:string,sourceType:string,scriptsUrl:string,syncToken:string):string{const lines=script.split("\n");const out:string[]=[];let inSource=false;for(const line of lines){if(!inSource){if(line.endsWith('source="')){inSource=true;out.push(line.replace('source="','source=""'));const tmpFile="ns-install-"+scriptName+".txt";out.push(":local tmpFile \""+tmpFile+"\"");out.push(":log info \"NAVSPOT-"+scriptName.toUpperCase()+"-INSTALL: Baixando body via fetch...\"");out.push(":do {");out.push("/tool fetch url=\""+scriptsUrl+"\" http-method=post http-data=(\"{\\\"mode\\\":\\\"serve\\\",\\\"type\\\":\\\""+sourceType+"\\\",\\\"token\\\":\\\""+syncToken+"\\\"}\") output=file dst-path=$tmpFile");out.push(":delay 2s");out.push(":local srcBody [/file get $tmpFile contents]");out.push("/system script set [find name=\"navspot-"+scriptName+"\"] source=$srcBody");out.push(":do { /file remove $tmpFile } on-error={}");out.push(":log info \"NAVSPOT-"+scriptName.toUpperCase()+"-INSTALL: Body carregado com sucesso\"");out.push("} on-error={");out.push(":log error \"NAVSPOT-"+scriptName.toUpperCase()+"-INSTALL: Falha ao baixar body\"");out.push("}");}else{out.push(line);}}else{if(line==='"'){inSource=false;}}}return out.join("\n");}
Deno.serve(async(req)=>{
if(req.method==="OPTIONS")return new Response(null,{headers:H});
if(req.method!=="POST")return Response.json({error:"Method not allowed"},{status:405,headers:H});
const SU=Deno.env.get("SUPABASE_URL")!,SK=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,AK=Deno.env.get("SUPABASE_ANON_KEY")!;
const rest=async(t:string,p:Record<string,string>)=>{const r=await fetch(SU+"/rest/v1/"+t+"?"+new URLSearchParams(p),{headers:{apikey:SK,Authorization:"Bearer "+SK,Accept:"application/vnd.pgrst.object+json"}});return r.ok?r.json():null};
const tpl=async(id:string,v:Record<string,string>)=>{const t=await rest("script_templates",{id:"eq."+id,select:"content"});if(!t?.content)throw new Error("TPL:"+id);let c:string=t.content;for(const[k,val]of Object.entries(v))c=c.replaceAll(k,val);c=c.replace(/\r\n/g,"\n").replace(/\r/g,"\n");return c};
const vars=(h:any,e:any):Record<string,string>=>{const nb=(h.rede as string).split("/")[0].replace(/\.\d+$/,""),w=h.wan_interface||"ether1",ros=(!h.ros_version||h.ros_version==="auto")?"7":h.ros_version;return{"{{VERSION}}":V,"{{DEPLOYED_AT}}":new Date().toISOString(),"{{WAN_INTERFACE}}":w,"{{WAN_TYPE}}":h.wan_type||"dhcp","{{WAN_CONFIG}}":(h.wan_type||"dhcp")==="dhcp"?"/ip dhcp-client add interface="+w+" disabled=no":"","{{NETWORK_BASE}}":nb,"{{NETWORK_CIDR}}":(h.rede as string).includes("/")?h.rede:h.rede+"/24","{{GATEWAY}}":nb+".1","{{POOL_START}}":nb+".10","{{POOL_END}}":nb+".254","{{EMBARCACAO_NOME}}":e.nome,"{{MIGRATION_COMMANDS}}":"","{{SCRIPTS_URL}}":SU+"/functions/v1/gen7post","{{SYNC_TOKEN}}":h.sync_token,"{{SUPABASE_HOST}}":new URL(SU).hostname,"{{SYNC_URL}}":SU+"/functions/v1/mikrotik-sync","{{RECOVERY_URL}}":SU+"/functions/v1/navspot-recovery","{{API_BASE}}":SU+"/functions/v1","{{SYNC_INTERVAL}}":String(h.sync_interval_minutes||5),"{{ROS_VERSION}}":ros,"{{FETCH_DELAY}}":ros==="7"?"500":"2500","{{WRITE_DELAY}}":ros==="7"?"300":"1500","{{MAX_RETRIES}}":ros==="7"?"1":"3"}};
try{
const body=await req.json();
if(body.mode==="health")return Response.json({version:V,status:"ok"},{headers:H});
if(body.mode==="serve"){
const token=body.token;const type=body.type||"bootstrap";
if(!token)return Response.json({error:"token required"},{status:400,headers:H});
const h=await rest("hotspots",{sync_token:"eq."+token,select:"id,nome,interface_wifi,wan_interface,wan_type,rede,sync_token,sync_interval_minutes,max_usuarios,ros_version,script_versao,embarcacoes!inner(id,nome,empresa_id)"});
if(!h)return new Response("invalid token",{status:404,headers:{...H,"Content-Type":"text/plain"}});
if(body.ros_version)h.ros_version=body.ros_version;
const v=vars(h,h.embarcacoes);
const scriptsUrl=SU+"/functions/v1/gen7post";
  // Source-only types: extract raw script body from template
  if(type==="sync-source"){
  const full=await tpl("sync-standalone",v);
  return new Response(extractSourceBody(full),{headers:{...H,"Content-Type":"text/plain; charset=utf-8"}});
  }
  if(type==="guardian-source"){
  const full=await tpl("guardian-standalone",v);
  return new Response(extractSourceBody(full),{headers:{...H,"Content-Type":"text/plain; charset=utf-8"}});
  }
  // Standalone types: replace source block with fetch-based approach
  if(type==="sync-standalone"){
  const full=await tpl("sync-standalone",v);
  return new Response(replaceSourceWithFetch(full,"sync","sync-source",scriptsUrl,h.sync_token),{headers:{...H,"Content-Type":"text/plain; charset=utf-8"}});
  }
  if(type==="guardian-standalone"){
  const full=await tpl("guardian-standalone",v);
  return new Response(replaceSourceWithFetch(full,"guardian","guardian-source",scriptsUrl,h.sync_token),{headers:{...H,"Content-Type":"text/plain; charset=utf-8"}});
  }
  if(type==="all"){
  const s0=await tpl("infra",v);
  const s1r=await tpl("sync-standalone",v);const s1=replaceSourceWithFetch(s1r,"sync","sync-source",scriptsUrl,h.sync_token);
  const s2r=await tpl("guardian-standalone",v);const s2=replaceSourceWithFetch(s2r,"guardian","guardian-source",scriptsUrl,h.sync_token);
  const s3=await tpl("bootstrap",v);
  return new Response(s0+"\n"+s1+"\n"+s2+"\n"+s3,{headers:{...H,"Content-Type":"text/plain; charset=utf-8"}});
  }
  if(type==="recovery"){
  const s1r=await tpl("sync-standalone",v);const s1=replaceSourceWithFetch(s1r,"sync","sync-source",scriptsUrl,h.sync_token);
  const s2r=await tpl("guardian-standalone",v);const s2=replaceSourceWithFetch(s2r,"guardian","guardian-source",scriptsUrl,h.sync_token);
  return new Response(s1+"\n"+s2,{headers:{...H,"Content-Type":"text/plain; charset=utf-8"}});
  }
const script=await tpl(type,v);
return new Response(script,{headers:{...H,"Content-Type":"text/plain; charset=utf-8"}});
}
// === GENERATE MODE (requires auth) ===
const ah=req.headers.get("Authorization");if(!ah||!ah.startsWith("Bearer "))return Response.json({success:false,error:"Unauthorized"},{status:401,headers:H});
const ur=await fetch(SU+"/auth/v1/user",{headers:{apikey:AK,Authorization:ah}});if(!ur.ok)return Response.json({success:false,error:"Invalid token"},{status:401,headers:H});
const hid=body.hotspot_id;if(!hid)return Response.json({success:false,error:"hotspot_id required"},{status:400,headers:H});
const h=await rest("hotspots",{select:"id,nome,interface_wifi,wan_interface,wan_type,rede,sync_token,sync_interval_minutes,max_usuarios,ros_version,script_versao,embarcacoes!inner(id,nome,empresa_id)",id:"eq."+hid});if(!h)return Response.json({success:false,error:"Hotspot not found"},{status:404,headers:H});
if(!h.sync_token)return Response.json({success:false,error:"sync_token ausente"},{status:400,headers:H});
const v=vars(h,h.embarcacoes);
const scriptsUrl=SU+"/functions/v1/gen7post";
const s0=await tpl("infra",v);
const s1r=await tpl("sync-standalone",v);const s1=replaceSourceWithFetch(s1r,"sync","sync-source",scriptsUrl,h.sync_token);
const s2r=await tpl("guardian-standalone",v);const s2=replaceSourceWithFetch(s2r,"guardian","guardian-source",scriptsUrl,h.sync_token);
const s3=await tpl("bootstrap",v);
const sp=hid+"/"+V,enc=new TextEncoder(),fn=["infra.rsc","sync.rsc","guardian.rsc","bootstrap.rsc"],ss=[s0,s1,s2,s3];
for(let i=0;i<4;i++){const r=await fetch(SU+"/storage/v1/object/hotspot-scripts/"+sp+"/"+fn[i],{method:"PUT",headers:{apikey:SK,Authorization:"Bearer "+SK,"Content-Type":"text/plain; charset=utf-8","x-upsert":"true"},body:enc.encode(ss[i])});if(!r.ok)throw new Error("Upload:"+fn[i])}
const urls:string[]=[];for(const n of fn){const r=await fetch(SU+"/storage/v1/object/sign/hotspot-scripts/"+sp+"/"+n,{method:"POST",headers:{apikey:SK,Authorization:"Bearer "+SK,"Content-Type":"application/json"},body:JSON.stringify({expiresIn:900})});if(!r.ok)throw new Error("Sign:"+n);const d=await r.json();urls.push(SU+"/storage/v1"+d.signedURL)}
await fetch(SU+"/rest/v1/hotspots?id=eq."+hid,{method:"PATCH",headers:{apikey:SK,Authorization:"Bearer "+SK,"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify({scripts_version:V,scripts_generated_at:new Date().toISOString(),scripts_storage_path:sp,script_gerado:s3,script_versao:((h.script_versao as number)||0)+1})});
return Response.json({success:true,version:V,infra_url:urls[0],sync_url:urls[1],guardian_url:urls[2],bootstrap_url:urls[3],expires_in_seconds:900,storage_path:sp},{headers:H});
}catch(e){console.error("[gen7post]",e);return Response.json({success:false,error:e instanceof Error?e.message:"Internal error"},{status:500,headers:H})}
});
