
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { 
  Search, 
  Filter, 
  Plus, 
  MapPin, 
  Users, 
  Wifi,
  Settings,
  RefreshCw,
  AlertTriangle
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Hotspots() {
  const [searchTerm, setSearchTerm] = useState("");

  const hotspots = [
    {
      id: 1,
      name: "Embarcação Atlas",
      embarcacao: "Atlas Marine",
      status: "ativo",
      usuarios: 12,
      maxUsuarios: 50,
      localizacao: "Porto de Santos",
      ultimaAtualizacao: "2 min atrás",
      ip: "192.168.1.1",
      sinal: 85
    },
    {
      id: 2,
      name: "Navio Esperança",
      embarcacao: "Esperança Transportes",
      status: "inativo",
      usuarios: 0,
      maxUsuarios: 30,
      localizacao: "Porto do Rio",
      ultimaAtualizacao: "15 min atrás",
      ip: "192.168.1.2",
      sinal: 0
    },
    {
      id: 3,
      name: "Lancha Marina",
      embarcacao: "Marina Recreio",
      status: "ativo",
      usuarios: 8,
      maxUsuarios: 25,
      localizacao: "Marina da Glória",
      ultimaAtualizacao: "5 min atrás",
      ip: "192.168.1.3",
      sinal: 92
    },
    {
      id: 4,
      name: "Iate Poseidon",
      embarcacao: "Poseidon Luxury",
      status: "alerta",
      usuarios: 23,
      maxUsuarios: 25,
      localizacao: "Angra dos Reis",
      ultimaAtualizacao: "1 min atrás",
      ip: "192.168.1.4",
      sinal: 67
    }
  ];

  const filteredHotspots = hotspots.filter(hotspot =>
    hotspot.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    hotspot.embarcacao.toLowerCase().includes(searchTerm.toLowerCase()) ||
    hotspot.localizacao.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Hotspots</h1>
          <p className="text-muted-foreground">
            Monitore e gerencie todos os hotspots Wi-Fi das embarcações
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Sincronizar
          </Button>
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Novo Hotspot
          </Button>
        </div>
      </div>

      {/* Estatísticas rápidas */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold">24</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
            <Wifi className="h-8 w-8 text-navspot-blue-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold text-green-600">18</p>
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
              <p className="text-2xl font-bold text-red-600">3</p>
              <p className="text-sm text-muted-foreground">Inativos</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
              <div className="h-3 w-3 rounded-full bg-red-500"></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold text-yellow-600">3</p>
              <p className="text-sm text-muted-foreground">Alertas</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-yellow-500" />
          </CardContent>
        </Card>
      </div>

      {/* Filtros e busca */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lista de Hotspots</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar hotspots..."
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
                <TableHead>Hotspot</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Usuários</TableHead>
                <TableHead>Localização</TableHead>
                <TableHead>Sinal</TableHead>
                <TableHead>Última Atualização</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredHotspots.map((hotspot) => (
                <TableRow key={hotspot.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{hotspot.name}</p>
                      <p className="text-sm text-muted-foreground">{hotspot.embarcacao}</p>
                      <p className="text-xs text-muted-foreground">{hotspot.ip}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={hotspot.status as any} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>{hotspot.usuarios}/{hotspot.maxUsuarios}</span>
                      {hotspot.usuarios >= hotspot.maxUsuarios * 0.9 && (
                        <Badge variant="destructive" className="text-xs">
                          Limite
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{hotspot.localizacao}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <div className={`h-2 w-2 rounded-full ${
                          hotspot.sinal > 70 ? 'bg-green-500' : 
                          hotspot.sinal > 40 ? 'bg-yellow-500' : 
                          hotspot.sinal > 0 ? 'bg-red-500' : 'bg-gray-400'
                        }`}></div>
                        <span className="text-sm">{hotspot.sinal}%</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {hotspot.ultimaAtualizacao}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm">
                      <Settings className="h-4 w-4" />
                    </Button>
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
