import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Wifi, AlertTriangle, Shield, Clock, Gavel, Ban, CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";

export default function TermosUso() {
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
            <h1 className="text-2xl font-bold">Termos de Uso</h1>
            <p className="text-sm text-muted-foreground">Versão 1.0 - Última atualização: Janeiro de 2026</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Termos e Condições de Uso do Serviço WiFi
            </CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            {/* Aceitação */}
            <section>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                1. Aceitação dos Termos
              </h2>
              <p>
                Ao completar seu cadastro e utilizar o serviço de WiFi disponibilizado na embarcação, 
                você declara que leu, compreendeu e concorda integralmente com estes Termos de Uso. 
                Caso não concorde com qualquer disposição, você não deve utilizar o serviço.
              </p>
            </section>

            {/* Descrição do Serviço */}
            <section>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Wifi className="h-4 w-4" />
                2. Descrição do Serviço
              </h2>
              <p>
                O serviço consiste no fornecimento de acesso à internet via rede WiFi na embarcação, 
                sujeito às seguintes condições:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>Acesso mediante autenticação com login e senha individuais</li>
                <li>Limites de velocidade conforme perfil de acesso atribuído</li>
                <li>Quotas de consumo de dados (quando aplicável)</li>
                <li>Restrições de horário e dias de uso (quando configurado)</li>
                <li>Limitação de dispositivos simultâneos por usuário</li>
              </ul>
            </section>

            {/* Responsabilidades do Usuário */}
            <section>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4" />
                3. Responsabilidades do Usuário
              </h2>
              <p>Ao utilizar o serviço, você se compromete a:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Manter suas credenciais de acesso em sigilo e não compartilhá-las</li>
                <li>Utilizar o serviço de forma responsável e ética</li>
                <li>Respeitar os limites de uso estabelecidos pelo administrador</li>
                <li>Comunicar imediatamente qualquer uso não autorizado de sua conta</li>
                <li>Fornecer dados pessoais verdadeiros e atualizados</li>
              </ul>
            </section>

            {/* Proibições */}
            <section>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Ban className="h-4 w-4 text-destructive" />
                4. Condutas Proibidas
              </h2>
              <p>É expressamente proibido utilizar o serviço para:</p>
              
              <div className="bg-destructive/10 rounded-lg p-4 space-y-2">
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Atividades ilegais ou que violem a legislação brasileira</li>
                  <li>Acesso não autorizado a sistemas, redes ou dados de terceiros</li>
                  <li>Distribuição de malware, vírus ou código malicioso</li>
                  <li>Disseminação de conteúdo ilegal, difamatório ou que viole direitos de terceiros</li>
                  <li>Uso de ferramentas para burlar restrições de acesso ou quotas</li>
                  <li>Compartilhamento de credenciais com terceiros</li>
                  <li>Uso comercial não autorizado do serviço</li>
                  <li>Atividades que comprometam a segurança ou desempenho da rede</li>
                  <li>Download ou distribuição de conteúdo protegido por direitos autorais</li>
                  <li>Acesso a conteúdo inadequado ou proibido pela política da empresa</li>
                </ul>
              </div>
            </section>

            {/* Monitoramento */}
            <section>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                5. Monitoramento e Registro de Atividades
              </h2>
              <p>
                O uso do serviço está sujeito a monitoramento para fins de segurança e cumprimento 
                legal. São registrados:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>Horários de conexão e desconexão</li>
                <li>Endereços IP utilizados</li>
                <li>Endereços MAC dos dispositivos</li>
                <li>Volume de dados transferidos</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-2">
                Estes registros são mantidos conforme exigido pelo Marco Civil da Internet 
                (Lei 12.965/2014) e podem ser disponibilizados mediante ordem judicial.
              </p>
            </section>

            {/* Marco Civil */}
            <section>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4" />
                6. Guarda de Registros (Marco Civil da Internet)
              </h2>
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="font-medium">Conforme Art. 13 da Lei 12.965/2014:</p>
                <p className="text-sm mt-2">
                  "Na provisão de conexão à internet, cabe ao administrador de sistema autônomo respectivo 
                  o dever de manter os registros de conexão, sob sigilo, em ambiente controlado e de 
                  segurança, pelo prazo de 1 (um) ano."
                </p>
                <p className="text-sm mt-2">
                  Os registros de conexão são mantidos por período mínimo de 6 meses, podendo ser 
                  estendido conforme configuração da empresa controladora.
                </p>
              </div>
            </section>

            {/* Suspensão */}
            <section>
              <h2 className="text-lg font-semibold">7. Suspensão e Bloqueio</h2>
              <p>O acesso ao serviço pode ser suspenso ou bloqueado nas seguintes situações:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Violação destes Termos de Uso</li>
                <li>Uso indevido ou abusivo do serviço</li>
                <li>Solicitação da administração ou gerência da embarcação</li>
                <li>Esgotamento de quota de dados (quando aplicável)</li>
                <li>Desligamento do vínculo com a empresa</li>
                <li>Por ordem judicial ou determinação de autoridade competente</li>
              </ul>
            </section>

            {/* Limitação de Responsabilidade */}
            <section>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Gavel className="h-4 w-4" />
                8. Limitação de Responsabilidade
              </h2>
              <p>
                O serviço é fornecido "como está", sem garantias de disponibilidade ininterrupta ou 
                velocidade mínima. A empresa controladora não se responsabiliza por:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>Interrupções temporárias do serviço por motivos técnicos ou operacionais</li>
                <li>Velocidade de conexão, que pode variar conforme condições de rede</li>
                <li>Conteúdo acessado pelo usuário através do serviço</li>
                <li>Danos decorrentes de uso indevido das credenciais de acesso</li>
                <li>Perdas ou danos resultantes de atividades realizadas pelo usuário</li>
              </ul>
            </section>

            {/* Propriedade Intelectual */}
            <section>
              <h2 className="text-lg font-semibold">9. Propriedade Intelectual</h2>
              <p>
                O sistema de gestão de WiFi (NAVSPOT), incluindo sua interface, código e documentação, 
                é protegido por direitos de propriedade intelectual. A utilização do serviço não 
                confere ao usuário qualquer direito sobre tais elementos.
              </p>
            </section>

            {/* Privacidade */}
            <section>
              <h2 className="text-lg font-semibold">10. Privacidade e Proteção de Dados</h2>
              <p>
                O tratamento de seus dados pessoais é regido pela nossa{" "}
                <Link to="/privacidade" className="text-primary underline">
                  Política de Privacidade
                </Link>
                , que faz parte integrante destes Termos de Uso. Ao aceitar estes termos, você também 
                declara ciência e concordância com a Política de Privacidade.
              </p>
            </section>

            {/* Alterações */}
            <section>
              <h2 className="text-lg font-semibold">11. Alterações nos Termos</h2>
              <p>
                Estes Termos de Uso podem ser alterados a qualquer momento. Alterações significativas 
                serão comunicadas aos usuários, que poderão ser solicitados a fornecer novo aceite. 
                O uso continuado do serviço após alterações implica aceitação dos novos termos.
              </p>
            </section>

            {/* Legislação */}
            <section>
              <h2 className="text-lg font-semibold">12. Legislação Aplicável</h2>
              <p>
                Estes Termos de Uso são regidos pela legislação brasileira, especialmente:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>Marco Civil da Internet (Lei 12.965/2014)</li>
                <li>Lei Geral de Proteção de Dados (Lei 13.709/2018)</li>
                <li>Código Civil Brasileiro</li>
                <li>Código de Defesa do Consumidor (quando aplicável)</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-2">
                Eventuais conflitos serão dirimidos no foro da comarca da sede da empresa controladora.
              </p>
            </section>

            {/* Contato */}
            <section className="bg-primary/5 rounded-lg p-4">
              <h2 className="text-lg font-semibold">Dúvidas?</h2>
              <p className="text-sm">
                Em caso de dúvidas sobre estes Termos de Uso, entre em contato com a administração 
                da embarcação ou com a empresa controladora.
              </p>
            </section>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground pb-4">
          <p>Estes termos atendem aos requisitos do Marco Civil da Internet (Lei 12.965/2014)</p>
          <p>e da Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018)</p>
        </div>
      </div>
    </div>
  );
}
