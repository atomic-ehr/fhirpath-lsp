import { IPlugin } from './IPlugin';
import { Diagnostic, DiagnosticSeverity, TextDocument } from 'vscode-languageserver';
import { ParseResult } from '../../parser/FHIRPathService';

/**
 * Validation result
 */
export interface ValidationResult {
  /**
   * Whether validation passed
   */
  valid: boolean;

  /**
   * Validation errors
   */
  errors?: ValidationError[];

  /**
   * Validation warnings
   */
  warnings?: ValidationWarning[];

  /**
   * Additional validation info
   */
  info?: ValidationInfo[];

  /**
   * Validation metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Base validation issue
 */
interface ValidationIssue {
  message: string;
  code?: string;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  source?: string;
}

/**
 * Validation error
 */
export interface ValidationError extends ValidationIssue {
  severity: 'error';
}

/**
 * Validation warning
 */
export interface ValidationWarning extends ValidationIssue {
  severity: 'warning';
}

/**
 * Validation info
 */
export interface ValidationInfo extends ValidationIssue {
  severity: 'info' | 'hint';
}

/**
 * Validator registration
 */
export interface ValidatorRegistration {
  /**
   * Unique validator ID
   */
  id: string;

  /**
   * Validator name
   */
  name: string;

  /**
   * Validator description
   */
  description?: string;

  /**
   * Validator instance
   */
  validator: IValidator;

  /**
   * Priority for ordering (higher = runs first)
   */
  priority?: number;

  /**
   * Whether validator is enabled by default
   */
  enabledByDefault?: boolean;

  /**
   * Validator categories
   */
  categories?: ValidatorCategory[];

  /**
   * Validation triggers
   */
  triggers?: ValidationTrigger[];
}

/**
 * Validator categories
 */
export enum ValidatorCategory {
  Syntax = 'syntax',
  Semantic = 'semantic',
  FHIR = 'fhir',
  Custom = 'custom',
  Security = 'security',
  Performance = 'performance'
}

/**
 * Validation triggers
 */
export enum ValidationTrigger {
  OnType = 'onType',
  OnSave = 'onSave',
  OnDemand = 'onDemand'
}

/**
 * Validator interface
 */
export interface IValidator {
  /**
   * Validate a FHIRPath expression
   */
  validate(
    expression: string,
    parseResult: ParseResult,
    document: TextDocument,
    context?: ValidationContext
  ): Promise<ValidationResult>;

  /**
   * Check if validator should run for given context
   */
  shouldValidate?(
    expression: string,
    document: TextDocument,
    context?: ValidationContext
  ): boolean;

  /**
   * Get validator configuration schema
   */
  getConfigurationSchema?(): any;

  /**
   * Convert validation result to diagnostics
   */
  toDiagnostics?(result: ValidationResult, document: TextDocument): Diagnostic[];
}

/**
 * Validation context
 */
export interface ValidationContext {
  /**
   * FHIR resource type context
   */
  resourceType?: string;

  /**
   * FHIR version
   */
  fhirVersion?: string;

  /**
   * Available variables in scope
   */
  variables?: Record<string, any>;

  /**
   * Custom context data
   */
  customData?: Record<string, any>;

  /**
   * Validation options
   */
  options?: {
    /**
     * Maximum validation time in milliseconds
     */
    timeout?: number;

    /**
     * Strict mode
     */
    strict?: boolean;

    /**
     * Enabled categories
     */
    enabledCategories?: ValidatorCategory[];

    /**
     * Custom rules
     */
    customRules?: any[];
  };
}

/**
 * Plugin that provides validators
 */
export interface IValidatorPlugin extends IPlugin {
  /**
   * Get validators provided by this plugin
   */
  getValidators(): ValidatorRegistration[];
}

/**
 * Type guard for validator plugins
 */
export function isValidatorPlugin(plugin: IPlugin): plugin is IValidatorPlugin {
  return 'getValidators' in plugin;
}

/**
 * Built-in validator types
 */
export enum BuiltinValidatorType {
  SyntaxValidator = 'syntax',
  SemanticValidator = 'semantic',
  FHIRValidator = 'fhir',
  TypeValidator = 'type',
  ReferenceValidator = 'reference'
}

/**
 * Validation result builder
 */
export class ValidationResultBuilder {
  private result: ValidationResult = { valid: true };

  static create(): ValidationResultBuilder {
    return new ValidationResultBuilder();
  }

  addError(error: Omit<ValidationError, 'severity'>): ValidationResultBuilder {
    if (!this.result.errors) {
      this.result.errors = [];
    }
    this.result.errors.push({ ...error, severity: 'error' });
    this.result.valid = false;
    return this;
  }

  addWarning(warning: Omit<ValidationWarning, 'severity'>): ValidationResultBuilder {
    if (!this.result.warnings) {
      this.result.warnings = [];
    }
    this.result.warnings.push({ ...warning, severity: 'warning' });
    return this;
  }

  addInfo(info: Omit<ValidationInfo, 'severity'> & { severity?: 'info' | 'hint' }): ValidationResultBuilder {
    if (!this.result.info) {
      this.result.info = [];
    }
    this.result.info.push({ ...info, severity: info.severity || 'info' });
    return this;
  }

  addMetadata(key: string, value: any): ValidationResultBuilder {
    if (!this.result.metadata) {
      this.result.metadata = {};
    }
    this.result.metadata[key] = value;
    return this;
  }

  setValid(valid: boolean): ValidationResultBuilder {
    this.result.valid = valid;
    return this;
  }

  build(): ValidationResult {
    return { ...this.result };
  }
}

/**
 * Helper to convert validation results to diagnostics
 */
export function validationResultToDiagnostics(
  result: ValidationResult,
  document: TextDocument,
  source: string = 'fhirpath'
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Convert errors
  if (result.errors) {
    for (const error of result.errors) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        message: error.message,
        code: error.code,
        source: error.source || source,
        range: error.range || {
          start: { line: 0, character: 0 },
          end: { line: 0, character: Number.MAX_VALUE }
        }
      });
    }
  }

  // Convert warnings
  if (result.warnings) {
    for (const warning of result.warnings) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        message: warning.message,
        code: warning.code,
        source: warning.source || source,
        range: warning.range || {
          start: { line: 0, character: 0 },
          end: { line: 0, character: Number.MAX_VALUE }
        }
      });
    }
  }

  // Convert info
  if (result.info) {
    for (const info of result.info) {
      diagnostics.push({
        severity: info.severity === 'hint' ? DiagnosticSeverity.Hint : DiagnosticSeverity.Information,
        message: info.message,
        code: info.code,
        source: info.source || source,
        range: info.range || {
          start: { line: 0, character: 0 },
          end: { line: 0, character: Number.MAX_VALUE }
        }
      });
    }
  }

  return diagnostics;
}