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
import { Copy, Download, Check, RefreshCw, AlertTriangle } from "lucide-react";
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
    a.download = `navspot-${hotspotName.toLowerCase().replace(/\s+/g, "-")}.rsc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Download iniciado",
      description: `Arquivo navspot-${hotspotName}.rsc baixado.`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Script MikroTik - {hotspotName}</DialogTitle>
          <DialogDescription>
            Copie este script e execute no terminal do seu roteador MikroTik para configurar o hotspot.
          </DialogDescription>
        </DialogHeader>
        
        <Alert className="bg-yellow-500/10 border-yellow-500/50">
          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          <AlertTitle className="text-yellow-700 dark:text-yellow-400">
            Atenção: Você perderá a conexão por 10-15 segundos
          </AlertTitle>
          <AlertDescription className="text-yellow-600 dark:text-yellow-300/80">
            <p className="mb-2">Durante a instalação, a conexão com o MikroTik será interrompida. Para evitar problemas:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Cole o script inteiro no terminal do MikroTik</li>
              <li>Feche o Winbox <strong>imediatamente</strong> após colar (não espere terminar)</li>
              <li>Aguarde 30 segundos</li>
              <li>Reconecte via <code className="bg-yellow-500/20 px-1 rounded">192.168.88.1</code></li>
            </ol>
            <p className="mt-2">
              <strong>Alternativa segura:</strong> Use o botão "Download .rsc", faça upload via Files no Winbox, e execute: <code className="bg-yellow-500/20 px-1 rounded">/import navspot-bootstrap.rsc</code>
            </p>
          </AlertDescription>
        </Alert>

        <div className="relative">
          <Textarea
            value={script}
            readOnly
            className="font-mono text-xs min-h-[300px] resize-none"
          />
        </div>

        <div className="bg-muted/50 p-4 rounded-lg text-sm">
          <h4 className="font-semibold mb-2">Verificação pós-instalação:</h4>
          <p className="text-muted-foreground mb-2">Após reconectar, execute este comando no terminal para verificar se funcionou:</p>
          <code className="block bg-muted p-2 rounded text-xs">/log print where message~"NAVSPOT"</code>
          <p className="text-muted-foreground mt-2">Deve aparecer: <code className="bg-muted px-1 rounded">NAVSPOT v5.2: Bootstrap concluido!</code></p>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
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
