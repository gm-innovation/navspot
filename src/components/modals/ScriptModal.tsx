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
import { Separator } from "@/components/ui/separator";
import { Copy, Download, Check, RefreshCw, AlertTriangle, Upload, CheckCircle2, ArrowRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ScriptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bootstrapScript: string;
  finalizeScript: string;
  hotspotName: string;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

export function ScriptModal({
  open,
  onOpenChange,
  bootstrapScript,
  finalizeScript,
  hotspotName,
  onRegenerate,
  isRegenerating,
}: ScriptModalProps) {
  const [copiedBootstrap, setCopiedBootstrap] = useState(false);
  const [copiedFinalize, setCopiedFinalize] = useState(false);

  const handleCopyBootstrap = async () => {
    try {
      await navigator.clipboard.writeText(bootstrapScript);
      setCopiedBootstrap(true);
      toast({
        title: "Script copiado!",
        description: "O script de bootstrap foi copiado para a área de transferência.",
      });
      setTimeout(() => setCopiedBootstrap(false), 2000);
    } catch (error) {
      toast({
        title: "Erro ao copiar",
        description: "Não foi possível copiar o script.",
        variant: "destructive",
      });
    }
  };

  const handleCopyFinalize = async () => {
    try {
      await navigator.clipboard.writeText(finalizeScript);
      setCopiedFinalize(true);
      toast({
        title: "Script copiado!",
        description: "O script de finalização foi copiado para a área de transferência.",
      });
      setTimeout(() => setCopiedFinalize(false), 2000);
    } catch (error) {
      toast({
        title: "Erro ao copiar",
        description: "Não foi possível copiar o script.",
        variant: "destructive",
      });
    }
  };

  const handleDownloadBootstrap = () => {
    const blob = new Blob([bootstrapScript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "navspot-bootstrap.rsc";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Download iniciado",
      description: "Arquivo navspot-bootstrap.rsc baixado.",
    });
  };

  const handleDownloadFinalize = () => {
    const blob = new Blob([finalizeScript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "navspot-finalize-ether2.rsc";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Download iniciado",
      description: "Arquivo navspot-finalize-ether2.rsc baixado.",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Script MikroTik v6.4 - {hotspotName}</DialogTitle>
          <DialogDescription>
            Instalação em duas etapas para garantir conectividade durante a configuração.
          </DialogDescription>
        </DialogHeader>
        
        {/* Área scrollável */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          
          {/* PARTE 1: BOOTSTRAP */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                1
              </div>
              <h3 className="text-lg font-semibold">Parte 1: Bootstrap</h3>
            </div>

            <Alert className="bg-primary/10 border-primary/50">
              <Upload className="h-4 w-4 text-primary" />
              <AlertTitle className="text-primary">
                Método: Upload + /import
              </AlertTitle>
              <AlertDescription className="text-primary/80">
                <ol className="list-decimal list-inside space-y-1 mt-2">
                  <li>Conecte-se ao MikroTik via <strong>ether2</strong> (Winbox/MAC)</li>
                  <li>Clique em <strong>"Download Bootstrap"</strong> abaixo</li>
                  <li>No Winbox, vá em <strong>Files</strong> e faça upload do arquivo</li>
                  <li>Abra o <strong>Terminal</strong> e execute:</li>
                </ol>
                <code className="block bg-primary/20 p-2 rounded text-xs mt-2">/import navspot-bootstrap.rsc</code>
              </AlertDescription>
            </Alert>

            <div className="relative">
              <Textarea
                value={bootstrapScript}
                readOnly
                className="font-mono text-xs min-h-[150px] max-h-[200px] resize-none"
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCopyBootstrap} className="flex-1">
                {copiedBootstrap ? (
                  <Check className="h-4 w-4 mr-2" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" />
                )}
                {copiedBootstrap ? "Copiado!" : "Copiar Bootstrap"}
              </Button>
              <Button onClick={handleDownloadBootstrap} className="flex-1">
                <Download className="h-4 w-4 mr-2" />
                Download Bootstrap
              </Button>
            </div>
          </div>

          {/* SEPARADOR COM CHECKLIST */}
          <div className="relative py-4">
            <Separator />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-background px-4">
                <ArrowRight className="h-6 w-6 text-muted-foreground" />
              </div>
            </div>
          </div>

          <Alert className="bg-yellow-500/10 border-yellow-500/50">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <AlertTitle className="text-yellow-700 dark:text-yellow-400">
              Ação Manual Necessária
            </AlertTitle>
            <AlertDescription className="text-yellow-600 dark:text-yellow-300/80">
              <p className="mb-2">Após a Parte 1 completar, siga estes passos:</p>
              <div className="space-y-2 mt-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>Aguarde a mensagem <strong>"ACAO NECESSARIA"</strong> no log do MikroTik</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span><strong>Desconecte</strong> o cabo de rede da <strong>ether2</strong></span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span><strong>Conecte</strong> o cabo na <strong>ether3, ether4 ou ether5</strong></span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span><strong>Reconecte</strong> o Winbox via <code className="bg-yellow-500/20 px-1 rounded">192.168.88.1</code></span>
                </div>
              </div>
            </AlertDescription>
          </Alert>

          {/* PARTE 2: FINALIZAÇÃO */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-600 font-bold">
                2
              </div>
              <h3 className="text-lg font-semibold">Parte 2: Finalização</h3>
            </div>

            <Alert className="bg-green-500/10 border-green-500/50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-700 dark:text-green-400">
                Após Reconectar
              </AlertTitle>
              <AlertDescription className="text-green-600 dark:text-green-300/80">
                <ol className="list-decimal list-inside space-y-1 mt-2">
                  <li>Faça upload do arquivo <strong>navspot-finalize-ether2.rsc</strong></li>
                  <li>No Terminal, execute:</li>
                </ol>
                <code className="block bg-green-500/20 p-2 rounded text-xs mt-2">/import navspot-finalize-ether2.rsc</code>
                <p className="mt-2 text-sm">Este script migra a ether2 e conclui a instalação.</p>
              </AlertDescription>
            </Alert>

            <div className="relative">
              <Textarea
                value={finalizeScript}
                readOnly
                className="font-mono text-xs min-h-[120px] max-h-[150px] resize-none"
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCopyFinalize} className="flex-1">
                {copiedFinalize ? (
                  <Check className="h-4 w-4 mr-2" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" />
                )}
                {copiedFinalize ? "Copiado!" : "Copiar Finalize"}
              </Button>
              <Button onClick={handleDownloadFinalize} variant="secondary" className="flex-1">
                <Download className="h-4 w-4 mr-2" />
                Download Finalize
              </Button>
            </div>
          </div>

          {/* Verificação pós-instalação */}
          <div className="bg-muted/50 p-4 rounded-lg text-sm">
            <h4 className="font-semibold mb-2">Verificação pós-instalação:</h4>
            <p className="text-muted-foreground mb-2">Após executar a Parte 2, verifique no terminal:</p>
            <code className="block bg-muted p-2 rounded text-xs">/log print where message~"NAVSPOT"</code>
            <p className="text-muted-foreground mt-2">Deve aparecer: <code className="bg-muted px-1 rounded">NAVSPOT v6.4: INSTALACAO 100% CONCLUIDA!</code></p>
          </div>
        </div>

        {/* Footer fixo com botão de regenerar */}
        {onRegenerate && (
          <div className="pt-4 border-t">
            <Button
              variant="outline"
              onClick={onRegenerate}
              disabled={isRegenerating}
              className="w-full"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`} />
              Regenerar Scripts
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
