import { BaseConfigValidator, ValidationRule, ValidationRuleResult } from './ConfigValidator';
import { AppConfig } from '../ConfigManager';

/**
 * Validator for provider configuration
 */
export class ProviderConfigValidator extends BaseConfigValidator {
  constructor() {
    super('ProviderConfigValidator', '1.0.0');
  }

  protected initializeRules(): void {
    // Global provider rules
    this.addRule(new ProviderEnabledRule());

    // ModelProvider configuration rules
    this.addRule(new ModelProviderConfigRule());
    this.addRule(new FHIRModelProviderConfigRule());
    this.addRule(new ModelProviderCachingConfigRule());

    // Enhanced provider configuration rules
    this.addRule(new EnhancedProviderConfigRule());
    this.addRule(new EnhancedCompletionConfigRule());
    this.addRule(new EnhancedHoverConfigRule());
    this.addRule(new EnhancedDiagnosticsConfigRule());
    this.addRule(new EnhancedRefactoringConfigRule());

    // Health check configuration rules
    this.addRule(new HealthCheckConfigRule());

    // Refactoring configuration rules
    this.addRule(new RefactoringConfigRule());


    // Individual provider rules
    this.addRule(new CompletionConfigRule());
    this.addRule(new HoverConfigRule());
    this.addRule(new DefinitionConfigRule());
    this.addRule(new ReferencesConfigRule());
    this.addRule(new SemanticTokensConfigRule());
    this.addRule(new CodeActionConfigRule());
  }
}

/**
 * Rule to validate provider enabled field
 */
class ProviderEnabledRule implements ValidationRule {
  name = 'provider-enabled';
  description = 'Validates that providers.enabled is a boolean';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (path === 'providers.enabled' || path === '') {
      const enabled = path === 'providers.enabled' ? value : fullConfig.providers?.enabled;

      if (enabled !== undefined && typeof enabled !== 'boolean') {
        errors.push('providers.enabled must be a boolean value');
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}

/**
 * Rule to validate refactoring configuration
 */
class RefactoringConfigRule implements ValidationRule {
  name = 'refactoring-config';
  description = 'Validates refactoring configuration';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const refactoringPaths = [
      'providers.refactoring.enabled',
      'providers.refactoring.autoSuggestNames',
      'providers.refactoring.confirmDestructive',
      'providers.refactoring.maxPreviewChanges',
      'providers.refactoring.safetyChecks.semanticValidation',
      'providers.refactoring.safetyChecks.syntaxCheck',
      'providers.refactoring.safetyChecks.referenceIntegrity'
    ];

    for (const refactoringPath of refactoringPaths) {
      if (path === refactoringPath || path === '') {
        const fieldValue = path === refactoringPath ? value : this.getValueByPath(fullConfig, refactoringPath);

        if (fieldValue !== undefined) {
          if (refactoringPath === 'providers.refactoring.maxPreviewChanges') {
            if (typeof fieldValue !== 'number') {
              errors.push(`${refactoringPath} must be a number`);
            } else if (fieldValue < 1 || fieldValue > 1000) {
              errors.push(`${refactoringPath} must be between 1 and 1000`);
            } else if (fieldValue > 500) {
              warnings.push(`${refactoringPath} above 500 may impact performance`);
            }
          } else {
            // Boolean fields
            if (typeof fieldValue !== 'boolean') {
              errors.push(`${refactoringPath} must be a boolean value`);
            }
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
 * Rule to validate completion configuration
 */
class CompletionConfigRule implements ValidationRule {
  name = 'completion-config';
  description = 'Validates completion provider configuration';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const completionPaths = [
      'providers.completion.enabled',
      'providers.completion.maxSuggestions',
      'providers.completion.includeSnippets',
      'providers.completion.includeDocumentation',
      'providers.completion.fuzzyMatching',
      'providers.completion.sortByRelevance'
    ];

    for (const completionPath of completionPaths) {
      if (path === completionPath || path === '') {
        const fieldValue = path === completionPath ? value : this.getValueByPath(fullConfig, completionPath);

        if (fieldValue !== undefined) {
          if (completionPath === 'providers.completion.maxSuggestions') {
            if (typeof fieldValue !== 'number') {
              errors.push(`${completionPath} must be a number`);
            } else if (fieldValue < 1 || fieldValue > 200) {
              errors.push(`${completionPath} must be between 1 and 200`);
            } else if (fieldValue > 100) {
              warnings.push(`${completionPath} above 100 may impact performance`);
            }
          } else {
            if (typeof fieldValue !== 'boolean') {
              errors.push(`${completionPath} must be a boolean value`);
            }
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
 * Rule to validate hover configuration
 */
class HoverConfigRule implements ValidationRule {
  name = 'hover-config';
  description = 'Validates hover provider configuration';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const hoverPaths = [
      'providers.hover.enabled',
      'providers.hover.includeDocumentation',
      'providers.hover.includeExamples',
      'providers.hover.maxContentLength',
      'providers.hover.showTypeInformation'
    ];

    for (const hoverPath of hoverPaths) {
      if (path === hoverPath || path === '') {
        const fieldValue = path === hoverPath ? value : this.getValueByPath(fullConfig, hoverPath);

        if (fieldValue !== undefined) {
          if (hoverPath === 'providers.hover.maxContentLength') {
            if (typeof fieldValue !== 'number') {
              errors.push(`${hoverPath} must be a number`);
            } else if (fieldValue < 100 || fieldValue > 5000) {
              errors.push(`${hoverPath} must be between 100 and 5000`);
            }
          } else {
            if (typeof fieldValue !== 'boolean') {
              errors.push(`${hoverPath} must be a boolean value`);
            }
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
 * Rule to validate definition configuration
 */
class DefinitionConfigRule implements ValidationRule {
  name = 'definition-config';
  description = 'Validates definition provider configuration';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const definitionPaths = [
      'providers.definition.enabled',
      'providers.definition.includeDeclaration',
      'providers.definition.includeReferences',
      'providers.definition.maxResults'
    ];

    for (const definitionPath of definitionPaths) {
      if (path === definitionPath || path === '') {
        const fieldValue = path === definitionPath ? value : this.getValueByPath(fullConfig, definitionPath);

        if (fieldValue !== undefined) {
          if (definitionPath === 'providers.definition.maxResults') {
            if (typeof fieldValue !== 'number') {
              errors.push(`${definitionPath} must be a number`);
            } else if (fieldValue < 1 || fieldValue > 100) {
              errors.push(`${definitionPath} must be between 1 and 100`);
            }
          } else {
            if (typeof fieldValue !== 'boolean') {
              errors.push(`${definitionPath} must be a boolean value`);
            }
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
 * Rule to validate references configuration
 */
class ReferencesConfigRule implements ValidationRule {
  name = 'references-config';
  description = 'Validates references provider configuration';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const referencesPaths = [
      'providers.references.enabled',
      'providers.references.includeDeclaration',
      'providers.references.maxResults',
      'providers.references.searchInComments'
    ];

    for (const referencesPath of referencesPaths) {
      if (path === referencesPath || path === '') {
        const fieldValue = path === referencesPath ? value : this.getValueByPath(fullConfig, referencesPath);

        if (fieldValue !== undefined) {
          if (referencesPath === 'providers.references.maxResults') {
            if (typeof fieldValue !== 'number') {
              errors.push(`${referencesPath} must be a number`);
            } else if (fieldValue < 1 || fieldValue > 1000) {
              errors.push(`${referencesPath} must be between 1 and 1000`);
            } else if (fieldValue > 500) {
              warnings.push(`${referencesPath} above 500 may impact performance`);
            }
          } else {
            if (typeof fieldValue !== 'boolean') {
              errors.push(`${referencesPath} must be a boolean value`);
            }
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
 * Rule to validate semantic tokens configuration
 */
class SemanticTokensConfigRule implements ValidationRule {
  name = 'semantic-tokens-config';
  description = 'Validates semantic tokens provider configuration';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const semanticTokensPaths = [
      'providers.semanticTokens.enabled',
      'providers.semanticTokens.includeModifiers',
      'providers.semanticTokens.colorizeStrings',
      'providers.semanticTokens.colorizeNumbers',
      'providers.semanticTokens.colorizeComments'
    ];

    for (const semanticTokensPath of semanticTokensPaths) {
      if (path === semanticTokensPath || path === '') {
        const fieldValue = path === semanticTokensPath ? value : this.getValueByPath(fullConfig, semanticTokensPath);

        if (fieldValue !== undefined && typeof fieldValue !== 'boolean') {
          errors.push(`${semanticTokensPath} must be a boolean value`);
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
 * Rule to validate code action configuration
 */
class CodeActionConfigRule implements ValidationRule {
  name = 'code-action-config';
  description = 'Validates code action provider configuration';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const codeActionPaths = [
      'providers.codeAction.enabled',
      'providers.codeAction.includeQuickFixes',
      'providers.codeAction.includeRefactorings',
      'providers.codeAction.includeSourceActions',
      'providers.codeAction.maxActions'
    ];

    for (const codeActionPath of codeActionPaths) {
      if (path === codeActionPath || path === '') {
        const fieldValue = path === codeActionPath ? value : this.getValueByPath(fullConfig, codeActionPath);

        if (fieldValue !== undefined) {
          if (codeActionPath === 'providers.codeAction.maxActions') {
            if (typeof fieldValue !== 'number') {
              errors.push(`${codeActionPath} must be a number`);
            } else if (fieldValue < 1 || fieldValue > 100) {
              errors.push(`${codeActionPath} must be between 1 and 100`);
            } else if (fieldValue > 50) {
              warnings.push(`${codeActionPath} above 50 may clutter the UI`);
            }
          } else {
            if (typeof fieldValue !== 'boolean') {
              errors.push(`${codeActionPath} must be a boolean value`);
            }
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
 * Rule to validate ModelProvider configuration
 */
class ModelProviderConfigRule implements ValidationRule {
  name = 'model-provider-config';
  description = 'Validates ModelProvider configuration';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const modelProviderPaths = [
      'providers.modelProvider.enabled',
      'providers.modelProvider.required'
    ];

    for (const modelProviderPath of modelProviderPaths) {
      if (path === modelProviderPath || path === '') {
        const fieldValue = path === modelProviderPath ? value : this.getValueByPath(fullConfig, modelProviderPath);

        if (fieldValue !== undefined && typeof fieldValue !== 'boolean') {
          errors.push(`${modelProviderPath} must be a boolean value`);
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
 * Rule to validate FHIR ModelProvider configuration
 */
class FHIRModelProviderConfigRule implements ValidationRule {
  name = 'fhir-model-provider-config';
  description = 'Validates FHIR ModelProvider configuration';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (path === 'providers.modelProvider.fhirModelProvider.packages' || path === '') {
      const packages = path === 'providers.modelProvider.fhirModelProvider.packages' ?
        value : this.getValueByPath(fullConfig, 'providers.modelProvider.fhirModelProvider.packages');

      if (packages !== undefined) {
        if (!Array.isArray(packages)) {
          errors.push('providers.modelProvider.fhirModelProvider.packages must be an array');
        } else if (packages.length === 0) {
          errors.push('At least one FHIR package must be specified');
        } else {
          for (let i = 0; i < packages.length; i++) {
            const pkg = packages[i];

            if (typeof pkg !== 'object' || pkg === null) {
              errors.push(`providers.modelProvider.fhirModelProvider.packages[${i}] must be an object`);
              continue;
            }

            if (typeof pkg.name !== 'string' || pkg.name.trim() === '') {
              errors.push(`providers.modelProvider.fhirModelProvider.packages[${i}].name must be a non-empty string`);
            }

            if (typeof pkg.version !== 'string' || pkg.version.trim() === '') {
              errors.push(`providers.modelProvider.fhirModelProvider.packages[${i}].version must be a non-empty string`);
            }
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
 * Rule to validate enhanced provider configuration
 */
class EnhancedProviderConfigRule implements ValidationRule {
  name = 'enhanced-provider-config';
  description = 'Validates enhanced provider configuration';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    return { isValid: errors.length === 0, errors, warnings };
  }
}

/**
 * Rule to validate enhanced completion configuration
 */
class EnhancedCompletionConfigRule implements ValidationRule {
  name = 'enhanced-completion-config';
  description = 'Validates enhanced completion configuration';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const completionPaths = [
      'providers.enhanced.completion.enabled',
      'providers.enhanced.completion.enhanced',
      'providers.enhanced.completion.choiceTypes',
      'providers.enhanced.completion.inheritance',
      'providers.enhanced.completion.deepNavigation',
      'providers.enhanced.completion.maxCompletions'
    ];

    for (const completionPath of completionPaths) {
      if (path === completionPath || path === '') {
        const fieldValue = path === completionPath ? value : this.getValueByPath(fullConfig, completionPath);

        if (fieldValue !== undefined) {
          if (completionPath === 'providers.enhanced.completion.maxCompletions') {
            if (typeof fieldValue !== 'number') {
              errors.push(`${completionPath} must be a number`);
            } else if (fieldValue < 10 || fieldValue > 500) {
              errors.push(`${completionPath} must be between 10 and 500`);
            }
          } else {
            if (typeof fieldValue !== 'boolean') {
              errors.push(`${completionPath} must be a boolean value`);
            }
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
 * Rule to validate enhanced hover configuration
 */
class EnhancedHoverConfigRule implements ValidationRule {
  name = 'enhanced-hover-config';
  description = 'Validates enhanced hover configuration';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const hoverPaths = [
      'providers.enhanced.hover.enabled',
      'providers.enhanced.hover.enhanced',
      'providers.enhanced.hover.showHierarchy',
      'providers.enhanced.hover.showConstraints',
      'providers.enhanced.hover.showTerminology'
    ];

    for (const hoverPath of hoverPaths) {
      if (path === hoverPath || path === '') {
        const fieldValue = path === hoverPath ? value : this.getValueByPath(fullConfig, hoverPath);

        if (fieldValue !== undefined && typeof fieldValue !== 'boolean') {
          errors.push(`${hoverPath} must be a boolean value`);
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
 * Rule to validate enhanced diagnostics configuration
 */
class EnhancedDiagnosticsConfigRule implements ValidationRule {
  name = 'enhanced-diagnostics-config';
  description = 'Validates enhanced diagnostics configuration';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const diagnosticsPaths = [
      'providers.enhanced.diagnostics.enabled',
      'providers.enhanced.diagnostics.typeAware',
      'providers.enhanced.diagnostics.strictMode',
      'providers.enhanced.diagnostics.enableSuggestions',
      'providers.enhanced.diagnostics.maxSuggestions'
    ];

    for (const diagnosticsPath of diagnosticsPaths) {
      if (path === diagnosticsPath || path === '') {
        const fieldValue = path === diagnosticsPath ? value : this.getValueByPath(fullConfig, diagnosticsPath);

        if (fieldValue !== undefined) {
          if (diagnosticsPath === 'providers.enhanced.diagnostics.maxSuggestions') {
            if (typeof fieldValue !== 'number') {
              errors.push(`${diagnosticsPath} must be a number`);
            } else if (fieldValue < 1 || fieldValue > 20) {
              errors.push(`${diagnosticsPath} must be between 1 and 20`);
            }
          } else {
            if (typeof fieldValue !== 'boolean') {
              errors.push(`${diagnosticsPath} must be a boolean value`);
            }
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
 * Rule to validate enhanced refactoring configuration
 */
class EnhancedRefactoringConfigRule implements ValidationRule {
  name = 'enhanced-refactoring-config';
  description = 'Validates enhanced refactoring configuration';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const refactoringPaths = [
      'providers.enhanced.refactoring.enabled',
      'providers.enhanced.refactoring.smart',
      'providers.enhanced.refactoring.enableOptimizations'
    ];

    for (const refactoringPath of refactoringPaths) {
      if (path === refactoringPath || path === '') {
        const fieldValue = path === refactoringPath ? value : this.getValueByPath(fullConfig, refactoringPath);

        if (fieldValue !== undefined && typeof fieldValue !== 'boolean') {
          errors.push(`${refactoringPath} must be a boolean value`);
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
 * Rule to validate ModelProvider caching configuration
 */
class ModelProviderCachingConfigRule implements ValidationRule {
  name = 'model-provider-caching-config';
  description = 'Validates ModelProvider caching configuration';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const cachingPaths = [
      'providers.modelProvider.caching.enabled',
      'providers.modelProvider.caching.ttl',
      'providers.modelProvider.caching.maxSize'
    ];

    for (const cachingPath of cachingPaths) {
      if (path === cachingPath || path === '') {
        const fieldValue = path === cachingPath ? value : this.getValueByPath(fullConfig, cachingPath);

        if (fieldValue !== undefined) {
          if (cachingPath === 'providers.modelProvider.caching.enabled') {
            if (typeof fieldValue !== 'boolean') {
              errors.push(`${cachingPath} must be a boolean value`);
            }
          } else if (cachingPath === 'providers.modelProvider.caching.ttl') {
            if (typeof fieldValue !== 'number') {
              errors.push(`${cachingPath} must be a number`);
            } else if (fieldValue < 60000 || fieldValue > 3600000) {
              errors.push(`${cachingPath} must be between 60000 and 3600000 milliseconds`);
            }
          } else if (cachingPath === 'providers.modelProvider.caching.maxSize') {
            if (typeof fieldValue !== 'number') {
              errors.push(`${cachingPath} must be a number`);
            } else if (fieldValue < 100 || fieldValue > 10000) {
              errors.push(`${cachingPath} must be between 100 and 10000`);
            }
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
 * Rule to validate health check configuration
 */
class HealthCheckConfigRule implements ValidationRule {
  name = 'health-check-config';
  description = 'Validates health check configuration';

  validate(value: any, path: string, fullConfig: Partial<AppConfig>): ValidationRuleResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const healthCheckPaths = [
      'providers.healthCheck.enabled',
      'providers.healthCheck.intervalMs',
      'providers.healthCheck.timeoutMs',
      'providers.healthCheck.maxFailures'
    ];

    for (const healthCheckPath of healthCheckPaths) {
      if (path === healthCheckPath || path === '') {
        const fieldValue = path === healthCheckPath ? value : this.getValueByPath(fullConfig, healthCheckPath);

        if (fieldValue !== undefined) {
          if (healthCheckPath === 'providers.healthCheck.enabled') {
            if (typeof fieldValue !== 'boolean') {
              errors.push(`${healthCheckPath} must be a boolean value`);
            }
          } else if (healthCheckPath === 'providers.healthCheck.intervalMs') {
            if (typeof fieldValue !== 'number') {
              errors.push(`${healthCheckPath} must be a number`);
            } else if (fieldValue < 30000 || fieldValue > 300000) {
              errors.push(`${healthCheckPath} must be between 30000 and 300000 milliseconds`);
            }
          } else if (healthCheckPath === 'providers.healthCheck.timeoutMs') {
            if (typeof fieldValue !== 'number') {
              errors.push(`${healthCheckPath} must be a number`);
            } else if (fieldValue < 1000 || fieldValue > 30000) {
              errors.push(`${healthCheckPath} must be between 1000 and 30000 milliseconds`);
            }
          } else if (healthCheckPath === 'providers.healthCheck.maxFailures') {
            if (typeof fieldValue !== 'number') {
              errors.push(`${healthCheckPath} must be a number`);
            } else if (fieldValue < 1 || fieldValue > 10) {
              errors.push(`${healthCheckPath} must be between 1 and 10`);
            }
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
