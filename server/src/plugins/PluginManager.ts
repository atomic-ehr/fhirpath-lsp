import { Connection } from 'vscode-languageserver';
import * as path from 'path';
import * as fs from 'fs';
import {
  IPlugin,
  PluginState,
  PluginManifest,
  PluginContext,
  PluginMetadata,
  PluginCapabilityType,
  PluginActivationEvent,
  Disposable,
  PluginExtensionContext,
  PluginConnection,
  PluginLogger
} from './interfaces/IPlugin';
import { PluginLoader } from './lifecycle/PluginLoader';
import { DependencyResolver } from './lifecycle/DependencyResolver';
import { PluginValidator } from './lifecycle/PluginValidator';
import { ProviderRegistry } from './registry/ProviderRegistry';
import { AnalyzerRegistry } from './registry/AnalyzerRegistry';
import { ValidatorRegistry } from './registry/ValidatorRegistry';

/**
 * Plugin source types
 */
export enum PluginSource {
  Builtin = 'builtin',
  NPM = 'npm',
  Local = 'local',
  Registry = 'registry'
}

/**
 * Plugin instance with metadata
 */
interface PluginInstance {
  plugin: IPlugin;
  manifest: PluginManifest;
  source: PluginSource;
  path: string;
  context?: PluginContext;
  activationEvents?: PluginActivationEvent[];
  error?: Error;
}

/**
 * Plugin manager configuration
 */
export interface PluginManagerConfig {
  enabled: boolean;
  sources: PluginSource[];
  registry?: string;
  local?: {
    paths: string[];
  };
  disabled?: string[];
  configuration?: Record<string, any>;
}

/**
 * Central plugin manager that coordinates all plugin operations
 */
export class PluginManager {
  private plugins: Map<string, PluginInstance> = new Map();
  private connection: Connection;
  private config: PluginManagerConfig;
  private loader: PluginLoader;
  private resolver: DependencyResolver;
  private validator: PluginValidator;
  private providerRegistry: ProviderRegistry;
  private analyzerRegistry: AnalyzerRegistry;
  private validatorRegistry: ValidatorRegistry;
  private disposables: Disposable[] = [];
  private listeners = {
    activated: new Set<(plugin: IPlugin) => void>(),
    deactivated: new Set<(plugin: IPlugin) => void>()
  };

  constructor(connection: Connection, config: PluginManagerConfig) {
    this.connection = connection;
    this.config = config;
    this.loader = new PluginLoader(connection);
    this.resolver = new DependencyResolver();
    this.validator = new PluginValidator();
    this.providerRegistry = new ProviderRegistry(connection);
    this.analyzerRegistry = new AnalyzerRegistry(connection);
    this.validatorRegistry = new ValidatorRegistry(connection);
  }

  /**
   * Initialize the plugin manager
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      this.connection.console.log('Plugin system is disabled');
      return;
    }

    this.connection.console.log('Initializing plugin manager...');

    try {
      // Discover plugins from all configured sources
      await this.discoverPlugins();

      // Validate all discovered plugins
      await this.validatePlugins();

      // Resolve dependencies
      await this.resolveDependencies();

      // Load plugins
      await this.loadPlugins();

      // Initialize plugins
      await this.initializePlugins();

      this.connection.console.log(`Plugin manager initialized with ${this.plugins.size} plugins`);
    } catch (error) {
      this.connection.console.error(`Failed to initialize plugin manager: ${error}`);
      throw error;
    }
  }

  /**
   * Activate plugins based on activation events
   */
  async activatePlugins(event?: PluginActivationEvent): Promise<void> {
    const pluginsToActivate = event
      ? this.getPluginsForActivationEvent(event)
      : this.getAllInitializedPlugins();

    for (const instance of pluginsToActivate) {
      if (instance.plugin.state !== PluginState.Activated) {
        await this.activatePlugin(instance.plugin.metadata.id);
      }
    }
  }

  /**
   * Activate a specific plugin
   */
  async activatePlugin(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId);
    if (!instance) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (instance.plugin.state === PluginState.Activated) {
      return; // Already activated
    }

    if (instance.plugin.state !== PluginState.Initialized) {
      throw new Error(`Plugin ${pluginId} is not initialized`);
    }

    try {
      this.connection.console.log(`Activating plugin: ${pluginId}`);

      // Activate the plugin
      await instance.plugin.activate();
      (instance.plugin as any).state = PluginState.Activated;

      // Register plugin capabilities
      this.registerPluginCapabilities(instance);

      // Notify listeners
      this.listeners.activated.forEach(listener => listener(instance.plugin));

      this.connection.console.log(`Plugin activated: ${pluginId}`);
    } catch (error) {
      (instance.plugin as any).state = PluginState.Failed;
      instance.error = error as Error;
      this.connection.console.error(`Failed to activate plugin ${pluginId}: ${error}`);
      throw error;
    }
  }

  /**
   * Deactivate a plugin
   */
  async deactivatePlugin(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId);
    if (!instance) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (instance.plugin.state !== PluginState.Activated) {
      return; // Not activated
    }

    try {
      this.connection.console.log(`Deactivating plugin: ${pluginId}`);

      // Unregister plugin capabilities
      this.unregisterPluginCapabilities(instance);

      // Deactivate the plugin
      await instance.plugin.deactivate();
      (instance.plugin as any).state = PluginState.Deactivated;

      // Notify listeners
      this.listeners.deactivated.forEach(listener => listener(instance.plugin));

      this.connection.console.log(`Plugin deactivated: ${pluginId}`);
    } catch (error) {
      this.connection.console.error(`Failed to deactivate plugin ${pluginId}: ${error}`);
      throw error;
    }
  }

  /**
   * Get a plugin by ID
   */
  getPlugin(pluginId: string): IPlugin | undefined {
    return this.plugins.get(pluginId)?.plugin;
  }

  /**
   * Get all plugins
   */
  getAllPlugins(): IPlugin[] {
    return Array.from(this.plugins.values()).map(instance => instance.plugin);
  }

  /**
   * Get plugin API
   */
  getPluginAPI(pluginId: string): any {
    const plugin = this.getPlugin(pluginId);
    return plugin?.getAPI ? plugin.getAPI() : undefined;
  }

  /**
   * Update the plugin manager configuration
   */
  async updateConfiguration(newConfig: PluginManagerConfig): Promise<void> {
    this.config = newConfig;
    this.connection.console.log('Plugin manager configuration updated');
  }

  /**
   * Update plugin configuration
   */
  updatePluginConfiguration(pluginId: string, configuration: any): void {
    const instance = this.plugins.get(pluginId);
    if (!instance || !instance.context) {
      return;
    }

    instance.context.configuration = configuration;
    
    if (instance.plugin.onConfigurationChanged) {
      instance.plugin.onConfigurationChanged(configuration);
    }
  }

  /**
   * Dispose the plugin manager
   */
  async dispose(): Promise<void> {
    // Deactivate all plugins
    for (const [pluginId, instance] of this.plugins) {
      if (instance.plugin.state === PluginState.Activated) {
        await this.deactivatePlugin(pluginId);
      }
    }

    // Dispose all plugins
    for (const instance of this.plugins.values()) {
      try {
        instance.plugin.dispose();
        (instance.plugin as any).state = PluginState.Disposed;
      } catch (error) {
        this.connection.console.error(`Failed to dispose plugin ${instance.plugin.metadata.id}: ${error}`);
      }
    }

    // Clean up disposables
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];

    // Clear registries
    this.plugins.clear();
    this.listeners.activated.clear();
    this.listeners.deactivated.clear();
  }

  /**
   * Get registries for external access
   */
  getProviderRegistry(): ProviderRegistry {
    return this.providerRegistry;
  }

  getAnalyzerRegistry(): AnalyzerRegistry {
    return this.analyzerRegistry;
  }

  getValidatorRegistry(): ValidatorRegistry {
    return this.validatorRegistry;
  }

  /**
   * Discover plugins from all configured sources
   */
  private async discoverPlugins(): Promise<void> {
    this.connection.console.log('Discovering plugins...');

    for (const source of this.config.sources) {
      try {
        switch (source) {
          case PluginSource.Builtin:
            await this.discoverBuiltinPlugins();
            break;
          case PluginSource.NPM:
            await this.discoverNPMPlugins();
            break;
          case PluginSource.Local:
            await this.discoverLocalPlugins();
            break;
          case PluginSource.Registry:
            await this.discoverRegistryPlugins();
            break;
        }
      } catch (error) {
        this.connection.console.error(`Failed to discover plugins from ${source}: ${error}`);
      }
    }

    this.connection.console.log(`Discovered ${this.plugins.size} plugins`);
  }

  /**
   * Discover built-in plugins
   */
  private async discoverBuiltinPlugins(): Promise<void> {
    // For built-in plugins, we'll register them directly rather than discovering from disk
    // This avoids the complexity of file system discovery for built-in functionality
    
    const builtinPlugins = [
      {
        id: 'fhirpath-lsp-core-providers',
        name: 'FHIRPath LSP Core Providers', 
        version: '1.0.0',
        main: 'CoreProvidersPlugin.ts',
        capabilities: [{ type: 'codeAction' as any, version: '1.0.0' }],
        activationEvents: [{ type: 'onLanguage' as any, value: 'fhirpath' }]
      },
      {
        id: 'fhirpath-lsp-performance-analyzer',
        name: 'FHIRPath Performance Analyzer',
        version: '1.0.0', 
        main: 'PerformanceAnalyzerPlugin.ts',
        capabilities: [{ type: 'analyzer' as any, version: '1.0.0' }],
        activationEvents: [{ type: 'onLanguage' as any, value: 'fhirpath' }]
      }
    ];

    for (const manifest of builtinPlugins) {
      if (!this.isPluginDisabled(manifest.id)) {
        this.plugins.set(manifest.id, {
          plugin: null as any, // Will be loaded later
          manifest: manifest as any,
          source: PluginSource.Builtin,
          path: path.join(__dirname, 'builtin', manifest.main),
          activationEvents: manifest.activationEvents
        });
      }
    }
  }

  /**
   * Discover NPM plugins
   */
  private async discoverNPMPlugins(): Promise<void> {
    // TODO: Implement NPM plugin discovery
    // Look for packages with specific prefix or keyword
  }

  /**
   * Discover local plugins
   */
  private async discoverLocalPlugins(): Promise<void> {
    if (!this.config.local?.paths) {
      return;
    }

    for (const localPath of this.config.local.paths) {
      try {
        const manifests = await this.loader.discoverPlugins(localPath);
        
        for (const manifest of manifests) {
          if (!this.isPluginDisabled(manifest.id)) {
            const pluginPath = path.join(localPath, manifest.main);
            this.plugins.set(manifest.id, {
              plugin: null as any, // Will be loaded later
              manifest,
              source: PluginSource.Local,
              path: pluginPath,
              activationEvents: manifest.activationEvents
            });
          }
        }
      } catch (error) {
        this.connection.console.error(`Failed to discover local plugins from ${localPath}: ${error}`);
      }
    }
  }

  /**
   * Discover registry plugins
   */
  private async discoverRegistryPlugins(): Promise<void> {
    // TODO: Implement registry plugin discovery
    // Download and cache plugins from registry
  }

  /**
   * Validate all discovered plugins
   */
  private async validatePlugins(): Promise<void> {
    const invalidPlugins: string[] = [];

    for (const [pluginId, instance] of this.plugins) {
      try {
        const isValid = await this.validator.validate(instance.manifest);
        if (!isValid) {
          invalidPlugins.push(pluginId);
        }
      } catch (error) {
        this.connection.console.error(`Failed to validate plugin ${pluginId}: ${error}`);
        invalidPlugins.push(pluginId);
      }
    }

    // Remove invalid plugins
    for (const pluginId of invalidPlugins) {
      this.plugins.delete(pluginId);
    }

    if (invalidPlugins.length > 0) {
      this.connection.console.warn(`Removed ${invalidPlugins.length} invalid plugins`);
    }
  }

  /**
   * Resolve plugin dependencies
   */
  private async resolveDependencies(): Promise<void> {
    const manifests = Array.from(this.plugins.values()).map(i => i.manifest);
    const resolution = await this.resolver.resolve(manifests);

    if (!resolution.success) {
      const errors = resolution.errors.join(', ');
      throw new Error(`Failed to resolve plugin dependencies: ${errors}`);
    }

    // Reorder plugins based on dependency order
    const orderedPlugins = new Map<string, PluginInstance>();
    for (const pluginId of resolution.order) {
      const instance = this.plugins.get(pluginId);
      if (instance) {
        orderedPlugins.set(pluginId, instance);
      }
    }
    this.plugins = orderedPlugins;
  }

  /**
   * Load all plugins
   */
  private async loadPlugins(): Promise<void> {
    for (const [pluginId, instance] of this.plugins) {
      try {
        if (instance.source === PluginSource.Builtin) {
          // Load built-in plugins using the factory
          const plugin = await this.loadBuiltinPlugin(pluginId);
          instance.plugin = plugin;
          (plugin as any).state = PluginState.Loaded;
        } else {
          const plugin = await this.loader.load(instance.path);
          instance.plugin = plugin;
          (plugin as any).state = PluginState.Loaded;
        }
      } catch (error) {
        this.connection.console.error(`Failed to load plugin ${pluginId}: ${error}`);
        instance.error = error as Error;
        this.plugins.delete(pluginId);
      }
    }
  }

  /**
   * Initialize all loaded plugins
   */
  private async initializePlugins(): Promise<void> {
    for (const [pluginId, instance] of this.plugins) {
      if (instance.plugin.state !== PluginState.Loaded) {
        continue;
      }

      try {
        const context = this.createPluginContext(instance);
        instance.context = context;
        
        await instance.plugin.initialize(context);
        (instance.plugin as any).state = PluginState.Initialized;
      } catch (error) {
        this.connection.console.error(`Failed to initialize plugin ${pluginId}: ${error}`);
        instance.error = error as Error;
        (instance.plugin as any).state = PluginState.Failed;
      }
    }
  }

  /**
   * Create plugin context
   */
  private createPluginContext(instance: PluginInstance): PluginContext {
    const metadata = instance.plugin.metadata;
    const storagePath = this.getPluginStoragePath(metadata.id);
    const configuration = this.config.configuration?.[metadata.id] || {};

    const pluginConnection: PluginConnection = {
      console: {
        log: (message: string) => this.connection.console.log(`[${metadata.id}] ${message}`),
        error: (message: string) => this.connection.console.error(`[${metadata.id}] ${message}`),
        warn: (message: string) => this.connection.console.warn(`[${metadata.id}] ${message}`),
        info: (message: string) => this.connection.console.info(`[${metadata.id}] ${message}`)
      },
      window: {
        showErrorMessage: (message: string) => this.connection.window.showErrorMessage(`[${metadata.name}] ${message}`),
        showWarningMessage: (message: string) => this.connection.window.showWarningMessage(`[${metadata.name}] ${message}`),
        showInformationMessage: (message: string) => this.connection.window.showInformationMessage(`[${metadata.name}] ${message}`)
      }
    };

    const logger: PluginLogger = {
      log: (level, message, ...args) => {
        const formattedMessage = `[${metadata.id}] ${message}`;
        switch (level) {
          case 'error':
            this.connection.console.error(formattedMessage);
            break;
          case 'warn':
            this.connection.console.warn(formattedMessage);
            break;
          case 'info':
            this.connection.console.info(formattedMessage);
            break;
          case 'debug':
            this.connection.console.log(formattedMessage);
            break;
        }
      },
      error: (message, ...args) => logger.log('error', message, ...args),
      warn: (message, ...args) => logger.log('warn', message, ...args),
      info: (message, ...args) => logger.log('info', message, ...args),
      debug: (message, ...args) => logger.log('debug', message, ...args)
    };

    const extensionContext: PluginExtensionContext = {
      getPlugin: (id: string) => this.getPlugin(id),
      onPluginActivated: (listener) => {
        this.listeners.activated.add(listener);
        return { dispose: () => this.listeners.activated.delete(listener) };
      },
      onPluginDeactivated: (listener) => {
        this.listeners.deactivated.add(listener);
        return { dispose: () => this.listeners.deactivated.delete(listener) };
      },
      sendMessage: async (targetPluginId, message) => {
        // TODO: Implement inter-plugin messaging
        throw new Error('Inter-plugin messaging not yet implemented');
      },
      onMessage: (listener) => {
        // TODO: Implement inter-plugin messaging
        return { dispose: () => {} };
      }
    };

    return {
      metadata,
      connection: pluginConnection,
      storagePath,
      configuration,
      logger,
      extensionContext
    };
  }

  /**
   * Get plugin storage path
   */
  private getPluginStoragePath(pluginId: string): string {
    // TODO: Implement proper storage path resolution
    return path.join(process.cwd(), '.fhirpath-lsp', 'plugin-data', pluginId);
  }

  /**
   * Check if plugin is disabled
   */
  private isPluginDisabled(pluginId: string): boolean {
    return this.config.disabled?.includes(pluginId) || false;
  }

  /**
   * Get plugins for activation event
   */
  private getPluginsForActivationEvent(event: PluginActivationEvent): PluginInstance[] {
    return Array.from(this.plugins.values()).filter(instance => {
      if (!instance.activationEvents) {
        return false;
      }

      return instance.activationEvents.some(e => {
        if (e.type === '*') {
          return true;
        }
        if (e.type !== event.type) {
          return false;
        }
        if (!e.value || !event.value) {
          return true;
        }
        
        const eventValues = Array.isArray(event.value) ? event.value : [event.value];
        const eValues = Array.isArray(e.value) ? e.value : [e.value];
        
        return eventValues.some(v => eValues.includes(v));
      });
    });
  }

  /**
   * Get all initialized plugins
   */
  private getAllInitializedPlugins(): PluginInstance[] {
    return Array.from(this.plugins.values()).filter(
      instance => instance.plugin.state === PluginState.Initialized
    );
  }

  /**
   * Register plugin capabilities
   */
  private registerPluginCapabilities(instance: PluginInstance): void {
    const plugin = instance.plugin;

    // Check if it's a provider plugin
    if ('getProviders' in plugin) {
      this.providerRegistry.registerPlugin(plugin as any);
    }

    // Check if it's an analyzer plugin
    if ('getAnalyzers' in plugin) {
      this.analyzerRegistry.registerPlugin(plugin as any);
    }

    // Check if it's a validator plugin
    if ('getValidators' in plugin) {
      this.validatorRegistry.registerPlugin(plugin as any);
    }
  }

  /**
   * Load a built-in plugin
   */
  private async loadBuiltinPlugin(pluginId: string): Promise<IPlugin> {
    switch (pluginId) {
      case 'fhirpath-lsp-core-providers':
        // Import and create core providers plugin
        const { CoreProvidersPlugin } = await import('./builtin/CoreProvidersPlugin');
        const corePlugin = new CoreProvidersPlugin();
        // TODO: Inject dependencies properly through plugin context
        return corePlugin;
        
      case 'fhirpath-lsp-performance-analyzer':
        // Import and create performance analyzer plugin
        const { PerformanceAnalyzerPlugin } = await import('./builtin/PerformanceAnalyzerPlugin');
        return new PerformanceAnalyzerPlugin();
        
      default:
        throw new Error(`Unknown built-in plugin: ${pluginId}`);
    }
  }

  /**
   * Unregister plugin capabilities
   */
  private unregisterPluginCapabilities(instance: PluginInstance): void {
    const pluginId = instance.plugin.metadata.id;

    this.providerRegistry.unregisterPlugin(pluginId);
    this.analyzerRegistry.unregisterPlugin(pluginId);
    this.validatorRegistry.unregisterPlugin(pluginId);
  }
}