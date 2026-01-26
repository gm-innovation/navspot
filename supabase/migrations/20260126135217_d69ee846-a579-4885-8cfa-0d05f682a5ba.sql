-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.hotspots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tripulantes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.acoes_pendentes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alertas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.embarcacoes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.perfis_velocidade;