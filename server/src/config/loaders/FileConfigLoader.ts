import * as fs from 'fs';
import * as path from 'path';
import { ConfigLoader } from '../ConfigManager';
import { AppConfig } from '../ConfigManager';

/**
 * Configuration loader that reads from and writes to JSON files
 */
export class FileConfigLoader implements ConfigLoader {
  private filePath: string;
  private watchCallback?: (config: Partial<AppConfig>) => void;
  private watcher?: fs.FSWatcher;

  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
  }

  /**
   * Load configuration from file
   */
  async load(): Promise<Partial<AppConfig>> {
    try {
      if (!fs.existsSync(this.filePath)) {
        console.log(`Configuration file ${this.filePath} does not exist, using defaults`);
        return {};
      }

      const fileContent = await fs.promises.readFile(this.filePath, 'utf-8');
      const config = JSON.parse(fileContent);

      console.log(`Loaded configuration from ${this.filePath}`);
      return config;
    } catch (error) {
      console.error(`Failed to load configuration from ${this.filePath}:`, error);
      throw new Error(`Configuration file load error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Save configuration to file
   */
  async save(config: Partial<AppConfig>): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }

      // Write configuration with pretty formatting
      const configJson = JSON.stringify(config, null, 2);
      await fs.promises.writeFile(this.filePath, configJson, 'utf-8');

      console.log(`Saved configuration to ${this.filePath}`);
    } catch (error) {
      console.error(`Failed to save configuration to ${this.filePath}:`, error);
      throw new Error(`Configuration file save error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Watch file for changes
   */
  watch(callback: (config: Partial<AppConfig>) => void): () => void {
    this.watchCallback = callback;

    // Only watch if file exists
    if (!fs.existsSync(this.filePath)) {
      console.log(`Configuration file ${this.filePath} does not exist, skipping watch setup`);
      return () => {}; // Return no-op cleanup function
    }

    try {
      // Watch the file for changes
      this.watcher = fs.watch(this.filePath, { persistent: false }, (eventType) => {
        if (eventType === 'change') {
          this.handleFileChange();
        }
      });

      console.log(`Watching configuration file ${this.filePath} for changes`);
    } catch (error) {
      console.warn(`Failed to watch configuration file ${this.filePath}:`, error);
    }

    // Return cleanup function
    return () => {
      if (this.watcher) {
        this.watcher.close();
        this.watcher = undefined;
      }
      this.watchCallback = undefined;
    };
  }

  /**
   * Get the file path being watched
   */
  getFilePath(): string {
    return this.filePath;
  }

  /**
   * Check if file exists
   */
  exists(): boolean {
    return fs.existsSync(this.filePath);
  }

  /**
   * Create default configuration file if it doesn't exist
   */
  async createDefault(defaultConfig: Partial<AppConfig>): Promise<void> {
    if (!this.exists()) {
      await this.save(defaultConfig);
      console.log(`Created default configuration file at ${this.filePath}`);
    }
  }

  private async handleFileChange(): Promise<void> {
    if (!this.watchCallback) {
      return;
    }

    try {
      // Add a small delay to handle rapid file changes
      await new Promise(resolve => setTimeout(resolve, 100));

      const config = await this.load();
      this.watchCallback(config);
      console.log(`Configuration file ${this.filePath} changed, reloaded`);
    } catch (error) {
      console.error(`Failed to reload configuration after file change:`, error);
    }
  }
}

/**
 * Factory function to create file config loaders for common locations
 */
export class FileConfigLoaderFactory {
  /**
   * Create loader for workspace configuration
   */
  static createWorkspaceLoader(workspaceRoot: string): FileConfigLoader {
    const configPath = path.join(workspaceRoot, '.fhirpath-lsp.json');
    return new FileConfigLoader(configPath);
  }

  /**
   * Create loader for user configuration
   */
  static createUserLoader(): FileConfigLoader {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const configPath = path.join(homeDir, '.fhirpath-lsp', 'config.json');
    return new FileConfigLoader(configPath);
  }

  /**
   * Create loader for system configuration
   */
  static createSystemLoader(): FileConfigLoader {
    const configPath = process.platform === 'win32'
      ? path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'fhirpath-lsp', 'config.json')
      : '/etc/fhirpath-lsp/config.json';
    return new FileConfigLoader(configPath);
  }

  /**
   * Create loader for custom path
   */
  static createCustomLoader(filePath: string): FileConfigLoader {
    return new FileConfigLoader(filePath);
  }
}

/**
 * Multi-file configuration loader that can load from multiple files with priority
 */
export class MultiFileConfigLoader implements ConfigLoader {
  private loaders: Array<{ loader: FileConfigLoader; priority: number }> = [];

  /**
   * Add a file loader with priority (higher number = higher priority)
   */
  addLoader(loader: FileConfigLoader, priority: number): void {
    this.loaders.push({ loader, priority });
    this.loaders.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Load configuration from all files, merging by priority
   */
  async load(): Promise<Partial<AppConfig>> {
    let mergedConfig: Partial<AppConfig> = {};

    // Load from lowest to highest priority
    const sortedLoaders = [...this.loaders].reverse();

    for (const { loader } of sortedLoaders) {
      try {
        const config = await loader.load();
        mergedConfig = this.mergeConfigs(mergedConfig, config);
      } catch (error) {
        console.warn(`Failed to load from ${loader.getFilePath()}:`, error);
      }
    }

    return mergedConfig;
  }

  /**
   * Save configuration to the highest priority file
   */
  async save(config: Partial<AppConfig>): Promise<void> {
    if (this.loaders.length === 0) {
      throw new Error('No file loaders configured');
    }

    const highestPriorityLoader = this.loaders[0].loader;
    await highestPriorityLoader.save(config);
  }

  /**
   * Watch all files for changes
   */
  watch(callback: (config: Partial<AppConfig>) => void): () => void {
    const cleanupFunctions: Array<() => void> = [];

    for (const { loader } of this.loaders) {
      const cleanup = loader.watch(async () => {
        // Reload all configurations when any file changes
        const mergedConfig = await this.load();
        callback(mergedConfig);
      });
      cleanupFunctions.push(cleanup);
    }

    // Return cleanup function that stops watching all files
    return () => {
      for (const cleanup of cleanupFunctions) {
        cleanup();
      }
    };
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
