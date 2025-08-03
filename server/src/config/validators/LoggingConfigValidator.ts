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
    const validLevels = ['error', 'warn', 'info', 'debug'];
    if (config.level !== undefined && !validLevels.includes(config.level)) {
      errors.push(`level must be one of: ${validLevels.join(', ')}`);
    }

    // Validate console config
    if (config.console !== undefined) {
      const consoleErrors = this.validateConsoleConfig(config.console);
      errors.push(...consoleErrors);
    }

    // Validate file config
    if (config.file !== undefined) {
      const fileErrors = this.validateFileConfig(config.file);
      errors.push(...fileErrors);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      data: errors.length === 0 ? config as LoggingConfig : undefined
    };
  }

  private validateConsoleConfig(config: any): string[] {
    const errors: string[] = [];

    if (typeof config !== 'object' || config === null) {
      return ['console must be an object'];
    }

    if (config.enabled !== undefined && typeof config.enabled !== 'boolean') {
      errors.push('console.enabled must be a boolean');
    }

    if (config.colorize !== undefined && typeof config.colorize !== 'boolean') {
      errors.push('console.colorize must be a boolean');
    }

    if (config.includeTimestamp !== undefined && typeof config.includeTimestamp !== 'boolean') {
      errors.push('console.includeTimestamp must be a boolean');
    }

    return errors;
  }

  private validateFileConfig(config: any): string[] {
    const errors: string[] = [];

    if (typeof config !== 'object' || config === null) {
      return ['file must be an object'];
    }

    if (config.enabled !== undefined && typeof config.enabled !== 'boolean') {
      errors.push('file.enabled must be a boolean');
    }

    if (config.path !== undefined) {
      if (typeof config.path !== 'string') {
        errors.push('file.path must be a string');
      } else if (config.path.trim() === '') {
        errors.push('file.path must not be empty');
      }
    }

    if (config.maxSize !== undefined) {
      if (typeof config.maxSize !== 'number') {
        errors.push('file.maxSize must be a number');
      } else if (config.maxSize < 1024 || config.maxSize > 100 * 1024 * 1024) {
        errors.push('file.maxSize must be between 1KB and 100MB');
      }
    }

    if (config.maxFiles !== undefined) {
      if (typeof config.maxFiles !== 'number') {
        errors.push('file.maxFiles must be a number');
      } else if (config.maxFiles < 1 || config.maxFiles > 50) {
        errors.push('file.maxFiles must be between 1 and 50');
      }
    }

    return errors;
  }
}