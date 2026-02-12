import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Download, Check, RefreshCw, Upload, Shield, RotateCcw, Package, Server, Eye, Activity } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useDownloadRecoveryScript } from "@/hooks/useHotspots";
import { useDownloadModularScript } from "@/hooks/useModularScripts";

interface ScriptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bootstrapScript: string;
  finalizeScript?: string;
  hotspotName: string;
  hotspotId?: string;
  scriptVersion?: string;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
  syncToken?: string;
}

export function ScriptModal({
  open,
  onOpenChange,
  bootstrapScript,
  hotspotName,
  hotspotId,
  scriptVersion = "7.7.0",
  onRegenerate,
  isRegenerating,
  syncToken,
}: ScriptModalProps) {
  const [copied, setCopied] = useState(false);
  const [copiedUpdate, setCopiedUpdate] = useState(false);
  const downloadRecovery = useDownloadRecoveryScript();
  const downloadModular = useDownloadModularScript();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(bootstrapScript);
      setCopied(true);
      toast({
        title: "Script copiado!",
        description: "O script foi copiado para a área de transferência.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Erro ao copiar",
        description: "Não foi possível copiar o script.",
        variant: "destructive",
      });
    }
  };

  const handleDownload = () => {
    const blob = new Blob([bootstrapScript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `navspot-bootstrap-v${scriptVersion}.rsc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "Download iniciado",
      description: `Arquivo navspot-bootstrap-v${scriptVersion}.rsc baixado.`,
    });
  };

  const handleDownloadRecovery = async () => {
    if (!hotspotId) return;
    try {
      const script = await downloadRecovery.mutateAsync(hotspotId);
      const versionMatch = script.match(/Recovery Script v(\d+\.\d+\.\d+)/);
      const recoveryVersion = versionMatch ? versionMatch[1] : scriptVersion;
      const blob = new Blob([script], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `navspot-recovery-v${recoveryVersion}.rsc`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      // Erro tratado pelo hook
    }
  };

  const handleModularDownload = async (type: 'infra' | 'sync-standalone' | 'guardian-standalone') => {
    if (!syncToken) return;
    const filenames: Record<string, string> = {
      'infra': `navspot-infra-v${scriptVersion}.rsc`,
      'sync-standalone': `navspot-sync-v${scriptVersion}.rsc`,
      'guardian-standalone': `navspot-guardian-v${scriptVersion}.rsc`,
    };
    try {
      const script = await downloadModular.mutateAsync({ type, token: syncToken });
      const blob = new Blob([script], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenames[type];
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: "Download concluído",
        description: `Arquivo ${filenames[type]} baixado (${script.length} bytes).`,
      });
    } catch (error) {
      // Erro tratado pelo hook
    }
  };

  const updateCommand = syncToken
    ? `/tool fetch url="https://focqrhkozhdefohroqyi.supabase.co/functions/v1/mikrotik-script-generator?mode=serve&type=all&token=${syncToken}&ros_version=7" dst-path=navspot-scripts.rsc\n/import navspot-scripts.rsc`
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Script MikroTik v{scriptVersion} - {hotspotName}</DialogTitle>
          <DialogDescription>
            Instalação resiliente com auto-recuperação e token fallback embutido.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto pr-2">
          <Tabs defaultValue="bootstrap" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="bootstrap">
                <Package className="h-4 w-4 mr-2" />
                Bootstrap (Automático)
              </TabsTrigger>
              <TabsTrigger value="modular">
                <Server className="h-4 w-4 mr-2" />
                Modular (Manual)
              </TabsTrigger>
            </TabsList>

            {/* ===== ABA BOOTSTRAP (conteudo atual) ===== */}
            <TabsContent value="bootstrap" className="space-y-4 mt-4">
              <Alert className="bg-primary/10 border-primary/50">
                <Upload className="h-4 w-4 text-primary" />
                <AlertTitle className="text-primary">Método Recomendado: Download + Import</AlertTitle>
                <AlertDescription className="text-primary/80">
                  <ol className="list-decimal list-inside space-y-1 mt-2">
                    <li>Conecte-se ao MikroTik via <strong>ether2</strong> (Winbox/MAC)</li>
                    <li>Clique em <strong>"Download Script"</strong> abaixo</li>
                    <li>No Winbox, vá em <strong>Files</strong> e faça upload do arquivo</li>
                    <li>Abra o <strong>Terminal</strong> e execute:</li>
                  </ol>
                  <code className="block bg-primary/20 p-2 rounded text-xs mt-2 font-mono">/import navspot-bootstrap.rsc</code>
                </AlertDescription>
              </Alert>

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleCopy} className="flex-1">
                  {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  {copied ? "Copiado!" : "Copiar Script"}
                </Button>
                <Button onClick={handleDownload} className="flex-1">
                  <Download className="h-4 w-4 mr-2" />
                  Download (.rsc)
                </Button>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Script de Instalação</h3>
                <Textarea value={bootstrapScript} readOnly className="font-mono text-xs min-h-[300px] resize-none" />
              </div>

              <Alert className="bg-green-500/10 border-green-500/50">
                <Shield className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-700 dark:text-green-400">Auto-Recuperação v{scriptVersion}</AlertTitle>
                <AlertDescription className="text-green-600/80 dark:text-green-400/80">
                  <ul className="text-xs space-y-1 mt-2">
                    <li>• <strong>Token Fallback:</strong> Token embutido no sync e guardian</li>
                    <li>• <strong>navspot-guardian:</strong> Verifica integridade a cada 10 minutos</li>
                    <li>• <strong>Safe Update:</strong> Atualiza scripts sem remover antes</li>
                  </ul>
                </AlertDescription>
              </Alert>
            </TabsContent>

            {/* ===== ABA MODULAR (novo v7.7.0) ===== */}
            <TabsContent value="modular" className="space-y-4 mt-4">
              <Alert className="bg-orange-500/10 border-orange-500/50">
                <Server className="h-4 w-4 text-orange-600" />
                <AlertTitle className="text-orange-700 dark:text-orange-400">Instalação Modular (Manual)</AlertTitle>
                <AlertDescription className="text-orange-600/80 dark:text-orange-400/80">
                  <p className="text-xs mb-2">
                    Baixe cada script separadamente e importe um por um via Winbox. 
                    Ideal para diagnóstico ou quando o bootstrap automático falha.
                  </p>
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                {/* Passo 1: Infra */}
                <div className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">1</span>
                    <h4 className="font-medium text-sm">Infraestrutura</h4>
                    <span className="text-xs text-muted-foreground">(roda 1 vez)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Bridge, IP, DHCP, NAT, Hotspot profile, WiFi, Walled Garden.</p>
                  <Button
                    onClick={() => handleModularDownload('infra')}
                    disabled={!syncToken || downloadModular.isPending}
                    className="w-full"
                    size="sm"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {downloadModular.isPending ? 'Baixando...' : 'Download infra.rsc'}
                  </Button>
                  <code className="block bg-muted p-2 rounded text-xs font-mono">/import navspot-infra-v{scriptVersion}.rsc</code>
                </div>

                {/* Passo 2: Sync */}
                <div className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">2</span>
                    <h4 className="font-medium text-sm">Sync (Heartbeat)</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">Instala navspot-sync + scheduler. Envia heartbeat e processa ações.</p>
                  <Button
                    onClick={() => handleModularDownload('sync-standalone')}
                    disabled={!syncToken || downloadModular.isPending}
                    className="w-full"
                    size="sm"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {downloadModular.isPending ? 'Baixando...' : 'Download sync.rsc'}
                  </Button>
                  <code className="block bg-muted p-2 rounded text-xs font-mono">/import navspot-sync-v{scriptVersion}.rsc</code>
                </div>

                {/* Passo 3: Guardian */}
                <div className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">3</span>
                    <h4 className="font-medium text-sm">Guardian (Vigia)</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">Instala navspot-guardian + scheduler. Monitora integridade e auto-repara.</p>
                  <Button
                    onClick={() => handleModularDownload('guardian-standalone')}
                    disabled={!syncToken || downloadModular.isPending}
                    className="w-full"
                    size="sm"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {downloadModular.isPending ? 'Baixando...' : 'Download guardian.rsc'}
                  </Button>
                  <code className="block bg-muted p-2 rounded text-xs font-mono">/import navspot-guardian-v{scriptVersion}.rsc</code>
                </div>
              </div>

              {/* Verificação */}
              <div className="bg-muted/50 p-4 rounded-lg text-sm">
                <h4 className="font-semibold mb-2">Verificação pós-instalação:</h4>
                <code className="block bg-muted p-2 rounded text-xs font-mono">/system script print</code>
                <p className="text-muted-foreground mt-1 text-xs">Deve listar: <strong>navspot-sync</strong> e <strong>navspot-guardian</strong></p>
                <code className="block bg-muted p-2 rounded text-xs font-mono mt-2">/log print where message~"NAVSPOT"</code>
              </div>
            </TabsContent>
          </Tabs>

          {/* SEÇÃO COMPARTILHADA: Atualizar Scripts */}
          {syncToken && (
            <Alert className="bg-blue-500/10 border-blue-500/50 mt-4">
              <RefreshCw className="h-4 w-4 text-blue-600" />
              <AlertTitle className="text-blue-700 dark:text-blue-400">Atualizar Scripts (sem reinstalar)</AlertTitle>
              <AlertDescription className="text-blue-600/80 dark:text-blue-400/80">
                <p className="mb-2 text-xs">
                  Cole no terminal do RouterOS para atualizar apenas os scripts:
                </p>
                <code className="block bg-blue-500/20 p-2 rounded text-xs font-mono whitespace-pre-wrap break-all">
                  {updateCommand}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={async () => {
                    await navigator.clipboard.writeText(updateCommand);
                    setCopiedUpdate(true);
                    toast({ title: "Comando copiado!", description: "Cole no terminal do MikroTik." });
                    setTimeout(() => setCopiedUpdate(false), 2000);
                  }}
                >
                  {copiedUpdate ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                  {copiedUpdate ? "Copiado!" : "Copiar comando"}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Verificação pós-instalação */}
          <div className="bg-muted/50 p-4 rounded-lg text-sm mt-4">
            <h4 className="font-semibold mb-2">Configuração de portas:</h4>
            <ul className="text-muted-foreground text-xs space-y-1">
              <li>• <strong>ether1:</strong> WAN (Internet)</li>
              <li>• <strong>ether2:</strong> Gerência fixa (Winbox/MNDP)</li>
              <li>• <strong>ether3-5:</strong> Hotspot (bridge1)</li>
            </ul>
          </div>
        </div>

        {/* Footer fixo */}
        <div className="pt-4 border-t space-y-3">
          {hotspotId && (
            <Button
              variant="outline"
              onClick={handleDownloadRecovery}
              disabled={downloadRecovery.isPending}
              className="w-full"
            >
              <RotateCcw className={`h-4 w-4 mr-2 ${downloadRecovery.isPending ? 'animate-spin' : ''}`} />
              {downloadRecovery.isPending ? 'Baixando Recovery...' : 'Baixar Recovery (.rsc)'}
            </Button>
          )}
          {onRegenerate && (
            <Button
              variant="outline"
              onClick={onRegenerate}
              disabled={isRegenerating}
              className="w-full"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`} />
              Regenerar Script
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
