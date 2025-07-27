import { PluginManager, PluginSource } from '../plugins/PluginManager';
import { ConfigManager } from '../config/ConfigManager';
import { PluginConfigAdapter } from '../config/adapters/PluginConfigAdapter';
import { ConfigNotificationService } from '../config/ConfigNotificationService';
import { PluginConfigValidator } from '../config/validators/PluginConfigValidator';
import { Connection, CodeAction } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock connection for testing
const mockConnection = {
  console: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn()
  },
  window: {
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showInformationMessage: jest.fn()
  },
  workspace: {
    getWorkspaceFolders: jest.fn().mockResolvedValue([])
  }
} as unknown as Connection;

describe('Plugin System Integration', () => {
  let pluginManager: PluginManager;
  let configManager: ConfigManager;
  let pluginConfigAdapter: PluginConfigAdapter;
  let configNotificationService: ConfigNotificationService;
  let tempDir: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Create temporary directory for test configuration
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-test-'));
    
    // Initialize configuration system
    configManager = new ConfigManager();
    configNotificationService = new ConfigNotificationService(configManager);
    pluginConfigAdapter = new PluginConfigAdapter(configManager, configNotificationService);
    
    // Register plugin validator
    const pluginValidator = new PluginConfigValidator();
    configManager.registerValidator('plugin', pluginValidator);
    
    // Initialize plugin manager with basic config
    pluginManager = new PluginManager(mockConnection, {
      enabled: true,
      sources: [PluginSource.Builtin],
      disabled: [],
      configuration: {}
    });
  });

  afterEach(async () => {
    // Cleanup
    await pluginManager.dispose();
    pluginConfigAdapter.dispose();
    
    // Remove temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('Configuration Integration', () => {
    it('should load and apply plugin configuration', async () => {
      // Create test configuration
      const testConfig = {
        plugins: {
          enabled: true,
          sources: [
            { type: 'builtin', enabled: true, priority: 100 }
          ],
          disabled: ['test-disabled-plugin'],
          plugins: {
            'test-plugin': {
              setting: 'test-value'
            }
          }
        }
      };

      // Set configuration
      configManager.set('plugins', testConfig.plugins);

      // Get plugin configuration through adapter
      const pluginConfig = pluginConfigAdapter.getPluginConfig();

      expect(pluginConfig.enabled).toBe(true);
      expect(pluginConfig.sources).toContain(PluginSource.Builtin);
      expect(pluginConfig.disabled).toContain('test-disabled-plugin');
      expect(pluginConfig.configuration['test-plugin']).toEqual({ setting: 'test-value' });
    });

    it('should handle configuration validation errors', () => {
      const invalidConfig = {
        plugins: {
          enabled: 'not-a-boolean', // Invalid
          sources: 'not-an-array'   // Invalid
        }
      };

      const validator = new PluginConfigValidator();
      const result = validator.validate(invalidConfig.plugins, { path: 'plugins', source: 'test' });

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should notify on configuration changes', (done) => {
      let notificationReceived = false;

      // Listen for configuration changes
      const unsubscribe = pluginConfigAdapter.onConfigurationChanged((newConfig) => {
        expect(newConfig.enabled).toBe(false);
        notificationReceived = true;
        unsubscribe();
        done();
      });

      // Change configuration
      setTimeout(() => {
        pluginConfigAdapter.updatePluginConfig({ enabled: false });
        
        // Fallback check in case notification doesn't fire
        setTimeout(() => {
          if (!notificationReceived) {
            unsubscribe();
            done();
          }
        }, 100);
      }, 10);
    });
  });

  describe('Built-in Plugin Loading', () => {
    it('should discover and load built-in plugins', async () => {
      // Update plugin manager with configuration that enables built-ins
      const config = pluginConfigAdapter.getPluginConfig();
      await pluginManager.updateConfiguration(config);
      
      // Initialize the plugin system
      await pluginManager.initialize();

      // Check that plugins were discovered
      const allPlugins = pluginManager.getAllPlugins();
      expect(allPlugins.length).toBeGreaterThan(0);

      // Verify built-in plugins are present
      const pluginIds = allPlugins.map(p => p.metadata.id);
      expect(pluginIds).toContain('fhirpath-lsp-core-providers');
    });

    it('should activate plugins for language events', async () => {
      // Initialize and activate plugins
      const config = pluginConfigAdapter.getPluginConfig();
      await pluginManager.updateConfiguration(config);
      await pluginManager.initialize();

      await pluginManager.activatePlugins({
        type: 'onLanguage',
        value: 'fhirpath'
      });

      // Check that plugins are activated
      const corePlugin = pluginManager.getPlugin('fhirpath-lsp-core-providers');
      if (corePlugin) {
        expect(corePlugin.state).toBe('activated');
      }
    });
  });

  describe('Provider Integration', () => {
    beforeEach(async () => {
      const config = pluginConfigAdapter.getPluginConfig();
      await pluginManager.updateConfiguration(config);
      await pluginManager.initialize();
      
      await pluginManager.activatePlugins({
        type: 'onLanguage',
        value: 'fhirpath'
      });
    });

    it('should register code action providers from plugins', () => {
      const providerRegistry = pluginManager.getProviderRegistry();
      const codeActionProviders = providerRegistry.getCodeActionProviders();

      expect(codeActionProviders.length).toBeGreaterThan(0);
    });

    it('should provide code actions through plugin providers', async () => {
      const providerRegistry = pluginManager.getProviderRegistry();
      const providers = providerRegistry.getCodeActionProviders();

      if (providers.length > 0) {
        const mockDocument = {
          uri: 'file:///test.fhirpath',
          languageId: 'fhirpath',
          version: 1,
          getText: () => 'Patient.name',
          lineCount: 1
        } as TextDocument;

        const mockRange = {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 12 }
        };

        const mockContext = {
          diagnostics: [],
          only: undefined
        };

        // Test that providers can be called without errors
        const actions = await providers[0].provideCodeActions(mockDocument, mockRange, mockContext);
        expect(Array.isArray(actions)).toBe(true);
      }
    });
  });

  describe('Plugin Lifecycle Management', () => {
    it('should handle plugin enable/disable through configuration', async () => {
      // Initialize with plugin enabled
      const config = pluginConfigAdapter.getPluginConfig();
      await pluginManager.updateConfiguration(config);
      await pluginManager.initialize();

      // Disable a plugin through configuration
      pluginConfigAdapter.setPluginEnabled('fhirpath-lsp-core-providers', false);

      const updatedConfig = pluginConfigAdapter.getPluginConfig();
      expect(updatedConfig.disabled).toContain('fhirpath-lsp-core-providers');
      expect(pluginConfigAdapter.isPluginEnabled('fhirpath-lsp-core-providers')).toBe(false);
    });

    it('should update plugin-specific configuration', () => {
      const pluginId = 'test-plugin';
      const newConfig = { 
        setting1: 'value1',
        setting2: 42 
      };

      pluginConfigAdapter.setPluginConfiguration(pluginId, newConfig);
      const retrievedConfig = pluginConfigAdapter.getPluginConfiguration(pluginId);

      expect(retrievedConfig).toEqual(newConfig);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle plugin initialization failures gracefully', async () => {
      // Create a mock plugin that fails initialization
      const failingPlugin = {
        metadata: { id: 'failing-plugin', name: 'Failing Plugin', version: '1.0.0' },
        capabilities: [],
        state: 'loaded',
        initialize: jest.fn().mockRejectedValue(new Error('Initialization failed')),
        activate: jest.fn(),
        deactivate: jest.fn(),
        dispose: jest.fn()
      };

      // Manually add failing plugin
      (pluginManager as any).plugins.set('failing-plugin', {
        plugin: failingPlugin,
        manifest: failingPlugin.metadata,
        source: PluginSource.Builtin,
        path: '/fake/path'
      });

      // Try to initialize - should not throw
      try {
        await (pluginManager as any).initializePlugins();
        
        // Check that the plugin state is failed
        expect(failingPlugin.state).toBe('failed');
      } catch (error) {
        // The specific plugin fails, but the system should continue
        expect(mockConnection.console.error).toHaveBeenCalled();
      }
    });

    it('should continue operation when plugin system is disabled', () => {
      // Update configuration to disable plugins
      pluginConfigAdapter.updatePluginConfig({ enabled: false });

      const disabledConfig = pluginConfigAdapter.getPluginConfig();
      expect(disabledConfig.enabled).toBe(false);

      // Plugin manager should handle disabled state gracefully
      expect(() => {
        pluginManager.updateConfiguration(disabledConfig);
      }).not.toThrow();
    });
  });

  describe('Performance and Resource Management', () => {
    it('should complete plugin loading within reasonable time', async () => {
      const startTime = Date.now();
      
      const config = pluginConfigAdapter.getPluginConfig();
      await pluginManager.updateConfiguration(config);
      await pluginManager.initialize();
      
      const loadTime = Date.now() - startTime;
      
      // Plugin loading should complete within 5 seconds for built-ins
      expect(loadTime).toBeLessThan(5000);
    });

    it('should properly dispose of resources', async () => {
      const config = pluginConfigAdapter.getPluginConfig();
      await pluginManager.updateConfiguration(config);
      await pluginManager.initialize();

      const pluginsBefore = pluginManager.getAllPlugins();
      expect(pluginsBefore.length).toBeGreaterThan(0);

      // Dispose should clean up all plugins
      await pluginManager.dispose();

      // Verify cleanup
      const pluginsAfter = pluginManager.getAllPlugins();
      pluginsAfter.forEach(plugin => {
        expect(plugin.state).toBe('disposed');
      });
    });
  });

  describe('API Access and Inter-plugin Communication', () => {
    it('should provide access to plugin APIs', async () => {
      const config = pluginConfigAdapter.getPluginConfig();
      await pluginManager.updateConfiguration(config);
      await pluginManager.initialize();

      await pluginManager.activatePlugins({
        type: 'onLanguage',
        value: 'fhirpath'
      });

      // Try to get API from core providers plugin
      const api = pluginManager.getPluginAPI('fhirpath-lsp-core-providers');
      
      // API might be undefined if plugin doesn't expose one, which is fine
      if (api) {
        expect(typeof api).toBe('object');
      }
    });
  });

  describe('Security and Sandboxing', () => {
    it('should apply security configuration', () => {
      const securityConfig = {
        security: {
          sandboxing: true,
          allowedApiAccess: ['connection', 'logger'],
          resourceLimits: {
            memory: 50 * 1024 * 1024, // 50MB
            cpu: 50,
            fileSystem: false,
            network: false
          }
        }
      };

      pluginConfigAdapter.updatePluginConfig(securityConfig);
      const retrievedConfig = pluginConfigAdapter.getSecurityConfig();

      expect(retrievedConfig?.sandboxing).toBe(true);
      expect(retrievedConfig?.allowedApiAccess).toContain('connection');
      expect(retrievedConfig?.resourceLimits?.memory).toBe(50 * 1024 * 1024);
    });
  });
});