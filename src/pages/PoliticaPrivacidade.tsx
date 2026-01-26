import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shield, Mail, Phone, MapPin, Calendar, Database, Eye, Edit, Trash2, Download, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";

export default function PoliticaPrivacidade() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link to="/completar-cadastro">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Política de Privacidade</h1>
            <p className="text-sm text-muted-foreground">Versão 1.0 - Última atualização: Janeiro de 2026</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Informações sobre o Tratamento de Dados Pessoais
            </CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            {/* Identificação do Controlador */}
            <section>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                1. Identificação do Controlador
              </h2>
              <p>
                O controlador dos dados pessoais coletados por meio deste sistema é a <strong>empresa operadora 
                da embarcação</strong> à qual você está vinculado. As informações específicas do controlador, 
                incluindo razão social, CNPJ e endereço, estão disponíveis na configuração de sua empresa.
              </p>
            </section>

            {/* Encarregado (DPO) */}
            <section>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Mail className="h-4 w-4" />
                2. Encarregado de Proteção de Dados (DPO)
              </h2>
              <p>
                Conforme exigido pela Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018), cada empresa 
                controladora possui um Encarregado de Dados designado. Para obter os dados de contato do DPO 
                de sua empresa, consulte a administração ou acesse as configurações de LGPD do sistema.
              </p>
            </section>

            {/* Dados Coletados */}
            <section>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Database className="h-4 w-4" />
                3. Dados Pessoais Coletados
              </h2>
              <p>Coletamos os seguintes dados pessoais para fornecimento do serviço de WiFi:</p>
              
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div>
                  <h4 className="font-medium">Dados de Identificação:</h4>
                  <ul className="list-disc list-inside text-sm">
                    <li>Nome completo (obrigatório)</li>
                    <li>CPF (opcional)</li>
                    <li>Email (opcional)</li>
                    <li>Cargo na embarcação (opcional)</li>
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-medium">Dados de Acesso:</h4>
                  <ul className="list-disc list-inside text-sm">
                    <li>Login e senha WiFi</li>
                    <li>Endereço MAC dos dispositivos</li>
                    <li>Endereço IP atribuído</li>
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-medium">Dados de Uso:</h4>
                  <ul className="list-disc list-inside text-sm">
                    <li>Horário de início e fim das sessões</li>
                    <li>Volume de dados consumidos (bytes)</li>
                    <li>Último acesso</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Finalidade */}
            <section>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Eye className="h-4 w-4" />
                4. Finalidade do Tratamento
              </h2>
              <p>Seus dados pessoais são tratados para as seguintes finalidades:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Fornecimento do serviço:</strong> Autenticação e controle de acesso à rede WiFi</li>
                <li><strong>Gestão de uso:</strong> Aplicação de quotas, limites de velocidade e regras de acesso</li>
                <li><strong>Segurança:</strong> Monitoramento e prevenção de uso indevido da rede</li>
                <li><strong>Cumprimento legal:</strong> Guarda de registros conforme Marco Civil da Internet</li>
                <li><strong>Suporte:</strong> Resolução de problemas técnicos de conectividade</li>
              </ul>
            </section>

            {/* Base Legal */}
            <section>
              <h2 className="text-lg font-semibold">5. Base Legal para o Tratamento</h2>
              <p>O tratamento de seus dados pessoais é fundamentado nas seguintes bases legais da LGPD:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Consentimento (Art. 7º, I):</strong> Você consente expressamente ao completar seu cadastro</li>
                <li><strong>Execução de contrato (Art. 7º, V):</strong> Necessário para fornecer o serviço de WiFi</li>
                <li><strong>Cumprimento de obrigação legal (Art. 7º, II):</strong> Marco Civil da Internet exige guarda de logs</li>
                <li><strong>Legítimo interesse (Art. 7º, IX):</strong> Segurança da rede e prevenção de fraudes</li>
              </ul>
            </section>

            {/* Compartilhamento */}
            <section>
              <h2 className="text-lg font-semibold">6. Compartilhamento de Dados</h2>
              <p>Seus dados pessoais podem ser compartilhados com:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Administradores da empresa:</strong> Para gestão do serviço de WiFi</li>
                <li><strong>Gerentes de embarcação:</strong> Para suporte técnico e operacional</li>
                <li><strong>Autoridades judiciais:</strong> Mediante ordem judicial, conforme Marco Civil da Internet</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-2">
                Não comercializamos seus dados pessoais com terceiros.
              </p>
            </section>

            {/* Retenção */}
            <section>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                7. Período de Retenção
              </h2>
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <p><strong>Dados de identificação:</strong> Mantidos enquanto o vínculo com a empresa estiver ativo</p>
                <p><strong>Logs de acesso (sessões WiFi):</strong> Mínimo de 6 meses, conforme Marco Civil da Internet (Lei 12.965/2014, Art. 13)</p>
                <p><strong>Registros de auditoria:</strong> 5 anos (prazo prescricional civil)</p>
              </div>
            </section>

            {/* Direitos do Titular */}
            <section>
              <h2 className="text-lg font-semibold">8. Seus Direitos (LGPD Art. 18)</h2>
              <p>Como titular dos dados, você possui os seguintes direitos:</p>
              
              <div className="grid gap-3 mt-3">
                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                  <Eye className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-medium">Acesso</h4>
                    <p className="text-sm text-muted-foreground">Solicitar cópia dos seus dados pessoais</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                  <Edit className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-medium">Retificação</h4>
                    <p className="text-sm text-muted-foreground">Corrigir dados incompletos, inexatos ou desatualizados</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                  <Trash2 className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-medium">Eliminação</h4>
                    <p className="text-sm text-muted-foreground">Solicitar exclusão dos dados (sujeito a obrigações legais de retenção)</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                  <Download className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-medium">Portabilidade</h4>
                    <p className="text-sm text-muted-foreground">Receber seus dados em formato estruturado</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Como exercer direitos */}
            <section>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Phone className="h-4 w-4" />
                9. Como Exercer Seus Direitos
              </h2>
              <p>Para exercer qualquer um dos direitos acima, você pode:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Acessar o portal "Meus Dados" disponível no sistema (quando autenticado)</li>
                <li>Entrar em contato com o Encarregado de Dados (DPO) da sua empresa</li>
                <li>Enviar solicitação através da administração da embarcação</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-2">
                Prazo de resposta: até 15 dias úteis, conforme LGPD.
              </p>
            </section>

            {/* Segurança */}
            <section>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4" />
                10. Medidas de Segurança
              </h2>
              <p>Implementamos medidas técnicas e administrativas para proteger seus dados:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Criptografia de senhas</li>
                <li>Controle de acesso baseado em funções (RBAC)</li>
                <li>Políticas de segurança em nível de linha (RLS)</li>
                <li>Logs de auditoria para rastreabilidade</li>
                <li>Backups regulares com proteção</li>
              </ul>
            </section>

            {/* Atualizações */}
            <section>
              <h2 className="text-lg font-semibold">11. Atualizações desta Política</h2>
              <p>
                Esta política pode ser atualizada periodicamente. Quando houver alterações significativas, 
                você será notificado e poderá ser solicitado a fornecer novo consentimento.
              </p>
            </section>

            {/* Contato */}
            <section className="bg-primary/5 rounded-lg p-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Dúvidas?
              </h2>
              <p className="text-sm">
                Em caso de dúvidas sobre esta política ou sobre o tratamento de seus dados pessoais, 
                entre em contato com o Encarregado de Proteção de Dados (DPO) de sua empresa ou com 
                a administração da embarcação.
              </p>
            </section>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground pb-4">
          <p>Esta política atende aos requisitos da Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018)</p>
          <p>e do Marco Civil da Internet (Lei 12.965/2014)</p>
        </div>
      </div>
    </div>
  );
}
