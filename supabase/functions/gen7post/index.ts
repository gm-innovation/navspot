const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const V="7.9.16";

function replaceSourceWithImport(script:string,scriptName:string,rscType:string,scriptsUrl:string,syncToken:string):string{
  const lines=script.split("\n");const out:string[]=[];let inSource=false;
  for(const line of lines){
    if(!inSource){
      if(/^\/system script add name="navspot-/.test(line.trim())&&line.includes('source="')){
        inSource=true;
        const label=scriptName.toUpperCase();
        out.push(`:log info "NAVSPOT-${label}-INSTALL: Baixando ${scriptName}.rsc..."`);
        out.push(`:do {`);
        out.push(`    /tool fetch url="${scriptsUrl}?type=${rscType}&token=${syncToken}" output=file dst-path="navspot-${scriptName}-dl.rsc"`);
        out.push(`    :delay 2s`);
        out.push(`    :do { /system script remove [find name="navspot-${scriptName}"] } on-error={}`);
        out.push(`    /import navspot-${scriptName}-dl.rsc`);
        out.push(`    :do { /file remove "navspot-${scriptName}-dl.rsc" } on-error={}`);
        out.push(`    :log info "NAVSPOT-${label}-INSTALL: ${scriptName}.rsc importado com sucesso"`);
        out.push(`} on-error={`);
        out.push(`    :log error "NAVSPOT-${label}-INSTALL: Falha ao baixar/importar ${scriptName}.rsc"`);
        out.push(`}`);
        continue;
      }
      out.push(line);
    } else {
      // inside source block — skip lines until closing lone "
      if(line.trim()==='"'){inSource=false;}
    }
  }
  return out.join("\n");
}

Deno.serve(async(req)=>{
if(req.method==="OPTIONS")return new Response(null,{headers:H});

const SU=Deno.env.get("SUPABASE_URL")!,SK=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,AK=Deno.env.get("SUPABASE_ANON_KEY")!;
const rest=async(t:string,p:Record<string,string>)=>{const r=await fetch(SU+"/rest/v1/"+t+"?"+new URLSearchParams(p),{headers:{apikey:SK,Authorization:"Bearer "+SK,Accept:"application/vnd.pgrst.object+json"}});return r.ok?r.json():null};
const tpl=async(id:string,v:Record<string,string>)=>{const t=await rest("script_templates",{id:"eq."+id,select:"content"});if(!t?.content)throw new Error("TPL:"+id);let c:string=t.content;c=c.replace(/\r\n/g,"\n").replace(/\r/g,"\n");let inSrc=false;c=c.split("\n").map((l:string)=>{if(!inSrc)l=l.trimStart();if(l.includes('source="'))inSrc=true;if(inSrc&&l.trimStart()==='"')inSrc=false;return l}).join("\n");for(const[k,val]of Object.entries(v))c=c.replaceAll(k,val);return c};
const vars=(h:any,e:any):Record<string,string>=>{const nb=(h.rede as string).split("/")[0].replace(/\.\d+$/,""),w=h.wan_interface||"ether1",ros=(!h.ros_version||h.ros_version==="auto")?"7":h.ros_version;return{"{{VERSION}}":V,"{{DEPLOYED_AT}}":new Date().toISOString(),"{{WAN_INTERFACE}}":w,"{{WAN_TYPE}}":h.wan_type||"dhcp","{{WAN_CONFIG}}":(h.wan_type||"dhcp")==="dhcp"?"/ip dhcp-client add interface="+w+" disabled=no":"","{{NETWORK_BASE}}":nb,"{{NETWORK_CIDR}}":(h.rede as string).includes("/")?h.rede:h.rede+"/24","{{GATEWAY}}":nb+".1","{{POOL_START}}":nb+".10","{{POOL_END}}":nb+".254","{{EMBARCACAO_NOME}}":e.nome,"{{MIGRATION_COMMANDS}}":"","{{SCRIPTS_URL}}":SU+"/functions/v1/gen7post","{{SYNC_TOKEN}}":h.sync_token,"{{SUPABASE_HOST}}":new URL(SU).hostname,"{{SYNC_URL}}":SU+"/functions/v1/mikrotik-sync","{{RECOVERY_URL}}":SU+"/functions/v1/navspot-recovery","{{API_BASE}}":SU+"/functions/v1","{{SYNC_INTERVAL}}":String(h.sync_interval_minutes||5),"{{ROS_VERSION}}":ros,"{{FETCH_DELAY}}":ros==="7"?"500":"2500","{{WRITE_DELAY}}":ros==="7"?"300":"1500","{{MAX_RETRIES}}":ros==="7"?"1":"3"}};

const url=new URL(req.url);

// ─── GET handler: MikroTik /tool fetch downloads .rsc files ───
if(req.method==="GET"){
  const type=url.searchParams.get("type");
  const token=url.searchParams.get("token");
  if(!type||!token)return new Response("missing type or token",{status:400,headers:H});
  try{
    const h=await rest("hotspots",{sync_token:"eq."+token,select:"id,nome,interface_wifi,wan_interface,wan_type,rede,sync_token,sync_interval_minutes,max_usuarios,ros_version,script_versao,embarcacoes!inner(id,nome,empresa_id)"});
    if(!h)return new Response("invalid token",{status:404,headers:{...H,"Content-Type":"text/plain"}});
    const v=vars(h,h.embarcacoes);
    if(type==="sync-rsc"){
      const full=await tpl("sync-standalone",v);
      return new Response(full,{headers:{...H,"Content-Type":"text/plain; charset=utf-8"}});
    }
    if(type==="guardian-rsc"){
      const full=await tpl("guardian-standalone",v);
      return new Response(full,{headers:{...H,"Content-Type":"text/plain; charset=utf-8"}});
    }
    return new Response("unknown type: "+type,{status:400,headers:H});
  }catch(e){console.error("[gen7post GET]",e);return new Response("error",{status:500,headers:H});}
}

if(req.method!=="POST")return Response.json({error:"Method not allowed"},{status:405,headers:H});

try{
const body=await req.json();
if(body.mode==="health")return Response.json({version:V,status:"ok"},{headers:H});

// ─── SERVE MODE (POST, backward compat) ───
if(body.mode==="serve"){
  const token=body.token;const type=body.type||"bootstrap";
  if(!token)return Response.json({error:"token required"},{status:400,headers:H});
  const h=await rest("hotspots",{sync_token:"eq."+token,select:"id,nome,interface_wifi,wan_interface,wan_type,rede,sync_token,sync_interval_minutes,max_usuarios,ros_version,script_versao,embarcacoes!inner(id,nome,empresa_id)"});
  if(!h)return new Response("invalid token",{status:404,headers:{...H,"Content-Type":"text/plain"}});
  if(body.ros_version)h.ros_version=body.ros_version;
  const v=vars(h,h.embarcacoes);
  const scriptsUrl=SU+"/functions/v1/gen7post";

  // sync-rsc / guardian-rsc via POST serve mode
  if(type==="sync-rsc"){
    const full=await tpl("sync-standalone",v);
    return new Response(full,{headers:{...H,"Content-Type":"text/plain; charset=utf-8"}});
  }
  if(type==="guardian-rsc"){
    const full=await tpl("guardian-standalone",v);
    return new Response(full,{headers:{...H,"Content-Type":"text/plain; charset=utf-8"}});
  }
  // Standalone installers with fetch+import
  if(type==="sync-standalone"){
    const full=await tpl("sync-standalone",v);
    return new Response(replaceSourceWithImport(full,"sync","sync-rsc",scriptsUrl,h.sync_token),{headers:{...H,"Content-Type":"text/plain; charset=utf-8"}});
  }
  if(type==="guardian-standalone"){
    const full=await tpl("guardian-standalone",v);
    return new Response(replaceSourceWithImport(full,"guardian","guardian-rsc",scriptsUrl,h.sync_token),{headers:{...H,"Content-Type":"text/plain; charset=utf-8"}});
  }
  if(type==="all"){
    const s0=await tpl("infra",v);
    const s1r=await tpl("sync-standalone",v);const s1=replaceSourceWithImport(s1r,"sync","sync-rsc",scriptsUrl,h.sync_token);
    const s2r=await tpl("guardian-standalone",v);const s2=replaceSourceWithImport(s2r,"guardian","guardian-rsc",scriptsUrl,h.sync_token);
    const s3=await tpl("bootstrap",v);
    return new Response(s0+"\n"+s1+"\n"+s2+"\n"+s3,{headers:{...H,"Content-Type":"text/plain; charset=utf-8"}});
  }
  if(type==="recovery"){
    const s1r=await tpl("sync-standalone",v);const s1=replaceSourceWithImport(s1r,"sync","sync-rsc",scriptsUrl,h.sync_token);
    const s2r=await tpl("guardian-standalone",v);const s2=replaceSourceWithImport(s2r,"guardian","guardian-rsc",scriptsUrl,h.sync_token);
    return new Response(s1+"\n"+s2,{headers:{...H,"Content-Type":"text/plain; charset=utf-8"}});
  }
  const script=await tpl(type,v);
  return new Response(script,{headers:{...H,"Content-Type":"text/plain; charset=utf-8"}});
}

// ─── GENERATE MODE (requires auth) ───
const ah=req.headers.get("Authorization");if(!ah||!ah.startsWith("Bearer "))return Response.json({success:false,error:"Unauthorized"},{status:401,headers:H});
const ur=await fetch(SU+"/auth/v1/user",{headers:{apikey:AK,Authorization:ah}});if(!ur.ok)return Response.json({success:false,error:"Invalid token"},{status:401,headers:H});
const hid=body.hotspot_id;if(!hid)return Response.json({success:false,error:"hotspot_id required"},{status:400,headers:H});
const h=await rest("hotspots",{select:"id,nome,interface_wifi,wan_interface,wan_type,rede,sync_token,sync_interval_minutes,max_usuarios,ros_version,script_versao,embarcacoes!inner(id,nome,empresa_id)",id:"eq."+hid});if(!h)return Response.json({success:false,error:"Hotspot not found"},{status:404,headers:H});
if(!h.sync_token)return Response.json({success:false,error:"sync_token ausente"},{status:400,headers:H});
const v=vars(h,h.embarcacoes);
const scriptsUrl=SU+"/functions/v1/gen7post";
const s0=await tpl("infra",v);
const s1r=await tpl("sync-standalone",v);const s1=replaceSourceWithImport(s1r,"sync","sync-rsc",scriptsUrl,h.sync_token);
const s2r=await tpl("guardian-standalone",v);const s2=replaceSourceWithImport(s2r,"guardian","guardian-rsc",scriptsUrl,h.sync_token);
const s3=await tpl("bootstrap",v);
const sp=hid+"/"+V,enc=new TextEncoder(),fn=["infra.rsc","sync.rsc","guardian.rsc","bootstrap.rsc"],ss=[s0,s1,s2,s3];
for(let i=0;i<4;i++){const r=await fetch(SU+"/storage/v1/object/hotspot-scripts/"+sp+"/"+fn[i],{method:"PUT",headers:{apikey:SK,Authorization:"Bearer "+SK,"Content-Type":"text/plain; charset=utf-8","x-upsert":"true"},body:enc.encode(ss[i])});if(!r.ok)throw new Error("Upload:"+fn[i])}
const urls:string[]=[];for(const n of fn){const r=await fetch(SU+"/storage/v1/object/sign/hotspot-scripts/"+sp+"/"+n,{method:"POST",headers:{apikey:SK,Authorization:"Bearer "+SK,"Content-Type":"application/json"},body:JSON.stringify({expiresIn:900})});if(!r.ok)throw new Error("Sign:"+n);const d=await r.json();urls.push(SU+"/storage/v1"+d.signedURL)}
await fetch(SU+"/rest/v1/hotspots?id=eq."+hid,{method:"PATCH",headers:{apikey:SK,Authorization:"Bearer "+SK,"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify({scripts_version:V,scripts_generated_at:new Date().toISOString(),scripts_storage_path:sp,script_gerado:s3,script_versao:((h.script_versao as number)||0)+1})});
return Response.json({success:true,version:V,infra_url:urls[0],sync_url:urls[1],guardian_url:urls[2],bootstrap_url:urls[3],expires_in_seconds:900,storage_path:sp},{headers:H});
}catch(e){console.error("[gen7post]",e);return Response.json({success:false,error:e instanceof Error?e.message:"Internal error"},{status:500,headers:H})}
});
