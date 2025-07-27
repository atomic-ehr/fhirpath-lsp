import { BaseConfig } from './BaseConfig';

/**
 * Safety checks configuration for refactoring operations
 */
export interface RefactoringSafetyChecks {
  semanticValidation: boolean;
  syntaxCheck: boolean;
  referenceIntegrity: boolean;
}

/**
 * Refactoring provider configuration
 */
export interface RefactoringConfig extends BaseConfig {
  autoSuggestNames: boolean;
  confirmDestructive: boolean;
  maxPreviewChanges: number;
  safetyChecks: RefactoringSafetyChecks;
}

/**
 * Throttling configuration for request types
 */
export interface ThrottleConfig {
  requestType: string;
  limit: number;
  windowMs: number;
}

/**
 * Performance configuration for providers
 */
export interface PerformanceConfig extends BaseConfig {
  requestThrottling: {
    enabled: boolean;
    configs: ThrottleConfig[];
    adaptiveEnabled: boolean;
    defaultWindowMs: number;
  };
  caching: {
    enabled: boolean;
    maxCacheSize: number;
    ttlMs: number;
  };
  timeouts: {
    completionTimeoutMs: number;
    diagnosticTimeoutMs: number;
    hoverTimeoutMs: number;
  };
}

/**
 * Cache configuration
 */
export interface CacheConfig extends BaseConfig {
  maxSize: number;
  ttlMs: number;
  cleanupIntervalMs: number;
  persistToDisk: boolean;
  diskCachePath?: string;
}

/**
 * Completion provider configuration
 */
export interface CompletionConfig extends BaseConfig {
  maxSuggestions: number;
  includeSnippets: boolean;
  includeDocumentation: boolean;
  fuzzyMatching: boolean;
  sortByRelevance: boolean;
}

/**
 * Hover provider configuration
 */
export interface HoverConfig extends BaseConfig {
  includeDocumentation: boolean;
  includeExamples: boolean;
  maxContentLength: number;
  showTypeInformation: boolean;
}

/**
 * Definition provider configuration
 */
export interface DefinitionConfig extends BaseConfig {
  includeDeclaration: boolean;
  includeReferences: boolean;
  maxResults: number;
}

/**
 * References provider configuration
 */
export interface ReferencesConfig extends BaseConfig {
  includeDeclaration: boolean;
  maxResults: number;
  searchInComments: boolean;
}

/**
 * Semantic tokens provider configuration
 */
export interface SemanticTokensConfig extends BaseConfig {
  includeModifiers: boolean;
  colorizeStrings: boolean;
  colorizeNumbers: boolean;
  colorizeComments: boolean;
}

/**
 * Code action provider configuration
 */
export interface CodeActionConfig extends BaseConfig {
  includeQuickFixes: boolean;
  includeRefactorings: boolean;
  includeSourceActions: boolean;
  maxActions: number;
}

/**
 * Complete provider configuration
 */
export interface ProviderConfig extends BaseConfig {
  refactoring: RefactoringConfig;
  performance: PerformanceConfig;
  cache: CacheConfig;
  completion: CompletionConfig;
  hover: HoverConfig;
  definition: DefinitionConfig;
  references: ReferencesConfig;
  semanticTokens: SemanticTokensConfig;
  codeAction: CodeActionConfig;
}

/**
 * Default provider configuration
 */
export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  enabled: true,
  version: '1.0.0',
  refactoring: {
    enabled: true,
    autoSuggestNames: true,
    confirmDestructive: true,
    maxPreviewChanges: 100,
    safetyChecks: {
      semanticValidation: true,
      syntaxCheck: true,
      referenceIntegrity: true
    }
  },
  performance: {
    enabled: true,
    requestThrottling: {
      enabled: true,
      configs: [
        { requestType: 'completion', limit: 10, windowMs: 1000 },
        { requestType: 'diagnostic', limit: 5, windowMs: 1000 },
        { requestType: 'hover', limit: 20, windowMs: 1000 },
        { requestType: 'definition', limit: 10, windowMs: 1000 },
        { requestType: 'references', limit: 5, windowMs: 1000 },
        { requestType: 'semanticTokens', limit: 3, windowMs: 1000 },
        { requestType: 'documentSymbol', limit: 5, windowMs: 1000 },
        { requestType: 'codeAction', limit: 10, windowMs: 1000 }
      ],
      adaptiveEnabled: true,
      defaultWindowMs: 1000
    },
    caching: {
      enabled: true,
      maxCacheSize: 1000,
      ttlMs: 300000 // 5 minutes
    },
    timeouts: {
      completionTimeoutMs: 5000,
      diagnosticTimeoutMs: 10000,
      hoverTimeoutMs: 3000
    }
  },
  cache: {
    enabled: true,
    maxSize: 1000,
    ttlMs: 300000,
    cleanupIntervalMs: 60000,
    persistToDisk: false
  },
  completion: {
    enabled: true,
    maxSuggestions: 50,
    includeSnippets: true,
    includeDocumentation: true,
    fuzzyMatching: true,
    sortByRelevance: true
  },
  hover: {
    enabled: true,
    includeDocumentation: true,
    includeExamples: false,
    maxContentLength: 1000,
    showTypeInformation: true
  },
  definition: {
    enabled: true,
    includeDeclaration: true,
    includeReferences: false,
    maxResults: 10
  },
  references: {
    enabled: true,
    includeDeclaration: false,
    maxResults: 100,
    searchInComments: false
  },
  semanticTokens: {
    enabled: true,
    includeModifiers: true,
    colorizeStrings: true,
    colorizeNumbers: true,
    colorizeComments: false
  },
  codeAction: {
    enabled: true,
    includeQuickFixes: true,
    includeRefactorings: true,
    includeSourceActions: true,
    maxActions: 20
  }
};

/**
 * Configuration schema metadata for providers
 */
export const PROVIDER_CONFIG_SCHEMA = {
  name: 'ProviderConfig',
  version: '1.0.0',
  description: 'Configuration for language server providers',
  properties: {
    enabled: { type: 'boolean', default: true },
    refactoring: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: true },
        autoSuggestNames: { type: 'boolean', default: true },
        confirmDestructive: { type: 'boolean', default: true },
        maxPreviewChanges: { type: 'number', minimum: 1, maximum: 1000, default: 100 }
      }
    },
    performance: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: true },
        requestThrottling: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', default: true },
            adaptiveEnabled: { type: 'boolean', default: true },
            defaultWindowMs: { type: 'number', minimum: 100, maximum: 10000, default: 1000 }
          }
        }
      }
    },
    cache: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: true },
        maxSize: { type: 'number', minimum: 10, maximum: 10000, default: 1000 },
        ttlMs: { type: 'number', minimum: 1000, maximum: 3600000, default: 300000 }
      }
    }
  }
};
