import {
  parse,
  analyze,
  evaluate,
  FHIRModelProvider
} from '@atomic-ehr/fhirpath';
import { getLogger } from '../logging/index.js';
import type {
  AnalysisResult,
  ASTNode,
  ParseResult as FHIRPathParseResult,
  Diagnostic as FHIRPathDiagnostic,
  ModelTypeProvider,
  TypeInfo,
  FHIRModelProviderConfig,
  EvaluateOptions
} from '@atomic-ehr/fhirpath';

// Types for parser integration
export interface ParseResult {
  success: boolean;
  ast?: ASTNode;
  errors: ParseError[];
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
  offset: number;
  length: number;
  code?: string;
}


// Local token type for LSP semantic highlighting
export interface Token {
  type: string; // Token type for semantic highlighting
  value: string;
  start: number;
  end: number;
  line: number;
  column: number;
}

// Simple wrapper for LSP integration
// No longer implementing FHIRPathExpression interface as it doesn't exist in new API

/**
 * Service for integrating with @atomic-ehr/fhirpath parser
 * Provides abstraction layer for LSP integration
 */
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  accessCount: number;
}

export class FHIRPathService {
  private parseCache = new Map<string, CacheEntry<ParseResult>>();
  private analysisCache = new Map<string, CacheEntry<AnalysisResult>>();
  private modelProvider?: ModelTypeProvider;
  private isModelProviderInitialized = false;
  private initializationPromise?: Promise<void>;
  private logger = getLogger('FHIRPathService');
  
  // Performance optimization settings
  private readonly maxCacheSize = 1000;
  private readonly cacheExpiryMs = 30 * 60 * 1000; // 30 minutes
  private readonly backgroundProcessingEnabled = true;
  private backgroundTasks: Promise<void>[] = [];

  /**
   * Parse FHIRPath expression and extract tokens for syntax highlighting
   */
  parse(expression: string): ParseResult {
    // Check cache first
    const cached = this.getCachedResult(this.parseCache, expression);
    if (cached) {
      return cached;
    }

    try {
      // Parse the expression using @atomic-ehr/fhirpath parser
      const parseResult = parse(expression);

      // Check if parse has errors
      if (parseResult.errors.length > 0) {
        const errors = parseResult.errors.map(error => this.convertParseErrorToError(error, expression));
        const result: ParseResult = {
          success: false,
          errors
        };
        
        // Don't cache failed parses as they might be temporary during editing
        return result;
      }

      // Create successful result
      const result: ParseResult = {
        success: true,
        ast: parseResult.ast,
        errors: []
      };

      // Cache successful parse
      this.setCachedResult(this.parseCache, expression, result);
      return result;

    } catch (error: any) {
      const parseError = this.parseErrorFromException(error, expression);
      const result: ParseResult = {
        success: false,
        errors: [parseError]
      };

      // Don't cache failed parses as they might be temporary during editing
      return result;
    }
  }

  /**
   * Initialize FHIR model provider for enhanced type checking
   */
  async initializeModelProvider(config?: FHIRModelProviderConfig): Promise<void> {
    if (this.isModelProviderInitialized) {
      return;
    }

    // If initialization is already in progress, wait for it
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.performInitialization(config);
    return this.initializationPromise;
  }

  /**
   * Perform the actual model provider initialization
   */
  private async performInitialization(config?: FHIRModelProviderConfig): Promise<void> {
    try {
      const path = require('path');
      const workspaceRoot = process.cwd();
      const cacheDir = path.join(workspaceRoot, '.fhirpath-lsp');
      
      const defaultConfig: FHIRModelProviderConfig = {
        packages: [
          { name: 'hl7.fhir.r4.core', version: '4.0.1' }
        ],
        cacheDir: cacheDir
      };

      const provider  = new FHIRModelProvider(config || defaultConfig)
      await provider.initialize();
      
      this.isModelProviderInitialized = true;
      
      // Clear analysis cache since we now have enhanced type information
      this.analysisCache.clear();
      this.modelProvider =  provider;

    } catch (error) {
      this.logger.warn('Failed to initialize FHIR model provider', error as Error);
      // Continue without model provider - basic analysis will still work
    }
  }

  /**
   * Analyze expression for type information and semantic validation
   */
  analyze(expression: string, options?: {
    variables?: Record<string, unknown>;
    inputType?: TypeInfo;
    errorRecovery?: boolean;
  }): AnalysisResult | null {
    try {
      // Check cache key including options
      const cacheKey = `${expression}:${JSON.stringify(options || {})}`;
      const cached = this.getCachedResult(this.analysisCache, cacheKey);
      if (cached) {
        return cached;
      }

      const analysisOptions = {
        variables: options?.variables,
        modelProvider: this.modelProvider,
        inputType: options?.inputType,
        errorRecovery: options?.errorRecovery || true
      };

      const result = analyze(expression, analysisOptions);
      this.setCachedResult(this.analysisCache, cacheKey, result);
      
      // Optionally trigger background processing for common expressions
      if (this.backgroundProcessingEnabled) {
        this.scheduleBackgroundAnalysis(expression, options);
      }
      
      return result;

    } catch (error) {
      this.logger.error('Analysis error:', error as Error);
      return null;
    }
  }

  /**
   * Advanced analysis with context-aware type checking
   */
  analyzeWithContext(
    expression: string, 
    resourceType?: string,
    variables?: Record<string, unknown>
  ): AnalysisResult | null {
    try {
      let inputType: TypeInfo | undefined;
      
      // Create input type info for the resource context
      if (resourceType && this.modelProvider && this.isModelProviderInitialized) {
        try {
          inputType = this.modelProvider.getType(resourceType);
        } catch (error) {
          this.logger.warn(`Failed to get type for ${resourceType}:`, error as Error);
        }
      }

      return this.analyze(expression, {
        variables,
        inputType,
        errorRecovery: true
      });

    } catch (error) {
      this.logger.error('Context-aware analysis error:', error as Error);
      return null;
    }
  }

  /**
   * Evaluate FHIRPath expression against input data
   */
  evaluate(expression: string, input?: unknown, variables?: Record<string, unknown>): any[] {
    try {
      const options: EvaluateOptions = {
        input,
        variables
      };

      const result = evaluate(expression, options);
      
      return result;
    } catch (error) {
      this.logger.error('Evaluation error:', error as Error);
      return [];
    }
  }

  /**
   * Get type information for an expression
   */
  getExpressionType(expression: string, resourceType?: string): TypeInfo | null {
    try {
      const analysis = this.analyzeWithContext(expression, resourceType);
      
      if (analysis && analysis.ast) {
        // The AST should have type information attached by the analyzer
        return (analysis.ast as any).typeInfo || null;
      }
      
      return null;
    } catch (error) {
      this.logger.error('Type inference error:', error as Error);
      return null;
    }
  }

  /**
   * Validate expression against expected type
   */
  validateExpressionType(
    expression: string, 
    expectedType: string,
    resourceType?: string
  ): { isValid: boolean; actualType?: string; diagnostics: FHIRPathDiagnostic[] } {
    try {
      const analysis = this.analyzeWithContext(expression, resourceType);
      
      if (!analysis) {
        return {
          isValid: false,
          diagnostics: [{
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: expression.length } },
            severity: 1,
            message: 'Failed to analyze expression',
            source: 'fhirpath-type-check'
          }]
        };
      }

      const actualType = this.getExpressionType(expression, resourceType);
      const isValid = actualType ? this.isTypeCompatible(actualType, expectedType) : false;

      return {
        isValid,
        actualType: actualType?.type || 'unknown',
        diagnostics: analysis.diagnostics || []
      };

    } catch (error) {
      return {
        isValid: false,
        diagnostics: [{
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: expression.length } },
          severity: 1,
          message: `Type validation error: ${error instanceof Error ? error.message : String(error)}`,
          source: 'fhirpath-type-check'
        }]
      };
    }
  }

  /**
   * Check if actual type is compatible with expected type
   */
  private isTypeCompatible(actualType: TypeInfo, expectedType: string): boolean {
    // Basic type compatibility check
    if (actualType.type === expectedType) {
      return true;
    }

    // Handle some common type compatibility rules
    const compatibilityRules: Record<string, string[]> = {
      'Any': ['String', 'Integer', 'Decimal', 'Boolean', 'Date', 'DateTime', 'Time'],
      'Decimal': ['Integer'],
      'String': [],
      'Boolean': [],
      'Date': ['DateTime'],
      'DateTime': ['Date']
    };

    const compatibleTypes = compatibilityRules[expectedType];
    return compatibleTypes ? compatibleTypes.includes(actualType.type) : false;
  }

  /**
   * Get the initialized model provider instance
   */
  getModelProvider(): ModelTypeProvider | undefined {
    return this.isModelProviderInitialized ? this.modelProvider : undefined;
  }

  /**
   * Get available resource types from model provider
   */
  getAvailableResourceTypes(): string[] {
    if (!this.modelProvider || !this.isModelProviderInitialized) {
      return [];
    }

    try {
      // Get all resource types from the model provider
      if ('getResourceTypes' in this.modelProvider && typeof this.modelProvider.getResourceTypes === 'function') {
        const resourceTypes = this.modelProvider.getResourceTypes();
        return resourceTypes || [];
      }
      return [];
    } catch (error) {
      this.logger.error('Failed to get resource types from model provider:', error as Error);
      return [];
    }
  }

  /**
   * Get properties available for a resource type
   */
  getResourceProperties(resourceType: string): string[] {
    if (!this.modelProvider || !this.isModelProviderInitialized) {
      return [];
    }

    try {
      const typeInfo = this.modelProvider.getType(resourceType);
      if (typeInfo) {
        return this.modelProvider.getElementNames(typeInfo);
      }
    } catch (error) {
      this.logger.warn(`Failed to get properties for ${resourceType}:`, error as Error);
    }

    return [];
  }

  /**
   * Get detailed property information for a resource type
   */
  getResourcePropertyDetails(resourceType: string): Array<{
    name: string;
    type: string;
    description?: string;
    cardinality?: string;
  }> {
    if (!this.modelProvider || !this.isModelProviderInitialized) {
      return [];
    }

    try {
      const typeInfo = this.modelProvider.getType(resourceType);
      if (typeInfo) {
        const elementNames = this.modelProvider.getElementNames(typeInfo);
        return elementNames.map(name => {
          try {
            const elementType = this.modelProvider!.getElementType(typeInfo, name);
            return {
              name,
              type: elementType?.type || 'unknown',
              description: (elementType as any)?.description,
              cardinality: (elementType as any)?.cardinality
            };
          } catch (error) {
            this.logger.warn(`Failed to get element details for ${resourceType}.${name}:`, error as Error);
            return {
              name,
              type: 'unknown'
            };
          }
        });
      }
    } catch (error) {
      this.logger.warn(`Failed to get property details for ${resourceType}:`, error as Error);
    }

    return [];
  }

  /**
   * Enhanced cache management with TTL and LRU eviction
   */
  private getCachedResult<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
    const entry = cache.get(key);
    if (!entry) {
      return null;
    }

    // Check if expired
    const now = Date.now();
    if (now - entry.timestamp > this.cacheExpiryMs) {
      cache.delete(key);
      return null;
    }

    // Update access count and timestamp for LRU
    entry.accessCount++;
    entry.timestamp = now;

    return entry.value;
  }

  private setCachedResult<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
    const now = Date.now();

    // If cache is full, evict least recently used entries
    if (cache.size >= this.maxCacheSize) {
      this.evictLRUEntries(cache);
    }

    cache.set(key, {
      value,
      timestamp: now,
      accessCount: 1
    });
  }

  private evictLRUEntries<T>(cache: Map<string, CacheEntry<T>>): void {
    // Remove 20% of entries to avoid frequent evictions
    const targetSize = Math.floor(this.maxCacheSize * 0.8);
    const entriesToRemove = cache.size - targetSize;

    if (entriesToRemove <= 0) return;

    // Sort by access count and timestamp (oldest first)
    const entries = Array.from(cache.entries()).sort((a, b) => {
      const [, entryA] = a;
      const [, entryB] = b;
      
      if (entryA.accessCount !== entryB.accessCount) {
        return entryA.accessCount - entryB.accessCount;
      }
      return entryA.timestamp - entryB.timestamp;
    });

    // Remove the least used entries
    for (let i = 0; i < entriesToRemove; i++) {
      cache.delete(entries[i][0]);
    }
  }

  /**
   * Background processing for performance optimization
   */
  private scheduleBackgroundAnalysis(
    expression: string, 
    options?: { variables?: Record<string, unknown>; inputType?: TypeInfo; errorRecovery?: boolean; }
  ): void {
    // Only process common patterns in background
    if (!this.isCommonPattern(expression)) {
      return;
    }

    const task = this.performBackgroundAnalysis(expression, options);
    this.backgroundTasks.push(task);

    // Cleanup completed tasks
    this.backgroundTasks = this.backgroundTasks.filter(task => {
      // Check if task is still pending
      return task.constructor.name === 'Promise';
    });
  }

  private async performBackgroundAnalysis(
    expression: string, 
    options?: { variables?: Record<string, unknown>; inputType?: TypeInfo; errorRecovery?: boolean; }
  ): Promise<void> {
    try {
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to not block main thread
      
      // Pre-compute analysis for related expressions
      const variations = this.generateExpressionVariations(expression);
      
      for (const variation of variations) {
        const cacheKey = `${variation}:${JSON.stringify(options || {})}`;
        if (!this.analysisCache.has(cacheKey)) {
          try {
            const result = analyze(variation, {
              variables: options?.variables,
              modelProvider: this.modelProvider,
              inputType: options?.inputType,
              errorRecovery: true
            });
            this.setCachedResult(this.analysisCache, cacheKey, result);
          } catch (error) {
            // Ignore errors in background processing
          }
        }
      }
    } catch (error) {
      // Background tasks shouldn't fail the main process
      this.logger.warn('Background analysis failed:', error as Error);
    }
  }

  private isCommonPattern(expression: string): boolean {
    // Common patterns that benefit from pre-computation
    const commonPatterns = [
      /^[A-Za-z]+\.[A-Za-z]+$/, // Simple navigation like Patient.name
      /^[A-Za-z]+\.[A-Za-z]+\.[A-Za-z]+$/, // Deeper navigation like Patient.name.family
      /\.where\(/, // where() function usage
      /\.exists\(\)/, // exists() function usage
      /\.first\(\)/, // first() function usage
      /\.select\(/ // select() function usage
    ];

    return commonPatterns.some(pattern => pattern.test(expression));
  }

  private generateExpressionVariations(expression: string): string[] {
    const variations: string[] = [];
    
    // Add common variations for pre-computation
    if (expression.endsWith('.exists()')) {
      const base = expression.replace('.exists()', '');
      variations.push(
        `${base}.empty()`,
        `${base}.count()`,
        `${base}.first()`
      );
    }
    
    if (expression.includes('.where(')) {
      const base = expression.split('.where(')[0];
      variations.push(
        `${base}.count()`,
        `${base}.exists()`,
        `${base}.first()`
      );
    }

    return variations.slice(0, 3); // Limit variations to avoid cache bloat
  }

  /**
   * Performance monitoring and cache statistics
   */
  getCacheStatistics(): {
    parseCache: { size: number; maxSize: number };
    analysisCache: { size: number; maxSize: number };
    backgroundTasks: number;
  } {
    return {
      parseCache: {
        size: this.parseCache.size,
        maxSize: this.maxCacheSize
      },
      analysisCache: {
        size: this.analysisCache.size,
        maxSize: this.maxCacheSize
      },
      backgroundTasks: this.backgroundTasks.length
    };
  }

  /**
   * Clear all caches (useful for testing or memory pressure)
   */
  clearCaches(): void {
    this.parseCache.clear();
    this.analysisCache.clear();
  }

  /**
   * Convert parse error to ParseError for LSP compatibility
   */
  private convertParseErrorToError(error: any, expression: string): ParseError {
    // Handle fhirpath ParseError structure
    const position = error.position || { line: 0, character: 0 };
    const range = error.range || { 
      start: position, 
      end: { line: position.line, character: position.character + 1 }
    };
    
    const startOffset = this.lineColumnToOffset(expression, range.start.line, range.start.character);
    const endOffset = this.lineColumnToOffset(expression, range.end.line, range.end.character);
    
    return {
      message: error.message || 'Parse error',
      line: range.start.line,
      column: range.start.character,
      offset: startOffset,
      length: Math.max(1, endOffset - startOffset),
      code: 'fhirpath-parse-error'
    };
  }

  /**
   * Convert line/column position to text offset
   */
  private lineColumnToOffset(text: string, line: number, column: number): number {
    const lines = text.split('\n');
    let offset = 0;
    
    for (let i = 0; i < line && i < lines.length; i++) {
      offset += lines[i].length + 1; // +1 for newline character
    }
    
    return offset + column;
  }

  /**
   * Convert exception to structured parse error
   */
  private parseErrorFromException(error: any, expression: string): ParseError {
    let line = 0;
    let column = 0;
    let offset = 0;
    let length = 1;
    let message = error.message || 'Parse error';

    // Try to extract position information from error
    if (error.location) {
      line = error.location.line - 1; // Convert to 0-based
      column = error.location.column - 1; // Convert to 0-based
      offset = error.location.offset || 0;
      if (error.location.end) {
        length = error.location.end.offset - offset;
      }
    } else {
      // Fallback: try to parse position from error message
      const positionMatch = error.message?.match(/at position (\d+)/);
      if (positionMatch) {
        offset = parseInt(positionMatch[1]);
        const position = this.offsetToLineColumn(expression, offset);
        line = position.line;
        column = position.column;
      }
    }

    return {
      message,
      line,
      column,
      offset,
      length,
      code: 'fhirpath-parse-error'
    };
  }

  /**
   * Convert text offset to line/column position
   */
  private offsetToLineColumn(text: string, offset: number): { line: number; column: number } {
    const lines = text.substring(0, offset).split('\n');
    return {
      line: lines.length - 1,
      column: lines[lines.length - 1].length
    };
  }


  /**
   * Check if a resource type is valid according to the model provider
   */
  isValidResourceType(resourceType: string): boolean {
    if (!this.modelProvider || !this.isModelProviderInitialized) {
      return false;
    }

    try {
      const typeInfo = this.modelProvider.getType(resourceType);
      return typeInfo !== null && typeInfo !== undefined;
    } catch (error) {
      return false;
    }
  }


  /**
   * Clear caches (useful for memory management)
   */
  clearCache(): void {
    this.parseCache.clear();
    this.analysisCache.clear();
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats() {
    return {
      parseCache: this.parseCache.size,
      analysisCache: this.analysisCache.size
    };
  }
}
