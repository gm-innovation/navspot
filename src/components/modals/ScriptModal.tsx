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
import { Copy, Download, Check, RefreshCw, Upload, CheckCircle2, AlertTriangle, Shield } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

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
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(bootstrapScript);
      setCopied(true);
      toast({
        title: "Script copiado!",
        description: "Atenção: para scripts grandes, prefira o download .rsc.",
        variant: "default",
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
          <DialogTitle>Script MikroTik v6.9.12 - {hotspotName}</DialogTitle>
          <DialogDescription>
            Instalação resiliente com auto-recuperação. A porta ether2 será configurada como gerência fixa (Winbox).
          </DialogDescription>
        </DialogHeader>
        
        {/* Área scrollável */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          
          {/* INSTRUÇÕES PRINCIPAIS - Download + Import */}
          <Alert className="bg-primary/10 border-primary/50">
            <Upload className="h-4 w-4 text-primary" />
            <AlertTitle className="text-primary">
              Método Recomendado: Download + Import
            </AlertTitle>
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

          {/* BOTÃO PRINCIPAL - DOWNLOAD */}
          <div className="space-y-3">
            <Button onClick={handleDownload} className="w-full h-12 text-base">
              <Download className="h-5 w-5 mr-2" />
              Download Script (.rsc)
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Arquivo de ~15KB • Compatível com RouterOS 6.x e 7.x
            </p>
          </div>

          {/* SEÇÃO DE AUTO-RECUPERAÇÃO */}
          <Alert className="bg-green-500/10 border-green-500/50">
            <Shield className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-700 dark:text-green-400">
              Auto-Recuperação v6.9.12
            </AlertTitle>
            <AlertDescription className="text-green-600/80 dark:text-green-400/80">
              <p className="mb-2">
                Este script inclui um sistema de auto-reparo. Se o script de sincronização desaparecer após um reboot ou queda de energia, o roteador tentará se recuperar automaticamente.
              </p>
              <ul className="text-xs space-y-1">
                <li>• <strong>navspot-guardian:</strong> Verifica integridade a cada 10 minutos</li>
                <li>• <strong>Safe Update:</strong> Atualiza scripts sem remover antes</li>
              </ul>
            </AlertDescription>
          </Alert>

          {/* Verificação pós-instalação */}
          <div className="bg-muted/50 p-4 rounded-lg text-sm">
            <h4 className="font-semibold mb-2">Verificação pós-instalação:</h4>
            <p className="text-muted-foreground mb-2">Após a importação, verifique no terminal:</p>
            <code className="block bg-muted p-2 rounded text-xs font-mono">/log print where message~"NAVSPOT"</code>
            <p className="text-muted-foreground mt-2">Deve aparecer: <code className="bg-muted px-1 rounded">NAVSPOT v6.9.12: INSTALACAO CONCLUIDA!</code></p>
            
            <div className="mt-4 pt-3 border-t border-border">
              <h5 className="font-medium text-sm mb-2">Configuração de portas:</h5>
              <ul className="text-muted-foreground text-xs space-y-1">
                <li>• <strong>ether1:</strong> WAN (Internet)</li>
                <li>• <strong>ether2:</strong> Gerência fixa (Winbox/MNDP)</li>
                <li>• <strong>ether3-5:</strong> Hotspot (bridge1)</li>
              </ul>
            </div>
          </div>

          {/* SEÇÃO AVANÇADA - Colapsível */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between text-muted-foreground hover:text-foreground">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Opções Avançadas (Copy/Paste)
                </span>
                <span className="text-xs">{showAdvanced ? "▲" : "▼"}</span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-4">
              <Alert variant="destructive" className="bg-destructive/10">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Não recomendado</AlertTitle>
                <AlertDescription className="text-xs">
                  Colar scripts grandes no terminal pode causar truncamento devido ao limite de buffer do RouterOS. Use apenas se o download não for possível.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs font-bold">
                    !
                  </div>
                  <h3 className="text-sm font-medium text-muted-foreground">Script de Instalação</h3>
                </div>

                <div className="relative">
                  <Textarea
                    value={bootstrapScript}
                    readOnly
                    className="font-mono text-xs min-h-[150px] max-h-[200px] resize-none opacity-70"
                  />
                </div>

                <Button 
                  variant="outline" 
                  onClick={handleCopy} 
                  className="w-full text-muted-foreground"
                  size="sm"
                >
                  {copied ? (
                    <Check className="h-4 w-4 mr-2" />
                  ) : (
                    <Copy className="h-4 w-4 mr-2" />
                  )}
                  {copied ? "Copiado!" : "Copiar Script (não recomendado)"}
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
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
