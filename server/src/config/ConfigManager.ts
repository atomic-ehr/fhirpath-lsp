import { EventEmitter } from 'events';
import {
  BaseConfig,
  ConfigChangeEvent,
  ConfigChangeListener,
  ConfigValidationResult,
  ConfigProvider,
  ConfigEntry,
  ConfigSource,
  ConfigMetadata
} from './schemas/BaseConfig';
import { DiagnosticConfig, DEFAULT_DIAGNOSTIC_CONFIG } from './schemas/DiagnosticConfig';
import { ProviderConfig, DEFAULT_PROVIDER_CONFIG } from './schemas/ProviderConfig';
import { PluginConfig, DEFAULT_PLUGIN_CONFIG } from './schemas/PluginConfig';

/**
 * Main configuration interface that combines all service configurations
 */
export interface AppConfig extends BaseConfig {
  diagnostics: DiagnosticConfig;
  providers: ProviderConfig;
  plugins: PluginConfig;
}

/**
 * Default application configuration
 */
export const DEFAULT_APP_CONFIG: AppConfig = {
  enabled: true,
  version: '1.0.0',
  diagnostics: DEFAULT_DIAGNOSTIC_CONFIG,
  providers: DEFAULT_PROVIDER_CONFIG,
  plugins: DEFAULT_PLUGIN_CONFIG
};

/**
 * Configuration loader interface
 */
export interface ConfigLoader {
  load(): Promise<Partial<AppConfig>>;
  save(config: Partial<AppConfig>): Promise<void>;
  watch?(callback: (config: Partial<AppConfig>) => void): () => void;
}

/**
 * Configuration validator interface
 */
export interface ConfigValidator {
  validate(config: Partial<AppConfig>): ConfigValidationResult;
  validatePath(path: string, value: any): ConfigValidationResult;
}

/**
 * Central configuration manager that coordinates all configuration
 */
export class ConfigManager extends EventEmitter implements ConfigProvider<AppConfig> {
  private config: AppConfig;
  private loaders: Map<string, ConfigLoader> = new Map();
  private validators: Map<string, ConfigValidator> = new Map();
  private configEntries: Map<string, ConfigEntry> = new Map();
  private changeListeners: Set<ConfigChangeListener> = new Set();

  constructor(initialConfig?: Partial<AppConfig>) {
    super();
    this.config = this.mergeConfigs(DEFAULT_APP_CONFIG, initialConfig || {});
    this.initializeConfigEntries();
  }

  /**
   * Register a configuration loader
   */
  registerLoader(name: string, loader: ConfigLoader): void {
    this.loaders.set(name, loader);

    // Set up file watching if supported
    if (loader.watch) {
      loader.watch((partialConfig) => {
        this.updateConfig(partialConfig, {
          type: 'file',
          location: name,
          priority: 1
        });
      });
    }
  }

  /**
   * Register a configuration validator
   */
  registerValidator(name: string, validator: ConfigValidator): void {
    this.validators.set(name, validator);
  }

  /**
   * Load configuration from all registered loaders
   */
  async loadConfiguration(): Promise<void> {
    const configs: Array<{ config: Partial<AppConfig>; source: ConfigSource }> = [];

    // Load from all loaders
    for (const [name, loader] of this.loaders) {
      try {
        const config = await loader.load();
        configs.push({
          config,
          source: {
            type: 'file',
            location: name,
            priority: 1
          }
        });
      } catch (error) {
        console.warn(`Failed to load configuration from ${name}:`, error);
      }
    }

    // Sort by priority and merge
    configs.sort((a, b) => b.source.priority - a.source.priority);

    let mergedConfig = { ...DEFAULT_APP_CONFIG };
    for (const { config, source } of configs) {
      mergedConfig = this.mergeConfigs(mergedConfig, config);
      this.updateConfigMetadata(config, source);
    }

    // Validate merged configuration
    const validationResult = this.validateConfig(mergedConfig);
    if (!validationResult.isValid) {
      console.error('Configuration validation failed:', validationResult.errors);
      throw new Error('Invalid configuration');
    }

    this.config = mergedConfig;
    this.emit('configLoaded', this.config);
  }

  /**
   * Save configuration to all registered loaders
   */
  async saveConfiguration(): Promise<void> {
    const savePromises: Promise<void>[] = [];

    for (const [name, loader] of this.loaders) {
      try {
        savePromises.push(loader.save(this.config));
      } catch (error) {
        console.warn(`Failed to save configuration to ${name}:`, error);
      }
    }

    await Promise.allSettled(savePromises);
  }

  /**
   * Get configuration value by path
   */
  get<T = any>(path: string): T | undefined {
    return this.getValueByPath(this.config, path) as T;
  }

  /**
   * Set configuration value by path
   */
  set<T = any>(path: string, value: T): void {
    const oldValue = this.get(path);

    // Validate the new value
    const validationResult = this.validatePath(path, value);
    if (!validationResult.isValid) {
      throw new Error(`Invalid configuration value for ${path}: ${validationResult.errors[0]?.message}`);
    }

    // Update the configuration
    this.setValueByPath(this.config, path, value);

    // Create change event
    const changeEvent: ConfigChangeEvent<T> = {
      path,
      oldValue,
      newValue: value,
      timestamp: new Date()
    };

    // Notify listeners
    this.notifyChange(changeEvent);
    this.emit('configChanged', changeEvent);
  }

  /**
   * Check if configuration path exists
   */
  has(path: string): boolean {
    return this.getValueByPath(this.config, path) !== undefined;
  }

  /**
   * Delete configuration value by path
   */
  delete(path: string): boolean {
    const oldValue = this.get(path);
    if (oldValue === undefined) {
      return false;
    }

    this.deleteValueByPath(this.config, path);

    const changeEvent: ConfigChangeEvent = {
      path,
      oldValue,
      newValue: undefined,
      timestamp: new Date()
    };

    this.notifyChange(changeEvent);
    this.emit('configChanged', changeEvent);
    return true;
  }

  /**
   * Validate entire configuration
   */
  validate(config: Partial<AppConfig>): ConfigValidationResult {
    return this.validateConfig(config);
  }

  /**
   * Register change listener
   */
  onChange<T = any>(listener: ConfigChangeListener<T>): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  /**
   * Get the complete configuration
   */
  getConfig(): AppConfig {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * Update configuration with partial config
   */
  updateConfig(partialConfig: Partial<AppConfig>, source?: ConfigSource): void {
    const oldConfig = { ...this.config };
    this.config = this.mergeConfigs(this.config, partialConfig);

    if (source) {
      this.updateConfigMetadata(partialConfig, source);
    }

    // Validate updated configuration
    const validationResult = this.validateConfig(this.config);
    if (!validationResult.isValid) {
      console.warn('Configuration validation warnings:', validationResult.warnings);
    }

    // Emit change events for modified paths
    this.emitChangeEvents(oldConfig, this.config);
  }

  /**
   * Get configuration metadata for a path
   */
  getMetadata(path: string): ConfigMetadata | undefined {
    const entry = this.configEntries.get(path);
    return entry?.metadata;
  }

  private initializeConfigEntries(): void {
    // Initialize metadata for default configuration paths
    this.setConfigEntry('diagnostics', this.config.diagnostics, {
      source: { type: 'default', priority: 0 },
      schema: 'DiagnosticConfig',
      description: 'Diagnostic analysis configuration'
    });

    this.setConfigEntry('providers', this.config.providers, {
      source: { type: 'default', priority: 0 },
      schema: 'ProviderConfig',
      description: 'Language server provider configuration'
    });
  }

  private setConfigEntry(path: string, value: any, metadata: ConfigMetadata): void {
    this.configEntries.set(path, {
      value,
      metadata
    });
  }

  private updateConfigMetadata(config: Partial<AppConfig>, source: ConfigSource): void {
    // Update metadata for configuration sections
    if (config.diagnostics) {
      this.setConfigEntry('diagnostics', config.diagnostics, {
        source,
        schema: 'DiagnosticConfig',
        description: 'Diagnostic analysis configuration'
      });
    }

    if (config.providers) {
      this.setConfigEntry('providers', config.providers, {
        source,
        schema: 'ProviderConfig',
        description: 'Language server provider configuration'
      });
    }
  }

  private mergeConfigs<T extends Record<string, any>>(target: T, source: Partial<T>): T {
    const result = { ...target };

    for (const key in source) {
      const sourceValue = source[key];
      const targetValue = result[key];

      if (sourceValue !== undefined) {
        if (this.isObject(sourceValue) && this.isObject(targetValue)) {
          result[key] = this.mergeConfigs(targetValue, sourceValue);
        } else {
          result[key] = sourceValue;
        }
      }
    }

    return result;
  }

  private isObject(value: any): value is Record<string, any> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private validateConfig(config: Partial<AppConfig>): ConfigValidationResult {
    const errors: any[] = [];
    const warnings: any[] = [];

    // Run all registered validators
    for (const [name, validator] of this.validators) {
      try {
        const result = validator.validate(config);
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      } catch (error) {
        console.warn(`Validator ${name} failed:`, error);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private validatePath(path: string, value: any): ConfigValidationResult {
    const errors: any[] = [];
    const warnings: any[] = [];

    // Run path-specific validation
    for (const [name, validator] of this.validators) {
      try {
        const result = validator.validatePath(path, value);
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      } catch (error) {
        console.warn(`Path validator ${name} failed:`, error);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private getValueByPath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private setValueByPath(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current, key) => {
      if (!(key in current)) {
        current[key] = {};
      }
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  private deleteValueByPath(obj: any, path: string): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current, key) => current?.[key], obj);
    if (target) {
      delete target[lastKey];
    }
  }

  private notifyChange<T>(event: ConfigChangeEvent<T>): void {
    for (const listener of this.changeListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Configuration change listener error:', error);
      }
    }
  }

  private emitChangeEvents(oldConfig: AppConfig, newConfig: AppConfig): void {
    // Compare configurations and emit change events
    this.compareAndEmitChanges('', oldConfig, newConfig);
  }

  private compareAndEmitChanges(basePath: string, oldValue: any, newValue: any): void {
    if (oldValue === newValue) {
      return;
    }

    if (this.isObject(oldValue) && this.isObject(newValue)) {
      const allKeys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);

      for (const key of allKeys) {
        const path = basePath ? `${basePath}.${key}` : key;
        this.compareAndEmitChanges(path, oldValue[key], newValue[key]);
      }
    } else {
      const changeEvent: ConfigChangeEvent = {
        path: basePath,
        oldValue,
        newValue,
        timestamp: new Date()
      };

      this.notifyChange(changeEvent);
      this.emit('configChanged', changeEvent);
    }
  }
}
