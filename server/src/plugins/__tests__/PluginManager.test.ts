import { PluginManager, PluginSource } from '../PluginManager';
import { 
  IPlugin, 
  PluginState, 
  PluginCapabilityType,
  PluginMetadata,
  PluginCapability,
  PluginContext
} from '../interfaces/IPlugin';
import { IProviderPlugin, ProviderRegistration } from '../interfaces/IProviderPlugin';
import { IAnalyzerPlugin, AnalyzerRegistration } from '../interfaces/IAnalyzerPlugin';
import { Connection } from 'vscode-languageserver';

// Mock connection
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
  }
} as unknown as Connection;

// Mock plugin implementations
class MockProviderPlugin implements IPlugin, IProviderPlugin {
  readonly metadata: PluginMetadata = {
    id: 'test-provider-plugin',
    name: 'Test Provider Plugin',
    version: '1.0.0'
  };

  readonly capabilities: PluginCapability[] = [
    { type: PluginCapabilityType.CodeAction, version: '1.0.0' }
  ];

  state: PluginState = PluginState.Loaded;
  private providers: ProviderRegistration[] = [];

  async initialize(context: PluginContext): Promise<void> {
    this.state = PluginState.Initialized;
  }

  async activate(): Promise<void> {
    this.providers = [
      {
        type: PluginCapabilityType.CodeAction,
        provider: {
          provideCodeActions: async () => []
        },
        priority: 100
      }
    ];
    this.state = PluginState.Activated;
  }

  async deactivate(): Promise<void> {
    this.providers = [];
    this.state = PluginState.Deactivated;
  }

  dispose(): void {
    this.state = PluginState.Disposed;
  }

  getProviders(): ProviderRegistration[] {
    return this.providers;
  }
}

class MockAnalyzerPlugin implements IPlugin, IAnalyzerPlugin {
  readonly metadata: PluginMetadata = {
    id: 'test-analyzer-plugin',
    name: 'Test Analyzer Plugin',
    version: '1.0.0'
  };

  readonly capabilities: PluginCapability[] = [
    { type: PluginCapabilityType.Analyzer, version: '1.0.0' }
  ];

  state: PluginState = PluginState.Loaded;
  private analyzers: AnalyzerRegistration[] = [];

  async initialize(context: PluginContext): Promise<void> {
    this.state = PluginState.Initialized;
  }

  async activate(): Promise<void> {
    this.analyzers = [
      {
        id: 'test-analyzer',
        name: 'Test Analyzer',
        analyzer: {
          analyze: async () => ({ diagnostics: [] })
        },
        priority: 50
      }
    ];
    this.state = PluginState.Activated;
  }

  async deactivate(): Promise<void> {
    this.analyzers = [];
    this.state = PluginState.Deactivated;
  }

  dispose(): void {
    this.state = PluginState.Disposed;
  }

  getAnalyzers(): AnalyzerRegistration[] {
    return this.analyzers;
  }
}

describe('PluginManager', () => {
  let pluginManager: PluginManager;

  beforeEach(() => {
    jest.clearAllMocks();
    pluginManager = new PluginManager(mockConnection, {
      enabled: true,
      sources: [PluginSource.Builtin],
      disabled: [],
      configuration: {}
    });
  });

  afterEach(async () => {
    await pluginManager.dispose();
  });

  describe('Initialization', () => {
    it('should initialize successfully with valid configuration', async () => {
      // Mock built-in plugin discovery
      const originalDiscoverBuiltinPlugins = (pluginManager as any).discoverBuiltinPlugins;
      (pluginManager as any).discoverBuiltinPlugins = async () => {
        // Manually add a mock plugin
        (pluginManager as any).plugins.set('test-plugin', {
          plugin: new MockProviderPlugin(),
          manifest: {
            id: 'test-plugin',
            name: 'Test Plugin',
            version: '1.0.0',
            main: 'test.js',
            capabilities: [{ type: PluginCapabilityType.CodeAction, version: '1.0.0' }]
          },
          source: PluginSource.Builtin,
          path: '/fake/path',
          activationEvents: [{ type: 'onLanguage', value: 'fhirpath' }]
        });
      };

      await pluginManager.initialize();

      expect(mockConnection.console.log).toHaveBeenCalledWith(
        expect.stringContaining('Plugin manager initialized')
      );

      // Restore original method
      (pluginManager as any).discoverBuiltinPlugins = originalDiscoverBuiltinPlugins;
    });

    it('should handle initialization failure gracefully', async () => {
      // Mock a failing discovery
      const originalDiscoverPlugins = (pluginManager as any).discoverPlugins;
      (pluginManager as any).discoverPlugins = async () => {
        throw new Error('Discovery failed');
      };

      await expect(pluginManager.initialize()).rejects.toThrow('Discovery failed');

      // Restore original method
      (pluginManager as any).discoverPlugins = originalDiscoverPlugins;
    });
  });

  describe('Plugin Activation', () => {
    beforeEach(async () => {
      // Setup a mock plugin for activation tests
      const mockPlugin = new MockProviderPlugin();
      (pluginManager as any).plugins.set('test-plugin', {
        plugin: mockPlugin,
        manifest: {
          id: 'test-plugin',
          name: 'Test Plugin',
          version: '1.0.0',
          main: 'test.js',
          capabilities: [{ type: PluginCapabilityType.CodeAction, version: '1.0.0' }]
        },
        source: PluginSource.Builtin,
        path: '/fake/path',
        activationEvents: [{ type: 'onLanguage', value: 'fhirpath' }],
        context: {
          metadata: mockPlugin.metadata,
          connection: mockConnection as any,
          storagePath: '/fake/storage',
          configuration: {},
          logger: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn(),
            debug: jest.fn()
          },
          extensionContext: {} as any
        }
      });

      await mockPlugin.initialize((pluginManager as any).plugins.get('test-plugin').context);
    });

    it('should activate plugins for specific events', async () => {
      await pluginManager.activatePlugins({
        type: 'onLanguage',
        value: 'fhirpath'
      });

      const plugin = pluginManager.getPlugin('test-plugin');
      expect(plugin?.state).toBe(PluginState.Activated);
    });

    it('should activate specific plugin by ID', async () => {
      await pluginManager.activatePlugin('test-plugin');

      const plugin = pluginManager.getPlugin('test-plugin');
      expect(plugin?.state).toBe(PluginState.Activated);
    });

    it('should handle activation failure', async () => {
      // Mock plugin that fails activation
      const failingPlugin = new MockProviderPlugin();
      failingPlugin.activate = async () => {
        throw new Error('Activation failed');
      };

      (pluginManager as any).plugins.set('failing-plugin', {
        plugin: failingPlugin,
        manifest: {
          id: 'failing-plugin',
          name: 'Failing Plugin',
          version: '1.0.0',
          main: 'failing.js',
          capabilities: [{ type: PluginCapabilityType.CodeAction, version: '1.0.0' }]
        },
        source: PluginSource.Builtin,
        path: '/fake/failing/path',
        context: {
          metadata: failingPlugin.metadata,
          connection: mockConnection as any,
          storagePath: '/fake/storage',
          configuration: {},
          logger: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn(),
            debug: jest.fn()
          },
          extensionContext: {} as any
        }
      });

      await failingPlugin.initialize((pluginManager as any).plugins.get('failing-plugin').context);

      await expect(pluginManager.activatePlugin('failing-plugin')).rejects.toThrow('Activation failed');
      expect(failingPlugin.state).toBe(PluginState.Failed);
    });
  });

  describe('Plugin Registration', () => {
    it('should register provider plugins correctly', async () => {
      const mockPlugin = new MockProviderPlugin();
      
      // Manually set up plugin
      (pluginManager as any).plugins.set('provider-test', {
        plugin: mockPlugin,
        manifest: mockPlugin.metadata,
        source: PluginSource.Builtin,
        path: '/fake/path',
        context: {
          metadata: mockPlugin.metadata,
          connection: mockConnection as any,
          storagePath: '/fake/storage',
          configuration: {},
          logger: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn(),
            debug: jest.fn()
          },
          extensionContext: {} as any
        }
      });

      await mockPlugin.initialize((pluginManager as any).plugins.get('provider-test').context);
      await mockPlugin.activate();

      // Register capabilities
      (pluginManager as any).registerPluginCapabilities((pluginManager as any).plugins.get('provider-test'));

      const providerRegistry = pluginManager.getProviderRegistry();
      const codeActionProviders = providerRegistry.getCodeActionProviders();

      expect(codeActionProviders.length).toBeGreaterThan(0);
    });

    it('should register analyzer plugins correctly', async () => {
      const mockPlugin = new MockAnalyzerPlugin();
      
      // Manually set up plugin
      (pluginManager as any).plugins.set('analyzer-test', {
        plugin: mockPlugin,
        manifest: mockPlugin.metadata,
        source: PluginSource.Builtin,
        path: '/fake/path',
        context: {
          metadata: mockPlugin.metadata,
          connection: mockConnection as any,
          storagePath: '/fake/storage',
          configuration: {},
          logger: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn(),
            debug: jest.fn()
          },
          extensionContext: {} as any
        }
      });

      await mockPlugin.initialize((pluginManager as any).plugins.get('analyzer-test').context);
      await mockPlugin.activate();

      // Register capabilities
      (pluginManager as any).registerPluginCapabilities((pluginManager as any).plugins.get('analyzer-test'));

      const analyzerRegistry = pluginManager.getAnalyzerRegistry();
      const analyzers = analyzerRegistry.getAllAnalyzers();

      expect(analyzers.length).toBeGreaterThan(0);
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration correctly', async () => {
      const newConfig = {
        enabled: true,
        sources: [PluginSource.Local],
        disabled: ['disabled-plugin'],
        configuration: { 'test-plugin': { setting: 'value' } }
      };

      await pluginManager.updateConfiguration(newConfig);

      expect((pluginManager as any).config).toEqual(newConfig);
    });

    it('should update plugin-specific configuration', () => {
      const mockPlugin = new MockProviderPlugin();
      mockPlugin.onConfigurationChanged = jest.fn();

      (pluginManager as any).plugins.set('config-test', {
        plugin: mockPlugin,
        context: {
          metadata: mockPlugin.metadata,
          configuration: {},
          logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
        }
      });

      const newConfig = { setting: 'new-value' };
      pluginManager.updatePluginConfiguration('config-test', newConfig);

      expect(mockPlugin.onConfigurationChanged).toHaveBeenCalledWith(newConfig);
    });
  });

  describe('Plugin Lifecycle', () => {
    let mockPlugin: MockProviderPlugin;

    beforeEach(async () => {
      mockPlugin = new MockProviderPlugin();
      (pluginManager as any).plugins.set('lifecycle-test', {
        plugin: mockPlugin,
        manifest: mockPlugin.metadata,
        source: PluginSource.Builtin,
        path: '/fake/path',
        context: {
          metadata: mockPlugin.metadata,
          connection: mockConnection as any,
          storagePath: '/fake/storage',
          configuration: {},
          logger: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn(),
            debug: jest.fn()
          },
          extensionContext: {} as any
        }
      });

      await mockPlugin.initialize((pluginManager as any).plugins.get('lifecycle-test').context);
    });

    it('should complete full plugin lifecycle', async () => {
      // Activate
      await pluginManager.activatePlugin('lifecycle-test');
      expect(mockPlugin.state).toBe(PluginState.Activated);

      // Deactivate
      await pluginManager.deactivatePlugin('lifecycle-test');
      expect(mockPlugin.state).toBe(PluginState.Deactivated);

      // Dispose happens during cleanup
    });

    it('should handle plugin disposal', async () => {
      await pluginManager.activatePlugin('lifecycle-test');
      await pluginManager.dispose();

      expect(mockPlugin.state).toBe(PluginState.Disposed);
    });
  });

  describe('Error Handling', () => {
    it('should handle plugin not found errors', async () => {
      await expect(pluginManager.activatePlugin('non-existent')).rejects.toThrow('Plugin non-existent not found');
    });

    it('should handle invalid plugin state errors', async () => {
      const mockPlugin = new MockProviderPlugin();
      mockPlugin.state = PluginState.Failed;

      (pluginManager as any).plugins.set('failed-plugin', {
        plugin: mockPlugin,
        manifest: mockPlugin.metadata,
        source: PluginSource.Builtin,
        path: '/fake/path'
      });

      await expect(pluginManager.activatePlugin('failed-plugin')).rejects.toThrow('Plugin failed-plugin is not initialized');
    });
  });

  describe('Plugin API Access', () => {
    it('should provide access to plugin APIs', async () => {
      const mockPlugin = new MockProviderPlugin();
      mockPlugin.getAPI = () => ({ version: '1.0.0', test: true });

      (pluginManager as any).plugins.set('api-test', {
        plugin: mockPlugin,
        manifest: mockPlugin.metadata,
        source: PluginSource.Builtin,
        path: '/fake/path'
      });

      const api = pluginManager.getPluginAPI('api-test');
      expect(api).toEqual({ version: '1.0.0', test: true });
    });

    it('should return undefined for plugins without API', () => {
      const mockPlugin = new MockProviderPlugin();
      // No getAPI method

      (pluginManager as any).plugins.set('no-api-test', {
        plugin: mockPlugin,
        manifest: mockPlugin.metadata,
        source: PluginSource.Builtin,
        path: '/fake/path'
      });

      const api = pluginManager.getPluginAPI('no-api-test');
      expect(api).toBeUndefined();
    });
  });
});