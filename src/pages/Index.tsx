
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Index() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirecionar para login se não estiver autenticado
    // Por enquanto, vamos redirecionar direto para o dashboard
    navigate("/");
  }, [navigate]);

  return null;
}
