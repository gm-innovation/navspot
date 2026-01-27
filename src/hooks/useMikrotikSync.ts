import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';

export type MikrotikActionType = 
  // User management
  | 'create_user' 
  | 'remove_user' 
  | 'disable_user' 
  | 'enable_user'
  | 'update_password' 
  | 'update_user_profile'
  | 'kick_session'
  // Device management
  | 'block_device' 
  | 'unblock_device' 
  | 'kick_device'
  // Profile management
  | 'add_profile' 
  | 'update_profile_config' 
  | 'remove_profile'
  // Firewall/Access rules
  | 'update_firewall_rules';

interface CreateActionParams {
  embarcacaoId: string;
  tipo: MikrotikActionType;
  payload: Json;
}

interface CreateActionForHotspotParams {
  hotspotId: string;
  tipo: MikrotikActionType;
  payload: Json;
}

interface CreateActionForEmpresaParams {
  empresaId: string;
  tipo: MikrotikActionType;
  payload: Json;
}

/**
 * Convert a profile name to MikroTik-compatible slug
 * Example: "Tripulação Padrão" -> "tripulacao-padrao"
 */
export function toProfileSlug(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Create a pending action for all hotspots of an embarcacao
 */
export async function createMikrotikAction({ 
  embarcacaoId, 
  tipo, 
  payload 
}: CreateActionParams): Promise<void> {
  // Fetch hotspots for this embarcacao
  const { data: hotspots, error: hotspotsError } = await supabase
    .from('hotspots')
    .select('id')
    .eq('embarcacao_id', embarcacaoId);

  if (hotspotsError) {
    console.error('[useMikrotikSync] Error fetching hotspots:', hotspotsError);
    throw hotspotsError;
  }

  if (!hotspots || hotspots.length === 0) {
    console.log('[useMikrotikSync] No hotspots found for embarcacao:', embarcacaoId);
    return;
  }

  // Create action for each hotspot
  const actions = hotspots.map(h => ({
    hotspot_id: h.id,
    tipo,
    payload,
    status: 'pendente',
  }));

  const { error } = await supabase
    .from('acoes_pendentes')
    .insert(actions);

  if (error) {
    console.error('[useMikrotikSync] Error creating actions:', error);
    throw error;
  }

  console.log(`[useMikrotikSync] Created ${actions.length} action(s) of type ${tipo}`);
}

/**
 * Create a pending action for a specific hotspot
 */
export async function createMikrotikActionForHotspot({ 
  hotspotId, 
  tipo, 
  payload 
}: CreateActionForHotspotParams): Promise<void> {
  const { error } = await supabase
    .from('acoes_pendentes')
    .insert({
      hotspot_id: hotspotId,
      tipo,
      payload,
      status: 'pendente',
    });

  if (error) {
    console.error('[useMikrotikSync] Error creating action for hotspot:', error);
    throw error;
  }

  console.log(`[useMikrotikSync] Created action of type ${tipo} for hotspot ${hotspotId}`);
}

/**
 * Create pending actions for ALL hotspots of an empresa
 * Useful for profile changes that affect all embarcacoes
 */
export async function createMikrotikActionForEmpresa({ 
  empresaId, 
  tipo, 
  payload 
}: CreateActionForEmpresaParams): Promise<void> {
  // First, get all embarcacoes for this empresa
  const { data: embarcacoes, error: embError } = await supabase
    .from('embarcacoes')
    .select('id')
    .eq('empresa_id', empresaId);

  if (embError) {
    console.error('[useMikrotikSync] Error fetching embarcacoes:', embError);
    throw embError;
  }

  if (!embarcacoes || embarcacoes.length === 0) {
    console.log('[useMikrotikSync] No embarcacoes found for empresa:', empresaId);
    return;
  }

  // Get all hotspots for these embarcacoes
  const embarcacaoIds = embarcacoes.map(e => e.id);
  const { data: hotspots, error: hotspotsError } = await supabase
    .from('hotspots')
    .select('id')
    .in('embarcacao_id', embarcacaoIds);

  if (hotspotsError) {
    console.error('[useMikrotikSync] Error fetching hotspots:', hotspotsError);
    throw hotspotsError;
  }

  if (!hotspots || hotspots.length === 0) {
    console.log('[useMikrotikSync] No hotspots found for empresa:', empresaId);
    return;
  }

  // Create action for each hotspot
  const actions = hotspots.map(h => ({
    hotspot_id: h.id,
    tipo,
    payload,
    status: 'pendente',
  }));

  const { error } = await supabase
    .from('acoes_pendentes')
    .insert(actions);

  if (error) {
    console.error('[useMikrotikSync] Error creating actions:', error);
    throw error;
  }

  console.log(`[useMikrotikSync] Created ${actions.length} action(s) of type ${tipo} for empresa`);
}

/**
 * Get the default profile slug for an empresa
 * Uses the first profile ordered by priority
 */
export async function getDefaultProfileSlug(empresaId: string): Promise<string> {
  const { data: perfil } = await supabase
    .from('perfis_velocidade')
    .select('nome')
    .eq('empresa_id', empresaId)
    .order('prioridade', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (perfil) {
    return toProfileSlug(perfil.nome);
  }

  return 'default'; // MikroTik's built-in default profile
}
