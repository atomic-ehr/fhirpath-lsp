import { ConfigValidator, ValidationContext } from './ConfigValidator';
import { ConfigValidationResult, ConfigValidationError, ConfigValidationWarning } from '../schemas/BaseConfig';
import { PluginConfig, PluginSourceConfig } from '../schemas/PluginConfig';

/**
 * Validator for plugin configuration
 */
export class PluginConfigValidator implements ConfigValidator<PluginConfig> {
  readonly name = 'PluginConfigValidator';
  readonly version = '1.0.0';

  validate(config: Partial<PluginConfig>, context: ValidationContext): ConfigValidationResult {
    const errors: ConfigValidationError[] = [];
    const warnings: ConfigValidationWarning[] = [];

    if (config.enabled !== undefined) {
      this.validateEnabled(config.enabled, errors);
    }

    if (config.sources !== undefined) {
      this.validateSources(config.sources, errors, warnings);
    }

    if (config.local !== undefined) {
      this.validateLocalConfig(config.local, errors);
    }

    if (config.registry !== undefined) {
      this.validateRegistryConfig(config.registry, errors, warnings);
    }

    if (config.disabled !== undefined) {
      this.validateDisabled(config.disabled, errors);
    }

    if (config.plugins !== undefined) {
      this.validatePluginConfigs(config.plugins, warnings);
    }

    if (config.loading !== undefined) {
      this.validateLoadingConfig(config.loading, errors, warnings);
    }

    if (config.security !== undefined) {
      this.validateSecurityConfig(config.security, errors, warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private validateEnabled(enabled: any, errors: ConfigValidationError[]): void {
    if (typeof enabled !== 'boolean') {
      errors.push({
        path: 'plugins.enabled',
        message: 'Plugin enabled flag must be a boolean',
        value: enabled
      });
    }
  }

  private validateSources(sources: any, errors: ConfigValidationError[], warnings: ConfigValidationWarning[]): void {
    if (!Array.isArray(sources)) {
      errors.push({
        path: 'plugins.sources',
        message: 'Plugin sources must be an array',
        value: sources
      });
      return;
    }

    const validSourceTypes = ['builtin', 'npm', 'local', 'registry'];
    const seenTypes = new Set<string>();

    sources.forEach((source: any, index: number) => {
      const basePath = `plugins.sources[${index}]`;

      if (typeof source !== 'object' || source === null) {
        errors.push({
          path: basePath,
          message: 'Plugin source must be an object',
          value: source
        });
        return;
      }

      // Validate type
      if (!source.type || !validSourceTypes.includes(source.type)) {
        errors.push({
          path: `${basePath}.type`,
          message: `Plugin source type must be one of: ${validSourceTypes.join(', ')}`,
          value: source.type
        });
      } else {
        if (seenTypes.has(source.type)) {
          warnings.push({
            path: `${basePath}.type`,
            message: `Duplicate plugin source type: ${source.type}`,
            value: source.type
          });
        }
        seenTypes.add(source.type);
      }

      // Validate enabled
      if (source.enabled !== undefined && typeof source.enabled !== 'boolean') {
        errors.push({
          path: `${basePath}.enabled`,
          message: 'Plugin source enabled flag must be a boolean',
          value: source.enabled
        });
      }

      // Validate priority
      if (source.priority !== undefined) {
        if (typeof source.priority !== 'number' || source.priority < 0 || source.priority > 100) {
          errors.push({
            path: `${basePath}.priority`,
            message: 'Plugin source priority must be a number between 0 and 100',
            value: source.priority
          });
        }
      }
    });
  }

  private validateLocalConfig(local: any, errors: ConfigValidationError[]): void {
    if (typeof local !== 'object' || local === null) {
      errors.push({
        path: 'plugins.local',
        message: 'Plugin local configuration must be an object',
        value: local
      });
      return;
    }

    if (local.paths !== undefined) {
      if (!Array.isArray(local.paths)) {
        errors.push({
          path: 'plugins.local.paths',
          message: 'Plugin local paths must be an array',
          value: local.paths
        });
      } else {
        local.paths.forEach((path: any, index: number) => {
          if (typeof path !== 'string') {
            errors.push({
              path: `plugins.local.paths[${index}]`,
              message: 'Plugin local path must be a string',
              value: path
            });
          }
        });
      }
    }
  }

  private validateRegistryConfig(registry: any, errors: ConfigValidationError[], warnings: ConfigValidationWarning[]): void {
    if (typeof registry !== 'object' || registry === null) {
      errors.push({
        path: 'plugins.registry',
        message: 'Plugin registry configuration must be an object',
        value: registry
      });
      return;
    }

    // Validate URL
    if (!registry.url || typeof registry.url !== 'string') {
      errors.push({
        path: 'plugins.registry.url',
        message: 'Plugin registry URL is required and must be a string',
        value: registry.url
      });
    } else {
      try {
        new URL(registry.url);
      } catch (error) {
        errors.push({
          path: 'plugins.registry.url',
          message: 'Plugin registry URL must be a valid URL',
          value: registry.url
        });
      }
    }

    // Validate token
    if (registry.token !== undefined && typeof registry.token !== 'string') {
      errors.push({
        path: 'plugins.registry.token',
        message: 'Plugin registry token must be a string',
        value: registry.token
      });
    }

    // Validate timeout
    if (registry.timeout !== undefined) {
      if (typeof registry.timeout !== 'number' || registry.timeout <= 0) {
        errors.push({
          path: 'plugins.registry.timeout',
          message: 'Plugin registry timeout must be a positive number',
          value: registry.timeout
        });
      } else if (registry.timeout < 1000) {
        warnings.push({
          path: 'plugins.registry.timeout',
          message: 'Plugin registry timeout is very low, consider using at least 1000ms',
          value: registry.timeout
        });
      }
    }
  }

  private validateDisabled(disabled: any, errors: ConfigValidationError[]): void {
    if (!Array.isArray(disabled)) {
      errors.push({
        path: 'plugins.disabled',
        message: 'Plugin disabled list must be an array',
        value: disabled
      });
      return;
    }

    disabled.forEach((pluginId: any, index: number) => {
      if (typeof pluginId !== 'string') {
        errors.push({
          path: `plugins.disabled[${index}]`,
          message: 'Plugin ID must be a string',
          value: pluginId
        });
      } else if (!/^[a-zA-Z0-9-_]+$/.test(pluginId)) {
        errors.push({
          path: `plugins.disabled[${index}]`,
          message: 'Plugin ID must contain only alphanumeric characters, hyphens, and underscores',
          value: pluginId
        });
      }
    });
  }

  private validatePluginConfigs(plugins: any, warnings: ConfigValidationWarning[]): void {
    if (typeof plugins !== 'object' || plugins === null) {
      warnings.push({
        path: 'plugins.plugins',
        message: 'Plugin configurations should be an object',
        value: plugins
      });
      return;
    }

    // Validate plugin IDs
    Object.keys(plugins).forEach(pluginId => {
      if (!/^[a-zA-Z0-9-_]+$/.test(pluginId)) {
        warnings.push({
          path: `plugins.plugins.${pluginId}`,
          message: 'Plugin ID should contain only alphanumeric characters, hyphens, and underscores',
          value: pluginId
        });
      }
    });
  }

  private validateLoadingConfig(loading: any, errors: ConfigValidationError[], warnings: ConfigValidationWarning[]): void {
    if (typeof loading !== 'object' || loading === null) {
      errors.push({
        path: 'plugins.loading',
        message: 'Plugin loading configuration must be an object',
        value: loading
      });
      return;
    }

    // Validate timeout
    if (loading.timeout !== undefined) {
      if (typeof loading.timeout !== 'number' || loading.timeout <= 0) {
        errors.push({
          path: 'plugins.loading.timeout',
          message: 'Plugin loading timeout must be a positive number',
          value: loading.timeout
        });
      } else if (loading.timeout < 5000) {
        warnings.push({
          path: 'plugins.loading.timeout',
          message: 'Plugin loading timeout is very low, consider using at least 5000ms',
          value: loading.timeout
        });
      }
    }

    // Validate retries
    if (loading.retries !== undefined) {
      if (typeof loading.retries !== 'number' || loading.retries < 0 || loading.retries > 10) {
        errors.push({
          path: 'plugins.loading.retries',
          message: 'Plugin loading retries must be a number between 0 and 10',
          value: loading.retries
        });
      }
    }

    // Validate parallel
    if (loading.parallel !== undefined && typeof loading.parallel !== 'boolean') {
      errors.push({
        path: 'plugins.loading.parallel',
        message: 'Plugin loading parallel flag must be a boolean',
        value: loading.parallel
      });
    }
  }

  private validateSecurityConfig(security: any, errors: ConfigValidationError[], warnings: ConfigValidationWarning[]): void {
    if (typeof security !== 'object' || security === null) {
      errors.push({
        path: 'plugins.security',
        message: 'Plugin security configuration must be an object',
        value: security
      });
      return;
    }

    // Validate sandboxing
    if (security.sandboxing !== undefined && typeof security.sandboxing !== 'boolean') {
      errors.push({
        path: 'plugins.security.sandboxing',
        message: 'Plugin security sandboxing flag must be a boolean',
        value: security.sandboxing
      });
    }

    // Validate allowedApiAccess
    if (security.allowedApiAccess !== undefined) {
      if (!Array.isArray(security.allowedApiAccess)) {
        errors.push({
          path: 'plugins.security.allowedApiAccess',
          message: 'Plugin security allowed API access must be an array',
          value: security.allowedApiAccess
        });
      } else {
        const validApis = ['connection', 'logger', 'workspace', 'documents'];
        security.allowedApiAccess.forEach((api: any, index: number) => {
          if (typeof api !== 'string') {
            errors.push({
              path: `plugins.security.allowedApiAccess[${index}]`,
              message: 'API access entry must be a string',
              value: api
            });
          } else if (!validApis.includes(api)) {
            warnings.push({
              path: `plugins.security.allowedApiAccess[${index}]`,
              message: `Unknown API: ${api}. Valid APIs are: ${validApis.join(', ')}`,
              value: api
            });
          }
        });
      }
    }

    // Validate resource limits
    if (security.resourceLimits !== undefined) {
      this.validateResourceLimits(security.resourceLimits, errors, warnings);
    }
  }

  private validateResourceLimits(limits: any, errors: ConfigValidationError[], warnings: ConfigValidationWarning[]): void {
    if (typeof limits !== 'object' || limits === null) {
      errors.push({
        path: 'plugins.security.resourceLimits',
        message: 'Plugin security resource limits must be an object',
        value: limits
      });
      return;
    }

    // Validate memory limit
    if (limits.memory !== undefined) {
      if (typeof limits.memory !== 'number' || limits.memory <= 0) {
        errors.push({
          path: 'plugins.security.resourceLimits.memory',
          message: 'Memory limit must be a positive number (bytes)',
          value: limits.memory
        });
      } else if (limits.memory < 1024 * 1024) { // 1MB
        warnings.push({
          path: 'plugins.security.resourceLimits.memory',
          message: 'Memory limit is very low, consider using at least 1MB',
          value: limits.memory
        });
      }
    }

    // Validate CPU limit
    if (limits.cpu !== undefined) {
      if (typeof limits.cpu !== 'number' || limits.cpu <= 0 || limits.cpu > 100) {
        errors.push({
          path: 'plugins.security.resourceLimits.cpu',
          message: 'CPU limit must be a number between 0 and 100 (percentage)',
          value: limits.cpu
        });
      }
    }

    // Validate file system access
    if (limits.fileSystem !== undefined && typeof limits.fileSystem !== 'boolean') {
      errors.push({
        path: 'plugins.security.resourceLimits.fileSystem',
        message: 'File system access flag must be a boolean',
        value: limits.fileSystem
      });
    }

    // Validate network access
    if (limits.network !== undefined && typeof limits.network !== 'boolean') {
      errors.push({
        path: 'plugins.security.resourceLimits.network',
        message: 'Network access flag must be a boolean',
        value: limits.network
      });
    }
  }
}