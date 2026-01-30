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
import { Copy, Download, Check, RefreshCw, Upload, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ScriptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bootstrapScript: string;
  finalizeScript?: string; // v6.9.1: Optional, not used anymore
  hotspotName: string;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

export function ScriptModal({
  open,
  onOpenChange,
  bootstrapScript,
  hotspotName,
  onRegenerate,
  isRegenerating,
}: ScriptModalProps) {
  const [copied, setCopied] = useState(false);

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
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Script MikroTik v6.9.1 - {hotspotName}</DialogTitle>
          <DialogDescription>
            Instalação completa em script único. A porta ether2 será configurada como gerência fixa (Winbox).
          </DialogDescription>
        </DialogHeader>
        
        {/* Área scrollável */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          
          {/* INSTRUÇÕES */}
          <Alert className="bg-primary/10 border-primary/50">
            <Upload className="h-4 w-4 text-primary" />
            <AlertTitle className="text-primary">
              Método de Instalação
            </AlertTitle>
            <AlertDescription className="text-primary/80">
              <ol className="list-decimal list-inside space-y-1 mt-2">
                <li>Conecte-se ao MikroTik via <strong>ether2</strong> (Winbox/MAC)</li>
                <li>Clique em <strong>"Download Script"</strong> abaixo</li>
                <li>No Winbox, vá em <strong>Files</strong> e faça upload do arquivo</li>
                <li>Abra o <strong>Terminal</strong> e execute:</li>
              </ol>
              <code className="block bg-primary/20 p-2 rounded text-xs mt-2">/import navspot-bootstrap.rsc</code>
            </AlertDescription>
          </Alert>

          {/* SCRIPT */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold">Script de Instalação</h3>
            </div>

            <div className="relative">
              <Textarea
                value={bootstrapScript}
                readOnly
                className="font-mono text-xs min-h-[200px] max-h-[300px] resize-none"
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCopy} className="flex-1">
                {copied ? (
                  <Check className="h-4 w-4 mr-2" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" />
                )}
                {copied ? "Copiado!" : "Copiar Script"}
              </Button>
              <Button onClick={handleDownload} className="flex-1">
                <Download className="h-4 w-4 mr-2" />
                Download Script
              </Button>
            </div>
          </div>

          {/* Verificação pós-instalação */}
          <div className="bg-muted/50 p-4 rounded-lg text-sm">
            <h4 className="font-semibold mb-2">Verificação pós-instalação:</h4>
            <p className="text-muted-foreground mb-2">Após a importação, verifique no terminal:</p>
            <code className="block bg-muted p-2 rounded text-xs">/log print where message~"NAVSPOT"</code>
            <p className="text-muted-foreground mt-2">Deve aparecer: <code className="bg-muted px-1 rounded">NAVSPOT v6.9.1: INSTALACAO CONCLUIDA!</code></p>
            
            <div className="mt-4 pt-3 border-t border-border">
              <h5 className="font-medium text-sm mb-2">Configuração de portas:</h5>
              <ul className="text-muted-foreground text-xs space-y-1">
                <li>• <strong>ether1:</strong> WAN (Internet)</li>
                <li>• <strong>ether2:</strong> Gerência fixa (Winbox/MNDP)</li>
                <li>• <strong>ether3-5:</strong> Hotspot (bridge1)</li>
              </ul>
            </div>
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
              Regenerar Script
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
