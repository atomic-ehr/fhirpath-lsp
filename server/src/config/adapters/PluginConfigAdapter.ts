import { ConfigManager } from '../ConfigManager';
import { ConfigNotificationService, ConfigNotificationEvent } from '../ConfigNotificationService';
import { PluginConfig, DEFAULT_PLUGIN_CONFIG, PLUGIN_CONFIG_PATHS } from '../schemas/PluginConfig';
import { ConfigChangeEvent } from '../schemas/BaseConfig';
import { PluginManagerConfig } from '../../plugins/PluginManager';

/**
 * Adapter for plugin configuration management
 */
export class PluginConfigAdapter {
  private configManager: ConfigManager;
  private notificationService: ConfigNotificationService;
  private changeListeners: Set<(config: PluginManagerConfig) => void> = new Set();

  constructor(
    configManager: ConfigManager,
    notificationService: ConfigNotificationService
  ) {
    this.configManager = configManager;
    this.notificationService = notificationService;
    this.setupChangeListeners();
  }

  /**
   * Get the current plugin configuration
   */
  getPluginConfig(): PluginManagerConfig {
    const config = this.configManager.get<PluginConfig>('plugins') || DEFAULT_PLUGIN_CONFIG;
    
    return this.transformToManagerConfig(config);
  }

  /**
   * Update plugin configuration
   */
  updatePluginConfig(updates: Partial<PluginConfig>): void {
    const currentPluginConfig = this.configManager.get('plugins') || DEFAULT_PLUGIN_CONFIG;
    const mergedPluginConfig = { ...currentPluginConfig, ...updates };
    this.configManager.updateConfig({ plugins: mergedPluginConfig });
  }

  /**
   * Enable/disable a specific plugin
   */
  setPluginEnabled(pluginId: string, enabled: boolean): void {
    const disabled = this.configManager.get<string[]>(PLUGIN_CONFIG_PATHS.DISABLED) || [];
    
    if (enabled) {
      // Remove from disabled list
      const newDisabled = disabled.filter(id => id !== pluginId);
      this.configManager.set(PLUGIN_CONFIG_PATHS.DISABLED, newDisabled);
    } else {
      // Add to disabled list
      if (!disabled.includes(pluginId)) {
        this.configManager.set(PLUGIN_CONFIG_PATHS.DISABLED, [...disabled, pluginId]);
      }
    }
  }

  /**
   * Update configuration for a specific plugin
   */
  setPluginConfiguration(pluginId: string, configuration: any): void {
    const pluginConfigs = this.configManager.get<Record<string, any>>(PLUGIN_CONFIG_PATHS.PLUGIN_CONFIGS) || {};
    pluginConfigs[pluginId] = configuration;
    this.configManager.set(PLUGIN_CONFIG_PATHS.PLUGIN_CONFIGS, pluginConfigs);
  }

  /**
   * Get configuration for a specific plugin
   */
  getPluginConfiguration(pluginId: string): any {
    const pluginConfigs = this.configManager.get<Record<string, any>>(PLUGIN_CONFIG_PATHS.PLUGIN_CONFIGS) || {};
    return pluginConfigs[pluginId] || {};
  }

  /**
   * Check if a plugin is enabled
   */
  isPluginEnabled(pluginId: string): boolean {
    const systemEnabled = this.configManager.get<boolean>(PLUGIN_CONFIG_PATHS.ENABLED) ?? true;
    if (!systemEnabled) {
      return false;
    }

    const disabled = this.configManager.get<string[]>(PLUGIN_CONFIG_PATHS.DISABLED) || [];
    return !disabled.includes(pluginId);
  }

  /**
   * Listen for configuration changes
   */
  onConfigurationChanged(listener: (config: PluginManagerConfig) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /**
   * Get plugin loading configuration
   */
  getLoadingConfig() {
    const config = this.configManager.get<PluginConfig>('plugins') || DEFAULT_PLUGIN_CONFIG;
    return config.loading || DEFAULT_PLUGIN_CONFIG.loading;
  }

  /**
   * Get plugin security configuration
   */
  getSecurityConfig() {
    const config = this.configManager.get<PluginConfig>('plugins') || DEFAULT_PLUGIN_CONFIG;
    return config.security || DEFAULT_PLUGIN_CONFIG.security;
  }

  /**
   * Get plugin sources configuration
   */
  getSourcesConfig() {
    const config = this.configManager.get<PluginConfig>('plugins') || DEFAULT_PLUGIN_CONFIG;
    return config.sources || DEFAULT_PLUGIN_CONFIG.sources;
  }

  /**
   * Dispose the adapter and cleanup listeners
   */
  dispose(): void {
    this.changeListeners.clear();
  }

  /**
   * Transform plugin config to manager config format
   */
  private transformToManagerConfig(config: PluginConfig): PluginManagerConfig {
    return {
      enabled: config.enabled,
      sources: config.sources
        .filter(source => source.enabled)
        .map(source => source.type as any),
      local: config.local,
      registry: config.registry?.url,
      disabled: config.disabled,
      configuration: config.plugins
    };
  }

  /**
   * Setup change listeners for plugin configuration
   */
  private setupChangeListeners(): void {
    // Listen for changes to plugin configuration
    this.notificationService.subscribeToPaths(['plugins'], (event: ConfigNotificationEvent) => {
      if (event.newValue) {
        const newManagerConfig = this.transformToManagerConfig(event.newValue);
        this.notifyListeners(newManagerConfig);
      }
    });

    // Listen for changes to plugin enabled state
    this.notificationService.subscribeToPaths([PLUGIN_CONFIG_PATHS.ENABLED], () => {
      const currentConfig = this.getPluginConfig();
      this.notifyListeners(currentConfig);
    });

    // Listen for changes to disabled plugins list
    this.notificationService.subscribeToPaths([PLUGIN_CONFIG_PATHS.DISABLED], () => {
      const currentConfig = this.getPluginConfig();
      this.notifyListeners(currentConfig);
    });

    // Listen for changes to plugin-specific configurations
    this.notificationService.subscribeToPaths([PLUGIN_CONFIG_PATHS.PLUGIN_CONFIGS], () => {
      const currentConfig = this.getPluginConfig();
      this.notifyListeners(currentConfig);
    });
  }

  /**
   * Notify all listeners of configuration changes
   */
  private notifyListeners(config: PluginManagerConfig): void {
    this.changeListeners.forEach(listener => {
      try {
        listener(config);
      } catch (error) {
        console.error('Error in plugin configuration change listener:', error);
      }
    });
  }
}