import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Copy, Download, Wifi, User, Key } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface QRCodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripulante: {
    nome: string;
    login_wifi: string;
    senha_wifi: string;
    embarcacao_nome?: string;
  } | null;
}

export function QRCodeModal({ open, onOpenChange, tripulante }: QRCodeModalProps) {
  if (!tripulante) return null;

  // Create WiFi QR code string (WIFI:T:WPA;S:SSID;P:password;;)
  const wifiString = `WIFI:T:WPA;S:${tripulante.embarcacao_nome || "NAVSPOT"};P:${tripulante.senha_wifi};;`;
  
  // Create credentials text for sharing
  const credentialsText = `Login: ${tripulante.login_wifi}\nSenha: ${tripulante.senha_wifi}`;

  const handleCopyCredentials = () => {
    navigator.clipboard.writeText(credentialsText);
    toast({
      title: "Credenciais copiadas",
      description: "Login e senha copiados para a área de transferência.",
    });
  };

  const handleDownloadQR = () => {
    const svg = document.getElementById("qr-code-svg");
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL("image/png");
      
      const downloadLink = document.createElement("a");
      downloadLink.download = `qr-${tripulante.login_wifi}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };

    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5" />
            Credenciais WiFi
          </DialogTitle>
          <DialogDescription>
            QR Code para conexão WiFi de {tripulante.nome}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* QR Code */}
          <div className="flex justify-center p-4 bg-white rounded-lg">
            <QRCodeSVG
              id="qr-code-svg"
              value={wifiString}
              size={200}
              level="H"
              includeMargin
              imageSettings={{
                src: "/favicon.ico",
                height: 24,
                width: 24,
                excavate: true,
              }}
            />
          </div>

          {/* Credentials Card */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Login</p>
                  <p className="font-mono font-medium">{tripulante.login_wifi}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Key className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Senha</p>
                  <p className="font-mono font-medium">{tripulante.senha_wifi}</p>
                </div>
              </div>
              {tripulante.embarcacao_nome && (
                <div className="flex items-center gap-3">
                  <Wifi className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Rede</p>
                    <p className="font-medium">{tripulante.embarcacao_nome}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleCopyCredentials}>
              <Copy className="h-4 w-4 mr-2" />
              Copiar
            </Button>
            <Button variant="outline" className="flex-1" onClick={handleDownloadQR}>
              <Download className="h-4 w-4 mr-2" />
              Baixar QR
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
