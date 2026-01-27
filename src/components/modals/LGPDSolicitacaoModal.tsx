import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Loader2, Shield } from "lucide-react";
import { useCreateSolicitacao } from "@/hooks/useLGPD";
import { TripulanteWithDetails } from "@/hooks/useTripulantes";

interface LGPDSolicitacaoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripulante: TripulanteWithDetails | null;
}

type TipoSolicitacao = 'acesso' | 'retificacao' | 'exclusao' | 'portabilidade' | 'oposicao';

const tiposLabels: Record<TipoSolicitacao, { label: string; description: string }> = {
  acesso: { label: "Acesso aos dados", description: "Tripulante quer saber quais dados temos sobre ele (Art. 18, II)" },
  retificacao: { label: "Retificação de dados", description: "Tripulante quer corrigir dados incorretos (Art. 18, III)" },
  exclusao: { label: "Exclusão de dados", description: "Tripulante quer que seus dados sejam apagados (Art. 18, VI)" },
  portabilidade: { label: "Portabilidade", description: "Tripulante quer receber seus dados em formato estruturado (Art. 18, V)" },
  oposicao: { label: "Oposição ao tratamento", description: "Tripulante se opõe a algum tratamento específico (Art. 18, IV)" },
};

export function LGPDSolicitacaoModal({ open, onOpenChange, tripulante }: LGPDSolicitacaoModalProps) {
  const createSolicitacao = useCreateSolicitacao();
  const [tipo, setTipo] = useState<TipoSolicitacao>('acesso');
  const [descricao, setDescricao] = useState('');

  const handleSubmit = () => {
    if (!tripulante) return;

    createSolicitacao.mutate({
      tripulante_id: tripulante.id,
      tipo,
      descricao: descricao.trim() || undefined,
    }, {
      onSuccess: () => {
        onOpenChange(false);
        setTipo('acesso');
        setDescricao('');
      },
    });
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setTipo('acesso');
      setDescricao('');
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Nova Solicitação LGPD
          </DialogTitle>
          <DialogDescription>
            Registrar solicitação em nome de <strong>{tripulante?.nome}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Tipo de Solicitação</Label>
            <RadioGroup value={tipo} onValueChange={(v) => setTipo(v as TipoSolicitacao)}>
              {Object.entries(tiposLabels).map(([key, { label, description }]) => (
                <div key={key} className="flex items-start space-x-3 p-2 rounded-md hover:bg-muted/50">
                  <RadioGroupItem value={key} id={key} className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor={key} className="font-medium cursor-pointer">
                      {label}
                    </Label>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição (opcional)</Label>
            <Textarea
              id="descricao"
              placeholder="Descreva o pedido do tripulante..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={3}
            />
          </div>

          <Alert className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/50">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800 dark:text-yellow-200 text-sm">
              <strong>Prazo legal:</strong> 15 dias úteis para resposta (Art. 18, §3º da LGPD)
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={createSolicitacao.isPending}>
            {createSolicitacao.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Registrando...
              </>
            ) : (
              "Registrar Solicitação"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
