import {
  ConfigValidationResult,
  ConfigValidationError,
  ConfigValidationWarning
} from '../schemas/BaseConfig';
import { AppConfig } from '../ConfigManager';

/**
 * Base configuration validator interface
 */
export interface IConfigValidator {
  validate(config: Partial<AppConfig>): ConfigValidationResult;
  validatePath(path: string, value: any): ConfigValidationResult;
  getName(): string;
  getVersion(): string;
}

/**
 * Validation rule interface
 */
export interface ValidationRule {
  name: string;
  description: string;
  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult;
}

/**
 * Validation rule result
 */
export interface ValidationRuleResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Base configuration validator class
 */
export abstract class BaseConfigValidator implements IConfigValidator {
  protected rules: Map<string, ValidationRule> = new Map();
  protected name: string;
  protected version: string;

  constructor(name: string, version: string = '1.0.0') {
    this.name = name;
    this.version = version;
    this.initializeRules();
  }

  /**
   * Initialize validation rules - to be implemented by subclasses
   */
  protected abstract initializeRules(): void;

  /**
   * Get validator name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get validator version
   */
  getVersion(): string {
    return this.version;
  }

  /**
   * Add a validation rule
   */
  addRule(rule: ValidationRule): void {
    this.rules.set(rule.name, rule);
  }

  /**
   * Remove a validation rule
   */
  removeRule(ruleName: string): boolean {
    return this.rules.delete(ruleName);
  }

  /**
   * Get all validation rules
   */
  getRules(): ValidationRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Validate entire configuration
   */
  validate(config: Partial<AppConfig>): ConfigValidationResult {
    const errors: ConfigValidationError[] = [];
    const warnings: ConfigValidationWarning[] = [];

    // Run all rules against the configuration
    for (const [ruleName, rule] of this.rules) {
      try {
        const result = this.validateWithRule(rule, config, '');

        // Convert rule errors to validation errors
        for (const error of result.errors) {
          errors.push({
            path: '',
            message: `[${ruleName}] ${error}`,
            value: config
          });
        }

        // Convert rule warnings to validation warnings
        for (const warning of result.warnings) {
          warnings.push({
            path: '',
            message: `[${ruleName}] ${warning}`,
            value: config
          });
        }
      } catch (error) {
        errors.push({
          path: '',
          message: `Validation rule '${ruleName}' failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          value: config
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate specific configuration path
   */
  validatePath(path: string, value: any): ConfigValidationResult {
    const errors: ConfigValidationError[] = [];
    const warnings: ConfigValidationWarning[] = [];

    // Create a minimal config object for context
    const contextConfig = this.createContextConfig(path, value);

    // Run applicable rules against the path
    for (const [ruleName, rule] of this.rules) {
      try {
        const result = this.validateWithRule(rule, contextConfig, path);

        // Convert rule errors to validation errors
        for (const error of result.errors) {
          errors.push({
            path,
            message: `[${ruleName}] ${error}`,
            value
          });
        }

        // Convert rule warnings to validation warnings
        for (const warning of result.warnings) {
          warnings.push({
            path,
            message: `[${ruleName}] ${warning}`,
            value
          });
        }
      } catch (error) {
        errors.push({
          path,
          message: `Validation rule '${ruleName}' failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          value
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate configuration with a specific rule
   */
  protected validateWithRule(
    rule: ValidationRule,
    config: Partial<AppConfig>,
    targetPath: string
  ): ValidationRuleResult {
    if (targetPath) {
      // Validate specific path
      const value = this.getValueByPath(config, targetPath);
      return rule.validate(value, targetPath, config);
    } else {
      // Validate entire config
      return rule.validate(config, '', config);
    }
  }

  /**
   * Create context configuration for path validation
   */
  protected createContextConfig(path: string, value: any): Partial<AppConfig> {
    const config: any = {};
    this.setValueByPath(config, path, value);
    return config;
  }

  /**
   * Get value by path from configuration object
   */
  protected getValueByPath(obj: any, path: string): any {
    if (!path) return obj;
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Set value by path in configuration object
   */
  protected setValueByPath(obj: any, path: string, value: any): void {
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

  /**
   * Check if value is an object
   */
  protected isObject(value: any): value is Record<string, any> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  /**
   * Check if value is a valid number
   */
  protected isValidNumber(value: any): boolean {
    return typeof value === 'number' && !isNaN(value) && isFinite(value);
  }

  /**
   * Check if value is a valid boolean
   */
  protected isValidBoolean(value: any): boolean {
    return typeof value === 'boolean';
  }

  /**
   * Check if value is a valid string
   */
  protected isValidString(value: any): boolean {
    return typeof value === 'string';
  }

  /**
   * Check if value is within numeric range
   */
  protected isInRange(value: number, min?: number, max?: number): boolean {
    if (min !== undefined && value < min) return false;
    if (max !== undefined && value > max) return false;
    return true;
  }

  /**
   * Check if string matches pattern
   */
  protected matchesPattern(value: string, pattern: RegExp): boolean {
    return pattern.test(value);
  }
}

/**
 * Composite validator that combines multiple validators
 */
export class CompositeConfigValidator implements IConfigValidator {
  private validators: IConfigValidator[] = [];
  private name: string;
  private version: string;

  constructor(name: string = 'CompositeValidator', version: string = '1.0.0') {
    this.name = name;
    this.version = version;
  }

  /**
   * Add a validator to the composite
   */
  addValidator(validator: IConfigValidator): void {
    this.validators.push(validator);
  }

  /**
   * Remove a validator from the composite
   */
  removeValidator(validatorName: string): boolean {
    const index = this.validators.findIndex(v => v.getName() === validatorName);
    if (index >= 0) {
      this.validators.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all validators
   */
  getValidators(): IConfigValidator[] {
    return [...this.validators];
  }

  /**
   * Get validator name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get validator version
   */
  getVersion(): string {
    return this.version;
  }

  /**
   * Validate configuration using all validators
   */
  validate(config: Partial<AppConfig>): ConfigValidationResult {
    const allErrors: ConfigValidationError[] = [];
    const allWarnings: ConfigValidationWarning[] = [];

    for (const validator of this.validators) {
      try {
        const result = validator.validate(config);
        allErrors.push(...result.errors);
        allWarnings.push(...result.warnings);
      } catch (error) {
        allErrors.push({
          path: '',
          message: `Validator '${validator.getName()}' failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          value: config
        });
      }
    }

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings
    };
  }

  /**
   * Validate specific path using all validators
   */
  validatePath(path: string, value: any): ConfigValidationResult {
    const allErrors: ConfigValidationError[] = [];
    const allWarnings: ConfigValidationWarning[] = [];

    for (const validator of this.validators) {
      try {
        const result = validator.validatePath(path, value);
        allErrors.push(...result.errors);
        allWarnings.push(...result.warnings);
      } catch (error) {
        allErrors.push({
          path,
          message: `Validator '${validator.getName()}' failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          value
        });
      }
    }

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings
    };
  }
}

/**
 * Factory for creating common validators
 */
export class ConfigValidatorFactory {
  /**
   * Create a composite validator with common validators
   */
  static createDefault(): CompositeConfigValidator {
    const composite = new CompositeConfigValidator('DefaultValidator');
    // Validators will be added as they are implemented
    return composite;
  }

  /**
   * Create a development validator with additional checks
   */
  static createDevelopment(): CompositeConfigValidator {
    const composite = new CompositeConfigValidator('DevelopmentValidator');
    // Add development-specific validators
    return composite;
  }

  /**
   * Create a production validator with essential checks only
   */
  static createProduction(): CompositeConfigValidator {
    const composite = new CompositeConfigValidator('ProductionValidator');
    // Add production-specific validators
    return composite;
  }
}
