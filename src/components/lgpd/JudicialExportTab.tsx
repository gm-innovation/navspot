import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Scale, Download, Info, Loader2 } from "lucide-react";
import { EmpresaWithLGPD } from "@/hooks/useLGPDConfig";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTripulantes } from "@/hooks/useTripulantes";

interface JudicialExportTabProps {
  empresas: EmpresaWithLGPD[];
}

export function JudicialExportTab({ empresas }: JudicialExportTabProps) {
  const { toast } = useToast();
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<string>("");
  const [selectedTripulanteId, setSelectedTripulanteId] = useState<string>("");
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [numeroProcesso, setNumeroProcesso] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  // Buscar tripulantes da empresa selecionada
  const { data: tripulantes } = useTripulantes();
  
  // Filtrar tripulantes pela empresa selecionada (via embarcação)
  const tripulantesDisponiveis = tripulantes?.filter(t => {
    // Para simplificação, mostrar todos - idealmente filtrar por empresa
    return true;
  }) || [];

  const handleExport = async () => {
    if (!selectedEmpresaId || !periodoInicio || !periodoFim || !numeroProcesso.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha todos os campos obrigatórios para exportar.",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);
    try {
      // Buscar sessões WiFi do período
      let query = supabase
        .from("sessoes_wifi")
        .select(`
          id, inicio, fim, ip_address, mac_address, bytes_in, bytes_out, status,
          tripulante:tripulantes(id, nome, cpf, email, cargo),
          hotspot:hotspots(id, nome, embarcacao:embarcacoes(id, nome, empresa_id))
        `)
        .gte("inicio", periodoInicio)
        .lte("inicio", periodoFim)
        .order("inicio", { ascending: true });

      if (selectedTripulanteId) {
        query = query.eq("tripulante_id", selectedTripulanteId);
      }

      const { data: sessoes, error } = await query;

      if (error) throw error;

      // Filtrar por empresa
      const sessoesFiltradas = sessoes?.filter(s => 
        s.hotspot?.embarcacao?.empresa_id === selectedEmpresaId
      ) || [];

      // Montar pacote de exportação
      const empresa = empresas.find(e => e.id === selectedEmpresaId);
      const exportData = {
        metadados: {
          tipo_documento: "EXPORTACAO_JUDICIAL_MARCO_CIVIL",
          numero_processo: numeroProcesso,
          data_geracao: new Date().toISOString(),
          periodo: { inicio: periodoInicio, fim: periodoFim },
          empresa_controladora: {
            nome: empresa?.nome,
            cnpj: empresa?.cnpj,
            dpo: empresa?.lgpd_config?.dpo_nome,
            dpo_email: empresa?.lgpd_config?.dpo_email,
          },
          operador: "NAVSPOT - Sistema de Gerenciamento de Hotspot",
          total_registros: sessoesFiltradas.length,
        },
        registros: sessoesFiltradas.map(s => ({
          sessao_id: s.id,
          tripulante: {
            nome: s.tripulante?.nome,
            cpf: s.tripulante?.cpf,
            email: s.tripulante?.email,
            cargo: s.tripulante?.cargo,
          },
          conexao: {
            inicio: s.inicio,
            fim: s.fim,
            ip_address: s.ip_address,
            mac_address: s.mac_address,
            bytes_in: s.bytes_in,
            bytes_out: s.bytes_out,
            status: s.status,
          },
          hotspot: {
            nome: s.hotspot?.nome,
            embarcacao: s.hotspot?.embarcacao?.nome,
          },
        })),
      };

      // Calcular hash SHA-256
      const jsonString = JSON.stringify(exportData, null, 2);
      const encoder = new TextEncoder();
      const data = encoder.encode(jsonString);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

      const finalExport = {
        ...exportData,
        integridade: {
          algoritmo: "SHA-256",
          hash: hashHex,
        },
      };

      // Download JSON
      const blob = new Blob([JSON.stringify(finalExport, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `exportacao_judicial_${numeroProcesso.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Exportação concluída",
        description: `${sessoesFiltradas.length} registros exportados com hash SHA-256.`,
      });

      // Limpar formulário
      setSelectedTripulanteId("");
      setPeriodoInicio("");
      setPeriodoFim("");
      setNumeroProcesso("");
    } catch (error: any) {
      console.error("Erro na exportação:", error);
      toast({
        title: "Erro na exportação",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-5 w-5" />
          Exportação de Logs para Ordem Judicial
        </CardTitle>
        <CardDescription>
          Conforme Marco Civil da Internet (Art. 22), logs de conexão podem ser solicitados mediante ordem judicial
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50">
          <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            Esta funcionalidade gera um arquivo JSON assinado com hash SHA-256 para garantia de integridade.
            Use apenas mediante solicitação judicial formal.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Empresa *</Label>
            <Select value={selectedEmpresaId} onValueChange={setSelectedEmpresaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar empresa..." />
              </SelectTrigger>
              <SelectContent>
                {empresas.map((empresa) => (
                  <SelectItem key={empresa.id} value={empresa.id}>
                    {empresa.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tripulante (opcional)</Label>
            <Select value={selectedTripulanteId} onValueChange={setSelectedTripulanteId}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os tripulantes..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos os tripulantes</SelectItem>
                {tripulantesDisponiveis.map((tripulante) => (
                  <SelectItem key={tripulante.id} value={tripulante.id}>
                    {tripulante.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Período Início *</Label>
            <Input
              type="date"
              value={periodoInicio}
              onChange={(e) => setPeriodoInicio(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Período Fim *</Label>
            <Input
              type="date"
              value={periodoFim}
              onChange={(e) => setPeriodoFim(e.target.value)}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Número do Processo *</Label>
            <Input
              value={numeroProcesso}
              onChange={(e) => setNumeroProcesso(e.target.value)}
              placeholder="Ex: 1234567-89.2024.8.26.0001"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleExport} disabled={isExporting || !selectedEmpresaId}>
            {isExporting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Exportando...</>
            ) : (
              <><Download className="h-4 w-4 mr-2" />Exportar Logs (JSON assinado)</>
            )}
          </Button>
        </div>

        <div className="text-sm text-muted-foreground space-y-1">
          <p>O arquivo gerado incluirá:</p>
          <ul className="list-disc ml-6">
            <li>Dados de identificação do tripulante (nome, CPF, email)</li>
            <li>Sessões WiFi (início, fim, IP, MAC)</li>
            <li>Bytes transferidos</li>
            <li>Hash SHA-256 para integridade</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
