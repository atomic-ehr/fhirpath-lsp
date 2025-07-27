import { PluginConfigValidator } from '../validators/PluginConfigValidator';
import { PluginConfig } from '../schemas/PluginConfig';
import { ValidationContext } from '../validators/ConfigValidator';

describe('PluginConfigValidator', () => {
  let validator: PluginConfigValidator;
  let mockContext: ValidationContext;

  beforeEach(() => {
    validator = new PluginConfigValidator();
    mockContext = {
      path: 'plugins',
      source: 'test'
    };
  });

  describe('Basic Configuration Validation', () => {
    it('should validate correct plugin configuration', () => {
      const config: Partial<PluginConfig> = {
        enabled: true,
        sources: [
          { type: 'builtin', enabled: true, priority: 100 },
          { type: 'local', enabled: true, priority: 80 }
        ],
        local: {
          paths: ['.fhirpath-lsp/plugins']
        },
        disabled: [],
        plugins: {}
      };

      const result = validator.validate(config, mockContext);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate enabled flag', () => {
      const result1 = validator.validate({ enabled: true }, mockContext);
      expect(result1.isValid).toBe(true);

      const result2 = validator.validate({ enabled: 'true' as any }, mockContext);
      expect(result2.isValid).toBe(false);
      expect(result2.errors[0].message).toContain('boolean');
    });
  });

  describe('Sources Configuration Validation', () => {
    it('should validate correct sources', () => {
      const config = {
        sources: [
          { type: 'builtin', enabled: true, priority: 100 },
          { type: 'npm', enabled: false, priority: 60 }
        ]
      };

      const result = validator.validate(config, mockContext);
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid source types', () => {
      const config = {
        sources: [
          { type: 'invalid-type', enabled: true }
        ]
      };

      const result = validator.validate(config, mockContext);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('builtin, npm, local, registry');
    });

    it('should reject non-array sources', () => {
      const config = {
        sources: 'not-an-array'
      };

      const result = validator.validate(config, mockContext);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('array');
    });

    it('should validate priority ranges', () => {
      const config = {
        sources: [
          { type: 'builtin', enabled: true, priority: 150 } // Invalid: > 100
        ]
      };

      const result = validator.validate(config, mockContext);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('between 0 and 100');
    });

    it('should warn about duplicate source types', () => {
      const config = {
        sources: [
          { type: 'builtin', enabled: true },
          { type: 'builtin', enabled: false } // Duplicate
        ]
      };

      const result = validator.validate(config, mockContext);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain('Duplicate');
    });
  });

  describe('Local Configuration Validation', () => {
    it('should validate local paths', () => {
      const config = {
        local: {
          paths: ['.fhirpath-lsp/plugins', '/absolute/path']
        }
      };

      const result = validator.validate(config, mockContext);
      expect(result.isValid).toBe(true);
    });

    it('should reject non-string paths', () => {
      const config = {
        local: {
          paths: ['valid-path', 123] // Invalid number
        }
      };

      const result = validator.validate(config, mockContext);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('string');
    });

    it('should reject non-array paths', () => {
      const config = {
        local: {
          paths: 'not-an-array'
        }
      };

      const result = validator.validate(config, mockContext);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('array');
    });
  });

  describe('Registry Configuration Validation', () => {
    it('should validate correct registry config', () => {
      const config = {
        registry: {
          url: 'https://plugins.fhirpath-lsp.org',
          token: 'secret-token',
          timeout: 5000
        }
      };

      const result = validator.validate(config, mockContext);
      expect(result.isValid).toBe(true);
    });

    it('should require valid URL', () => {
      const config = {
        registry: {
          url: 'not-a-url'
        }
      };

      const result = validator.validate(config, mockContext);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('valid URL');
    });

    it('should require URL to be present', () => {
      const config = {
        registry: {
          token: 'token-without-url'
        }
      };

      const result = validator.validate(config, mockContext);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('required');
    });

    it('should validate timeout values', () => {
      const config1 = {
        registry: {
          url: 'https://example.com',
          timeout: -1 // Invalid: negative
        }
      };

      const result1 = validator.validate(config1, mockContext);
      expect(result1.isValid).toBe(false);
      expect(result1.errors[0].message).toContain('positive number');

      const config2 = {
        registry: {
          url: 'https://example.com',
          timeout: 500 // Valid but low - should warn
        }
      };

      const result2 = validator.validate(config2, mockContext);
      expect(result2.isValid).toBe(true);
      expect(result2.warnings).toHaveLength(1);
      expect(result2.warnings[0].message).toContain('very low');
    });
  });

  describe('Disabled Plugins Validation', () => {
    it('should validate plugin IDs', () => {
      const config = {
        disabled: ['valid-plugin-id', 'another_valid-id']
      };

      const result = validator.validate(config, mockContext);
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid plugin IDs', () => {
      const config = {
        disabled: ['valid-id', 'invalid@id', 'another.invalid.id']
      };

      const result = validator.validate(config, mockContext);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2); // Two invalid IDs
    });

    it('should reject non-array disabled list', () => {
      const config = {
        disabled: 'not-an-array'
      };

      const result = validator.validate(config, mockContext);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('array');
    });
  });

  describe('Security Configuration Validation', () => {
    it('should validate security configuration', () => {
      const config = {
        security: {
          sandboxing: true,
          allowedApiAccess: ['connection', 'logger'],
          resourceLimits: {
            memory: 104857600, // 100MB
            cpu: 80,
            fileSystem: false,
            network: false
          }
        }
      };

      const result = validator.validate(config, mockContext);
      expect(result.isValid).toBe(true);
    });

    it('should validate memory limits', () => {
      const config = {
        security: {
          resourceLimits: {
            memory: 500 // Too low - should warn
          }
        }
      };

      const result = validator.validate(config, mockContext);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain('very low');
    });

    it('should validate CPU limits', () => {
      const config = {
        security: {
          resourceLimits: {
            cpu: 150 // Invalid: > 100
          }
        }
      };

      const result = validator.validate(config, mockContext);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('between 0 and 100');
    });

    it('should warn about unknown APIs', () => {
      const config = {
        security: {
          allowedApiAccess: ['connection', 'unknown-api']
        }
      };

      const result = validator.validate(config, mockContext);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain('Unknown API');
    });
  });

  describe('Loading Configuration Validation', () => {
    it('should validate loading configuration', () => {
      const config = {
        loading: {
          timeout: 30000,
          retries: 3,
          parallel: true
        }
      };

      const result = validator.validate(config, mockContext);
      expect(result.isValid).toBe(true);
    });

    it('should validate loading timeout', () => {
      const config = {
        loading: {
          timeout: 1000 // Low but valid - should warn
        }
      };

      const result = validator.validate(config, mockContext);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain('very low');
    });

    it('should validate retry count', () => {
      const config = {
        loading: {
          retries: 15 // Too high
        }
      };

      const result = validator.validate(config, mockContext);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('between 0 and 10');
    });
  });

  describe('Plugin-Specific Configuration Validation', () => {
    it('should validate plugin configuration object', () => {
      const config = {
        plugins: {
          'valid-plugin-id': { setting: 'value' },
          'another-plugin': { number: 42 }
        }
      };

      const result = validator.validate(config, mockContext);
      expect(result.isValid).toBe(true);
    });

    it('should warn about invalid plugin IDs in configuration', () => {
      const config = {
        plugins: {
          'valid-id': { setting: 'value' },
          'invalid@id': { setting: 'value' }
        }
      };

      const result = validator.validate(config, mockContext);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain('alphanumeric');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty configuration', () => {
      const result = validator.validate({}, mockContext);
      expect(result.isValid).toBe(true);
    });

    it('should handle null and undefined values', () => {
      const config = {
        enabled: undefined,
        sources: null,
        disabled: undefined
      };

      const result = validator.validate(config, mockContext);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});