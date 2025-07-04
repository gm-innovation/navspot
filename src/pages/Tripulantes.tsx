
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  Filter, 
  Plus, 
  Users,
  UserCheck,
  Crown,
  Anchor,
  Settings
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Tripulantes() {
  const [searchTerm, setSearchTerm] = useState("");

  const tripulantes = [
    {
      id: 1,
      nome: "João Silva",
      login: "joao.silva",
      tipo: "Comandante",
      embarcacao: "Atlas Marine",
      email: "joao.silva@atlasmarine.com",
      cpf: "123.456.***-**",
      status: "ativo",
      ultimoLogin: "Hoje, 14:30"
    },
    {
      id: 2,
      nome: "Maria Santos",
      login: "maria.santos",
      tipo: "Imediato",
      embarcacao: "Atlas Marine",
      email: "maria.santos@atlasmarine.com",
      cpf: "987.654.***-**",
      status: "ativo",
      ultimoLogin: "Ontem, 18:45"
    },
    {
      id: 3,
      nome: "Pedro Costa",
      login: "pedro.costa",
      tipo: "Tripulante",
      embarcacao: "Esperança Transportes",
      email: "pedro.costa@esperanca.com",
      cpf: "456.789.***-**",
      status: "inativo",
      ultimoLogin: "3 dias atrás"
    },
    {
      id: 4,
      nome: "Ana Oliveira",
      login: "ana.oliveira",
      tipo: "Chefe de Máquinas",
      embarcacao: "Marina Recreio",
      email: "ana.oliveira@marina.com",
      cpf: "321.654.***-**",
      status: "ativo",
      ultimoLogin: "2 horas atrás"
    }
  ];

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case "Comandante":
        return <Crown className="h-4 w-4 text-yellow-600" />;
      case "Imediato":
      case "Oficial":
        return <UserCheck className="h-4 w-4 text-blue-600" />;
      case "Chefe de Máquinas":
        return <Settings className="h-4 w-4 text-orange-600" />;
      default:
        return <Anchor className="h-4 w-4 text-gray-600" />;
    }
  };

  const getTipoBadgeColor = (tipo: string) => {
    switch (tipo) {
      case "Comandante":
        return "bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400";
      case "Imediato":
      case "Oficial":
        return "bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400";
      case "Chefe de Máquinas":
        return "bg-orange-100 text-orange-800 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400";
      default:
        return "bg-gray-100 text-gray-800 hover:bg-gray-100 dark:bg-gray-900/20 dark:text-gray-400";
    }
  };

  const filteredTripulantes = tripulantes.filter(tripulante =>
    tripulante.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tripulante.embarcacao.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tripulante.login.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tripulantes</h1>
          <p className="text-muted-foreground">
            Gerencie todos os tripulantes cadastrados no sistema
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Novo Tripulante
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold">342</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
            <Users className="h-8 w-8 text-navspot-blue-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold text-green-600">298</p>
              <p className="text-sm text-muted-foreground">Ativos</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
              <div className="h-3 w-3 rounded-full bg-green-500"></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold">24</p>
              <p className="text-sm text-muted-foreground">Comandantes</p>
            </div>
            <Crown className="h-8 w-8 text-yellow-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold">156</p>
              <p className="text-sm text-muted-foreground">Online Hoje</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-navspot-blue-100 dark:bg-navspot-blue-900/20 flex items-center justify-center">
              <div className="h-3 w-3 rounded-full bg-navspot-blue-500 animate-pulse"></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de tripulantes */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lista de Tripulantes</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar tripulantes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-[300px]"
                />
              </div>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                Filtros
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tripulante</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Embarcação</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Último Login</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTripulantes.map((tripulante) => (
                <TableRow key={tripulante.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{tripulante.nome}</p>
                      <p className="text-sm text-muted-foreground">@{tripulante.login}</p>
                      <p className="text-xs text-muted-foreground">{tripulante.cpf}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getTipoIcon(tripulante.tipo)}
                      <Badge 
                        variant="secondary"
                        className={getTipoBadgeColor(tripulante.tipo)}
                      >
                        {tripulante.tipo}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{tripulante.embarcacao}</span>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={tripulante.status === "ativo" ? "default" : "secondary"}
                      className={tripulante.status === "ativo" ? 
                        "bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400" : 
                        "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400"
                      }
                    >
                      {tripulante.status === "ativo" ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {tripulante.ultimoLogin}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
