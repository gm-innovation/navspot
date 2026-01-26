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
import { Copy, Download, Check, RefreshCw } from "lucide-react";
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
        
        <div className="relative">
          <Textarea
            value={script}
            readOnly
            className="font-mono text-xs min-h-[400px] resize-none"
          />
        </div>

        <div className="bg-muted/50 p-4 rounded-lg text-sm">
          <h4 className="font-semibold mb-2">Instruções de Aplicação:</h4>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li>Acesse o terminal do MikroTik (via Winbox ou SSH)</li>
            <li>Faça backup da configuração atual</li>
            <li>Cole o script no terminal ou importe o arquivo .rsc</li>
            <li>O roteador começará a sincronizar automaticamente</li>
          </ol>
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
