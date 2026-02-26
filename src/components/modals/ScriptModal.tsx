import { useState, useEffect } from "react";
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
import { Copy, Download, Check, RefreshCw, Upload, Shield, RotateCcw, Package, Server, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useDownloadRecoveryScript } from "@/hooks/useHotspots";
import { downloadFromSignedUrl } from "@/hooks/useModularScripts";

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
  signedUrls?: Record<string, string>;
}

export function ScriptModal({
  open,
  onOpenChange,
  bootstrapScript,
  hotspotName,
  hotspotId,
  scriptVersion = "7.8.0",
  onRegenerate,
  isRegenerating,
  syncToken,
  signedUrls,
}: ScriptModalProps) {
  const [copied, setCopied] = useState(false);
  const downloadRecovery = useDownloadRecoveryScript();
  const [ttlRemaining, setTtlRemaining] = useState(900);
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);

  const hasSignedUrls = !!(signedUrls?.infra_url || signedUrls?.sync_url || signedUrls?.guardian_url);

  // Track TTL countdown
  useEffect(() => {
    if (hasSignedUrls && open) {
      setGeneratedAt(Date.now());
      setTtlRemaining(900);
    }
  }, [hasSignedUrls, open]);

  useEffect(() => {
    if (!generatedAt || !open) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - generatedAt) / 1000);
      const remaining = Math.max(0, 900 - elapsed);
      setTtlRemaining(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [generatedAt, open]);

  const formatTTL = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(bootstrapScript);
      setCopied(true);
      toast({ title: "Script copiado!", description: "O script foi copiado para a área de transferência." });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({ title: "Erro ao copiar", description: "Não foi possível copiar o script.", variant: "destructive" });
    }
  };

  const handleDownload = async () => {
    if (signedUrls?.bootstrap_url) {
      await downloadFromSignedUrl(signedUrls.bootstrap_url, `navspot-bootstrap-v${scriptVersion}.rsc`);
      toast({ title: "Download iniciado", description: `Bootstrap v${scriptVersion} via URL assinada.` });
      return;
    }
    const blob = new Blob([bootstrapScript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `navspot-bootstrap-v${scriptVersion}.rsc`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast({ title: "Download iniciado", description: `Arquivo navspot-bootstrap-v${scriptVersion}.rsc baixado.` });
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

  const handleSignedDownload = async (type: 'infra' | 'sync' | 'guardian') => {
    const urlMap: Record<string, string | undefined> = {
      infra: signedUrls?.infra_url,
      sync: signedUrls?.sync_url,
      guardian: signedUrls?.guardian_url,
    };
    const filenameMap: Record<string, string> = {
      infra: `navspot-infra-v${scriptVersion}.rsc`,
      sync: `navspot-sync-v${scriptVersion}.rsc`,
      guardian: `navspot-guardian-v${scriptVersion}.rsc`,
    };
    const url = urlMap[type];
    if (!url) {
      toast({ title: "URL não disponível", description: "Regenere os scripts.", variant: "destructive" });
      return;
    }
    if (ttlRemaining <= 0) {
      toast({ title: "URLs expiradas", description: "Regenere os scripts para obter novas URLs.", variant: "destructive" });
      return;
    }
    await downloadFromSignedUrl(url, filenameMap[type]);
    toast({ title: "Download iniciado", description: `${filenameMap[type]} via URL assinada.` });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Script MikroTik v{scriptVersion} - {hotspotName}</DialogTitle>
          <DialogDescription>
            {hasSignedUrls
              ? "Scripts pré-renderizados no Storage. Download via URLs assinadas."
              : "Instalação resiliente com auto-recuperação e token fallback embutido."}
          </DialogDescription>
        </DialogHeader>

        {/* TTL Indicator */}
        {hasSignedUrls && (
          <Alert className={`${ttlRemaining > 60 ? 'bg-green-500/10 border-green-500/50' : 'bg-orange-500/10 border-orange-500/50'}`}>
            <Clock className="h-4 w-4" />
            <AlertDescription className="text-sm">
              URLs válidas por <strong>{formatTTL(ttlRemaining)}</strong>
              {ttlRemaining <= 0 && " — Expiradas! Regenere os scripts."}
            </AlertDescription>
          </Alert>
        )}
        
        <div className="flex-1 overflow-y-auto pr-2">
          <Tabs defaultValue={hasSignedUrls ? "modular" : "bootstrap"} className="w-full">
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

            {/* ===== ABA BOOTSTRAP ===== */}
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
                <Button variant="outline" onClick={handleCopy} className="flex-1" disabled={!bootstrapScript}>
                  {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  {copied ? "Copiado!" : "Copiar Script"}
                </Button>
                <Button onClick={handleDownload} className="flex-1">
                  <Download className="h-4 w-4 mr-2" />
                  Download (.rsc)
                </Button>
              </div>

              {bootstrapScript && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Script de Instalação</h3>
                  <Textarea value={bootstrapScript} readOnly className="font-mono text-xs min-h-[300px] resize-none" />
                </div>
              )}

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

            {/* ===== ABA MODULAR (v7.8.0 storage-first) ===== */}
            <TabsContent value="modular" className="space-y-4 mt-4">
              <Alert className="bg-orange-500/10 border-orange-500/50">
                <Server className="h-4 w-4 text-orange-600" />
                <AlertTitle className="text-orange-700 dark:text-orange-400">
                  {hasSignedUrls ? "Instalação Modular (Storage-First)" : "Instalação Modular (Manual)"}
                </AlertTitle>
                <AlertDescription className="text-orange-600/80 dark:text-orange-400/80">
                  <p className="text-xs mb-2">
                    {hasSignedUrls
                      ? "Scripts pré-renderizados prontos para download. URLs válidas por 15 minutos."
                      : "Baixe cada script separadamente e importe um por um via Winbox."}
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
                    onClick={() => handleSignedDownload('infra')}
                    disabled={!hasSignedUrls || ttlRemaining <= 0}
                    className="w-full"
                    size="sm"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download infra.rsc
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
                    onClick={() => handleSignedDownload('sync')}
                    disabled={!hasSignedUrls || ttlRemaining <= 0}
                    className="w-full"
                    size="sm"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download sync.rsc
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
                    onClick={() => handleSignedDownload('guardian')}
                    disabled={!hasSignedUrls || ttlRemaining <= 0}
                    className="w-full"
                    size="sm"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download guardian.rsc
                  </Button>
                  <code className="block bg-muted p-2 rounded text-xs font-mono">/import navspot-guardian-v{scriptVersion}.rsc</code>
                </div>
              </div>

              {!hasSignedUrls && (
                <Alert className="bg-muted/50">
                  <AlertDescription className="text-xs text-muted-foreground">
                    Clique em <strong>"Regenerar Script"</strong> abaixo para gerar os scripts e obter URLs de download.
                  </AlertDescription>
                </Alert>
              )}

              {/* Verificação */}
              <div className="bg-muted/50 p-4 rounded-lg text-sm">
                <h4 className="font-semibold mb-2">Verificação pós-instalação:</h4>
                <code className="block bg-muted p-2 rounded text-xs font-mono">/system script print</code>
                <p className="text-muted-foreground mt-1 text-xs">Deve listar: <strong>navspot-sync</strong> e <strong>navspot-guardian</strong></p>
                <code className="block bg-muted p-2 rounded text-xs font-mono mt-2">/log print where message~"NAVSPOT"</code>
              </div>
            </TabsContent>
          </Tabs>

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
              {isRegenerating ? 'Gerando...' : 'Regenerar Scripts'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
