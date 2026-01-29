import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Copy, Download, Check, RefreshCw, AlertTriangle, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ScriptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  script: string;
  hotspotName: string;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

export function ScriptModal({
  open,
  onOpenChange,
  script,
  hotspotName,
  onRegenerate,
  isRegenerating,
}: ScriptModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(script);
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
    const blob = new Blob([script], { type: "text/plain" });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Script MikroTik v6.0 - {hotspotName}</DialogTitle>
          <DialogDescription>
            Execute este script via <code className="bg-muted px-1 rounded">/import</code> para configurar o hotspot de forma segura.
          </DialogDescription>
        </DialogHeader>
        
        {/* Área scrollável */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          <Alert className="bg-primary/10 border-primary/50">
            <Upload className="h-4 w-4 text-primary" />
            <AlertTitle className="text-primary">
              Método Recomendado: Upload + /import
            </AlertTitle>
            <AlertDescription className="text-primary/80">
              <p className="mb-2">
                <strong>IMPORTANTE:</strong> Este script deve ser executado via{" "}
                <code className="bg-primary/20 px-1 rounded">/import</code>, não por copy/paste no terminal.
              </p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Clique em <strong>"Download .rsc"</strong> abaixo</li>
                <li>No Winbox, vá em <strong>Files</strong> e faça upload do arquivo</li>
                <li>Abra o <strong>Terminal</strong> e execute:</li>
              </ol>
              <code className="block bg-primary/20 p-2 rounded text-xs mt-2 mb-2">/import navspot-bootstrap.rsc</code>
              <p>
                Aguarde 30 segundos e reconecte via <code className="bg-primary/20 px-1 rounded">192.168.88.1</code>
              </p>
            </AlertDescription>
          </Alert>

          <Alert className="bg-yellow-500/10 border-yellow-500/50">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <AlertTitle className="text-yellow-700 dark:text-yellow-400">
              Aviso: Conexão será interrompida brevemente
            </AlertTitle>
            <AlertDescription className="text-yellow-600 dark:text-yellow-300/80">
              <p className="mb-2">
                A conexão Winbox será interrompida no final do script quando a porta ether2 for migrada para a bridge.
                Isso é <strong>normal e esperado</strong>.
              </p>
              <p>
                O script v6.0 usa "Backwards Safe Migration" - toda a rede (IP, DHCP, Hotspot, NAT) 
                já estará funcionando antes da migração, garantindo reconexão imediata.
              </p>
            </AlertDescription>
          </Alert>

          <div className="relative">
            <Textarea
              value={script}
              readOnly
              className="font-mono text-xs min-h-[200px] max-h-[250px] resize-none"
            />
          </div>

          <div className="bg-muted/50 p-4 rounded-lg text-sm">
            <h4 className="font-semibold mb-2">Verificação pós-instalação:</h4>
            <p className="text-muted-foreground mb-2">Após reconectar, execute este comando no terminal para verificar se funcionou:</p>
            <code className="block bg-muted p-2 rounded text-xs">/log print where message~"NAVSPOT"</code>
            <p className="text-muted-foreground mt-2">Deve aparecer: <code className="bg-muted px-1 rounded">NAVSPOT v6.0: Bootstrap concluido!</code></p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-4 border-t">
          {onRegenerate && (
            <Button
              variant="outline"
              onClick={onRegenerate}
              disabled={isRegenerating}
              className="w-full sm:w-auto"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`} />
              Regenerar
            </Button>
          )}
          <Button variant="outline" onClick={handleCopy} className="w-full sm:w-auto">
            {copied ? (
              <Check className="h-4 w-4 mr-2" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            {copied ? "Copiado!" : "Copiar Script"}
          </Button>
          <Button onClick={handleDownload} className="w-full sm:w-auto">
            <Download className="h-4 w-4 mr-2" />
            Download .rsc
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
