/**
 * Validator for logging configuration
 */

import { LoggingConfig } from '../schemas/LoggingConfig';
import { IConfigValidator, ValidationResult } from './ConfigValidator';

export class LoggingConfigValidator implements IConfigValidator<LoggingConfig> {
  validate(config: any): ValidationResult<LoggingConfig> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if config is an object
    if (typeof config !== 'object' || config === null) {
      return {
        isValid: false,
        errors: ['Logging configuration must be an object'],
        warnings: [],
        data: undefined
      };
    }

    // Validate enabled field
    if (config.enabled !== undefined && typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    // Validate level field
    const validLevels = ['error', 'warn', 'info', 'debug', 'trace'];
    if (config.level !== undefined && !validLevels.includes(config.level)) {
      errors.push(`level must be one of: ${validLevels.join(', ')}`);
    }

    // Validate transports
    if (config.transports !== undefined) {
      if (!Array.isArray(config.transports)) {
        errors.push('transports must be an array');
      } else {
        config.transports.forEach((transport: any, index: number) => {
          const transportErrors = this.validateTransport(transport, index);
          errors.push(...transportErrors);
        });
      }
    }

    // Validate correlationId config
    if (config.correlationId !== undefined) {
      const correlationErrors = this.validateCorrelationIdConfig(config.correlationId);
      errors.push(...correlationErrors);
    }

    // Validate context config
    if (config.context !== undefined) {
      const contextErrors = this.validateContextConfig(config.context);
      errors.push(...contextErrors);
    }

    // Validate performance config
    if (config.performance !== undefined) {
      const performanceErrors = this.validatePerformanceConfig(config.performance);
      errors.push(...performanceErrors);
    }

    // Validate filters
    if (config.filters !== undefined) {
      if (!Array.isArray(config.filters)) {
        errors.push('filters must be an array');
      } else {
        config.filters.forEach((filter: any, index: number) => {
          const filterErrors = this.validateFilter(filter, index);
          errors.push(...filterErrors);
        });
      }
    }

    // Check for performance impact warnings
    if (config.performance?.enableCpuTracking === true) {
      warnings.push('CPU tracking is enabled which may impact performance');
    }

    if (config.transports?.length > 5) {
      warnings.push('Large number of transports may impact performance');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      data: errors.length === 0 ? config as LoggingConfig : undefined
    };
  }

  private validateTransport(transport: any, index: number): string[] {
    const errors: string[] = [];
    const prefix = `transports[${index}]`;

    if (typeof transport !== 'object' || transport === null) {
      return [`${prefix} must be an object`];
    }

    // Required fields
    if (!transport.type) {
      errors.push(`${prefix}.type is required`);
    } else if (!['console', 'file', 'remote'].includes(transport.type)) {
      errors.push(`${prefix}.type must be one of: console, file, remote`);
    }

    if (!transport.name) {
      errors.push(`${prefix}.name is required`);
    } else if (typeof transport.name !== 'string') {
      errors.push(`${prefix}.name must be a string`);
    }

    // Optional fields
    const validLevels = ['error', 'warn', 'info', 'debug', 'trace'];
    if (transport.level !== undefined && !validLevels.includes(transport.level)) {
      errors.push(`${prefix}.level must be one of: ${validLevels.join(', ')}`);
    }

    if (transport.enabled !== undefined && typeof transport.enabled !== 'boolean') {
      errors.push(`${prefix}.enabled must be a boolean`);
    }

    if (transport.options !== undefined && (typeof transport.options !== 'object' || transport.options === null)) {
      errors.push(`${prefix}.options must be an object`);
    }

    // Type-specific validation
    if (transport.type === 'file' && transport.options) {
      if (!transport.options.filePath) {
        errors.push(`${prefix}.options.filePath is required for file transport`);
      }
    }

    if (transport.type === 'remote' && transport.options) {
      if (!transport.options.endpoint) {
        errors.push(`${prefix}.options.endpoint is required for remote transport`);
      }
    }

    return errors;
  }

  private validateCorrelationIdConfig(config: any): string[] {
    const errors: string[] = [];

    if (typeof config !== 'object' || config === null) {
      return ['correlationId must be an object'];
    }

    if (config.enabled !== undefined && typeof config.enabled !== 'boolean') {
      errors.push('correlationId.enabled must be a boolean');
    }

    if (config.generator !== undefined && !['uuid', 'short', 'custom'].includes(config.generator)) {
      errors.push('correlationId.generator must be one of: uuid, short, custom');
    }

    return errors;
  }

  private validateContextConfig(config: any): string[] {
    const errors: string[] = [];

    if (typeof config !== 'object' || config === null) {
      return ['context must be an object'];
    }

    if (config.includeSource !== undefined && typeof config.includeSource !== 'boolean') {
      errors.push('context.includeSource must be a boolean');
    }

    if (config.includePerformance !== undefined && typeof config.includePerformance !== 'boolean') {
      errors.push('context.includePerformance must be a boolean');
    }

    if (config.defaultTags !== undefined) {
      if (!Array.isArray(config.defaultTags)) {
        errors.push('context.defaultTags must be an array');
      } else if (!config.defaultTags.every((tag: any) => typeof tag === 'string')) {
        errors.push('context.defaultTags must be an array of strings');
      }
    }

    return errors;
  }

  private validatePerformanceConfig(config: any): string[] {
    const errors: string[] = [];

    if (typeof config !== 'object' || config === null) {
      return ['performance must be an object'];
    }

    const booleanFields = ['enableTimers', 'enableMemoryTracking', 'enableCpuTracking'];
    for (const field of booleanFields) {
      if (config[field] !== undefined && typeof config[field] !== 'boolean') {
        errors.push(`performance.${field} must be a boolean`);
      }
    }

    if (config.thresholds !== undefined) {
      if (typeof config.thresholds !== 'object' || config.thresholds === null) {
        errors.push('performance.thresholds must be an object');
      } else {
        for (const [operation, thresholds] of Object.entries(config.thresholds)) {
          if (typeof thresholds !== 'object' || thresholds === null) {
            errors.push(`performance.thresholds.${operation} must be an object`);
            continue;
          }

          const { warn, error } = thresholds as any;
          if (typeof warn !== 'number' || warn < 0) {
            errors.push(`performance.thresholds.${operation}.warn must be a positive number`);
          }
          if (typeof error !== 'number' || error < 0) {
            errors.push(`performance.thresholds.${operation}.error must be a positive number`);
          }
          if (typeof warn === 'number' && typeof error === 'number' && warn >= error) {
            errors.push(`performance.thresholds.${operation}.warn must be less than error threshold`);
          }
        }
      }
    }

    return errors;
  }

  private validateFilter(filter: any, index: number): string[] {
    const errors: string[] = [];
    const prefix = `filters[${index}]`;

    if (typeof filter !== 'object' || filter === null) {
      return [`${prefix} must be an object`];
    }

    if (!filter.type) {
      errors.push(`${prefix}.type is required`);
    } else if (!['level', 'component', 'performance'].includes(filter.type)) {
      errors.push(`${prefix}.type must be one of: level, component, performance`);
    }

    if (!filter.name) {
      errors.push(`${prefix}.name is required`);
    } else if (typeof filter.name !== 'string') {
      errors.push(`${prefix}.name must be a string`);
    }

    if (filter.enabled !== undefined && typeof filter.enabled !== 'boolean') {
      errors.push(`${prefix}.enabled must be a boolean`);
    }

    if (filter.options !== undefined && (typeof filter.options !== 'object' || filter.options === null)) {
      errors.push(`${prefix}.options must be an object`);
    }

    return errors;
  }
}