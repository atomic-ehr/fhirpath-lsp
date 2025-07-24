/**
 * Shared types and interfaces for FHIRPath Language Server Protocol
 */

// Configuration settings
export interface FHIRPathSettings {
  validate: {
    enable: boolean;
    delay: number;
  };
  semantic: {
    enable: boolean;
  };
  completion: {
    snippets: boolean;
  };
  fhirVersion: 'R4' | 'STU3' | 'DSTU2';
  trace: {
    server: 'off' | 'messages' | 'verbose';
  };
}

// Server capabilities
export interface FHIRPathServerCapabilities {
  hasConfigurationCapability?: boolean;
  hasWorkspaceFolderCapability?: boolean;
  hasDiagnosticRelatedInformationCapability?: boolean;
}

// Custom LSP requests/notifications
export namespace FHIRPathRequest {
  export const ClearCache = 'fhirpath/clearCache';
  export const CacheStats = 'fhirpath/cacheStats';
  export const ValidateExpression = 'fhirpath/validate';
}

// Cache statistics response
export interface CacheStats {
  parseCache: number;
  analysisCache: number;
  totalDocuments: number;
  cachedParseResults: number;
  fhirPathDocuments: number;
}

// Validation request/response
export interface ValidateExpressionRequest {
  uri: string;
  content: string;
}

export interface ValidateExpressionResponse {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  message: string;
  line: number;
  column: number;
  offset: number;
  length: number;
  code?: string;
}

export interface ValidationWarning {
  message: string;
  line: number;
  column: number;
  offset: number;
  length: number;
  code?: string;
}

// Token types for semantic highlighting
export enum SemanticTokenType {
  Function = 0,
  Parameter = 1,
  Variable = 2,
  Property = 3,
  Operator = 4,
  Keyword = 5,
  String = 6,
  Number = 7,
  Boolean = 8,
  Comment = 9
}

export enum SemanticTokenModifier {
  Declaration = 0,
  Readonly = 1,
  Deprecated = 2,
  Modification = 3,
  Documentation = 4,
  DefaultLibrary = 5
}

// Document analysis types
export interface DocumentAnalysis {
  uri: string;
  version: number;
  isValid: boolean;
  parseTime: number;
  tokenCount: number;
  errorCount: number;
  warningCount: number;
}

// Performance metrics
export interface PerformanceMetrics {
  parseTime: number;
  validateTime: number;
  tokensTime: number;
  totalTime: number;
  cacheHitRate: number;
}

// Extension status
export enum ExtensionStatus {
  Initializing = 'initializing',
  Running = 'running',
  Error = 'error',
  Stopped = 'stopped',
  Restarting = 'restarting'
}

// Common constants
export const FHIRPATH_LANGUAGE_ID = 'fhirpath';
export const FHIRPATH_FILE_EXTENSIONS = ['.fhirpath', '.fhir'];
export const DEFAULT_VALIDATION_DELAY = 300;
export const MAX_DIAGNOSTICS = 100;
export const CACHE_TIMEOUT = 5 * 60 * 1000; // 5 minutes