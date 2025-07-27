import { DiagnosticSeverity } from 'vscode-languageserver';
import { BaseConfigValidator, ValidationRule, ValidationRuleResult } from './ConfigValidator';
import { AppConfig } from '../ConfigManager';

/**
 * Validator for diagnostic configuration
 */
export class DiagnosticConfigValidator extends BaseConfigValidator {
  constructor() {
    super('DiagnosticConfigValidator', '1.0.0');
  }

  protected initializeRules(): void {
    // Global diagnostic rules
    this.addRule(new DiagnosticEnabledRule());

    // Performance analyzer rules
    this.addRule(new PerformanceMaxComplexityRule());
    this.addRule(new PerformanceMaxNestingDepthRule());
    this.addRule(new PerformanceBooleanFieldsRule());

    // Code quality analyzer rules
    this.addRule(new CodeQualityMaxLineLengthRule());
    this.addRule(new CodeQualityBooleanFieldsRule());

    // FHIR best practices rules
    this.addRule(new FHIRBestPracticesBooleanFieldsRule());

    // Maintainability rules
    this.addRule(new MaintainabilityMaxFunctionComplexityRule());
    this.addRule(new MaintainabilityBooleanFieldsRule());

    // Severity configuration rules
    this.addRule(new DiagnosticSeverityRule());

    // Global rules validation
    this.addRule(new GlobalRulesRule());
  }
}

/**
 * Rule to validate diagnostic enabled field
 */
class DiagnosticEnabledRule implements ValidationRule {
  name = 'diagnostic-enabled';
  description = 'Validates that diagnostics.enabled is a boolean';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (path === 'diagnostics.enabled' || path === '') {
      const enabled = path === 'diagnostics.enabled' ? value : fullConfig.diagnostics?.enabled;

      if (enabled !== undefined && typeof enabled !== 'boolean') {
        errors.push('diagnostics.enabled must be a boolean value');
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}

/**
 * Rule to validate performance max complexity
 */
class PerformanceMaxComplexityRule implements ValidationRule {
  name = 'performance-max-complexity';
  description = 'Validates performance.maxComplexity is within valid range';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (path === 'diagnostics.performance.maxComplexity' || path === '') {
      const maxComplexity = path === 'diagnostics.performance.maxComplexity' ?
        value : fullConfig.diagnostics?.performance?.maxComplexity;

      if (maxComplexity !== undefined) {
        if (typeof maxComplexity !== 'number') {
          errors.push('diagnostics.performance.maxComplexity must be a number');
        } else if (maxComplexity < 1 || maxComplexity > 50) {
          errors.push('diagnostics.performance.maxComplexity must be between 1 and 50');
        } else if (maxComplexity > 20) {
          warnings.push('diagnostics.performance.maxComplexity above 20 may impact performance');
        }
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}

/**
 * Rule to validate performance max nesting depth
 */
class PerformanceMaxNestingDepthRule implements ValidationRule {
  name = 'performance-max-nesting-depth';
  description = 'Validates performance.maxNestingDepth is within valid range';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (path === 'diagnostics.performance.maxNestingDepth' || path === '') {
      const maxNestingDepth = path === 'diagnostics.performance.maxNestingDepth' ?
        value : fullConfig.diagnostics?.performance?.maxNestingDepth;

      if (maxNestingDepth !== undefined) {
        if (typeof maxNestingDepth !== 'number') {
          errors.push('diagnostics.performance.maxNestingDepth must be a number');
        } else if (maxNestingDepth < 1 || maxNestingDepth > 20) {
          errors.push('diagnostics.performance.maxNestingDepth must be between 1 and 20');
        } else if (maxNestingDepth > 10) {
          warnings.push('diagnostics.performance.maxNestingDepth above 10 may be too permissive');
        }
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}

/**
 * Rule to validate performance boolean fields
 */
class PerformanceBooleanFieldsRule implements ValidationRule {
  name = 'performance-boolean-fields';
  description = 'Validates performance boolean configuration fields';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const booleanFields = [
      'diagnostics.performance.enabled',
      'diagnostics.performance.flagRedundantOperations',
      'diagnostics.performance.flagExpensiveOperations'
    ];

    for (const field of booleanFields) {
      if (path === field || path === '') {
        const fieldValue = path === field ? value : this.getValueByPath(fullConfig, field);

        if (fieldValue !== undefined && typeof fieldValue !== 'boolean') {
          errors.push(`${field} must be a boolean value`);
        }
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  private getValueByPath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}

/**
 * Rule to validate code quality max line length
 */
class CodeQualityMaxLineLengthRule implements ValidationRule {
  name = 'code-quality-max-line-length';
  description = 'Validates codeQuality.maxLineLength is within valid range';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (path === 'diagnostics.codeQuality.maxLineLength' || path === '') {
      const maxLineLength = path === 'diagnostics.codeQuality.maxLineLength' ?
        value : fullConfig.diagnostics?.codeQuality?.maxLineLength;

      if (maxLineLength !== undefined) {
        if (typeof maxLineLength !== 'number') {
          errors.push('diagnostics.codeQuality.maxLineLength must be a number');
        } else if (maxLineLength < 50 || maxLineLength > 200) {
          errors.push('diagnostics.codeQuality.maxLineLength must be between 50 and 200');
        } else if (maxLineLength < 80) {
          warnings.push('diagnostics.codeQuality.maxLineLength below 80 may be too restrictive');
        }
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}

/**
 * Rule to validate code quality boolean fields
 */
class CodeQualityBooleanFieldsRule implements ValidationRule {
  name = 'code-quality-boolean-fields';
  description = 'Validates code quality boolean configuration fields';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const booleanFields = [
      'diagnostics.codeQuality.enabled',
      'diagnostics.codeQuality.enforceNamingConventions',
      'diagnostics.codeQuality.flagMagicValues',
      'diagnostics.codeQuality.requireDocumentation'
    ];

    for (const field of booleanFields) {
      if (path === field || path === '') {
        const fieldValue = path === field ? value : this.getValueByPath(fullConfig, field);

        if (fieldValue !== undefined && typeof fieldValue !== 'boolean') {
          errors.push(`${field} must be a boolean value`);
        }
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  private getValueByPath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}

/**
 * Rule to validate FHIR best practices boolean fields
 */
class FHIRBestPracticesBooleanFieldsRule implements ValidationRule {
  name = 'fhir-best-practices-boolean-fields';
  description = 'Validates FHIR best practices boolean configuration fields';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const booleanFields = [
      'diagnostics.fhirBestPractices.enabled',
      'diagnostics.fhirBestPractices.enforceTypeSafety',
      'diagnostics.fhirBestPractices.flagDeprecatedElements',
      'diagnostics.fhirBestPractices.suggestOptimizations',
      'diagnostics.fhirBestPractices.checkCardinality'
    ];

    for (const field of booleanFields) {
      if (path === field || path === '') {
        const fieldValue = path === field ? value : this.getValueByPath(fullConfig, field);

        if (fieldValue !== undefined && typeof fieldValue !== 'boolean') {
          errors.push(`${field} must be a boolean value`);
        }
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  private getValueByPath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}

/**
 * Rule to validate maintainability max function complexity
 */
class MaintainabilityMaxFunctionComplexityRule implements ValidationRule {
  name = 'maintainability-max-function-complexity';
  description = 'Validates maintainability.maxFunctionComplexity is within valid range';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (path === 'diagnostics.maintainability.maxFunctionComplexity' || path === '') {
      const maxFunctionComplexity = path === 'diagnostics.maintainability.maxFunctionComplexity' ?
        value : fullConfig.diagnostics?.maintainability?.maxFunctionComplexity;

      if (maxFunctionComplexity !== undefined) {
        if (typeof maxFunctionComplexity !== 'number') {
          errors.push('diagnostics.maintainability.maxFunctionComplexity must be a number');
        } else if (maxFunctionComplexity < 1 || maxFunctionComplexity > 30) {
          errors.push('diagnostics.maintainability.maxFunctionComplexity must be between 1 and 30');
        } else if (maxFunctionComplexity > 15) {
          warnings.push('diagnostics.maintainability.maxFunctionComplexity above 15 may indicate complex functions');
        }
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}

/**
 * Rule to validate maintainability boolean fields
 */
class MaintainabilityBooleanFieldsRule implements ValidationRule {
  name = 'maintainability-boolean-fields';
  description = 'Validates maintainability boolean configuration fields';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const booleanFields = [
      'diagnostics.maintainability.enabled',
      'diagnostics.maintainability.flagDuplication',
      'diagnostics.maintainability.enforceConsistency'
    ];

    for (const field of booleanFields) {
      if (path === field || path === '') {
        const fieldValue = path === field ? value : this.getValueByPath(fullConfig, field);

        if (fieldValue !== undefined && typeof fieldValue !== 'boolean') {
          errors.push(`${field} must be a boolean value`);
        }
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  private getValueByPath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}

/**
 * Rule to validate diagnostic severity configuration
 */
class DiagnosticSeverityRule implements ValidationRule {
  name = 'diagnostic-severity';
  description = 'Validates diagnostic severity configuration values';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const severityFields = [
      'diagnostics.severity.performance',
      'diagnostics.severity.codeQuality',
      'diagnostics.severity.fhirBestPractices',
      'diagnostics.severity.maintainability'
    ];

    const validSeverities = [
      DiagnosticSeverity.Error,
      DiagnosticSeverity.Warning,
      DiagnosticSeverity.Information,
      DiagnosticSeverity.Hint
    ];

    for (const field of severityFields) {
      if (path === field || path === '') {
        const fieldValue = path === field ? value : this.getValueByPath(fullConfig, field);

        if (fieldValue !== undefined) {
          if (!validSeverities.includes(fieldValue)) {
            errors.push(`${field} must be a valid DiagnosticSeverity value (1-4)`);
          }
        }
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  private getValueByPath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}

/**
 * Rule to validate global rules configuration
 */
class GlobalRulesRule implements ValidationRule {
  name = 'global-rules';
  description = 'Validates global rules configuration';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (path === 'diagnostics.globalRules' || path === '') {
      const globalRules = path === 'diagnostics.globalRules' ?
        value : fullConfig.diagnostics?.globalRules;

      if (globalRules !== undefined) {
        if (typeof globalRules !== 'object' || globalRules === null) {
          errors.push('diagnostics.globalRules must be an object');
        } else {
          // Validate each rule configuration
          for (const [ruleId, ruleConfig] of Object.entries(globalRules)) {
            if (typeof ruleConfig !== 'object' || ruleConfig === null) {
              errors.push(`diagnostics.globalRules.${ruleId} must be an object`);
              continue;
            }

            const config = ruleConfig as any;

            if (config.enabled !== undefined && typeof config.enabled !== 'boolean') {
              errors.push(`diagnostics.globalRules.${ruleId}.enabled must be a boolean`);
            }

            if (config.severity !== undefined && ![1, 2, 3, 4].includes(config.severity)) {
              errors.push(`diagnostics.globalRules.${ruleId}.severity must be a valid DiagnosticSeverity (1-4)`);
            }

            if (config.parameters !== undefined &&
                (typeof config.parameters !== 'object' || config.parameters === null)) {
              errors.push(`diagnostics.globalRules.${ruleId}.parameters must be an object`);
            }
          }
        }
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}
