import { BaseConfig } from './BaseConfig';

/**
 * Plugin configuration schema
 */
export interface PluginConfig extends BaseConfig {
  /**
   * Whether the plugin system is enabled
   */
  enabled: boolean;

  /**
   * Plugin sources to scan for plugins
   */
  sources: PluginSourceConfig[];

  /**
   * Local plugin paths
   */
  local?: {
    paths: string[];
  };

  /**
   * Registry configuration
   */
  registry?: {
    url: string;
    token?: string;
    timeout?: number;
  };

  /**
   * List of disabled plugin IDs
   */
  disabled: string[];

  /**
   * Plugin-specific configurations
   */
  plugins: Record<string, any>;

  /**
   * Plugin loading options
   */
  loading?: {
    timeout?: number;
    retries?: number;
    parallel?: boolean;
  };

  /**
   * Plugin security settings
   */
  security?: {
    sandboxing: boolean;
    allowedApiAccess: string[];
    resourceLimits?: {
      memory?: number;
      cpu?: number;
      fileSystem?: boolean;
      network?: boolean;
    };
  };
}

/**
 * Plugin source configuration
 */
export interface PluginSourceConfig {
  type: 'builtin' | 'npm' | 'local' | 'registry';
  enabled: boolean;
  priority?: number;
  options?: Record<string, any>;
}

/**
 * Default plugin configuration
 */
export const DEFAULT_PLUGIN_CONFIG: PluginConfig = {
  enabled: true,
  version: '1.0.0',
  sources: [
    {
      type: 'builtin',
      enabled: true,
      priority: 100
    },
    {
      type: 'local',
      enabled: true,
      priority: 80
    },
    {
      type: 'npm',
      enabled: false,
      priority: 60
    },
    {
      type: 'registry',
      enabled: false,
      priority: 40
    }
  ],
  local: {
    paths: ['.fhirpath-lsp/plugins']
  },
  disabled: [],
  plugins: {},
  loading: {
    timeout: 30000,
    retries: 3,
    parallel: true
  },
  security: {
    sandboxing: true,
    allowedApiAccess: ['connection', 'logger'],
    resourceLimits: {
      memory: 100 * 1024 * 1024, // 100MB
      cpu: 80, // 80% CPU usage
      fileSystem: false,
      network: false
    }
  }
};

/**
 * Plugin configuration paths for easy access
 */
export const PLUGIN_CONFIG_PATHS = {
  ENABLED: 'plugins.enabled',
  SOURCES: 'plugins.sources',
  LOCAL_PATHS: 'plugins.local.paths',
  DISABLED: 'plugins.disabled',
  PLUGIN_CONFIGS: 'plugins.plugins',
  SECURITY_SANDBOXING: 'plugins.security.sandboxing',
  LOADING_TIMEOUT: 'plugins.loading.timeout'
} as const;