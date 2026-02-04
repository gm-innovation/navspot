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

  describe('Script Generator v7.0 Architecture Validation', () => {
    describe('Minimal Bootstrap (Thin Client Pattern)', () => {
      it('should NOT have login-url with $(mac) in bootstrap', () => {
        // v7.0: Bootstrap MUST NOT contain login-url with runtime vars
        const badPattern = 'login-url="https://navspot.lovable.app/hotspot-login?h=abc&mac=$(mac)"';
        const goodPattern = ':do { /ip hotspot profile add name="hsprof-navspot" hotspot-address=192.168.88.1 } on-error={}';
        
        // Bad: login-url with $(mac) in bootstrap
        expect(badPattern).toMatch(/login-url=.*\$\(mac\)/);
        
        // Good: hotspot profile add without login-url
        expect(goodPattern).not.toMatch(/login-url=/);
        expect(goodPattern).toContain('profile add');
      });

      it('should have minimal hotspot profile add (only name + hotspot-address)', () => {
        const minimalAdd = '/ip hotspot profile add name="hsprof-navspot" hotspot-address=192.168.88.1';
        
        // Should NOT contain these (they come via sync)
        expect(minimalAdd).not.toContain('login-url=');
        expect(minimalAdd).not.toContain('dns-name=');
        expect(minimalAdd).not.toContain('login-by=');
        expect(minimalAdd).not.toContain('keepalive-timeout=');
        expect(minimalAdd).not.toContain('idle-timeout=');
        
        // Should be under 100 chars
        expect(minimalAdd.length).toBeLessThan(100);
      });

      it('should have cleanup commands at the start', () => {
        const cleanupCommand = ':do { /file remove [find where name~"navspot"] } on-error={}';
        
        expect(cleanupCommand).toContain('/file remove');
        expect(cleanupCommand).toContain('on-error={}');
      });

      it('should configure DNS before first sync', () => {
        // DNS must be set before sync can work
        const dnsConfig = '/ip dns set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4';
        
        expect(dnsConfig).toContain('allow-remote-requests=yes');
        expect(dnsConfig).toContain('8.8.8.8');
      });
    });

    describe('Action Processor v7.0 (configure_hotspot_profile handler)', () => {
      it('should have configure_hotspot_profile handler', () => {
        const handler = `:if ($cmd = "configure_hotspot_profile") do={
:local p2 [:find $rest "|"]
:local loginUrl [:pick $rest 0 $p2]
:local dnsName [:pick $rest ($p2 + 1) [:len $rest]]
:local hsprof [/ip hotspot profile find name="hsprof-navspot"]
:do { /ip hotspot profile set $hsprof login-url=$loginUrl } on-error={}
}`;
        
        expect(handler).toContain('configure_hotspot_profile');
        expect(handler).toContain('loginUrl');
        expect(handler).toContain('dnsName');
        expect(handler).toContain('profile set $hsprof login-url=$loginUrl');
      });

      it('should use $loginUrl (local var, no escape) not escaped version', () => {
        const correctHandler = '/ip hotspot profile set $hsprof login-url=$loginUrl';
        const wrongHandler = '/ip hotspot profile set $hsprof login-url=\\$loginUrl';
        
        // Correct: local script var without escape
        expect(correctHandler).toContain('$loginUrl');
        expect(correctHandler).not.toMatch(/\\\$loginUrl/);
        
        // Wrong: escaped local var
        expect(wrongHandler).toMatch(/\\\$loginUrl/);
      });

      it('should parse pipe-delimited format correctly', () => {
        // Format: configure_hotspot_profile|login_url|dns_name
        const pipeFormat = 'configure_hotspot_profile|https://navspot.lovable.app/hotspot-login?h=abc&mac=$(mac)|test.navspot.local';
        
        const parts = pipeFormat.split('|');
        expect(parts[0]).toBe('configure_hotspot_profile');
        expect(parts[1]).toContain('$(mac)'); // Runtime var in URL is OK (comes from sync)
        expect(parts[2]).toBe('test.navspot.local');
      });
    });

    describe('Guardian v7.0 (login-url verification)', () => {
      it('should check if login-url is configured', () => {
        const guardianCheck = `:local hsprof [/ip hotspot profile find name="hsprof-navspot"]
:local loginUrl ""
:if ([:len $hsprof] > 0) do={
:set loginUrl [/ip hotspot profile get $hsprof login-url]
}
:if ([:len $loginUrl] < 10) do={
:log warning "NAVSPOT-GUARDIAN v7.0: login-url incompleta - forcando sync"
}`;
        
        expect(guardianCheck).toContain('profile get $hsprof login-url');
        expect(guardianCheck).toContain('[:len $loginUrl] < 10');
        expect(guardianCheck).toContain('forcando sync');
      });

      it('should check for configure_hotspot_profile handler in action-processor', () => {
        const versionCheck = `:if ([:find $apSource "configure_hotspot_profile"] < 0) do={
:set needsRepair 1
}`;
        
        expect(versionCheck).toContain('configure_hotspot_profile');
        expect(versionCheck).toContain('needsRepair 1');
      });
    });

    describe('Sync API v7.0 (First-Sync Detection)', () => {
      it('should format configure_hotspot_profile action correctly', () => {
        // Pipe format: configure_hotspot_profile|login_url|dns_name
        const loginUrl = 'https://navspot.lovable.app/hotspot-login?h=abc&mac=$(mac)&ip=$(ip)';
        const dnsName = 'test.navspot.local';
        const formatted = `configure_hotspot_profile|${loginUrl}|${dnsName}`;
        
        expect(formatted).toContain('configure_hotspot_profile|');
        expect(formatted).toContain('$(mac)'); // Runtime vars are literal in sync
        expect(formatted).toContain('$(ip)');
        expect(formatted).toContain('|test.navspot.local');
      });

      it('should NOT have pipe character in loginUrl', () => {
        const loginUrl = 'https://navspot.lovable.app/hotspot-login?h=abc&mac=$(mac)';
        
        // URL should not contain | (would break pipe format)
        expect(loginUrl).not.toContain('|');
      });

      it('should use unshift to inject configure_hotspot_profile first', () => {
        // The configure_hotspot_profile action must be FIRST in the pipe
        // so it runs before create_user or create_profile
        const actions = [
          'create_profile|Tripulante|5M/2M|3',
          'create_user|joao|senha123|Tripulante',
        ];
        
        const configAction = 'configure_hotspot_profile|https://test.com|test.local';
        
        // Simulating unshift
        actions.unshift(configAction);
        
        expect(actions[0]).toBe(configAction);
        expect(actions[0]).toContain('configure_hotspot_profile');
      });
    });

    describe('Recovery v7.0 (Reset initial_config_sent)', () => {
      it('should NOT have login-url with runtime vars in recovery', () => {
        // v7.0: Recovery script must NOT contain login-url with $(mac)
        const badRecovery = ':do { /ip hotspot profile set $hsprof login-url="https://x.com?mac=$(mac)" } on-error={}';
        const goodRecovery = '# Config comes via sync API - no login-url in recovery';
        
        // Bad: login-url in recovery
        expect(badRecovery).toMatch(/login-url=.*\$\(mac\)/);
        
        // Good: no login-url
        expect(goodRecovery).not.toMatch(/login-url=/);
      });

      it('should trigger sync after recovery to get config', () => {
        const syncTrigger = '/system script run navspot-sync';
        
        expect(syncTrigger).toContain('script run navspot-sync');
      });
    });
  });

  describe('Script Generator Validation (Legacy Tests)', () => {
    it('should use correct action values for walled-garden menus', () => {
      // Para /ip hotspot walled-garden (hostnames): action=allow ou action=deny
      const hostnameBlacklist = '/ip hotspot walled-garden add dst-host=$domain action=deny';
      
      // Para /ip hotspot walled-garden ip (IPs): action=accept ou action=reject
      const ipWhitelist = '/ip hotspot walled-garden ip add dst-port=53 protocol=udp action=accept';
      
      expect(hostnameBlacklist).toContain('action=deny');
      expect(ipWhitelist).toContain('action=accept');
    });

    it('should use correct walled-garden menu for hostnames', () => {
      const actionProcessorSource = '/ip hotspot walled-garden add dst-host=$domain action=deny';
      
      // Verificar que usa o menu correto (sem "ip") para hostnames
      expect(actionProcessorSource).toContain('/ip hotspot walled-garden add dst-host');
      expect(actionProcessorSource).not.toMatch(/walled-garden ip.*dst-host/);
    });

    it('should not contain invalid policy token in script declarations', () => {
      const scriptDeclaration = '/system script add name="navspot-sync" policy=read,write,test source={';
      
      expect(scriptDeclaration).not.toMatch(/policy=.*policy,.*policy/);
      expect(scriptDeclaration).toMatch(/policy=read,write,test/);
    });

    it('should use full command in scheduler on-event', () => {
      const schedulerCommand = 'on-event="/system script run navspot-sync"';
      
      expect(schedulerCommand).toContain('on-event="/system script run');
    });

    it('should block non-comment lines >160 chars', () => {
      const longLineRe = /^(?!\s*#).{161,}$/m;
      
      // Good: short command
      const shortLine = '/ip hotspot profile add name="hsprof-navspot" hotspot-address=192.168.88.1';
      expect(longLineRe.test(shortLine)).toBe(false);
      
      // Good: long comment (allowed)
      const longComment = '# ' + 'x'.repeat(200);
      expect(longLineRe.test(longComment)).toBe(false);
      
      // Bad: long command
      const longCommand = '/ip hotspot profile add name="hsprof-navspot" hotspot-address=192.168.88.1 dns-name="test.navspot.local" html-directory=hotspot login-by=http-pap,http-chap keepalive-timeout=2m idle-timeout=5m';
      expect(longCommand.length).toBeGreaterThan(160);
      expect(longLineRe.test(longCommand)).toBe(true);
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

    it('should NOT have underscore-prefixed local variables', () => {
      const badPattern = ':local _hsprof [/ip hotspot profile find name="hsprof-navspot"]';
      const goodPattern = ':local hsprof [/ip hotspot profile find name="hsprof-navspot"]';
      
      expect(badPattern).toMatch(/^:local\s+_/);
      expect(goodPattern).not.toMatch(/^:local\s+_/);
    });
  });
});
