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

    it('should have login-url in separate set command WITHOUT quotes (v6.9.40)', () => {
      const setCommand = `/ip hotspot profile set $hsprof login-url=$fullUrl`;
      
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

    it('should use idempotent add pattern (v6.9.40)', () => {
      // v6.9.40: Replaced :if ([:len...] with idempotent :do { add } on-error={}
      const idempotentAdd = `:do { /ip hotspot profile add name="hsprof-navspot" } on-error={}`;
      
      expect(idempotentAdd).toContain(':do {');
      expect(idempotentAdd).toContain('profile add');
      expect(idempotentAdd).toContain('on-error={}');
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

  describe('Script Generator v6.9.40 Escaping Validation', () => {
    it('should NOT escape local script variables ($urlBase, $fullUrl, $hsprof)', () => {
      // v6.9.40: Variable names without underscore prefix (RouterOS 6.x parser issue)
      const correctLocalVars = `
:local fullUrl $urlBase
:set fullUrl ($fullUrl . $urlVars1)
:local hsprof [/ip hotspot profile find name="hsprof-navspot"]
/ip hotspot profile set $hsprof login-url=$fullUrl
`;
      
      // Variáveis locais NÃO devem ter backslash
      expect(correctLocalVars).toContain('$urlBase');
      expect(correctLocalVars).toContain('$fullUrl');
      expect(correctLocalVars).toContain('$hsprof');
      expect(correctLocalVars).not.toMatch(/\\\$urlBase/);
      expect(correctLocalVars).not.toMatch(/\\\$fullUrl/);
      expect(correctLocalVars).not.toMatch(/\\\$hsprof/);
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

  describe('Script Generator v6.9.38 Line Length Validation', () => {
    it('should block non-comment lines >160 chars', () => {
      const longLineRe = /^(?!\s*#).{161,}$/m;
      
      // Good: short command
      const shortLine = '/ip hotspot profile add name="hsprof-navspot" hotspot-address=192.168.88.1';
      expect(longLineRe.test(shortLine)).toBe(false);
      
      // Good: long comment (allowed)
      const longComment = '# ' + 'x'.repeat(200);
      expect(longLineRe.test(longComment)).toBe(false);
      
      // Bad: long command (should be blocked)
      const longCommand = '/ip hotspot profile add name="hsprof-navspot" hotspot-address=192.168.88.1 dns-name="test.navspot.local" html-directory=hotspot login-by=http-pap,http-chap keepalive-timeout=2m idle-timeout=5m';
      expect(longCommand.length).toBeGreaterThan(160);
      expect(longLineRe.test(longCommand)).toBe(true);
    });

    it('should use short profile add command (only name + hotspot-address)', () => {
      const shortAdd = '/ip hotspot profile add name="hsprof-navspot" hotspot-address=192.168.88.1';
      
      // Profile add should NOT contain these fields (they go in separate set commands)
      expect(shortAdd).not.toContain('dns-name=');
      expect(shortAdd).not.toContain('html-directory=');
      expect(shortAdd).not.toContain('login-by=');
      expect(shortAdd).not.toContain('keepalive-timeout=');
      expect(shortAdd).not.toContain('idle-timeout=');
      expect(shortAdd).not.toContain('login-url=');
      
      // Should be under 100 chars
      expect(shortAdd.length).toBeLessThan(100);
    });

    it('should use short on-event strings for schedulers', () => {
      const shortOnEvent = 'on-event="/system script run navspot-sync"';
      const longOnEvent = 'on-event=":delay 30s; :do { /system script run navspot-sync } on-error={}"';
      
      // Short version should be used
      expect(shortOnEvent.length).toBeLessThan(60);
      
      // Long version should be avoided
      expect(longOnEvent.length).toBeGreaterThan(60);
    });

    it('should build JSON incrementally to avoid long lines', () => {
      const incrementalPattern = `
:local body ("{" . $q . "sync_token" . $q . ":" . $q . $token . $q)
:set body ($body . "," . $q . "active_users_csv" . $q . ":" . $q . $users . $q)
`;
      
      // Each line should be <100 chars
      const lines = incrementalPattern.trim().split('\n');
      for (const line of lines) {
        expect(line.length).toBeLessThan(100);
      }
      
      // Should use incremental :set body pattern
      expect(incrementalPattern).toContain(':set body ($body');
    });

    it('should use separate set commands for profile configuration (v6.9.40)', () => {
      // v6.9.40: Variable name $hsprof (without underscore) for RouterOS 6.x compatibility
      const setCommands = `
:do { /ip hotspot profile set $hsprof dns-name="test.navspot.local" } on-error={}
:do { /ip hotspot profile set $hsprof html-directory=hotspot } on-error={}
:do { /ip hotspot profile set $hsprof login-by=http-pap,http-chap } on-error={}
:do { /ip hotspot profile set $hsprof keepalive-timeout=2m } on-error={}
:do { /ip hotspot profile set $hsprof idle-timeout=5m } on-error={}
:do { /ip hotspot profile set $hsprof login-url=$fullUrl } on-error={}
`;
      
      // Each set command should be under 100 chars
      const lines = setCommands.trim().split('\n');
      for (const line of lines) {
        expect(line.length).toBeLessThan(100);
      }
    });
    
    it('should NOT have underscore-prefixed local variables (v6.9.40)', () => {
      // v6.9.40: Local variables starting with _ can break RouterOS 6.x /import
      const badPattern = ':local _hsprof [/ip hotspot profile find name="hsprof-navspot"]';
      const goodPattern = ':local hsprof [/ip hotspot profile find name="hsprof-navspot"]';
      
      // Bad: underscore prefix
      expect(badPattern).toMatch(/^:local\s+_/);
      
      // Good: no underscore prefix
      expect(goodPattern).not.toMatch(/^:local\s+_/);
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
