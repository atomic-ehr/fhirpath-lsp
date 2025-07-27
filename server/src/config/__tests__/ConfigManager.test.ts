import { ConfigManager, DEFAULT_APP_CONFIG } from '../ConfigManager';
import { FileConfigLoader } from '../loaders/FileConfigLoader';
import { EnvironmentConfigLoader } from '../loaders/EnvironmentConfigLoader';
import { RuntimeConfigLoader } from '../loaders/RuntimeConfigLoader';
import { DiagnosticConfigValidator } from '../validators/DiagnosticConfigValidator';
import { ProviderConfigValidator } from '../validators/ProviderConfigValidator';
import { CompositeConfigValidator } from '../validators/ConfigValidator';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let tempDir: string;
  let tempConfigFile: string;

  beforeEach(() => {
    configManager = new ConfigManager();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
    tempConfigFile = path.join(tempDir, 'test-config.json');
  });

  afterEach(() => {
    // Clean up temp files
    if (fs.existsSync(tempConfigFile)) {
      fs.unlinkSync(tempConfigFile);
    }
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir);
    }
  });

  describe('Basic Configuration Management', () => {
    test('should initialize with default configuration', () => {
      const config = configManager.getConfig();
      expect(config).toEqual(DEFAULT_APP_CONFIG);
    });

    test('should get configuration values by path', () => {
      expect(configManager.get('diagnostics.enabled')).toBe(true);
      expect(configManager.get('diagnostics.performance.maxComplexity')).toBe(10);
      expect(configManager.get('providers.refactoring.enabled')).toBe(true);
    });

    test('should set configuration values by path', () => {
      configManager.set('diagnostics.performance.maxComplexity', 15);
      expect(configManager.get('diagnostics.performance.maxComplexity')).toBe(15);
    });

    test('should check if configuration path exists', () => {
      expect(configManager.has('diagnostics.enabled')).toBe(true);
      expect(configManager.has('nonexistent.path')).toBe(false);
    });

    test('should delete configuration values by path', () => {
      configManager.set('diagnostics.performance.maxComplexity', 15);
      expect(configManager.has('diagnostics.performance.maxComplexity')).toBe(true);

      const deleted = configManager.delete('diagnostics.performance.maxComplexity');
      expect(deleted).toBe(true);
      expect(configManager.has('diagnostics.performance.maxComplexity')).toBe(false);
    });

    test('should handle nested path creation', () => {
      configManager.set('new.nested.path', 'value');
      expect(configManager.get('new.nested.path')).toBe('value');
    });
  });

  describe('Configuration Loaders', () => {
    test('should register and use file loader', async () => {
      const testConfig = {
        diagnostics: {
          performance: {
            maxComplexity: 20
          }
        }
      };

      // Write test configuration file
      fs.writeFileSync(tempConfigFile, JSON.stringify(testConfig, null, 2));

      const fileLoader = new FileConfigLoader(tempConfigFile);
      configManager.registerLoader('test-file', fileLoader);

      await configManager.loadConfiguration();

      expect(configManager.get('diagnostics.performance.maxComplexity')).toBe(20);
    });

    test('should register and use environment loader', async () => {
      // Set environment variable
      process.env.FHIRPATH_LSP_DIAGNOSTICS_PERFORMANCE_MAX_COMPLEXITY = '25';

      const envLoader = new EnvironmentConfigLoader();
      configManager.registerLoader('test-env', envLoader);

      await configManager.loadConfiguration();

      expect(configManager.get('diagnostics.performance.maxComplexity')).toBe(25);

      // Clean up
      delete process.env.FHIRPATH_LSP_DIAGNOSTICS_PERFORMANCE_MAX_COMPLEXITY;
    });

    test('should register and use runtime loader', async () => {
      const runtimeLoader = new RuntimeConfigLoader({
        diagnostics: {
          performance: {
            maxComplexity: 30
          }
        }
      });

      configManager.registerLoader('test-runtime', runtimeLoader);

      await configManager.loadConfiguration();

      expect(configManager.get('diagnostics.performance.maxComplexity')).toBe(30);
    });

    test('should handle loader priority correctly', async () => {
      // Create multiple loaders with different values
      const fileConfig = { diagnostics: { performance: { maxComplexity: 10 } } };
      fs.writeFileSync(tempConfigFile, JSON.stringify(fileConfig, null, 2));

      const fileLoader = new FileConfigLoader(tempConfigFile);
      const runtimeLoader = new RuntimeConfigLoader({
        diagnostics: { performance: { maxComplexity: 20 } }
      });

      // Register loaders (runtime should have higher priority due to order)
      configManager.registerLoader('file', fileLoader);
      configManager.registerLoader('runtime', runtimeLoader);

      await configManager.loadConfiguration();

      // Runtime loader should override file loader
      expect(configManager.get('diagnostics.performance.maxComplexity')).toBe(20);
    });
  });

  describe('Configuration Validation', () => {
    test('should register and use validators', () => {
      const diagnosticValidator = new DiagnosticConfigValidator();
      const providerValidator = new ProviderConfigValidator();
      const compositeValidator = new CompositeConfigValidator();

      compositeValidator.addValidator(diagnosticValidator);
      compositeValidator.addValidator(providerValidator);

      configManager.registerValidator('composite', compositeValidator);

      // Test valid configuration
      const validResult = configManager.validate(DEFAULT_APP_CONFIG);
      expect(validResult.isValid).toBe(true);
      expect(validResult.errors).toHaveLength(0);
    });

    test('should validate path-specific values', () => {
      const diagnosticValidator = new DiagnosticConfigValidator();
      configManager.registerValidator('diagnostic', diagnosticValidator);

      // Test invalid value
      const invalidResult = configManager.validatePath('diagnostics.performance.maxComplexity', 'invalid');
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(0);

      // Test valid value
      const validResult = configManager.validatePath('diagnostics.performance.maxComplexity', 15);
      expect(validResult.isValid).toBe(true);
      expect(validResult.errors).toHaveLength(0);
    });

    test('should prevent setting invalid configuration values', () => {
      const diagnosticValidator = new DiagnosticConfigValidator();
      configManager.registerValidator('diagnostic', diagnosticValidator);

      expect(() => {
        configManager.set('diagnostics.performance.maxComplexity', 'invalid');
      }).toThrow();
    });
  });

  describe('Configuration Change Events', () => {
    test('should emit change events when configuration is updated', (done) => {
      let eventReceived = false;

      const unsubscribe = configManager.onChange((event) => {
        expect(event.path).toBe('diagnostics.performance.maxComplexity');
        expect(event.oldValue).toBe(10);
        expect(event.newValue).toBe(15);
        eventReceived = true;
      });

      configManager.set('diagnostics.performance.maxComplexity', 15);

      setTimeout(() => {
        expect(eventReceived).toBe(true);
        unsubscribe();
        done();
      }, 10);
    });

    test('should handle multiple change listeners', () => {
      let listener1Called = false;
      let listener2Called = false;

      const unsubscribe1 = configManager.onChange(() => {
        listener1Called = true;
      });

      const unsubscribe2 = configManager.onChange(() => {
        listener2Called = true;
      });

      configManager.set('diagnostics.enabled', false);

      expect(listener1Called).toBe(true);
      expect(listener2Called).toBe(true);

      unsubscribe1();
      unsubscribe2();
    });
  });

  describe('Configuration Persistence', () => {
    test('should save configuration to registered loaders', async () => {
      const fileLoader = new FileConfigLoader(tempConfigFile);
      configManager.registerLoader('test-file', fileLoader);

      // Update configuration
      configManager.set('diagnostics.performance.maxComplexity', 25);

      // Save configuration
      await configManager.saveConfiguration();

      // Verify file was written
      expect(fs.existsSync(tempConfigFile)).toBe(true);

      // Load and verify content
      const savedConfig = JSON.parse(fs.readFileSync(tempConfigFile, 'utf-8'));
      expect(savedConfig.diagnostics.performance.maxComplexity).toBe(25);
    });
  });

  describe('Configuration Metadata', () => {
    test('should track configuration metadata', async () => {
      const fileLoader = new FileConfigLoader(tempConfigFile);
      configManager.registerLoader('test-file', fileLoader);

      // Write test configuration
      fs.writeFileSync(tempConfigFile, JSON.stringify({
        diagnostics: { enabled: false }
      }, null, 2));

      await configManager.loadConfiguration();

      const metadata = configManager.getMetadata('diagnostics');
      expect(metadata).toBeDefined();
      expect(metadata?.schema).toBe('DiagnosticConfig');
    });
  });

  describe('Configuration Merging', () => {
    test('should merge partial configurations correctly', () => {
      const partialConfig = {
        diagnostics: {
          performance: {
            maxComplexity: 20
          }
        }
      };

      configManager.updateConfig(partialConfig);

      // Should update only the specified values
      expect(configManager.get('diagnostics.performance.maxComplexity')).toBe(20);
      expect(configManager.get('diagnostics.performance.maxNestingDepth')).toBe(5); // Should remain default
      expect(configManager.get('providers.refactoring.enabled')).toBe(true); // Should remain default
    });

    test('should handle deep merging of nested objects', () => {
      const partialConfig = {
        diagnostics: {
          performance: {
            maxComplexity: 15,
            flagRedundantOperations: false
          },
          codeQuality: {
            maxLineLength: 120
          }
        }
      };

      configManager.updateConfig(partialConfig);

      expect(configManager.get('diagnostics.performance.maxComplexity')).toBe(15);
      expect(configManager.get('diagnostics.performance.flagRedundantOperations')).toBe(false);
      expect(configManager.get('diagnostics.performance.maxNestingDepth')).toBe(5); // Should remain default
      expect(configManager.get('diagnostics.codeQuality.maxLineLength')).toBe(120);
      expect(configManager.get('diagnostics.codeQuality.enabled')).toBe(true); // Should remain default
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid configuration gracefully', async () => {
      // Write invalid JSON
      fs.writeFileSync(tempConfigFile, 'invalid json');

      const fileLoader = new FileConfigLoader(tempConfigFile);
      configManager.registerLoader('test-file', fileLoader);

      // Should not throw, but should log warning
      await expect(configManager.loadConfiguration()).rejects.toThrow();
    });

    test('should handle missing configuration files gracefully', async () => {
      const fileLoader = new FileConfigLoader('/nonexistent/path/config.json');
      configManager.registerLoader('test-file', fileLoader);

      // Should not throw, should use defaults
      await configManager.loadConfiguration();
      expect(configManager.get('diagnostics.enabled')).toBe(true);
    });

    test('should handle validation errors in change listeners', () => {
      const diagnosticValidator = new DiagnosticConfigValidator();
      configManager.registerValidator('diagnostic', diagnosticValidator);

      // This should not crash the system
      expect(() => {
        configManager.onChange(() => {
          throw new Error('Listener error');
        });
        configManager.set('diagnostics.performance.maxComplexity', 15);
      }).not.toThrow();
    });
  });

  describe('Performance', () => {
    test('should handle large configuration objects efficiently', () => {
      const largeConfig: any = {
        diagnostics: {
          globalRules: {}
        }
      };

      // Create a large number of rules
      for (let i = 0; i < 1000; i++) {
        largeConfig.diagnostics.globalRules[`rule_${i}`] = {
          enabled: true,
          severity: 2,
          parameters: { value: i }
        };
      }

      const startTime = Date.now();
      configManager.updateConfig(largeConfig);
      const endTime = Date.now();

      // Should complete within reasonable time (less than 100ms)
      expect(endTime - startTime).toBeLessThan(100);

      // Verify configuration was set correctly
      expect(configManager.get('diagnostics.globalRules.rule_500.parameters.value')).toBe(500);
    });

    test('should handle frequent configuration updates efficiently', () => {
      const startTime = Date.now();

      // Perform many updates
      for (let i = 0; i < 100; i++) {
        configManager.set('diagnostics.performance.maxComplexity', i);
      }

      const endTime = Date.now();

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(100);
      expect(configManager.get('diagnostics.performance.maxComplexity')).toBe(99);
    });
  });
});
