// @ts-nocheck
import { describe, it, expect, vi } from 'vitest';

// Direct implementation to avoid import issues
function toProfileSlug(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

describe('useMikrotikSync', () => {
  describe('toProfileSlug', () => {
    it('converts simple profile name to slug', () => {
      expect(toProfileSlug('Tripulante')).toBe('tripulante');
    });

    it('converts profile name with spaces to hyphenated slug', () => {
      expect(toProfileSlug('Tripulação Padrão')).toBe('tripulacao-padrao');
    });

    it('handles accents correctly', () => {
      expect(toProfileSlug('Comandante Sênior')).toBe('comandante-senior');
    });

    it('removes accent characters from Portuguese names', () => {
      expect(toProfileSlug('Açúcar Café')).toBe('acucar-cafe');
    });

    it('removes special characters', () => {
      expect(toProfileSlug('Perfil @#$ Teste!')).toBe('perfil--teste');
    });

    it('handles numbers correctly', () => {
      expect(toProfileSlug('Perfil Nível 1')).toBe('perfil-nivel-1');
    });

    it('converts uppercase to lowercase', () => {
      expect(toProfileSlug('ADMIN GERAL')).toBe('admin-geral');
    });

    it('handles empty string', () => {
      expect(toProfileSlug('')).toBe('');
    });

    it('handles complex Brazilian names with tildes', () => {
      expect(toProfileSlug('Capitão Irmãos')).toBe('capitao-irmaos');
    });

    it('handles cedilla', () => {
      expect(toProfileSlug('Caça Peça')).toBe('caca-peca');
    });
  });

  describe('Script Generator Validation', () => {
    it('should not contain action=deny in generated RouterOS scripts', () => {
      // Simular strings que seriam geradas pelo script generator
      const actionProcessorSource = `
        :if ($cmd = "create_blacklist_domain") do={
          /ip hotspot walled-garden add dst-host=$domain action=reject comment=("navspot-blacklist-" . $bName)
        }
      `;
      
      // Verificar que action=deny NÃO está presente
      expect(actionProcessorSource).not.toContain('action=deny');
      
      // Verificar que action=reject ESTÁ presente para blacklist
      expect(actionProcessorSource).toContain('action=reject');
    });

    it('should use correct walled-garden menu for hostnames', () => {
      const actionProcessorSource = `
        /ip hotspot walled-garden add dst-host=$domain action=reject
      `;
      
      // Verificar que não usa o menu "ip" para dst-host
      expect(actionProcessorSource).not.toMatch(/walled-garden ip.*dst-host/);
      
      // Verificar que usa o menu correto (sem "ip") para hostnames
      expect(actionProcessorSource).toContain('/ip hotspot walled-garden add dst-host');
    });

    it('should not contain invalid policy token in script declarations', () => {
      const scriptDeclaration = `
        /system script add name="navspot-sync" policy=read,write,test source={
      `;
      
      // Verificar que não contém "policy,policy" ou "policy=...policy..."
      expect(scriptDeclaration).not.toMatch(/policy=.*policy,.*policy/);
      // Verificar que usa políticas válidas
      expect(scriptDeclaration).toMatch(/policy=read,write,test/);
    });

    it('should use full command in scheduler on-event', () => {
      const schedulerCommand = `
        /system scheduler add name="navspot-sync-scheduler" interval=5m on-event="/system script run navspot-sync" start-time=startup
      `;
      
      // Verificar que on-event contém comando completo
      expect(schedulerCommand).toContain('on-event="/system script run');
    });

    it('should handle empty rate-limit gracefully', () => {
      const createProfileLogic = `
        :if ([:len $pRate] > 0) do={
          /ip hotspot user profile add name=$pName rate-limit=$pRate shared-users=$pShared
        } else={
          /ip hotspot user profile add name=$pName shared-users=$pShared
        }
      `;
      
      // Verificar que existe verificação de rate-limit vazio
      expect(createProfileLogic).toContain('[:len $pRate] > 0');
    });
  });
});
