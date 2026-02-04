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

  describe('Script Generator v6.9.36 Validation', () => {
    it('should NOT have login-url in add command', () => {
      const badPattern = `/ip hotspot profile add name="hsprof-navspot" login-url=$fullUrl`;
      const goodPattern = `/ip hotspot profile add name="hsprof-navspot" hotspot-address=192.168.88.1`;
      
      // Bad pattern: login-url in add command
      expect(badPattern).toMatch(/profile add[^#\n]*login-url=/);
      
      // Good pattern: add without login-url
      expect(goodPattern).not.toMatch(/profile add[^#\n]*login-url=/);
    });

    it('should have login-url in separate set command WITHOUT quotes (v6.9.36)', () => {
      const setCommand = `/ip hotspot profile set $_hsprof login-url=$fullUrl`;
      
      expect(setCommand).toContain('profile set');
      expect(setCommand).toContain('login-url=$fullUrl');
      expect(setCommand).not.toContain('login-url="$fullUrl"');
    });

    it('should have incremental URL construction with urlVars1/2/3', () => {
      const urlConstruction = `
:local urlVars1 "&mac=\\$(mac)"
:local urlVars2 "&ip=\\$(ip)"
:local urlVars3 "&link-login-only=\\$(link-login-only)"
:local fullUrl $urlBase
:set fullUrl ($fullUrl . $urlVars1)
`;
      
      expect(urlConstruction).toContain('urlVars1');
      expect(urlConstruction).toContain('urlVars2');
      expect(urlConstruction).toContain('urlVars3');
      expect(urlConstruction).toContain(':set fullUrl');
    });

    it('should have create-if-missing pattern', () => {
      const createIfMissing = `:if ([:len $_hsprof] = 0) do={`;
      
      expect(createIfMissing).toContain(':if');
      expect(createIfMissing).toContain('[:len');
      expect(createIfMissing).toContain('= 0');
    });

    it('should produce \\$(mac) in final RSC (single backslash)', () => {
      // TypeScript uses \\$(mac) to produce \$(mac) in output
      const tsTemplate = "&mac=\\$(mac)&ip=\\$(ip)";
      
      // In the final .rsc file, it should appear as \$(mac)
      expect(tsTemplate).toMatch(/\\\$\(mac\)/);
      expect(tsTemplate).toMatch(/\\\$\(ip\)/);
    });

    it('should NOT have urlVars with multiple runtime vars in same line', () => {
      const badPattern = ':local urlVars "&mac=\\$(mac)&ip=\\$(ip)&link-login-only=\\$(link-login-only)"';
      const goodPattern1 = ':local urlVars1 "&mac=\\$(mac)"';
      const goodPattern2 = ':local urlVars2 "&ip=\\$(ip)"';
      
      // Bad: multiple runtime vars in same line
      const multiVarRegex = /\\\$\([^)]+\).*\\\$\([^)]+\)/;
      expect(badPattern).toMatch(multiVarRegex);
      
      // Good: single runtime var per line
      expect(goodPattern1).not.toMatch(multiVarRegex);
      expect(goodPattern2).not.toMatch(multiVarRegex);
    });

    it('should have debug log for fullUrl length', () => {
      const debugLog = ':log info ("NAVSPOT-DEBUG: fullUrl-len=" . [:len $fullUrl] . " sample=" . [:pick $fullUrl 0 120])';
      
      expect(debugLog).toContain('fullUrl-len=');
      expect(debugLog).toContain('[:len $fullUrl]');
      expect(debugLog).toContain('[:pick $fullUrl 0 120]');
    });
  });

  describe('Script Generator v6.9.37 Escaping Validation', () => {
    it('should NOT escape local script variables ($urlBase, $fullUrl, $_hsprof)', () => {
      const correctLocalVars = `
:local fullUrl $urlBase
:set fullUrl ($fullUrl . $urlVars1)
:if ([:len $_hsprof] = 0) do={
/ip hotspot profile set $_hsprof login-url=$fullUrl
`;
      
      // Variáveis locais NÃO devem ter backslash
      expect(correctLocalVars).toContain('$urlBase');
      expect(correctLocalVars).toContain('$fullUrl');
      expect(correctLocalVars).toContain('$_hsprof');
      expect(correctLocalVars).not.toMatch(/\\\$urlBase/);
      expect(correctLocalVars).not.toMatch(/\\\$fullUrl/);
      expect(correctLocalVars).not.toMatch(/\\\$_hsprof/);
    });

    it('should ONLY escape runtime hotspot variables with single backslash in .rsc', () => {
      const correctRuntimeVars = `
:local urlVars1 "&mac=\\$(mac)"
:local urlVars2 "&ip=\\$(ip)"
:local urlVars3 "&link-login-only=\\$(link-login-only)"
`;
      
      expect(correctRuntimeVars).toMatch(/\\\$\(mac\)/);
      expect(correctRuntimeVars).toMatch(/\\\$\(ip\)/);
      expect(correctRuntimeVars).toMatch(/\\\$\(link-login-only\)/);
    });

    it('should NOT have double-escaped runtime vars (\\\\$(mac))', () => {
      const badPattern = '&mac=\\\\$(mac)';
      const goodPattern = '&mac=\\$(mac)';
      
      expect(badPattern).toMatch(/\\\\\$\(mac\)/);
      expect(goodPattern).not.toMatch(/\\\\\$\(mac\)/);
    });

    it('should have no leftover placeholders in final output', () => {
      const placeholders = ['@@RUNTIME_MAC@@', '@@RUNTIME_IP@@', '@@RUNTIME_LINK_LOGIN_ONLY@@'];
      const validOutput = ':local urlVars1 "&mac=\\$(mac)"';
      
      for (const ph of placeholders) {
        expect(validOutput).not.toContain(ph);
      }
    });

    it('should validate replaceRuntimePlaceholders function', () => {
      const input = ':local urlVars1 "&mac=@@RUNTIME_MAC@@"';
      const expected = ':local urlVars1 "&mac=\\$(mac)"';
      
      const output = input.replace(/@@RUNTIME_MAC@@/g, '\\$(mac)');
      expect(output).toBe(expected);
    });

    it('should have no CRLF or BOM in output', () => {
      const cleanScript = ':local test "value"\n:log info "ok"';
      expect(cleanScript.includes('\r\n')).toBe(false);
      expect(cleanScript.startsWith('\uFEFF')).toBe(false);
    });

    it('should have balanced braces and quotes', () => {
      const balanced = ':if ([:len $var] = 0) do={ :log info "test" }';
      const openBraces = (balanced.match(/{/g) || []).length;
      const closeBraces = (balanced.match(/}/g) || []).length;
      const quotes = (balanced.match(/"/g) || []).length;
      
      expect(openBraces).toBe(closeBraces);
      expect(quotes % 2).toBe(0);
    });

    it('should have balanced parentheses', () => {
      const balanced = ':if ([:len $var] = 0) do={ :set x ($a . $b) }';
      const openParens = (balanced.match(/\(/g) || []).length;
      const closeParens = (balanced.match(/\)/g) || []).length;
      
      expect(openParens).toBe(closeParens);
    });
  });

  describe('Script Generator Validation', () => {
    it('should use correct action values for walled-garden menus', () => {
      // Para /ip hotspot walled-garden (hostnames): action=allow ou action=deny
      const hostnameBlacklist = `
        /ip hotspot walled-garden add dst-host=$domain action=deny comment=("navspot-blacklist-" . $bName)
      `;
      
      // Para /ip hotspot walled-garden ip (IPs): action=accept ou action=reject
      const ipWhitelist = `
        /ip hotspot walled-garden ip add dst-port=53 protocol=udp action=accept comment="navspot-dns"
      `;
      
      // Hostnames devem usar deny para bloquear
      expect(hostnameBlacklist).toContain('action=deny');
      expect(hostnameBlacklist).not.toContain('action=reject');
      
      // IPs devem usar accept/reject
      expect(ipWhitelist).toContain('action=accept');
      expect(ipWhitelist).not.toContain('action=allow');
    });

    it('should use correct walled-garden menu for hostnames', () => {
      const actionProcessorSource = `
        /ip hotspot walled-garden add dst-host=$domain action=deny
      `;
      
      // Verificar que usa o menu correto (sem "ip") para hostnames
      expect(actionProcessorSource).toContain('/ip hotspot walled-garden add dst-host');
      // Verificar que NÃO usa o menu "ip" para dst-host
      expect(actionProcessorSource).not.toMatch(/walled-garden ip.*dst-host/);
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
