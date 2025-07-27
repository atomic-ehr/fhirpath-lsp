import { EventEmitter } from 'events';
import { ConfigLoader } from '../ConfigManager';
import { AppConfig } from '../ConfigManager';

/**
 * Runtime configuration update event
 */
export interface RuntimeConfigUpdate {
  path: string;
  value: any;
  timestamp: Date;
  source?: string;
}

/**
 * Configuration loader that manages runtime configuration updates
 */
export class RuntimeConfigLoader extends EventEmitter implements ConfigLoader {
  private runtimeConfig: Partial<AppConfig> = {};
  private updateHistory: RuntimeConfigUpdate[] = [];
  private maxHistorySize: number = 100;

  constructor(initialConfig?: Partial<AppConfig>) {
    super();
    if (initialConfig) {
      this.runtimeConfig = JSON.parse(JSON.stringify(initialConfig));
    }
  }

  /**
   * Load current runtime configuration
   */
  async load(): Promise<Partial<AppConfig>> {
    return JSON.parse(JSON.stringify(this.runtimeConfig));
  }

  /**
   * Save configuration (updates runtime config)
   */
  async save(config: Partial<AppConfig>): Promise<void> {
    const oldConfig = { ...this.runtimeConfig };
    this.runtimeConfig = JSON.parse(JSON.stringify(config));

    // Record the update
    this.recordUpdate('*', config, 'save');

    // Emit change event
    this.emit('configChanged', {
      oldConfig,
      newConfig: this.runtimeConfig,
      timestamp: new Date()
    });

    console.log('Runtime configuration updated via save()');
  }

  /**
   * Watch for runtime configuration changes
   */
  watch(callback: (config: Partial<AppConfig>) => void): () => void {
    const listener = () => {
      callback(this.runtimeConfig);
    };

    this.on('configChanged', listener);

    return () => {
      this.off('configChanged', listener);
    };
  }

  /**
   * Update a specific configuration path at runtime
   */
  updatePath(path: string, value: any, source?: string): void {
    const oldValue = this.getValueByPath(this.runtimeConfig, path);
    this.setValueByPath(this.runtimeConfig, path, value);

    // Record the update
    this.recordUpdate(path, value, source);

    // Emit change event
    this.emit('configChanged', {
      path,
      oldValue,
      newValue: value,
      timestamp: new Date()
    });

    console.log(`Runtime configuration updated: ${path} = ${JSON.stringify(value)}`);
  }

  /**
   * Update multiple configuration paths at once
   */
  updatePaths(updates: Array<{ path: string; value: any }>, source?: string): void {
    const changes: Array<{ path: string; oldValue: any; newValue: any }> = [];

    for (const { path, value } of updates) {
      const oldValue = this.getValueByPath(this.runtimeConfig, path);
      this.setValueByPath(this.runtimeConfig, path, value);
      changes.push({ path, oldValue, newValue: value });

      // Record individual update
      this.recordUpdate(path, value, source);
    }

    // Emit batch change event
    this.emit('configChanged', {
      changes,
      timestamp: new Date()
    });

    console.log(`Runtime configuration batch updated: ${updates.length} changes`);
  }

  /**
   * Merge partial configuration into runtime config
   */
  mergeConfig(partialConfig: Partial<AppConfig>, source?: string): void {
    const oldConfig = { ...this.runtimeConfig };
    this.runtimeConfig = this.mergeConfigs(this.runtimeConfig, partialConfig);

    // Record the merge
    this.recordUpdate('*', partialConfig, source || 'merge');

    // Emit change event
    this.emit('configChanged', {
      oldConfig,
      newConfig: this.runtimeConfig,
      timestamp: new Date()
    });

    console.log('Runtime configuration merged');
  }

  /**
   * Reset configuration to initial state or provided config
   */
  reset(config?: Partial<AppConfig>): void {
    const oldConfig = { ...this.runtimeConfig };
    this.runtimeConfig = config ? JSON.parse(JSON.stringify(config)) : {};

    // Record the reset
    this.recordUpdate('*', this.runtimeConfig, 'reset');

    // Emit change event
    this.emit('configChanged', {
      oldConfig,
      newConfig: this.runtimeConfig,
      timestamp: new Date()
    });

    console.log('Runtime configuration reset');
  }

  /**
   * Get configuration value by path
   */
  get(path: string): any {
    return this.getValueByPath(this.runtimeConfig, path);
  }

  /**
   * Set configuration value by path
   */
  set(path: string, value: any, source?: string): void {
    this.updatePath(path, value, source);
  }

  /**
   * Check if configuration path exists
   */
  has(path: string): boolean {
    return this.getValueByPath(this.runtimeConfig, path) !== undefined;
  }

  /**
   * Delete configuration value by path
   */
  delete(path: string, source?: string): boolean {
    const oldValue = this.getValueByPath(this.runtimeConfig, path);
    if (oldValue === undefined) {
      return false;
    }

    this.deleteValueByPath(this.runtimeConfig, path);

    // Record the deletion
    this.recordUpdate(path, undefined, source || 'delete');

    // Emit change event
    this.emit('configChanged', {
      path,
      oldValue,
      newValue: undefined,
      timestamp: new Date()
    });

    console.log(`Runtime configuration deleted: ${path}`);
    return true;
  }

  /**
   * Get update history
   */
  getUpdateHistory(): RuntimeConfigUpdate[] {
    return [...this.updateHistory];
  }

  /**
   * Clear update history
   */
  clearHistory(): void {
    this.updateHistory = [];
    console.log('Runtime configuration history cleared');
  }

  /**
   * Get configuration snapshot with metadata
   */
  getSnapshot(): {
    config: Partial<AppConfig>;
    timestamp: Date;
    updateCount: number;
    lastUpdate?: RuntimeConfigUpdate;
  } {
    return {
      config: JSON.parse(JSON.stringify(this.runtimeConfig)),
      timestamp: new Date(),
      updateCount: this.updateHistory.length,
      lastUpdate: this.updateHistory[this.updateHistory.length - 1]
    };
  }

  /**
   * Restore configuration from snapshot
   */
  restoreSnapshot(snapshot: { config: Partial<AppConfig>; timestamp: Date }): void {
    const oldConfig = { ...this.runtimeConfig };
    this.runtimeConfig = JSON.parse(JSON.stringify(snapshot.config));

    // Record the restore
    this.recordUpdate('*', this.runtimeConfig, `restore:${snapshot.timestamp.toISOString()}`);

    // Emit change event
    this.emit('configChanged', {
      oldConfig,
      newConfig: this.runtimeConfig,
      timestamp: new Date()
    });

    console.log(`Runtime configuration restored from snapshot: ${snapshot.timestamp.toISOString()}`);
  }

  /**
   * Create a scoped runtime loader for a specific configuration section
   */
  createScopedLoader(scope: string): ScopedRuntimeConfigLoader {
    return new ScopedRuntimeConfigLoader(this, scope);
  }

  private recordUpdate(path: string, value: any, source?: string): void {
    const update: RuntimeConfigUpdate = {
      path,
      value,
      timestamp: new Date(),
      source
    };

    this.updateHistory.push(update);

    // Trim history if it exceeds max size
    if (this.updateHistory.length > this.maxHistorySize) {
      this.updateHistory = this.updateHistory.slice(-this.maxHistorySize);
    }
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
}

/**
 * Scoped runtime configuration loader for specific configuration sections
 */
export class ScopedRuntimeConfigLoader {
  constructor(
    private parentLoader: RuntimeConfigLoader,
    private scope: string
  ) {}

  /**
   * Get scoped configuration
   */
  get(path?: string): any {
    const fullPath = path ? `${this.scope}.${path}` : this.scope;
    return this.parentLoader.get(fullPath);
  }

  /**
   * Set scoped configuration
   */
  set(path: string, value: any, source?: string): void {
    const fullPath = `${this.scope}.${path}`;
    this.parentLoader.set(fullPath, value, source);
  }

  /**
   * Update scoped configuration
   */
  update(partialConfig: any, source?: string): void {
    const updates = this.flattenConfig(partialConfig, this.scope);
    this.parentLoader.updatePaths(updates, source);
  }

  /**
   * Check if scoped path exists
   */
  has(path: string): boolean {
    const fullPath = `${this.scope}.${path}`;
    return this.parentLoader.has(fullPath);
  }

  /**
   * Delete scoped configuration
   */
  delete(path: string, source?: string): boolean {
    const fullPath = `${this.scope}.${path}`;
    return this.parentLoader.delete(fullPath, source);
  }

  private flattenConfig(obj: any, prefix: string): Array<{ path: string; value: any }> {
    const result: Array<{ path: string; value: any }> = [];

    for (const [key, value] of Object.entries(obj)) {
      const path = `${prefix}.${key}`;

      if (this.isObject(value)) {
        result.push(...this.flattenConfig(value, path));
      } else {
        result.push({ path, value });
      }
    }

    return result;
  }

  private isObject(value: any): value is Record<string, any> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
}

/**
 * Factory for creating runtime config loaders
 */
export class RuntimeConfigLoaderFactory {
  /**
   * Create empty runtime loader
   */
  static createEmpty(): RuntimeConfigLoader {
    return new RuntimeConfigLoader();
  }

  /**
   * Create runtime loader with initial configuration
   */
  static createWithConfig(config: Partial<AppConfig>): RuntimeConfigLoader {
    return new RuntimeConfigLoader(config);
  }

  /**
   * Create runtime loader for development with debug features
   */
  static createDevelopment(): RuntimeConfigLoader {
    const loader = new RuntimeConfigLoader();

    // Enable verbose logging in development
    loader.on('configChanged', (event) => {
      console.log('[DEV] Runtime config changed:', event);
    });

    return loader;
  }

  /**
   * Create runtime loader for production with minimal logging
   */
  static createProduction(): RuntimeConfigLoader {
    const loader = new RuntimeConfigLoader();

    // Minimal logging in production
    loader.on('configChanged', () => {
      console.log('Runtime configuration updated');
    });

    return loader;
  }
}
