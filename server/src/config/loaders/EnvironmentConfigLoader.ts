import { ConfigLoader } from '../ConfigManager';
import { AppConfig } from '../ConfigManager';

/**
 * Environment variable mapping configuration
 */
export interface EnvMapping {
  envVar: string;
  configPath: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  defaultValue?: any;
  transform?: (value: string) => any;
}

/**
 * Configuration loader that reads from environment variables
 */
export class EnvironmentConfigLoader implements ConfigLoader {
  private envMappings: EnvMapping[] = [];
  private prefix: string;

  constructor(prefix: string = 'FHIRPATH_LSP_') {
    this.prefix = prefix;
    this.initializeDefaultMappings();
  }

  /**
   * Add custom environment variable mapping
   */
  addMapping(mapping: EnvMapping): void {
    this.envMappings.push(mapping);
  }

  /**
   * Add multiple mappings
   */
  addMappings(mappings: EnvMapping[]): void {
    this.envMappings.push(...mappings);
  }

  /**
   * Load configuration from environment variables
   */
  async load(): Promise<Partial<AppConfig>> {
    const config: any = {};

    for (const mapping of this.envMappings) {
      const envValue = process.env[mapping.envVar];

      if (envValue !== undefined) {
        try {
          const convertedValue = this.convertValue(envValue, mapping);
          this.setValueByPath(config, mapping.configPath, convertedValue);
          console.log(`Loaded ${mapping.configPath} from environment variable ${mapping.envVar}`);
        } catch (error) {
          console.warn(`Failed to convert environment variable ${mapping.envVar}:`, error);
          if (mapping.defaultValue !== undefined) {
            this.setValueByPath(config, mapping.configPath, mapping.defaultValue);
          }
        }
      } else if (mapping.defaultValue !== undefined) {
        this.setValueByPath(config, mapping.configPath, mapping.defaultValue);
      }
    }

    return config;
  }

  /**
   * Save configuration to environment variables (not typically used)
   */
  async save(config: Partial<AppConfig>): Promise<void> {
    console.warn('EnvironmentConfigLoader.save() is not implemented - environment variables are typically read-only');
  }

  /**
   * Environment variables don't support watching, but we can poll
   */
  watch(callback: (config: Partial<AppConfig>) => void): () => void {
    console.log('Environment variable watching is not supported');
    return () => {}; // No-op cleanup
  }

  /**
   * Get all environment variables with the configured prefix
   */
  getAllPrefixedEnvVars(): Record<string, string> {
    const prefixedVars: Record<string, string> = {};

    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(this.prefix) && value !== undefined) {
        prefixedVars[key] = value;
      }
    }

    return prefixedVars;
  }

  /**
   * Auto-discover configuration from environment variables with prefix
   */
  async loadWithAutoDiscovery(): Promise<Partial<AppConfig>> {
    const config: any = {};
    const prefixedVars = this.getAllPrefixedEnvVars();

    // First load from explicit mappings
    const explicitConfig = await this.load();
    Object.assign(config, explicitConfig);

    // Then auto-discover remaining variables
    for (const [envVar, value] of Object.entries(prefixedVars)) {
      const configPath = this.envVarToConfigPath(envVar);

      // Skip if already handled by explicit mapping
      if (this.envMappings.some(m => m.envVar === envVar)) {
        continue;
      }

      try {
        const convertedValue = this.autoConvertValue(value);
        this.setValueByPath(config, configPath, convertedValue);
        console.log(`Auto-discovered ${configPath} from environment variable ${envVar}`);
      } catch (error) {
        console.warn(`Failed to auto-convert environment variable ${envVar}:`, error);
      }
    }

    return config;
  }

  private initializeDefaultMappings(): void {
    // Diagnostic configuration mappings
    this.envMappings = [
      // Global settings
      { envVar: `${this.prefix}ENABLED`, configPath: 'enabled', type: 'boolean', defaultValue: true },

      // Diagnostic settings
      { envVar: `${this.prefix}DIAGNOSTICS_ENABLED`, configPath: 'diagnostics.enabled', type: 'boolean' },
      { envVar: `${this.prefix}DIAGNOSTICS_PERFORMANCE_ENABLED`, configPath: 'diagnostics.performance.enabled', type: 'boolean' },
      { envVar: `${this.prefix}DIAGNOSTICS_PERFORMANCE_MAX_COMPLEXITY`, configPath: 'diagnostics.performance.maxComplexity', type: 'number' },
      { envVar: `${this.prefix}DIAGNOSTICS_PERFORMANCE_MAX_NESTING_DEPTH`, configPath: 'diagnostics.performance.maxNestingDepth', type: 'number' },
      { envVar: `${this.prefix}DIAGNOSTICS_CODE_QUALITY_ENABLED`, configPath: 'diagnostics.codeQuality.enabled', type: 'boolean' },
      { envVar: `${this.prefix}DIAGNOSTICS_CODE_QUALITY_MAX_LINE_LENGTH`, configPath: 'diagnostics.codeQuality.maxLineLength', type: 'number' },
      { envVar: `${this.prefix}DIAGNOSTICS_FHIR_BEST_PRACTICES_ENABLED`, configPath: 'diagnostics.fhirBestPractices.enabled', type: 'boolean' },

      // Provider settings
      { envVar: `${this.prefix}PROVIDERS_ENABLED`, configPath: 'providers.enabled', type: 'boolean' },
      { envVar: `${this.prefix}PROVIDERS_REFACTORING_ENABLED`, configPath: 'providers.refactoring.enabled', type: 'boolean' },
      { envVar: `${this.prefix}PROVIDERS_REFACTORING_CONFIRM_DESTRUCTIVE`, configPath: 'providers.refactoring.confirmDestructive', type: 'boolean' },
      { envVar: `${this.prefix}PROVIDERS_COMPLETION_ENABLED`, configPath: 'providers.completion.enabled', type: 'boolean' },
      { envVar: `${this.prefix}PROVIDERS_COMPLETION_MAX_SUGGESTIONS`, configPath: 'providers.completion.maxSuggestions', type: 'number' },
      { envVar: `${this.prefix}PROVIDERS_HOVER_ENABLED`, configPath: 'providers.hover.enabled', type: 'boolean' },

      // Performance settings
      { envVar: `${this.prefix}PROVIDERS_PERFORMANCE_THROTTLING_ENABLED`, configPath: 'providers.performance.requestThrottling.enabled', type: 'boolean' },
      { envVar: `${this.prefix}PROVIDERS_PERFORMANCE_CACHING_ENABLED`, configPath: 'providers.performance.caching.enabled', type: 'boolean' },
      { envVar: `${this.prefix}PROVIDERS_PERFORMANCE_CACHE_MAX_SIZE`, configPath: 'providers.performance.caching.maxCacheSize', type: 'number' },
      { envVar: `${this.prefix}PROVIDERS_PERFORMANCE_CACHE_TTL_MS`, configPath: 'providers.performance.caching.ttlMs', type: 'number' },

      // Timeout settings
      { envVar: `${this.prefix}PROVIDERS_PERFORMANCE_COMPLETION_TIMEOUT_MS`, configPath: 'providers.performance.timeouts.completionTimeoutMs', type: 'number' },
      { envVar: `${this.prefix}PROVIDERS_PERFORMANCE_DIAGNOSTIC_TIMEOUT_MS`, configPath: 'providers.performance.timeouts.diagnosticTimeoutMs', type: 'number' },
      { envVar: `${this.prefix}PROVIDERS_PERFORMANCE_HOVER_TIMEOUT_MS`, configPath: 'providers.performance.timeouts.hoverTimeoutMs', type: 'number' },

      // JSON configuration for complex objects
      { envVar: `${this.prefix}DIAGNOSTICS_CONFIG`, configPath: 'diagnostics', type: 'json' },
      { envVar: `${this.prefix}PROVIDERS_CONFIG`, configPath: 'providers', type: 'json' },
      { envVar: `${this.prefix}THROTTLE_CONFIGS`, configPath: 'providers.performance.requestThrottling.configs', type: 'json' }
    ];
  }

  private convertValue(value: string, mapping: EnvMapping): any {
    if (mapping.transform) {
      return mapping.transform(value);
    }

    switch (mapping.type) {
      case 'boolean':
        return this.parseBoolean(value);
      case 'number':
        return this.parseNumber(value);
      case 'json':
        return JSON.parse(value);
      case 'string':
      default:
        return value;
    }
  }

  private autoConvertValue(value: string): any {
    // Try to auto-detect type and convert

    // Boolean
    if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
      return this.parseBoolean(value);
    }

    // Number
    if (/^\d+$/.test(value)) {
      return parseInt(value, 10);
    }

    if (/^\d+\.\d+$/.test(value)) {
      return parseFloat(value);
    }

    // JSON
    if ((value.startsWith('{') && value.endsWith('}')) ||
        (value.startsWith('[') && value.endsWith(']'))) {
      try {
        return JSON.parse(value);
      } catch {
        // Fall through to string
      }
    }

    // Default to string
    return value;
  }

  private parseBoolean(value: string): boolean {
    const lowerValue = value.toLowerCase();
    return lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes' || lowerValue === 'on';
  }

  private parseNumber(value: string): number {
    const num = Number(value);
    if (isNaN(num)) {
      throw new Error(`Invalid number: ${value}`);
    }
    return num;
  }

  private envVarToConfigPath(envVar: string): string {
    // Remove prefix and convert to config path
    let path = envVar.substring(this.prefix.length);

    // Convert UPPER_CASE to camelCase path
    return path
      .toLowerCase()
      .split('_')
      .map((part, index) => {
        if (index === 0) return part;
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join('.');
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
}

/**
 * Factory for creating environment config loaders with common configurations
 */
export class EnvironmentConfigLoaderFactory {
  /**
   * Create loader with default FHIRPATH_LSP_ prefix
   */
  static createDefault(): EnvironmentConfigLoader {
    return new EnvironmentConfigLoader('FHIRPATH_LSP_');
  }

  /**
   * Create loader with custom prefix
   */
  static createWithPrefix(prefix: string): EnvironmentConfigLoader {
    return new EnvironmentConfigLoader(prefix);
  }

  /**
   * Create loader for development environment with DEV_ prefix
   */
  static createDevelopment(): EnvironmentConfigLoader {
    const loader = new EnvironmentConfigLoader('FHIRPATH_LSP_DEV_');

    // Add development-specific mappings
    loader.addMappings([
      { envVar: 'NODE_ENV', configPath: 'environment', type: 'string' },
      { envVar: 'DEBUG', configPath: 'debug', type: 'boolean' },
      { envVar: 'LOG_LEVEL', configPath: 'logLevel', type: 'string' }
    ]);

    return loader;
  }

  /**
   * Create loader for production environment
   */
  static createProduction(): EnvironmentConfigLoader {
    const loader = new EnvironmentConfigLoader('FHIRPATH_LSP_');

    // Add production-specific mappings
    loader.addMappings([
      { envVar: 'NODE_ENV', configPath: 'environment', type: 'string' },
      { envVar: 'PORT', configPath: 'port', type: 'number' },
      { envVar: 'HOST', configPath: 'host', type: 'string' }
    ]);

    return loader;
  }
}
