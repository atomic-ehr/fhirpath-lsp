import { DiagnosticSeverity } from 'vscode-languageserver';
import { BaseConfig } from './BaseConfig';

/**
 * Configuration for individual diagnostic rules
 */
export interface DiagnosticRuleConfig {
  enabled: boolean;
  severity: DiagnosticSeverity;
  parameters?: Record<string, any>;
}

/**
 * Performance analyzer configuration
 */
export interface PerformanceConfig extends BaseConfig {
  maxComplexity: number;
  maxNestingDepth: number;
  flagRedundantOperations: boolean;
  flagExpensiveOperations: boolean;
  rules?: Record<string, DiagnosticRuleConfig>;
}

/**
 * Code quality analyzer configuration
 */
export interface CodeQualityConfig extends BaseConfig {
  maxLineLength: number;
  enforceNamingConventions: boolean;
  flagMagicValues: boolean;
  requireDocumentation: boolean;
  rules?: Record<string, DiagnosticRuleConfig>;
}

/**
 * FHIR best practices analyzer configuration
 */
export interface FHIRBestPracticesConfig extends BaseConfig {
  enforceTypeSafety: boolean;
  flagDeprecatedElements: boolean;
  suggestOptimizations: boolean;
  checkCardinality: boolean;
  rules?: Record<string, DiagnosticRuleConfig>;
}

/**
 * Maintainability analyzer configuration
 */
export interface MaintainabilityConfig extends BaseConfig {
  maxFunctionComplexity: number;
  flagDuplication: boolean;
  enforceConsistency: boolean;
  rules?: Record<string, DiagnosticRuleConfig>;
}

/**
 * Severity configuration for different analyzer categories
 */
export interface DiagnosticSeverityConfig {
  performance: DiagnosticSeverity;
  codeQuality: DiagnosticSeverity;
  fhirBestPractices: DiagnosticSeverity;
  maintainability: DiagnosticSeverity;
}

/**
 * Complete diagnostic configuration
 */
export interface DiagnosticConfig extends BaseConfig {
  performance: PerformanceConfig;
  codeQuality: CodeQualityConfig;
  fhirBestPractices: FHIRBestPracticesConfig;
  maintainability: MaintainabilityConfig;
  severity: DiagnosticSeverityConfig;
  globalRules?: Record<string, DiagnosticRuleConfig>;
}

/**
 * Default diagnostic configuration
 */
export const DEFAULT_DIAGNOSTIC_CONFIG: DiagnosticConfig = {
  enabled: true,
  version: '1.0.0',
  performance: {
    enabled: true,
    maxComplexity: 10,
    maxNestingDepth: 5,
    flagRedundantOperations: true,
    flagExpensiveOperations: true
  },
  codeQuality: {
    enabled: true,
    maxLineLength: 100,
    enforceNamingConventions: false,
    flagMagicValues: true,
    requireDocumentation: false
  },
  fhirBestPractices: {
    enabled: true,
    enforceTypeSafety: true,
    flagDeprecatedElements: true,
    suggestOptimizations: true,
    checkCardinality: false
  },
  maintainability: {
    enabled: true,
    maxFunctionComplexity: 8,
    flagDuplication: true,
    enforceConsistency: true
  },
  severity: {
    performance: DiagnosticSeverity.Warning,
    codeQuality: DiagnosticSeverity.Information,
    fhirBestPractices: DiagnosticSeverity.Warning,
    maintainability: DiagnosticSeverity.Information
  }
};

/**
 * Configuration schema metadata for diagnostics
 */
export const DIAGNOSTIC_CONFIG_SCHEMA = {
  name: 'DiagnosticConfig',
  version: '1.0.0',
  description: 'Configuration for diagnostic analysis and validation',
  properties: {
    enabled: { type: 'boolean', default: true },
    performance: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: true },
        maxComplexity: { type: 'number', minimum: 1, maximum: 50, default: 10 },
        maxNestingDepth: { type: 'number', minimum: 1, maximum: 20, default: 5 },
        flagRedundantOperations: { type: 'boolean', default: true },
        flagExpensiveOperations: { type: 'boolean', default: true }
      }
    },
    codeQuality: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: true },
        maxLineLength: { type: 'number', minimum: 50, maximum: 200, default: 100 },
        enforceNamingConventions: { type: 'boolean', default: false },
        flagMagicValues: { type: 'boolean', default: true },
        requireDocumentation: { type: 'boolean', default: false }
      }
    },
    fhirBestPractices: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: true },
        enforceTypeSafety: { type: 'boolean', default: true },
        flagDeprecatedElements: { type: 'boolean', default: true },
        suggestOptimizations: { type: 'boolean', default: true },
        checkCardinality: { type: 'boolean', default: false }
      }
    },
    maintainability: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: true },
        maxFunctionComplexity: { type: 'number', minimum: 1, maximum: 30, default: 8 },
        flagDuplication: { type: 'boolean', default: true },
        enforceConsistency: { type: 'boolean', default: true }
      }
    }
  }
};
