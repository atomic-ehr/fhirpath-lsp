import { BaseConfig } from './BaseConfig';

/**
 * FHIR Model Provider configuration
 */
export interface FHIRModelProviderConfig {
  packages: Array<{
    name: string;
    version: string;
  }>;
  cacheDir: string;
  registryUrl: string;
}

/**
 * ModelProvider configuration
 */
export interface ModelProviderConfig extends BaseConfig {
  required: boolean;
  fhirModelProvider: FHIRModelProviderConfig;
  caching: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
  performance: {
    enableOptimizations: boolean;
    batchSize: number;
    concurrentRequests: number;
  };
}

/**
 * Enhanced provider configuration
 */
export interface EnhancedProviderConfig {
  completion: {
    enabled: boolean;
    enhanced: boolean;
    choiceTypes: boolean;
    inheritance: boolean;
    deepNavigation: boolean;
    maxCompletions: number;
  };
  hover: {
    enabled: boolean;
    enhanced: boolean;
    showHierarchy: boolean;
    showConstraints: boolean;
    showTerminology: boolean;
  };
  diagnostics: {
    enabled: boolean;
    typeAware: boolean;
    strictMode: boolean;
    enableSuggestions: boolean;
    maxSuggestions: number;
  };
  refactoring: {
    enabled: boolean;
    smart: boolean;
    enableOptimizations: boolean;
  };
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  enabled: boolean;
  intervalMs: number;
  timeoutMs: number;
  maxFailures: number;
}

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
  modelProvider: ModelProviderConfig;
  enhanced: EnhancedProviderConfig;
  healthCheck: HealthCheckConfig;
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
  modelProvider: {
    enabled: true,
    required: false,
    fhirModelProvider: {
      packages: [
        { name: 'hl7.fhir.r4.core', version: '4.0.1' }
      ],
      cacheDir: '.fhir-cache',
      registryUrl: 'https://fs.get-ig.org/pkgs'
    },
    caching: {
      enabled: true,
      ttl: 600000, // 10 minutes
      maxSize: 1000
    },
    performance: {
      enableOptimizations: true,
      batchSize: 50,
      concurrentRequests: 10
    }
  },
  enhanced: {
    completion: {
      enabled: true,
      enhanced: true,
      choiceTypes: true,
      inheritance: true,
      deepNavigation: true,
      maxCompletions: 100
    },
    hover: {
      enabled: true,
      enhanced: true,
      showHierarchy: true,
      showConstraints: true,
      showTerminology: true
    },
    diagnostics: {
      enabled: true,
      typeAware: true,
      strictMode: false,
      enableSuggestions: true,
      maxSuggestions: 5
    },
    refactoring: {
      enabled: false, // Experimental feature
      smart: false,
      enableOptimizations: false
    }
  },
  healthCheck: {
    enabled: true,
    intervalMs: 60000, // 1 minute
    timeoutMs: 5000,
    maxFailures: 3
  },
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
    modelProvider: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: true },
        required: { type: 'boolean', default: false },
        fhirModelProvider: {
          type: 'object',
          properties: {
            packages: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  version: { type: 'string' }
                },
                required: ['name', 'version']
              }
            },
            cacheDir: { type: 'string', default: '.fhir-cache' },
            registryUrl: { type: 'string', default: 'https://fs.get-ig.org/pkgs' }
          }
        },
        caching: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', default: true },
            ttl: { type: 'number', minimum: 60000, maximum: 3600000, default: 600000 },
            maxSize: { type: 'number', minimum: 100, maximum: 10000, default: 1000 }
          }
        },
        performance: {
          type: 'object',
          properties: {
            enableOptimizations: { type: 'boolean', default: true },
            batchSize: { type: 'number', minimum: 10, maximum: 1000, default: 50 },
            concurrentRequests: { type: 'number', minimum: 1, maximum: 50, default: 10 }
          }
        }
      }
    },
    enhanced: {
      type: 'object',
      properties: {
        completion: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', default: true },
            enhanced: { type: 'boolean', default: true },
            choiceTypes: { type: 'boolean', default: true },
            inheritance: { type: 'boolean', default: true },
            deepNavigation: { type: 'boolean', default: true },
            maxCompletions: { type: 'number', minimum: 10, maximum: 500, default: 100 }
          }
        },
        hover: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', default: true },
            enhanced: { type: 'boolean', default: true },
            showHierarchy: { type: 'boolean', default: true },
            showConstraints: { type: 'boolean', default: true },
            showTerminology: { type: 'boolean', default: true }
          }
        },
        diagnostics: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', default: true },
            typeAware: { type: 'boolean', default: true },
            strictMode: { type: 'boolean', default: false },
            enableSuggestions: { type: 'boolean', default: true },
            maxSuggestions: { type: 'number', minimum: 1, maximum: 20, default: 5 }
          }
        },
        refactoring: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', default: false },
            smart: { type: 'boolean', default: false },
            enableOptimizations: { type: 'boolean', default: false }
          }
        }
      }
    },
    healthCheck: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: true },
        intervalMs: { type: 'number', minimum: 30000, maximum: 300000, default: 60000 },
        timeoutMs: { type: 'number', minimum: 1000, maximum: 30000, default: 5000 },
        maxFailures: { type: 'number', minimum: 1, maximum: 10, default: 3 }
      }
    },
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

/**
 * Health status interface
 */
export interface HealthStatus {
  healthy: boolean;
  reason?: string;
  timestamp?: Date;
  metadata?: Record<string, any>;
}
