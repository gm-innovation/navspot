
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Ship, MapPin, Users, Wifi, Plus, Settings } from "lucide-react";

export default function Embarcacoes() {
  const embarcacoes = [
    {
      id: 1,
      nome: "Atlas Marine",
      tipo: "Navio Cargueiro",
      responsavel: "Capitão Silva",
      email: "silva@atlasmarine.com",
      hotspots: 2,
      tripulantes: 45,
      localizacao: "Porto de Santos",
      status: "ativo",
      ultimaAtualizacao: "2 min atrás"
    },
    {
      id: 2,
      nome: "Esperança Transportes",
      tipo: "Navio Petroleiro",
      responsavel: "Comandante Costa",
      email: "costa@esperanca.com",
      hotspots: 1,
      tripulantes: 32,
      localizacao: "Porto do Rio",
      status: "inativo",
      ultimaAtualizacao: "15 min atrás"
    },
    {
      id: 3,
      nome: "Marina Recreio",
      tipo: "Lancha",
      responsavel: "Capitão Oliveira",
      email: "oliveira@marina.com",
      hotspots: 1,
      tripulantes: 12,
      localizacao: "Marina da Glória",
      status: "ativo",
      ultimaAtualizacao: "5 min atrás"
    },
    {
      id: 4,
      nome: "Poseidon Luxury",
      tipo: "Iate",
      responsavel: "Comandante Santos",
      email: "santos@poseidon.com",
      hotspots: 3,
      tripulantes: 18,
      localizacao: "Angra dos Reis",
      status: "ativo",
      ultimaAtualizacao: "1 min atrás"
    }
  ];

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Embarcações</h1>
          <p className="text-muted-foreground">
            Gerencie todas as embarcações cadastradas no sistema
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Nova Embarcação
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold">12</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
            <Ship className="h-8 w-8 text-navspot-blue-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold text-green-600">9</p>
              <p className="text-sm text-muted-foreground">Ativas</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
              <div className="h-3 w-3 rounded-full bg-green-500"></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold">156</p>
              <p className="text-sm text-muted-foreground">Tripulantes</p>
            </div>
            <Users className="h-8 w-8 text-navspot-blue-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold">24</p>
              <p className="text-sm text-muted-foreground">Hotspots</p>
            </div>
            <Wifi className="h-8 w-8 text-navspot-blue-500" />
          </CardContent>
        </Card>
      </div>

      {/* Lista de embarcações */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {embarcacoes.map((embarcacao) => (
          <Card key={embarcacao.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-navspot-blue-100 dark:bg-navspot-blue-900/20 flex items-center justify-center">
                    <Ship className="h-5 w-5 text-navspot-blue-600 dark:text-navspot-blue-400" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{embarcacao.nome}</CardTitle>
                    <p className="text-sm text-muted-foreground">{embarcacao.tipo}</p>
                  </div>
                </div>
                <Badge 
                  variant={embarcacao.status === "ativo" ? "default" : "secondary"}
                  className={embarcacao.status === "ativo" ? "bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400" : ""}
                >
                  {embarcacao.status === "ativo" ? "Ativo" : "Inativo"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Responsável */}
              <div>
                <p className="text-sm font-medium">{embarcacao.responsavel}</p>
                <p className="text-sm text-muted-foreground">{embarcacao.email}</p>
              </div>

              {/* Localização */}
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{embarcacao.localizacao}</span>
              </div>

              {/* Estatísticas */}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                <div className="text-center">
                  <p className="text-lg font-semibold">{embarcacao.hotspots}</p>
                  <p className="text-xs text-muted-foreground">Hotspots</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold">{embarcacao.tripulantes}</p>
                  <p className="text-xs text-muted-foreground">Tripulantes</p>
                </div>
              </div>

              {/* Ações */}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="flex-1">
                  <Settings className="h-4 w-4 mr-2" />
                  Gerenciar
                </Button>
                <Button variant="outline" size="sm" className="flex-1">
                  Ver Detalhes
                </Button>
              </div>

              {/* Última atualização */}
              <p className="text-xs text-muted-foreground text-center pt-2 border-t">
                Última atualização: {embarcacao.ultimaAtualizacao}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
