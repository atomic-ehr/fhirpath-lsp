import {
  CompletionItem,
  CompletionItemKind,
  CompletionParams,
  Position,
  TextDocumentPositionParams,
  MarkupKind
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { FHIRPathService } from '../parser/FHIRPathService';
import { FHIRPathFunctionRegistry } from '../services/FHIRPathFunctionRegistry';
import { FHIRPathContextService } from '../services/FHIRPathContextService';
import { FHIRResourceService } from '../services/FHIRResourceService';
import { ModelProviderService } from '../services/ModelProviderService';
import { cacheService } from '../services/CacheService';
import { createDebouncedMethod } from '../services/RequestThrottler';
import { getGlobalProfiler } from '../utils/PerformanceProfiler';
import { getLogger } from '../logging/index.js';
import * as fs from 'fs';
import * as path from 'path';

export interface CompletionContext {
  text: string;
  position: Position;
  triggerCharacter?: string;
  currentToken?: string;
  previousToken?: string;
  isAfterDot: boolean;
  isInFunction: boolean;
  isInBrackets: boolean;
  isInComment: boolean;
  isInDirective: boolean;
  directiveType?: string;
  directiveValue?: string;
  parentExpression?: string;
}

export interface ExpressionContext {
  resourceType: string;
  propertyPath: string[];
  isValid: boolean;
  currentProperty?: string;
  isAfterDot?: boolean;
}

export interface EnhancedCompletionItem extends CompletionItem {
  isChoice?: boolean;
  isInherited?: boolean;
  cardinality?: string;
  isRequired?: boolean;
  terminologyBinding?: string;
  priority?: number;
}

export interface NavigationContext {
  isNavigable: boolean;
  resourceType?: string;
  propertyPath?: string[];
  depth: number;
  isPartialPath?: boolean;
  currentType?: string;
  availableProperties?: string[];
  parentType?: string;
}

export interface CompletionProviderConfig {
  maxSuggestions?: number;
  includeSnippets?: boolean;
  includeDocumentation?: boolean;
  fuzzyMatching?: boolean;
  sortByRelevance?: boolean;
  enableTypeHints?: boolean;
  enableParameterHints?: boolean;
  enablePreviewText?: boolean;
  triggerCharacters?: string[];
  suggestionDelay?: number;
  enablePostfixSnippets?: boolean;
  enableFunctionTemplates?: boolean;
  enableIntelliSenseCache?: boolean;
  cacheSize?: number;
  contextAware?: boolean;
  smartSuggestions?: boolean;
  includePrivateElements?: boolean;
  priorityWeighting?: {
    commonElements?: number;
    recentlyUsed?: number;
    typeRelevance?: number;
  };
  semanticFiltering?: {
    filterByScope?: boolean;
    filterByCardinality?: boolean;
    filterByContext?: boolean;
  };
}

export class CompletionProvider {
  private functionRegistry: FHIRPathFunctionRegistry;
  private contextService?: FHIRPathContextService;
  private completionCache = new Map<string, { items: CompletionItem[]; timestamp: number; context: string; }>();
  private logger = getLogger('CompletionProvider');
  private config: CompletionProviderConfig;
  private recentlyUsedItems = new Map<string, number>(); // Track usage frequency

  constructor(
    private fhirPathService: FHIRPathService,
    private modelProviderService?: ModelProviderService,
    private fhirResourceService?: FHIRResourceService,
    config?: CompletionProviderConfig
  ) {
    this.functionRegistry = new FHIRPathFunctionRegistry();
    if (fhirResourceService) {
      this.contextService = new FHIRPathContextService(fhirResourceService);
    }

    // Set default configuration with schema-based overrides
    this.config = {
      maxSuggestions: 50,
      includeSnippets: true,
      includeDocumentation: true,
      fuzzyMatching: true,
      sortByRelevance: true,
      enableTypeHints: true,
      enableParameterHints: true,
      enablePreviewText: true,
      triggerCharacters: ['.', '(', '[', "'", '"'],
      suggestionDelay: 300,
      enablePostfixSnippets: true,
      enableFunctionTemplates: true,
      enableIntelliSenseCache: true,
      cacheSize: 1000,
      contextAware: true,
      smartSuggestions: true,
      includePrivateElements: false,
      priorityWeighting: {
        commonElements: 3,
        recentlyUsed: 2,
        typeRelevance: 5
      },
      semanticFiltering: {
        filterByScope: true,
        filterByCardinality: true,
        filterByContext: true
      },
      ...config
    };

    if (!this.modelProviderService) {
      this.logger.warn('ModelProviderService not provided. FHIR completions will be limited.');
    } else {
      this.logger.info('Initialized with ModelProviderService for enhanced FHIR completions');
    }
  }

  async provideCompletions(
    document: TextDocument,
    params: CompletionParams
  ): Promise<CompletionItem[]> {
    return this.provideCompletionsInternal(document, params);
  }

  /**
   * Update completion provider configuration
   */
  updateConfig(newConfig: Partial<CompletionProviderConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Clear cache if cache settings changed
    if (newConfig.enableIntelliSenseCache === false || newConfig.cacheSize) {
      this.completionCache.clear();
    }
    
    this.logger.debug('Updated completion provider configuration', newConfig);
  }

  /**
   * Resolve additional details for a completion item
   */
  async resolveCompletionItem(item: CompletionItem): Promise<CompletionItem> {
    // Track usage for priority weighting
    this.trackItemUsage(item.label);
    
    // Add documentation if enabled and not already present
    if (this.config.includeDocumentation && !item.documentation) {
      item.documentation = await this.loadDocumentationForItem(item);
    }
    
    // Add preview text if enabled
    if (this.config.enablePreviewText) {
      item.additionalTextEdits = this.generatePreviewEdits(item);
    }
    
    return item;
  }
  
  /**
   * Track item usage for smart suggestions
   */
  private trackItemUsage(label: string): void {
    const currentCount = this.recentlyUsedItems.get(label) || 0;
    this.recentlyUsedItems.set(label, currentCount + 1);
    
    // Keep only the most recent items to prevent memory bloat
    if (this.recentlyUsedItems.size > 1000) {
      const entries = Array.from(this.recentlyUsedItems.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 500);
      this.recentlyUsedItems.clear();
      entries.forEach(([key, value]) => this.recentlyUsedItems.set(key, value));
    }
  }
  
  /**
   * Load documentation for completion item
   */
  private async loadDocumentationForItem(item: CompletionItem): Promise<string | undefined> {
    // Implementation would load documentation from FHIR specs or model provider
    return undefined; // Placeholder
  }
  
  /**
   * Generate preview edits for completion item
   */
  private generatePreviewEdits(item: CompletionItem): any[] | undefined {
    // Implementation would generate helpful edits based on item type
    return undefined; // Placeholder
  }

  private async provideCompletionsInternal(
    document: TextDocument,
    params: CompletionParams
  ): Promise<CompletionItem[]> {
    try {
      const lineText = document.getText({
        start: { line: params.position.line, character: 0 },
        end: { line: params.position.line, character: params.position.character }
      });

      // Generate cache key
      const cacheKey = cacheService.generateCompletionKey(
        document.uri,
        params.position,
        params.context?.triggerCharacter
      );

      // Check cache first
      const cached = cacheService.getCompletion(cacheKey);
      if (cached) {
        return cached;
      }

      // Generate completions
      const context = this.analyzeCompletionContext(document, params.position, params.context?.triggerCharacter);

      const completions = await this.getCompletionsForContext(context, document);

      // Apply configuration-based filtering and sorting
      let filteredCompletions = this.applyConfigurationFilters(completions, context);
      
      // Apply priority weighting
      filteredCompletions = this.applyPriorityWeighting(filteredCompletions);
      
      // Limit results based on configuration
      if (this.config.maxSuggestions && filteredCompletions.length > this.config.maxSuggestions) {
        filteredCompletions = filteredCompletions.slice(0, this.config.maxSuggestions);
      }

      // Cache the result if enabled
      if (this.config.enableIntelliSenseCache) {
        cacheService.setCompletion(cacheKey, filteredCompletions);
        
        // Maintain cache size limit
        if (this.completionCache.size > (this.config.cacheSize || 1000)) {
          const oldestKey = this.completionCache.keys().next().value;
          this.completionCache.delete(oldestKey);
        }
      }

      return filteredCompletions;
    } catch (error) {
      this.logger.error('Error providing completions', error as Error);
      return [];
    }
  }

  /**
   * Apply configuration-based filters to completions
   */
  private applyConfigurationFilters(completions: CompletionItem[], context: CompletionContext): CompletionItem[] {
    let filtered = [...completions];

    // Apply semantic filtering if enabled
    if (this.config.semanticFiltering) {
      if (this.config.semanticFiltering.filterByScope && context.isAfterDot) {
        // Filter completions based on scope (e.g., only show relevant properties after dot)
        filtered = filtered.filter(item => this.isItemRelevantForScope(item, context));
      }

      if (this.config.semanticFiltering.filterByCardinality) {
        // Filter based on FHIR element cardinality constraints
        filtered = filtered.filter(item => this.isItemValidForCardinality(item, context));
      }

      if (this.config.semanticFiltering.filterByContext) {
        // Filter based on expression context
        filtered = filtered.filter(item => this.isItemValidForContext(item, context));
      }
    }

    // Filter private elements if not enabled
    if (!this.config.includePrivateElements) {
      filtered = filtered.filter(item => !this.isPrivateElement(item));
    }

    // Apply type hints if enabled
    if (this.config.enableTypeHints) {
      filtered = filtered.map(item => this.addTypeHints(item));
    }

    // Add parameter hints if enabled
    if (this.config.enableParameterHints && context.isInFunction) {
      filtered = filtered.map(item => this.addParameterHints(item));
    }

    return filtered;
  }

  /**
   * Apply priority weighting to completion items
   */
  private applyPriorityWeighting(completions: CompletionItem[]): CompletionItem[] {
    if (!this.config.sortByRelevance || !this.config.priorityWeighting) {
      return completions;
    }

    const weights = this.config.priorityWeighting;
    
    return completions.map(item => {
      let priority = 0;

      // Common elements weight
      if (weights.commonElements && this.isCommonElement(item)) {
        priority += weights.commonElements;
      }

      // Recently used weight
      if (weights.recentlyUsed) {
        const usageCount = this.recentlyUsedItems.get(item.label) || 0;
        priority += Math.min(usageCount * weights.recentlyUsed, weights.recentlyUsed * 3);
      }

      // Type relevance weight
      if (weights.typeRelevance && this.isTypeRelevant(item)) {
        priority += weights.typeRelevance;
      }

      // Store priority for sorting
      (item as any).priority = priority;
      return item;
    }).sort((a, b) => ((b as any).priority || 0) - ((a as any).priority || 0));
  }

  /**
   * Helper methods for filtering and weighting
   */
  private isItemRelevantForScope(item: CompletionItem, context: CompletionContext): boolean {
    // Implement scope-based filtering logic
    return true; // Placeholder
  }

  private isItemValidForCardinality(item: CompletionItem, context: CompletionContext): boolean {
    // Implement cardinality-based filtering logic
    return true; // Placeholder
  }

  private isItemValidForContext(item: CompletionItem, context: CompletionContext): boolean {
    // Implement context-based filtering logic
    return true; // Placeholder
  }

  private isPrivateElement(item: CompletionItem): boolean {
    // Check if item represents a private/internal FHIR element
    return item.label.startsWith('_') || item.detail?.includes('(internal)');
  }

  private addTypeHints(item: CompletionItem): CompletionItem {
    // Add type information to completion item if available
    if (item.kind === CompletionItemKind.Property && item.detail) {
      item.detail = `${item.detail} : ${this.getTypeHint(item)}`;
    }
    return item;
  }

  private addParameterHints(item: CompletionItem): CompletionItem {
    // Add parameter hints for function completions
    if (item.kind === CompletionItemKind.Function && this.config.enableFunctionTemplates) {
      // Implementation would add parameter hints
    }
    return item;
  }

  private isCommonElement(item: CompletionItem): boolean {
    // Check if this is a commonly used FHIR element
    const commonElements = ['id', 'identifier', 'status', 'code', 'subject', 'patient', 'value', 'text'];
    return commonElements.includes(item.label.toLowerCase());
  }

  private isTypeRelevant(item: CompletionItem): boolean {
    // Check if item is relevant to current type context
    return true; // Placeholder
  }

  private getTypeHint(item: CompletionItem): string {
    // Extract type hint from item data
    return (item as any).typeHint || 'unknown';
  }

  private analyzeCompletionContext(
    document: TextDocument,
    position: Position,
    triggerCharacter?: string
  ): CompletionContext {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const lineText = document.getText({
      start: { line: position.line, character: 0 },
      end: { line: position.line, character: position.character }
    });

    // Check if we're in a comment/directive context FIRST
    const commentContext = this.analyzeCommentContext(lineText, position.character);

    // If we're in a directive, use the line text directly for completion
    if (commentContext.isInDirective) {
      return {
        text: lineText,
        position,
        triggerCharacter,
        currentToken: commentContext.currentToken,
        previousToken: undefined,
        isAfterDot: false,
        isInFunction: false,
        isInBrackets: false,
        isInComment: commentContext.isInComment,
        isInDirective: commentContext.isInDirective,
        directiveType: commentContext.directiveType,
        directiveValue: commentContext.directiveValue,
        parentExpression: undefined
      };
    }

    // For non-directive contexts, proceed with normal expression analysis
    // Parse multi-expressions from the current line to get the specific expression at cursor
    const currentExpressionContext = this.getCurrentExpressionAtPosition(lineText, position.character);

    // Use the current expression context for analysis
    const expressionBeforeCursor = currentExpressionContext.expressionText;
    const expressionOffset = currentExpressionContext.startColumn;

    // Find current token and previous token within the current expression
    const tokens = this.tokenizeForCompletion(expressionBeforeCursor);
    const currentTokenInfo = this.getCurrentToken(expressionBeforeCursor, position.character - expressionOffset);
    const previousTokenInfo = this.getPreviousToken(tokens, currentTokenInfo);

    // Analyze context flags based on expression, not entire line
    const isAfterDot = /\.\s*$/.test(expressionBeforeCursor) || triggerCharacter === '.';
    const isInFunction = this.isInsideFunction(expressionBeforeCursor);
    const isInBrackets = this.isInsideBrackets(expressionBeforeCursor);

    // Extract parent expression for context-aware completion
    const parentExpression = this.extractParentExpression(expressionBeforeCursor);

    return {
      text: expressionBeforeCursor,
      position,
      triggerCharacter,
      currentToken: currentTokenInfo?.token,
      previousToken: previousTokenInfo?.token,
      isAfterDot,
      isInFunction,
      isInBrackets,
      isInComment: commentContext.isInComment,
      isInDirective: commentContext.isInDirective,
      directiveType: commentContext.directiveType,
      parentExpression
    };
  }

  /**
   * Parse multi-expressions from a line and find the expression at the cursor position
   * Supports semicolon-separated expressions while handling strings correctly
   */
  private getCurrentExpressionAtPosition(lineText: string, cursorPosition: number): {
    expressionText: string;
    startColumn: number;
    endColumn: number;
  } {
    // Handle semicolon-separated expressions, but be careful about semicolons in strings
    let expressions: Array<{text: string; start: number; end: number}> = [];
    let currentExpression = '';
    let inString = false;
    let stringChar = '';
    let expressionStart = 0;

    for (let i = 0; i < lineText.length; i++) {
      const char = lineText[i];
      const prevChar = i > 0 ? lineText[i - 1] : '';

      if (!inString && (char === '"' || char === "'")) {
        inString = true;
        stringChar = char;
      } else if (inString && char === stringChar && prevChar !== '\\') {
        inString = false;
        stringChar = '';
      } else if (!inString && char === ';') {
        // End of expression
        if (currentExpression.trim()) {
          expressions.push({
            text: currentExpression.trim(),
            start: expressionStart,
            end: i
          });
        }
        currentExpression = '';
        // Find the next non-whitespace character for the new expression start
        let nextStart = i + 1;
        while (nextStart < lineText.length && (lineText[nextStart] === ' ' || lineText[nextStart] === '\t')) {
          nextStart++;
        }
        expressionStart = nextStart;
        continue;
      }

      currentExpression += char;
    }

    // Add the last expression
    if (currentExpression.trim()) {
      expressions.push({
        text: currentExpression.trim(),
        start: expressionStart,
        end: lineText.length
      });
    }

    // If no expressions found, treat the whole line as one expression
    if (expressions.length === 0) {
      const trimmed = lineText.trim();
      if (trimmed) {
        let start = 0;
        while (start < lineText.length && (lineText[start] === ' ' || lineText[start] === '\t')) {
          start++;
        }
        expressions.push({
          text: trimmed,
          start: start,
          end: lineText.length
        });
      }
    }

    // Find which expression contains the cursor
    for (const expr of expressions) {
      if (cursorPosition >= expr.start && cursorPosition <= expr.end) {
        return {
          expressionText: lineText.substring(expr.start, cursorPosition),
          startColumn: expr.start,
          endColumn: expr.end
        };
      }
    }

    // Fallback: return the last expression or empty
    if (expressions.length > 0) {
      const lastExpr = expressions[expressions.length - 1];
      return {
        expressionText: lineText.substring(lastExpr.start, cursorPosition),
        startColumn: lastExpr.start,
        endColumn: lastExpr.end
      };
    }

    return {
      expressionText: '',
      startColumn: 0,
      endColumn: lineText.length
    };
  }

  private tokenizeForCompletion(text: string): string[] {
    // Simple tokenization for completion context
    return text.split(/[\s\(\)\[\]\.\,]+/).filter(token => token.length > 0);
  }

  private getCurrentToken(lineText: string, position: number): { token: string; start: number; end: number } | null {
    // Find the token at the cursor position
    const beforeCursor = lineText.substring(0, position);
    const afterCursor = lineText.substring(position);


    // Find token boundaries - look for the last delimiter
    const tokenStart = Math.max(
      beforeCursor.lastIndexOf(' '),
      beforeCursor.lastIndexOf('.'),
      beforeCursor.lastIndexOf('('),
      beforeCursor.lastIndexOf('['),
      beforeCursor.lastIndexOf(','),
      -1 // Use -1 as default to handle start of line
    ) + 1; // Start after the delimiter

    const tokenEnd = afterCursor.search(/[\s\.\(\)\[\],]/);
    const actualTokenEnd = tokenEnd === -1 ? lineText.length : position + tokenEnd;

    const token = lineText.substring(tokenStart, actualTokenEnd).trim();

    if (token.length === 0) {
      return null;
    }

    return {
      token,
      start: tokenStart,
      end: actualTokenEnd
    };
  }

  private getPreviousToken(tokens: string[], currentTokenInfo: any): { token: string } | null {
    if (tokens.length < 2) {
      return null;
    }

    // Return the second-to-last token
    return { token: tokens[tokens.length - 2] };
  }

  private isInsideFunction(text: string): boolean {
    // Count unmatched opening parentheses
    let parenCount = 0;
    for (let i = text.length - 1; i >= 0; i--) {
      if (text[i] === ')') parenCount++;
      if (text[i] === '(') parenCount--;
      if (parenCount < 0) return true;
    }
    return false;
  }

  private isInsideBrackets(text: string): boolean {
    // Count unmatched opening brackets
    let bracketCount = 0;
    for (let i = text.length - 1; i >= 0; i--) {
      if (text[i] === ']') bracketCount++;
      if (text[i] === '[') bracketCount--;
      if (bracketCount < 0) return true;
    }
    return false;
  }

  private extractParentExpression(text: string): string | undefined {
    // Extract the expression before the last dot for context
    const match = text.match(/([\w\.\[\]\(\)]+)\.[\w]*$/);
    return match ? match[1] : undefined;
  }

  private analyzeCommentContext(lineText: string, cursorPosition: number): {
    isInComment: boolean;
    isInDirective: boolean;
    directiveType?: string;
    directiveValue?: string;
    currentToken?: string;
  } {
    const textBeforeCursor = lineText.substring(0, cursorPosition);

    // Check if we're in a comment
    const commentMatch = textBeforeCursor.match(/^\s*\/\//);
    if (!commentMatch) {
      return { isInComment: false, isInDirective: false };
    }

    // Check if the line contains @ symbol indicating directive
    if (!textBeforeCursor.includes('@')) {
      return { isInComment: true, isInDirective: false };
    }

    // Extract content after the @ symbol
    const atIndex = textBeforeCursor.lastIndexOf('@');
    if (atIndex === -1) {
      return { isInComment: true, isInDirective: false };
    }

    const afterAt = textBeforeCursor.substring(atIndex + 1);

    // If we're right after @, we're starting a directive
    if (afterAt.trim() === '') {
      return {
        isInComment: true,
        isInDirective: true,
        directiveType: undefined,
        directiveValue: undefined,
        currentToken: ''
      };
    }

    // Check if we have a partial or complete directive
    const directiveMatch = afterAt.match(/^(\w+)(\s+(.*))?$/);
    if (directiveMatch) {
      const [, directiveType, , directiveValue] = directiveMatch;

      // Extract the current token being typed (for file paths, etc.)
      let currentToken = '';
      if (directiveValue) {
        // For inputfile directive, preserve whitespace in file paths
        if (directiveType === 'inputfile') {
          // Don't split by whitespace - treat the entire value as the current token
          currentToken = directiveValue;
        } else {
          // For other directives, use the old behavior of splitting by whitespace
          const tokens = directiveValue.trim().split(/\s+/);
          currentToken = tokens[tokens.length - 1] || '';
        }
      } else if (afterAt.endsWith(' ')) {
        // If there's whitespace after the directive name but no value yet,
        // we're still in directive context and should trigger completion
        currentToken = '';
      }

      return {
        isInComment: true,
        isInDirective: true,
        directiveType: directiveType,
        directiveValue: directiveValue || '',
        currentToken: currentToken
      };
    }

    // We're in a directive context but haven't typed a valid directive yet
    return {
      isInComment: true,
      isInDirective: true,
      directiveType: undefined,
      directiveValue: undefined,
      currentToken: afterAt
    };
  }

  private async getCompletionsForContext(context: CompletionContext, document: TextDocument): Promise<CompletionItem[]> {
    const completions: CompletionItem[] = [];

    // Get document context for enhanced completions
    let documentContext = null;
    if (this.contextService) {
      documentContext = await this.contextService.getCompletionContext(document);
    }

    // Simplified completion logic with clear priorities
    if (context.isInDirective) {
      // Directive completions (file paths, resource types, etc.)
      completions.push(...this.getDirectiveCompletions(context, document));
    } else if (context.isAfterDot || this.isPartialNavigation(context)) {
      // Property navigation with method chaining support
      const propertyCompletions = await this.getFHIRResourcePropertyCompletions(context, documentContext);
      const functionCompletions = this.getFunctionCompletions(context);
      
      completions.push(...propertyCompletions, ...functionCompletions);
    } else if (context.isInFunction) {
      // Function parameter completions
      completions.push(...this.getFunctionParameterCompletions(context));
      completions.push(...this.getValueCompletions(context));
    } else if (context.isInBrackets) {
      // Filter expression completions
      completions.push(...this.getFilterCompletions(context));
    } else {
      // Root context: resources, functions, operators, keywords
      const resourceCompletions = this.getFHIRResourceCompletions(context, documentContext);
      const functionCompletions = this.getFunctionCompletions(context);
      const operatorCompletions = this.getOperatorCompletions(context);
      const keywordCompletions = this.getKeywordCompletions(context);
      
      completions.push(...resourceCompletions, ...functionCompletions, ...operatorCompletions, ...keywordCompletions);
    }

    const finalCompletions = this.filterAndSortCompletions(completions, context);
    return finalCompletions;
  }

  /**
   * Check if the context represents partial navigation (e.g., "Patient.na")
   */
  private isPartialNavigation(context: CompletionContext): boolean {
    const expression = context.text.trim();
    // Match patterns like "Resource.property" or "Resource.prop1.prop2"
    return /^[A-Z]\w+\.\w+/.test(expression) && !context.isAfterDot;
  }

  private getFunctionCompletions(context: CompletionContext): CompletionItem[] {
    const allFunctions = this.functionRegistry.getFunctionCompletionItems();

    // Always ensure functions come after properties (properties use 0_ prefix)
    return allFunctions.map(func => {
      // If we're after a dot, prioritize functions that make sense on collections/values
      if (context.isAfterDot && context.parentExpression) {
        // Use Registry API to get functions by category
        const commonCategories = ['existence', 'navigation', 'manipulation', 'filtering'];
        const funcDetails = this.functionRegistry.getFunction(func.label);
        const isCommon = funcDetails && commonCategories.includes(funcDetails.category);

        if (isCommon) {
          return {
            ...func,
            sortText: `1_function_${func.label}` // Common functions after properties
          };
        }
        return {
          ...func,
          sortText: `2_function_${func.label}` // Less common functions
        };
      }

      // For non-dot contexts, functions still come after properties but before operators
      return {
        ...func,
        sortText: `1_function_${func.label}` // Functions after properties (0_), before operators (2_)
      };
    });
  }

  private getOperatorCompletions(context: CompletionContext): CompletionItem[] {
    const operators = this.functionRegistry.getOperatorCompletionItems();
    // Ensure operators come after properties (0_) and functions (1_)
    return operators.map(op => ({
      ...op,
      sortText: `3_operator_${op.label}` // Operators after functions
    }));
  }

  private getKeywordCompletions(context: CompletionContext): CompletionItem[] {
    const keywords = this.functionRegistry.getKeywordCompletionItems();
    // Ensure keywords come after properties, functions, and operators
    return keywords.map(kw => ({
      ...kw,
      sortText: `4_keyword_${kw.label}` // Keywords last
    }));
  }

  private getFHIRResourceCompletions(context: CompletionContext, documentContext?: any): CompletionItem[] {
    
    // Require ModelProvider for resource type completions
    if (!this.modelProviderService || !this.modelProviderService.isInitialized()) {
      this.logger.warn('ModelProvider not initialized. FHIR resource completions require ModelProvider.');
      return [];
    }

    const fhirResources = this.fhirPathService.getAvailableResourceTypes();
    
    if (fhirResources.length === 0) {
      this.logger.error('No FHIR resource types available from ModelProvider.');
      return [];
    }

    const completions: CompletionItem[] = [];

    // Check if user is typing a capitalized pattern (indicating resource type)
    const isCapitalizedPattern = context.currentToken && /^[A-Z]/.test(context.currentToken);

    // Common resource types for prioritization
    const commonTypes = ['Patient', 'Observation', 'Condition', 'Procedure', 'MedicationRequest', 
                         'DiagnosticReport', 'Encounter', 'Practitioner', 'Organization'];

    // If we have document context, prioritize the context resource type
    if (documentContext?.resourceType && fhirResources.includes(documentContext.resourceType)) {
      completions.push({
        label: documentContext.resourceType,
        kind: CompletionItemKind.Class,
        detail: `FHIR ${documentContext.resourceType} resource (context)`,
        documentation: {
          kind: MarkupKind.Markdown,
          value: `**${documentContext.resourceType}** resource type from document context.\n\nAccess properties using dot notation.`
        },
        insertText: documentContext.resourceType,
        sortText: `0_${documentContext.resourceType}` // Context resource gets highest priority
      });
    }

    // Add all other resource types with smart prioritization
    const otherResources = documentContext?.resourceType 
      ? fhirResources.filter(r => r !== documentContext.resourceType)
      : fhirResources;

    otherResources.forEach(resource => {
      let priority = '3_'; // Default priority
      
      if (isCapitalizedPattern || !context.currentToken) {
        // Prioritize common resource types when user types capitalized chars
        if (commonTypes.includes(resource)) {
          priority = '1_';
        } else {
          priority = '2_';
        }
      }

      completions.push({
        label: resource,
        kind: CompletionItemKind.Class,
        detail: `FHIR ${resource} resource`,
        documentation: {
          kind: MarkupKind.Markdown,
          value: `**${resource}** resource type from FHIR model.\n\nAccess properties using dot notation.`
        },
        insertText: resource,
        sortText: `${priority}${resource}`
      });
    });

    return completions;
  }

  private async getFHIRResourcePropertyCompletions(context: CompletionContext, documentContext?: any): Promise<CompletionItem[]> {
    // Use ModelProviderService for enhanced completions
    if (this.modelProviderService && this.modelProviderService.isInitialized()) {
      return this.getEnhancedFHIRCompletions(context, documentContext);
    }

    // Analyze navigation context for fallback
    const navigationContext = this.analyzeNavigationContext(context, documentContext);
    if (navigationContext.isNavigable) {
      return this.getNavigationCompletions(navigationContext, context);
    }

    // No ModelProvider available - require ModelProvider for completions
    this.logger.warn('ModelProviderService not initialized. FHIR property completions require ModelProvider.');
    return [];
  }

  private async getEnhancedFHIRCompletions(context: CompletionContext, documentContext?: any): Promise<CompletionItem[]> {
    try {
      
      // Check enhanced cache first
      const cached = this.getCachedEnhancedCompletions(context);
      if (cached) {
        return cached;
      }

      const expressionContext = this.parseExpressionContext(context, documentContext);
      
      if (!expressionContext.isValid) {
        return [];
      }

      const navigation = await this.modelProviderService!.navigatePropertyPath(
        expressionContext.resourceType,
        expressionContext.propertyPath
      );

      if (!navigation.isValid) {
        this.logger.warn('Navigation failed', undefined, { errors: navigation.errors });
        return [];
      }


      const completions: CompletionItem[] = [];

      // Add regular properties
      const propertyCompletions = await this.createPropertyCompletions(navigation.finalType, expressionContext);
      completions.push(...propertyCompletions);

      // Add choice type expansions
      // Check if the last property in the navigation path is a choice type
      const lastPropertyInfo = await this.getLastPropertyFromNavigation(navigation, expressionContext);
      if (lastPropertyInfo) {
        completions.push(...await this.createChoiceCompletions(lastPropertyInfo, expressionContext));
      } else {
        completions.push(...await this.createChoiceCompletions(navigation.finalType, expressionContext));
      }

      // Add inherited properties
      completions.push(...await this.createInheritedCompletions(navigation.finalType, expressionContext));

      // Cache the result
      this.setCachedEnhancedCompletions(context, completions);

      return completions;
    } catch (error) {
      this.logger.error('Error in enhanced FHIR completions:', error);
      return [];
    }
  }



  private getFHIRPropertiesForResource(resourceType: string): CompletionItem[] {
    // Require ModelProvider for all property completions
    if (!this.modelProviderService || !this.modelProviderService.isInitialized()) {
      this.logger.warn(`ModelProvider not initialized. Cannot get properties for ${resourceType}.`);
      return [];
    }

    const properties = this.fhirPathService.getResourcePropertyDetails(resourceType);
    
    if (properties.length === 0) {
      this.logger.warn(`No properties available for resource type: ${resourceType}. Check ModelProvider initialization.`);
      return [];
    }

    return properties.map(prop => ({
      label: prop.name,
      kind: CompletionItemKind.Property,
      detail: `${resourceType}.${prop.name}: ${prop.type || 'unknown'}`,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `**${prop.name}**${prop.type ? ` (${prop.type})` : ''}${prop.cardinality ? ` [${prop.cardinality}]` : ''}\n\n${prop.description || 'Property from FHIR model'}`
      },
      insertText: prop.name,
      sortText: `0_${prop.name}` // Properties get highest priority
    }));
  }


  private getFunctionParameterCompletions(context: CompletionContext): CompletionItem[] {
    // Analyze which function we're inside and suggest appropriate parameters
    const functionMatch = context.text.match(/(\w+)\s*\([^)]*$/);    
    if (!functionMatch) {
      return [];
    }

    const functionName = functionMatch[1];
    const func = this.functionRegistry.getFunction(functionName);
    
    if (!func || !func.parameters) {
      return [];
    }

    // Get parameter suggestions based on function definition
    const completions: CompletionItem[] = [];
    
    func.parameters.forEach((param, index) => {
      if (!param) return;
      
      const paramName = param.name || `param${index}`;
      const paramType = param.type || 'any';
      const isOptional = param.optional || false;
      
      // Create completion for parameter based on type
      if (paramType.includes('string')) {
        completions.push({
          label: `"${paramName}"`,
          kind: CompletionItemKind.Value,
          detail: `String parameter: ${paramName}`,
          documentation: {
            kind: MarkupKind.Markdown,
            value: `**${paramName}** (${paramType})${isOptional ? ' *(optional)*' : ''}\n\n${param.description || 'Function parameter'}`
          },
          insertText: `"${paramName}"`,
          sortText: `0_${paramName}`
        });
      } else if (paramType.includes('boolean')) {
        ['true', 'false'].forEach(value => {
          completions.push({
            label: value,
            kind: CompletionItemKind.Value,
            detail: `Boolean value for ${paramName}`,
            insertText: value,
            sortText: `0_${value}`
          });
        });
      } else if (paramType.includes('Expression') || paramType.includes('FHIRPath')) {
        // Suggest common FHIRPath expressions
        const commonExpressions = ['exists()', 'empty()', 'count() > 0', 'first()', 'last()'];
        commonExpressions.forEach(expr => {
          completions.push({
            label: expr,
            kind: CompletionItemKind.Snippet,
            detail: `Expression for ${paramName}`,
            insertText: expr,
            sortText: `1_${expr}`
          });
        });
      }
    });

    return completions;
  }

  private getValueCompletions(context: CompletionContext): CompletionItem[] {
    // Common FHIR value completions
    const commonValues = [
      { value: '"official"', description: 'Official name/identifier use' },
      { value: '"usual"', description: 'Usual name/identifier use' },
      { value: '"temp"', description: 'Temporary name/identifier use' },
      { value: '"final"', description: 'Final observation status' },
      { value: '"preliminary"', description: 'Preliminary observation status' },
      { value: '"amended"', description: 'Amended observation status' },
      { value: 'true', description: 'Boolean true value' },
      { value: 'false', description: 'Boolean false value' }
    ];

    return commonValues.map(val => ({
      label: val.value,
      kind: CompletionItemKind.Value,
      detail: 'FHIR value',
      documentation: val.description,
      insertText: val.value,
      sortText: `5_value_${val.value}` // Values after all other completions
    }));
  }

  private getFilterCompletions(context: CompletionContext): CompletionItem[] {
    // Common filter patterns
    const filterPatterns = [
      { pattern: 'use = "official"', description: 'Filter by use field' },
      { pattern: 'system = "phone"', description: 'Filter by system field' },
      { pattern: 'status = "final"', description: 'Filter by status field' },
      { pattern: 'exists()', description: 'Filter where field exists' },
      { pattern: 'empty()', description: 'Filter where field is empty' }
    ];

    return filterPatterns.map(filter => ({
      label: filter.pattern,
      kind: CompletionItemKind.Snippet,
      detail: 'Filter pattern',
      documentation: filter.description,
      insertText: filter.pattern,
      sortText: `6_filter_${filter.pattern}` // Filter patterns after values
    }));
  }

  private getDirectiveCompletions(context: CompletionContext, document: TextDocument): CompletionItem[] {
    const completions: CompletionItem[] = [];

    // If no directive type yet, suggest all available directives
    if (!context.directiveType) {

      // Always show all directives - let "last wins" behavior handle conflicts
      const directives = [
        {
          label: 'inputfile',
          kind: CompletionItemKind.Keyword,
          detail: 'Load input data from file',
          documentation: {
            kind: MarkupKind.Markdown,
            value: 'Load FHIR resource data from a JSON file.\n\nExample: `// @inputfile patient-example.json`\n\n**Note:** If multiple directives exist, the last one will be used.'
          },
          insertText: 'inputfile ',
          sortText: '0_inputfile'
        },
        {
          label: 'input',
          kind: CompletionItemKind.Keyword,
          detail: 'Inline input data',
          documentation: {
            kind: MarkupKind.Markdown,
            value: 'Provide FHIR resource data inline as JSON.\n\nExample: `// @input {"resourceType": "Patient", "id": "example"}`\n\n**Note:** If multiple directives exist, the last one will be used.'
          },
          insertText: 'input ',
          sortText: '0_input'
        },
        {
          label: 'resource',
          kind: CompletionItemKind.Keyword,
          detail: 'Specify resource type',
          documentation: {
            kind: MarkupKind.Markdown,
            value: 'Specify the FHIR resource type for context.\n\nExample: `// @resource Patient`\n\n**Note:** If multiple directives exist, the last one will be used.'
          },
          insertText: 'resource ',
          sortText: '0_resource'
        }
      ];

      completions.push(...directives);
    } else {
      // Provide specific completions based on directive type
      switch (context.directiveType) {
        case 'inputfile':
          const fileCompletions = this.getFilePathCompletions(document, context.currentToken);
          completions.push(...fileCompletions);
          break;
        case 'resource':
          const resourceCompletions = this.getFHIRResourceCompletions(context);
          completions.push(...resourceCompletions);
          break;
        case 'input':
          const inputCompletions = this.getInlineInputCompletions();
          completions.push(...inputCompletions);
          break;
        default:
      }
    }

    return completions;
  }


  private getFilePathCompletions(document: TextDocument, currentPath?: string): CompletionItem[] {
    const completions: CompletionItem[] = [];

    try {
      // Get the document's directory as the base path
      const documentUri = document.uri;
      const documentPath = documentUri.startsWith('file://')
        ? documentUri.substring(7)
        : documentUri;
      const documentDir = path.dirname(documentPath);

      // Determine the target directory based on current path
      let targetDir = documentDir;
      let searchPattern = '';

      if (currentPath) {
        if (currentPath.includes('/') || currentPath.includes('\\')) {
          // Extract directory and filename pattern
          const pathParts = currentPath.split(/[/\\]/);
          const filePattern = pathParts.pop() || '';
          const dirPath = pathParts.join(path.sep);

          if (dirPath) {
            targetDir = path.resolve(documentDir, dirPath);
          }
          searchPattern = filePattern.toLowerCase();
        } else {
          // Just a filename pattern
          searchPattern = currentPath.toLowerCase();
        }
      }

      // Read directory contents
      if (fs.existsSync(targetDir)) {
        const entries = fs.readdirSync(targetDir, { withFileTypes: true });

        for (const entry of entries) {
          const entryName = entry.name;

          // Skip hidden files and directories
          if (entryName.startsWith('.') && entryName !== '.' && entryName !== '..') {
            continue;
          }

          // Filter based on search pattern
          if (searchPattern && !entryName.toLowerCase().includes(searchPattern)) {
            continue;
          }

          if (entry.isDirectory()) {
            completions.push({
              label: entryName + '/',
              kind: CompletionItemKind.Folder,
              detail: 'Directory',
              insertText: entryName + '/',
              sortText: `0_${entryName}`
            });
          } else if (entry.isFile()) {
            // Prioritize JSON files for FHIR resources
            const isJsonFile = entryName.toLowerCase().endsWith('.json');
            const sortPrefix = isJsonFile ? '1' : '2';

            completions.push({
              label: entryName,
              kind: CompletionItemKind.File,
              detail: isJsonFile ? 'JSON file' : 'File',
              insertText: entryName,
              sortText: `${sortPrefix}_${entryName}`
            });
          }
        }
      }

      // Add common relative path suggestions if no specific path is being typed
      if (!currentPath || currentPath === '') {
        const commonPaths = [
          {
            label: './data/',
            kind: CompletionItemKind.Folder,
            detail: 'Data directory',
            insertText: './data/',
            sortText: '0_data'
          },
          {
            label: './examples/',
            kind: CompletionItemKind.Folder,
            detail: 'Examples directory',
            insertText: './examples/',
            sortText: '0_examples'
          },
          {
            label: '../',
            kind: CompletionItemKind.Folder,
            detail: 'Parent directory',
            insertText: '../',
            sortText: '0_parent'
          }
        ];

        // Only add common paths that actually exist
        for (const commonPath of commonPaths) {
          const fullPath = path.resolve(documentDir, commonPath.insertText);
          if (fs.existsSync(fullPath)) {
            completions.push(commonPath);
          }
        }
      }

    } catch (error) {
      this.logger.error('Error reading file system for completions:', error);

      // Fallback to static suggestions if file system reading fails
      const fallbackPatterns = [
        {
          label: 'patient-example.json',
          kind: CompletionItemKind.File,
          detail: 'Example Patient resource file',
          insertText: 'patient-example.json',
          sortText: '1_patient-example.json'
        },
        {
          label: 'observation-example.json',
          kind: CompletionItemKind.File,
          detail: 'Example Observation resource file',
          insertText: 'observation-example.json',
          sortText: '1_observation-example.json'
        }
      ];

      completions.push(...fallbackPatterns);
    }

    return completions;
  }


  private getInlineInputCompletions(): CompletionItem[] {
    const templates = [
      {
        label: 'Patient template',
        kind: CompletionItemKind.Snippet,
        detail: 'Basic Patient resource template',
        documentation: 'Template for a basic Patient resource',
        insertText: '{"resourceType": "Patient", "id": "example", "active": true, "name": [{"family": "Doe", "given": ["John"]}]}',
        sortText: '0_patient'
      },
      {
        label: 'Observation template',
        kind: CompletionItemKind.Snippet,
        detail: 'Basic Observation resource template',
        documentation: 'Template for a basic Observation resource',
        insertText: '{"resourceType": "Observation", "id": "example", "status": "final", "code": {"text": "Example"}, "subject": {"reference": "Patient/example"}}',
        sortText: '0_observation'
      }
    ];

    return templates;
  }

  /**
   * Parse expression context to determine resource type and property path
   */
  private parseExpressionContext(context: CompletionContext, documentContext?: any): ExpressionContext {
    // Parse complex expressions to understand current navigation state
    const expression = context.text.trim();
    
    
    // Enhanced regex to capture more patterns, including incomplete paths
    const match = expression.match(/^([A-Z][a-zA-Z0-9_]*)(\.([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]*)*)?\.?)?/);

    if (!match) {
      // Check if we have document context for root-level property access
      if (documentContext?.resourceType && (context.isAfterDot || expression === '')) {
        return {
          resourceType: documentContext.resourceType,
          propertyPath: [],
          isValid: true,
          currentProperty: context.currentToken,
          isAfterDot: context.isAfterDot
        };
      }
      return { resourceType: '', propertyPath: [], isValid: false };
    }

    const resourceType = match[1];
    let propertyPath: string[] = [];
    
    if (match[3]) {
      // Split the property path, but handle incomplete paths (ending with '.')
      propertyPath = match[3].split('.').filter(part => part.length > 0);
    }
    
    // Special handling for when user is typing after a dot
    if (context.isAfterDot) {
      if (context.currentToken && context.currentToken.length > 0) {
        // User is typing a new property after dot - the currentToken is the partial property being typed
        // Don't include it in propertyPath yet, as we want completions for this partial input
      } else {
        // User just typed a dot - we want completions for the next level
      }
    } else if (context.currentToken && !propertyPath.includes(context.currentToken)) {
      // If we have a current token that's not in the path, it might be a partial property
    }


    return {
      resourceType,
      propertyPath,
      isValid: true,
      currentProperty: context.currentToken,
      isAfterDot: context.isAfterDot
    };
  }

  /**
   * Create property completions with enhanced metadata
   */
  private async createPropertyCompletions(typeInfo: any, expressionContext: ExpressionContext): Promise<CompletionItem[]> {
    if (!this.modelProviderService) {
      this.logger.warn(`🚫 createPropertyCompletions: ModelProviderService not available`);
      return [];
    }

    try {
      
      const availableProperties = await this.getAvailableProperties(typeInfo);
      
      const enhanced = await this.modelProviderService.getEnhancedTypeInfo(typeInfo.name);

      const completions: CompletionItem[] = [];

      for (const propertyName of availableProperties) {
        try {
          const propertyType = await this.getPropertyType(typeInfo, propertyName);
          if (!propertyType) {
            continue;
          }

          const completion = await this.createEnhancedPropertyCompletion(
            propertyName,
            propertyType,
            enhanced,
            expressionContext
          );

          completions.push(completion);
        } catch (error) {
          this.logger.warn(`Failed to create completion for property ${propertyName}:`, error);
        }
      }

      return completions;
    } catch (error) {
      this.logger.error('Error creating property completions:', error);
      return [];
    }
  }

  /**
   * Create choice type expansion completions
   */
  private async createChoiceCompletions(typeInfo: any, expressionContext: ExpressionContext): Promise<CompletionItem[]> {
    if (!this.modelProviderService) return [];

    try {
      const choiceTypes = await this.modelProviderService.resolveChoiceTypes(typeInfo);
      if (choiceTypes.length <= 1) return [];

      // Extract base property from the typeInfo itself (for choice types like value[x])
      const baseProperty = this.extractBasePropertyFromChoice(typeInfo);
      if (!baseProperty) return [];

      const choiceProperties = this.modelProviderService.getChoicePropertyNames(baseProperty, choiceTypes);
      
      return choiceProperties.map(property => ({
        label: property,
        kind: CompletionItemKind.Property,
        detail: this.getChoicePropertyDetail(property, choiceTypes),
        documentation: {
          kind: MarkupKind.Markdown,
          value: this.getChoicePropertyDocumentation(property, choiceTypes)
        },
        sortText: `0_choice_${property}`, // Prioritize choice expansions
        insertText: property,
        filterText: `${baseProperty} ${property}`, // Allow fuzzy matching
        data: { isChoice: true, baseProperty }
      }));
    } catch (error) {
      this.logger.error('Error creating choice completions:', error);
      return [];
    }
  }

  /**
   * Create inherited property completions
   */
  private async createInheritedCompletions(typeInfo: any, expressionContext: ExpressionContext): Promise<CompletionItem[]> {
    if (!this.modelProviderService) return [];

    try {
      const enhanced = await this.modelProviderService.getEnhancedTypeInfo(typeInfo.name);
      if (!enhanced?.hierarchy || enhanced.hierarchy.length <= 1) return [];

      const inheritedCompletions: CompletionItem[] = [];

      // Traverse hierarchy to find inherited properties
      for (let i = 1; i < enhanced.hierarchy.length; i++) {
        const baseType = enhanced.hierarchy[i];
        const baseProperties = await this.getAvailableProperties(baseType);

        for (const property of baseProperties) {
          try {
            const completion = await this.createInheritedPropertyCompletion(property, baseType, expressionContext);
            inheritedCompletions.push(completion);
          } catch (error) {
            this.logger.warn(`Failed to create inherited completion for ${property}:`, error);
          }
        }
      }

      return inheritedCompletions;
    } catch (error) {
      this.logger.error('Error creating inherited completions:', error);
      return [];
    }
  }

  /**
   * Create enhanced property completion with metadata
   */
  private async createEnhancedPropertyCompletion(
    propertyName: string,
    propertyType: any,
    enhanced: any,
    expressionContext: ExpressionContext
  ): Promise<CompletionItem> {
    const detail = this.formatPropertyDetail(propertyType, enhanced);
    const documentation = this.createPropertyDocumentation(propertyName, propertyType, enhanced);
    const sortText = this.calculatePropertyPriority(propertyName, enhanced);

    return {
      label: propertyName,
      kind: CompletionItemKind.Property,
      detail,
      documentation: {
        kind: MarkupKind.Markdown,
        value: documentation
      },
      sortText,
      insertText: propertyName,
      data: {
        propertyName,
        propertyType: propertyType?.name,
        cardinality: enhanced?.constraints?.cardinality,
        isRequired: enhanced?.constraints?.required
      }
    };
  }

  /**
   * Create inherited property completion
   */
  private async createInheritedPropertyCompletion(
    property: string,
    baseType: any,
    expressionContext: ExpressionContext
  ): Promise<CompletionItem> {
    return {
      label: property,
      kind: CompletionItemKind.Property,
      detail: `${property} (inherited from ${baseType.name})`,
      documentation: {
        kind: MarkupKind.Markdown,
        value: this.createInheritedPropertyDoc(property, baseType)
      },
      sortText: `1_inherited_${property}`, // Lower priority than direct properties
      insertText: property,
      data: { isInherited: true, baseType: baseType.name }
    };
  }

  /**
   * Format property detail with cardinality and constraints
   */
  private formatPropertyDetail(propertyType: any, enhanced: any): string {
    let detail = propertyType?.name || 'unknown';

    if (enhanced?.constraints?.cardinality) {
      detail += ` [${enhanced.constraints.cardinality}]`;
    }

    if (enhanced?.constraints?.required) {
      detail += ' ⚠️ Required';
    }

    if (enhanced?.terminology?.strength && enhanced.terminology.strength !== 'example') {
      detail += ` 📋 ${enhanced.terminology.strength}`;
    }

    return detail;
  }

  /**
   * Create property documentation with metadata
   */
  private createPropertyDocumentation(propertyName: string, propertyType: any, enhanced: any): string {
    let doc = `**${propertyName}**`;

    if (propertyType?.name) {
      doc += ` (${propertyType.name})`;
    }

    if (enhanced?.constraints?.cardinality) {
      doc += ` [${enhanced.constraints.cardinality}]`;
    }

    doc += '\n\n';

    if (enhanced?.constraints?.required) {
      doc += '⚠️ **Required property**\n\n';
    }

    if (enhanced?.terminology?.valueSet) {
      doc += `📋 **Terminology binding**: ${enhanced.terminology.strength} to ${enhanced.terminology.valueSet}\n\n`;
    }

    // Add description if available
    doc += propertyType?.description || 'No description available';

    return doc;
  }

  /**
   * Create inherited property documentation
   */
  private createInheritedPropertyDoc(property: string, baseType: any): string {
    return `**${property}** (inherited from ${baseType.name})\n\nProperty inherited from the base type ${baseType.name}.`;
  }

  /**
   * Calculate property priority for sorting
   */
  private calculatePropertyPriority(propertyName: string, enhanced: any): string {
    let priority = '1_'; // Default priority for regular properties

    // Boost required properties
    if (enhanced?.constraints?.required) {
      priority = '0_required_';
    }

    // Boost common properties
    const commonProperties = ['id', 'name', 'status', 'value', 'code', 'text'];
    if (commonProperties.includes(propertyName)) {
      priority = '0_common_';
    }

    return priority + propertyName;
  }

  /**
   * Get choice property detail
   */
  private getChoicePropertyDetail(property: string, choiceTypes: any[]): string {
    const baseProperty = this.modelProviderService?.extractBaseProperty(property);
    const choiceType = this.modelProviderService?.extractChoiceType(property);
    
    return `${property} (choice: ${choiceType}) [0..1]`;
  }

  /**
   * Get choice property documentation
   */
  private getChoicePropertyDocumentation(property: string, choiceTypes: any[]): string {
    const baseProperty = this.modelProviderService?.extractBaseProperty(property);
    const choiceType = this.modelProviderService?.extractChoiceType(property);
    
    return `**${property}** (choice type)\n\nChoice expansion of \`${baseProperty}\` for type \`${choiceType}\`.\n\nThis is one of the possible types for the choice element \`${baseProperty}[x]\`.`;
  }

  /**
   * Extract current property from expression context
   */
  private extractCurrentProperty(expressionContext: ExpressionContext): string | undefined {
    if (expressionContext.propertyPath.length > 0) {
      return expressionContext.propertyPath[expressionContext.propertyPath.length - 1];
    }
    return undefined;
  }

  /**
   * Get available properties for a type
   */
  private async getAvailableProperties(typeInfo: any): Promise<string[]> {
    if (!this.modelProviderService) {
      this.logger.warn('getAvailableProperties: ModelProviderService not available');
      return [];
    }

    try {
      
      // Use ModelProviderService method which handles the proper ModelProvider access
      const properties = await this.modelProviderService.getAvailableProperties(typeInfo);
      return properties;
    } catch (error) {
      this.logger.warn(`Failed to get available properties for type ${typeInfo?.name}:`, error);
      return [];
    }
  }

  /**
   * Get property type information
   */
  private async getPropertyType(typeInfo: any, propertyName: string): Promise<any> {
    if (!this.modelProviderService) return null;

    try {
      // Use ModelProvider methods if available
      if (typeof (this.modelProviderService as any).modelProvider?.getElementType === 'function') {
        return (this.modelProviderService as any).modelProvider.getElementType(typeInfo, propertyName);
      }

      // Fallback to TypeInfo properties
      if ((typeInfo as any).properties instanceof Map) {
        return ((typeInfo as any).properties as Map<string, any>).get(propertyName);
      }

      return null;
    } catch (error) {
      this.logger.warn(`Failed to get property type for ${propertyName}:`, error);
      return null;
    }
  }

  /**
   * Enhanced caching for completions
   */
  private getCachedEnhancedCompletions(context: CompletionContext): CompletionItem[] | undefined {
    const cacheKey = this.generateEnhancedCacheKey(context);
    const cached = this.completionCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 300000) { // 5 min TTL
      return cached.items;
    }
    
    return undefined;
  }

  private setCachedEnhancedCompletions(context: CompletionContext, items: CompletionItem[]): void {
    const cacheKey = this.generateEnhancedCacheKey(context);
    this.completionCache.set(cacheKey, {
      items,
      timestamp: Date.now(),
      context: context.text
    });

    // Prevent cache from growing too large
    if (this.completionCache.size > 100) {
      const oldestEntries = Array.from(this.completionCache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp)
        .slice(0, 20);
      
      for (const [key] of oldestEntries) {
        this.completionCache.delete(key);
      }
    }
  }

  private generateEnhancedCacheKey(context: CompletionContext): string {
    return `enhanced:${context.text}:${context.isAfterDot}:${context.currentToken || ''}`;
  }

  /**
   * Analyze the completion context to determine if we're in a navigation scenario
   */
  private analyzeNavigationContext(context: CompletionContext, documentContext?: any): NavigationContext {
    const expression = context.text.trim();
    
    // Parse expression to extract navigation path
    const pathMatch = expression.match(/^([A-Z]\w+)(?:\.(\w+(?:\.\w+)*))?\.?$/);
    if (!pathMatch) {
      // Check if we have document context for implicit navigation
      if (documentContext?.resourceType && context.isAfterDot) {
        return {
          isNavigable: true,
          resourceType: documentContext.resourceType,
          propertyPath: [],
          depth: 0,
          isPartialPath: true,
          currentType: documentContext.resourceType
        };
      }
      return { isNavigable: false, depth: 0 };
    }
    
    const [, resourceType, pathString] = pathMatch;
    const propertyPath = pathString ? pathString.split('.') : [];
    const isPartialPath = expression.endsWith('.');
    
    // For now, we'll use a simplified navigation without ModelProviderService
    // This will be enhanced when ModelProviderService is properly integrated
    return {
      isNavigable: true,
      resourceType,
      propertyPath,
      depth: propertyPath.length,
      isPartialPath,
      currentType: this.determineCurrentType(resourceType, propertyPath),
      parentType: propertyPath.length > 0 ? this.determineCurrentType(resourceType, propertyPath.slice(0, -1)) : resourceType
    };
  }

  /**
   * Determine the current type based on navigation path
   */
  private determineCurrentType(resourceType: string, propertyPath: string[]): string | undefined {
    if (propertyPath.length === 0) {
      return resourceType;
    }
    
    // For now, return undefined to use existing logic
    // This will be enhanced with ModelProviderService navigation
    return undefined;
  }

  /**
   * Get completions for multi-level navigation
   */
  private async getNavigationCompletions(navigationContext: NavigationContext, completionContext: CompletionContext): Promise<CompletionItem[]> {
    if (!navigationContext.isNavigable || !navigationContext.resourceType) {
      return [];
    }

    // Root level - get properties for the resource type
    if (navigationContext.depth === 0) {
      return this.getFHIRPropertiesForResource(navigationContext.resourceType);
    }

    // For deeper levels, require ModelProviderService
    if (!this.modelProviderService || !this.modelProviderService.isInitialized()) {
      this.logger.warn('ModelProvider required for deep navigation completions');
      return [];
    }

    try {
      const navigationResult = await this.modelProviderService.navigatePropertyPath(
        navigationContext.resourceType,
        navigationContext.propertyPath || []
      );

      if (navigationResult.isValid && navigationResult.finalType) {
        const properties = await this.modelProviderService.getAvailableProperties(navigationResult.finalType);
        return properties.map(prop => ({
          label: prop,
          kind: CompletionItemKind.Property,
          detail: `Property on ${navigationResult.finalType.name}`,
          insertText: prop,
          sortText: `0_${prop}`
        }));
      } else {
        this.logger.warn('Navigation failed for path', undefined, {
          resourceType: navigationContext.resourceType,
          path: navigationContext.propertyPath,
          errors: navigationResult.errors
        });
        return [];
      }
    } catch (error) {
      this.logger.error('ModelProvider navigation error', error as Error);
      return [];
    }
  }


  private filterAndSortCompletions(
    completions: CompletionItem[],
    context: CompletionContext
  ): CompletionItem[] {
    // Handle empty or missing currentToken
    if (!context.currentToken || context.currentToken.length === 0) {
      // For directive contexts (especially @inputfile), show all completions without filtering
      if (context.isInDirective) {
        // Don't filter, just sort and return all completions for directive contexts
        return completions.sort((a, b) => {
          return a.sortText?.localeCompare(b.sortText || '') || a.label.localeCompare(b.label);
        }).slice(0, 50);
      }
      // For non-directive contexts with no token, show all completions sorted by priority
      return completions.sort((a, b) => {
        return a.sortText?.localeCompare(b.sortText || '') || a.label.localeCompare(b.label);
      }).slice(0, 50);
    }

    let filtered: CompletionItem[];

    // For directive completions, especially file paths, use different filtering logic
    if (context.isInDirective && context.directiveType === 'inputfile') {
      // For file paths, we need reactive filtering based on the current token
      // Extract the filename part from the current token for additional filtering
      const currentToken = context.currentToken.toLowerCase();

      // Check if currentToken is a complete directory path (ends with / or \)
      const isCompleteDirPath = currentToken.endsWith('/') || currentToken.endsWith('\\');

      if (isCompleteDirPath) {
        // If it's a complete directory path like "../" or "./data/",
        // don't filter - show all contents of that directory
        filtered = completions;
      } else {
        // Extract filename pattern for filtering
        let filenamePattern = '';

        if (currentToken.includes('/') || currentToken.includes('\\')) {
          // Extract just the filename part after the last separator
          const pathParts = currentToken.split(/[/\\]/);
          filenamePattern = pathParts[pathParts.length - 1] || '';
        } else {
          // The whole token is a filename pattern
          filenamePattern = currentToken;
        }

        // Apply reactive filtering based on the filename pattern
        if (filenamePattern) {
          filtered = completions.filter(item => {
            const itemLabel = item.label.toLowerCase();
            // For directories, check if they start with the pattern
            if (item.kind === CompletionItemKind.Folder) {
              return itemLabel.startsWith(filenamePattern) || itemLabel.includes(filenamePattern);
            }
            // For files, check if they contain the pattern (more flexible matching)
            return itemLabel.includes(filenamePattern);
          });
        } else {
          // No specific pattern, return all completions
          filtered = completions;
        }
      }
    } else if (context.isInDirective && !context.directiveType) {
      // For directive names, use prefix matching
      filtered = completions.filter(item =>
        item.label.toLowerCase().startsWith(context.currentToken!.toLowerCase())
      );
    } else {
      // Enhanced filtering for regular completions
      const currentToken = context.currentToken?.toLowerCase() || '';
      
      // Check if user is typing a capitalized pattern (likely a resource type)
      const isCapitalizedInput = context.currentToken && /^[A-Z]/.test(context.currentToken);
      
      
      if (isCapitalizedInput) {
        // For capitalized input, prioritize exact prefix matches for resource types
        filtered = completions.filter(item => {
          const itemLabel = item.label.toLowerCase();
          
          // Exact prefix match gets highest priority
          if (itemLabel.startsWith(currentToken)) {
            return true;
          }
          
          // For resource types (classes), also allow fuzzy matching
          if (item.kind === CompletionItemKind.Class) {
            return itemLabel.includes(currentToken);
          }
          
          // For properties and functions, use prefix matching only
          return itemLabel.startsWith(currentToken);
        });
      } else {
        // For regular completions, use prefix matching
        filtered = completions.filter(item =>
          item.label.toLowerCase().startsWith(currentToken)
        );
      }
    }

    // Sort by relevance: exact match first, then by sortText, then alphabetical
    return filtered.sort((a, b) => {
      const aExact = a.label.toLowerCase() === context.currentToken!.toLowerCase();
      const bExact = b.label.toLowerCase() === context.currentToken!.toLowerCase();

      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;

      // For capitalized input, prioritize resource types (classes)
      const isCapitalizedInput = context.currentToken && /^[A-Z]/.test(context.currentToken);
      if (isCapitalizedInput) {
        const aIsClass = a.kind === CompletionItemKind.Class;
        const bIsClass = b.kind === CompletionItemKind.Class;
        
        if (aIsClass && !bIsClass) return -1;
        if (!aIsClass && bIsClass) return 1;
      }

      return a.sortText?.localeCompare(b.sortText || '') || a.label.localeCompare(b.label);
    }).slice(0, 50); // Increased limit for file path completions
  }

  /**
   * Get the last property info from navigation path for choice type detection
   */
  private async getLastPropertyFromNavigation(navigation: any, expressionContext: ExpressionContext): Promise<any | null> {
    try {
      if (!navigation.navigationPath || navigation.navigationPath.length < 2) {
        return null;
      }

      // Get the last property path element
      const lastPropertyName = expressionContext.propertyPath[expressionContext.propertyPath.length - 1];
      if (!lastPropertyName) {
        return null;
      }

      // Get the parent type (second to last in navigation path)
      const parentType = navigation.navigationPath[navigation.navigationPath.length - 2];
      if (!parentType || !parentType.properties) {
        return null;
      }

      // Get the property info from the parent
      const propertyInfo = parentType.properties.get(lastPropertyName);
      if (!propertyInfo) {
        return null;
      }

      // If this property references a choice type, try to get the choice type info
      if (propertyInfo.name && propertyInfo.name.endsWith('[x]')) {
        // This is a choice type property, try to get the choice type info
        if (this.modelProviderService) {
          // Try to get the choice type from the model provider
          const choiceTypeName = propertyInfo.name;
          try {
            const choiceTypeInfo = await this.modelProviderService.getEnhancedTypeInfo(choiceTypeName);
            return choiceTypeInfo?.type || propertyInfo;
          } catch (error) {
            this.logger.warn(`Failed to get choice type info for ${choiceTypeName}:`, error);
            return propertyInfo;
          }
        }
      }

      return propertyInfo.type === 'choice' ? propertyInfo : null;
    } catch (error) {
      this.logger.warn('Failed to get last property from navigation:', error);
      return null;
    }
  }

  /**
   * Extract base property name from a choice type (e.g., "value" from value[x] TypeInfo)
   */
  private extractBasePropertyFromChoice(typeInfo: any): string | null {
    try {
      // First try to get the property name from the TypeInfo itself
      if (typeInfo?.name) {
        const name = typeInfo.name;
        
        // Handle choice type notation like "value[x]"
        if (name.endsWith('[x]')) {
          return name.slice(0, -3); // Remove "[x]" suffix
        }
        
        // Handle camelCase choice properties like "valueString" -> "value"
        if (this.modelProviderService?.isChoiceProperty(name)) {
          return this.modelProviderService.extractBaseProperty(name);
        }
        
        // Return the name as-is if it doesn't match choice patterns
        return name;
      }

      return null;
    } catch (error) {
      this.logger.warn('Failed to extract base property from choice:', error);
      return null;
    }
  }
}
