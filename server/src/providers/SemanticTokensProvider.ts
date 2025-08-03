import {
  SemanticTokens,
  SemanticTokensBuilder,
  SemanticTokensParams,
  SemanticTokensRangeParams,
  Range
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { FHIRPathService } from '../parser/FHIRPathService';
import { cacheService } from '../services/CacheService';
import { FHIRPathFunctionRegistry } from '../services/FHIRPathFunctionRegistry';
import { ModelProviderService, EnhancedTypeInfo, ChoiceValidationResult, NavigationResult } from '../services/ModelProviderService';
import {
  EnhancedTokenType,
  EnhancedTokenModifier,
  EnhancedSemanticToken,
  TokenClassification,
  TokenAnalysisContext,
  SemanticTokenAnalysisResult,
  EnhancedTokenBuilder,
  ChoiceTypeContext,
  InheritanceContext,
  ConstraintViolationContext,
  TokenTypeUtils
} from './EnhancedSemanticTokenTypes';

// Token types - must match the order in server.ts
export enum TokenType {
  FUNCTION = 0,
  PARAMETER = 1,
  VARIABLE = 2,
  PROPERTY = 3,
  OPERATOR = 4,
  KEYWORD = 5,
  STRING = 6,
  NUMBER = 7,
  BOOLEAN = 8,
  COMMENT = 9
}

// Token modifiers - must match the order in server.ts
export enum TokenModifier {
  DECLARATION = 0,
  READONLY = 1,
  DEPRECATED = 2,
  MODIFICATION = 3,
  DOCUMENTATION = 4,
  DEFAULT_LIBRARY = 5
}

export interface SemanticToken {
  line: number;
  startChar: number;
  length: number;
  tokenType: TokenType;
  tokenModifiers: number;
}

export class SemanticTokensProvider {
  private functionRegistry: FHIRPathFunctionRegistry;
  private enhancedTokenBuilder: EnhancedTokenBuilder;
  
  constructor(
    private fhirPathService: FHIRPathService,
    private modelProviderService?: ModelProviderService
  ) {
    this.functionRegistry = new FHIRPathFunctionRegistry();
    this.enhancedTokenBuilder = new EnhancedTokenBuilder();
  }

  async provideSemanticTokens(
    document: TextDocument,
    params: SemanticTokensParams
  ): Promise<SemanticTokens> {
    try {
      // Generate cache key based on document version and ModelProvider availability
      const cacheKey = cacheService.generateSemanticTokensKey(
        document.uri, 
        document.version,
        this.modelProviderService ? 'enhanced' : 'basic'
      );

      // Check cache first
      const cached = cacheService.getSemanticTokens(cacheKey);
      if (cached) {
        return cached;
      }

      // Generate enhanced tokens with ModelProvider if available
      const result = await this.generateEnhancedSemanticTokens(document);

      // Cache the result
      cacheService.setSemanticTokens(cacheKey, result);

      return result;
    } catch (error) {
      console.error('Error providing semantic tokens:', error);
      return { data: [] };
    }
  }

  /**
   * Generate enhanced semantic tokens with FHIR-aware highlighting
   */
  async generateEnhancedSemanticTokens(document: TextDocument): Promise<SemanticTokens> {
    const startTime = Date.now();
    const text = document.getText();
    
    // Extract resource context from document
    const resourceType = this.extractResourceTypeFromDocument(text);
    
    // Analyze tokens with enhanced FHIR context
    const analysisResult = await this.analyzeEnhancedSemanticTokens(text, document, resourceType);
    
    // Build semantic tokens from enhanced analysis
    const semanticTokens = this.buildEnhancedSemanticTokens(analysisResult.tokens);
    
    const analysisTime = Date.now() - startTime;
    console.log(`Enhanced semantic token analysis completed in ${analysisTime}ms for ${analysisResult.tokens.length} tokens`);
    
    return semanticTokens;
  }

  async provideSemanticTokensRange(
    document: TextDocument,
    params: SemanticTokensRangeParams
  ): Promise<SemanticTokens> {
    try {
      const text = document.getText(params.range);
      const tokens = await this.analyzeSemanticTokens(text, document, params.range);
      return this.buildSemanticTokens(tokens);
    } catch (error) {
      console.error('Error providing semantic tokens for range:', error);
      return { data: [] };
    }
  }

  private async analyzeSemanticTokens(
    text: string,
    document: TextDocument,
    range?: Range
  ): Promise<SemanticToken[]> {
    const tokens: SemanticToken[] = [];
    const lines = text.split('\\n');
    const startLine = range?.start.line || 0;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const actualLineNumber = startLine + lineIndex;

      // Skip empty lines
      if (line.trim().length === 0) {
        continue;
      }

      try {
        // Try to parse the line to get AST information
        const parseResult = this.fhirPathService.parse(line);
        if (parseResult.ast) {
          tokens.push(...await this.extractTokensFromAST(parseResult.ast, actualLineNumber, line));
        } else {
          // Fallback to regex-based tokenization
          tokens.push(...await this.extractTokensWithRegex(line, actualLineNumber));
        }
      } catch (error) {
        // If parsing fails, use regex-based approach
        tokens.push(...await this.extractTokensWithRegex(line, actualLineNumber));
      }
    }

    return tokens;
  }

  private async extractTokensFromAST(ast: any, lineNumber: number, lineText: string): Promise<SemanticToken[]> {
    const tokens: SemanticToken[] = [];

    // Recursive function to traverse AST nodes
    const traverse = async (node: any) => {
      if (!node || !node.type) {
        return;
      }

      // Extract position information if available
      const start = node.location?.start || { offset: 0 };
      const end = node.location?.end || { offset: 0 };

      if (start.offset !== undefined && end.offset !== undefined) {
        const tokenLength = Math.max(1, end.offset - start.offset);
        const tokenType = this.getTokenTypeFromASTNode(node);
        const tokenModifiers = await this.getTokenModifiersFromASTNode(node);

        if (tokenType !== undefined) {
          tokens.push({
            line: lineNumber,
            startChar: start.offset,
            length: tokenLength,
            tokenType,
            tokenModifiers
          });
        }
      }

      // Recursively process child nodes
      if (node.children && Array.isArray(node.children)) {
        await Promise.all(node.children.map(traverse));
      }

      // Handle specific node properties that might contain child nodes
      for (const prop of ['left', 'right', 'expression', 'condition', 'projection']) {
        if (node[prop]) {
          await traverse(node[prop]);
        }
      }

      if (node.arguments && Array.isArray(node.arguments)) {
        await Promise.all(node.arguments.map(traverse));
      }
    };

    await traverse(ast);
    return tokens;
  }

  private getTokenTypeFromASTNode(node: any): TokenType | undefined {
    switch (node.type) {
      case 'FunctionCall':
        return TokenType.FUNCTION;
      case 'Identifier':
        if (this.isFHIRResourceType(node.value)) {
          return TokenType.PROPERTY; // FHIR resource types as properties
        }
        return TokenType.PROPERTY;
      case 'MemberExpression':
        return TokenType.PROPERTY;
      case 'Literal':
        if (typeof node.value === 'string') {
          return TokenType.STRING;
        } else if (typeof node.value === 'number') {
          return TokenType.NUMBER;
        } else if (typeof node.value === 'boolean') {
          return TokenType.BOOLEAN;
        }
        break;
      case 'BinaryExpression':
      case 'UnaryExpression':
        return TokenType.OPERATOR;
      case 'Keyword':
        return TokenType.KEYWORD;
      default:
        return undefined;
    }
  }

  private async getTokenModifiersFromASTNode(node: any): Promise<number> {
    let modifiers = 0;

    // Mark built-in functions as default library
    if (node.type === 'FunctionCall' && this.isBuiltInFunction(node.name)) {
      modifiers |= (1 << TokenModifier.DEFAULT_LIBRARY);
    }

    // Mark FHIR resource types as readonly
    if (node.type === 'Identifier' && await this.isFHIRResourceType(node.value)) {
      modifiers |= (1 << TokenModifier.READONLY);
    }

    return modifiers;
  }

  private async extractTokensWithRegex(lineText: string, lineNumber: number): Promise<SemanticToken[]> {
    const tokens: SemanticToken[] = [];

    // Get operators and keywords from Registry API
    const operators = this.functionRegistry.getOperators();
    const keywords = this.functionRegistry.getKeywords();
    
    // Build dynamic regex patterns
    const wordOperatorsList = operators
      .filter(op => /^[a-zA-Z]+$/.test(op.symbol))
      .map(op => op.symbol);
    
    const symbolOperatorsList = operators
      .filter(op => !/^[a-zA-Z]+$/.test(op.symbol))
      .map(op => op.symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) // Escape regex chars
      .sort((a, b) => b.length - a.length); // Sort by length to match longer operators first
    
    const keywordsList = keywords.map(kw => kw.keyword);
    
    // Create regex strings
    const wordOperators = wordOperatorsList.length > 0 ? wordOperatorsList.join('|') : '';
    const symbolOperators = symbolOperatorsList.length > 0 ? symbolOperatorsList.join('|') : '';
    const keywordList = keywordsList.length > 0 ? keywordsList.join('|') : '';

    // Get FHIR resource types regex asynchronously
    const fhirResourceRegex = await this.getFHIRResourceTypeRegex();

    // Define regex patterns for different token types
    const patterns = [
      // Functions (word followed by opening parenthesis)
      {
        regex: /\b(\w+)(?=\s*\()/g,
        type: TokenType.FUNCTION,
        modifiers: (1 << TokenModifier.DEFAULT_LIBRARY)
      },
      // FHIR resource types - dynamically generated from model provider
      {
        regex: fhirResourceRegex,
        type: TokenType.PROPERTY,
        modifiers: (1 << TokenModifier.READONLY)
      },
      // Properties (words after dots, not followed by parentheses)
      {
        regex: /(?<=\.)([a-zA-Z_]\w*)(?!\s*\()/g,
        type: TokenType.PROPERTY,
        modifiers: 0
      },
      // String literals
      {
        regex: /'[^']*'|"[^"]*"/g,
        type: TokenType.STRING,
        modifiers: 0
      },
      // Number literals
      {
        regex: /\b\d+(?:\.\d+)?\b/g,
        type: TokenType.NUMBER,
        modifiers: 0
      },
      // Boolean literals
      {
        regex: /\b(true|false)\b/g,
        type: TokenType.BOOLEAN,
        modifiers: 0
      },
      // Keywords (boolean literals and reserved words)
      {
        regex: keywordList ? new RegExp(`\\b(${keywordList})\\b`, 'g') : /\b(true|false|null)\b/g,
        type: TokenType.KEYWORD,
        modifiers: 0
      },
      // Word-based operators
      {
        regex: wordOperators ? new RegExp(`\\b(${wordOperators})\\b`, 'g') : /\b(and|or|xor|implies)\b/g,
        type: TokenType.OPERATOR,
        modifiers: 0
      },
      // Symbol operators
      {
        regex: symbolOperators ? new RegExp(`(${symbolOperators})`, 'g') : /(<=|>=|!=|<|>|=)/g,
        type: TokenType.OPERATOR,
        modifiers: 0
      }
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.regex.exec(lineText)) !== null) {
        tokens.push({
          line: lineNumber,
          startChar: match.index,
          length: match[0].length,
          tokenType: pattern.type,
          tokenModifiers: pattern.modifiers
        });
      }
    });

    return tokens;
  }

  private buildSemanticTokens(tokens: SemanticToken[]): SemanticTokens {
    const builder = new SemanticTokensBuilder();

    // Sort tokens by line, then by character
    tokens.sort((a, b) => {
      if (a.line !== b.line) {
        return a.line - b.line;
      }
      return a.startChar - b.startChar;
    });

    // Add tokens to builder
    tokens.forEach(token => {
      builder.push(
        token.line,
        token.startChar,
        token.length,
        token.tokenType,
        token.tokenModifiers
      );
    });

    return builder.build();
  }

  private isBuiltInFunction(name: string): boolean {
    // Use Registry API to check if function exists
    return Boolean(this.functionRegistry.getFunction(name));
  }

  private async isFHIRResourceType(name: string): Promise<boolean> {
    try {
      // Use model provider to check if it's a valid FHIR resource type
      return await this.fhirPathService.isValidResourceType(name);
    } catch (error) {
      console.warn('Failed to validate FHIR resource type:', error);
      return false;
    }
  }

  private async getFHIRResourceTypeRegex(): Promise<RegExp> {
    try {
      // Get resource types from model provider
      const resourceTypes = await this.fhirPathService.getAvailableResourceTypes();
      
      if (!Array.isArray(resourceTypes) || resourceTypes.length === 0) {
        // Return a regex that matches nothing if no resource types available
        return /(?!)/g;
      }
      
      // Create regex pattern that matches any of the resource types as word boundaries
      const pattern = resourceTypes
        .map(type => type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) // Escape regex special characters
        .join('|');
      
      return new RegExp(`\\b(${pattern})\\b`, 'g');
    } catch (error) {
      console.warn('Failed to get FHIR resource types for regex:', error);
      return /(?!)/g; // Return regex that matches nothing
    }
  }

  /**
   * Analyze semantic tokens with enhanced FHIR context
   */
  async analyzeEnhancedSemanticTokens(
    text: string,
    document: TextDocument,
    resourceType?: string
  ): Promise<SemanticTokenAnalysisResult> {
    const startTime = Date.now();
    const enhancedTokens: EnhancedSemanticToken[] = [];
    const errors: any[] = [];
    let modelProviderCalls = 0;

    this.enhancedTokenBuilder.clear();

    const lines = text.split('\n');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      
      if (line.trim().length === 0) {
        continue;
      }

      try {
        const context: TokenAnalysisContext = {
          resourceType,
          lineNumber: lineIndex,
          columnNumber: 0,
          documentText: text
        };

        // Analyze line with enhanced context
        const lineTokens = await this.analyzeLineWithEnhancedContext(line, context);
        enhancedTokens.push(...lineTokens);
        
        // Count ModelProvider calls for performance tracking
        modelProviderCalls += lineTokens.filter(t => t.fhirContext).length;

      } catch (error) {
        errors.push({
          message: `Token analysis failed: ${error}`,
          range: {
            start: { line: lineIndex, character: 0 },
            end: { line: lineIndex, character: line.length }
          },
          severity: 'warning' as const
        });
      }
    }

    const analysisTime = Date.now() - startTime;

    return {
      tokens: enhancedTokens,
      errors,
      performance: {
        analysisTimeMs: analysisTime,
        tokensAnalyzed: enhancedTokens.length,
        modelProviderCalls
      }
    };
  }

  /**
   * Analyze a single line with enhanced FHIR context
   */
  async analyzeLineWithEnhancedContext(
    line: string,
    context: TokenAnalysisContext
  ): Promise<EnhancedSemanticToken[]> {
    const tokens: EnhancedSemanticToken[] = [];

    // Try to parse the line to get AST information first
    try {
      const parseResult = this.fhirPathService.parse(line);
      if (parseResult.success && parseResult.ast) {
        tokens.push(...await this.extractEnhancedTokensFromAST(parseResult.ast, context));
      } else {
        // Fallback to enhanced regex-based analysis
        tokens.push(...await this.extractEnhancedTokensWithRegex(line, context));
      }
    } catch (error) {
      // If parsing fails, use enhanced regex approach
      tokens.push(...await this.extractEnhancedTokensWithRegex(line, context));
    }

    return tokens;
  }

  /**
   * Extract enhanced tokens from AST with FHIR context
   */
  async extractEnhancedTokensFromAST(
    ast: any,
    context: TokenAnalysisContext
  ): Promise<EnhancedSemanticToken[]> {
    const tokens: EnhancedSemanticToken[] = [];

    const traverse = async (node: any, currentPath: string[] = []) => {
      if (!node || !node.type) {
        return;
      }

      const start = node.location?.start || { offset: 0 };
      const end = node.location?.end || { offset: 0 };

      if (start.offset !== undefined && end.offset !== undefined) {
        const tokenLength = Math.max(1, end.offset - start.offset);
        
        // Classify token with enhanced FHIR context
        const classification = await this.classifyTokenWithEnhancedContext(
          node,
          currentPath,
          context
        );

        if (classification) {
          const enhancedToken: EnhancedSemanticToken = {
            line: context.lineNumber,
            startChar: start.offset,
            length: tokenLength,
            tokenType: classification.tokenType,
            tokenModifiers: classification.modifiers.reduce((bits, mod) => bits | (1 << mod), 0),
            fhirContext: classification.context ? {
              resourceType: context.resourceType,
              propertyPath: currentPath,
              ...classification.context
            } : undefined
          };

          tokens.push(enhancedToken);
        }
      }

      // Update path for property navigation
      let nextPath = currentPath;
      if (node.type === 'Identifier' || node.type === 'MemberExpression') {
        nextPath = [...currentPath, node.value || node.property];
      }

      // Recursively process child nodes
      if (node.children && Array.isArray(node.children)) {
        await Promise.all(node.children.map(child => traverse(child, nextPath)));
      }

      for (const prop of ['left', 'right', 'expression', 'condition', 'projection']) {
        if (node[prop]) {
          await traverse(node[prop], nextPath);
        }
      }

      if (node.arguments && Array.isArray(node.arguments)) {
        await Promise.all(node.arguments.map(arg => traverse(arg, nextPath)));
      }
    };

    await traverse(ast);
    return tokens;
  }

  /**
   * Extract enhanced tokens using regex with FHIR context
   */
  async extractEnhancedTokensWithRegex(
    lineText: string,
    context: TokenAnalysisContext
  ): Promise<EnhancedSemanticToken[]> {
    const tokens: EnhancedSemanticToken[] = [];

    // Pattern to match property paths (e.g., Patient.name.family, Observation.valueString)
    const propertyPathPattern = /\b(\w+(?:\.\w+)*)\b/g;
    let match;

    while ((match = propertyPathPattern.exec(lineText)) !== null) {
      const [fullMatch] = match;
      const start = match.index;
      const end = start + fullMatch.length;
      const propertyPath = fullMatch.split('.');

      // Skip if it's a function call or single property
      if (propertyPath.length < 2 || lineText.substring(end, end + 1) === '(') {
        continue;
      }

      // Analyze each property in the path
      for (let i = 0; i < propertyPath.length; i++) {
        const property = propertyPath[i];
        const currentPath = propertyPath.slice(0, i + 1);
        const propertyStart = start + propertyPath.slice(0, i).join('.').length + (i > 0 ? 1 : 0);
        const propertyLength = property.length;

        const enhancedToken = await this.classifyPropertyToken(
          property,
          currentPath,
          context,
          propertyStart,
          propertyLength
        );

        if (enhancedToken) {
          tokens.push(enhancedToken);
        }
      }
    }

    return tokens;
  }

  /**
   * Classify a property token with enhanced FHIR context
   */
  async classifyPropertyToken(
    property: string,
    currentPath: string[],
    context: TokenAnalysisContext,
    startChar: number,
    length: number
  ): Promise<EnhancedSemanticToken | null> {
    if (!this.modelProviderService || !context.resourceType) {
      // Fallback to basic classification without ModelProvider
      return this.createBasicPropertyToken(property, context, startChar, length);
    }

    try {
      // Check if this is a choice type property
      if (TokenTypeUtils.isChoiceTypeProperty(property)) {
        return await this.createChoiceTypeToken(property, currentPath, context, startChar, length);
      }

      // Check if this is an inherited property
      if (TokenTypeUtils.isLikelyInheritedProperty(property)) {
        return await this.createInheritedPropertyToken(property, context, startChar, length);
      }

      // Check for constraint violations
      const constraintViolation = await this.checkConstraintViolations(property, currentPath, context);
      if (constraintViolation) {
        return this.createConstraintViolationToken(property, constraintViolation, context, startChar, length);
      }

      // Default property classification with type information
      return await this.createEnhancedPropertyToken(property, currentPath, context, startChar, length);

    } catch (error) {
      console.error('Error classifying property token:', error);
      return this.createBasicPropertyToken(property, context, startChar, length);
    }
  }

  /**
   * Create a choice type token with enhanced context
   */
  async createChoiceTypeToken(
    property: string,
    currentPath: string[],
    context: TokenAnalysisContext,
    startChar: number,
    length: number
  ): Promise<EnhancedSemanticToken> {
    if (!this.modelProviderService || !context.resourceType) {
      return this.createBasicPropertyToken(property, context, startChar, length)!;
    }

    const baseProperty = TokenTypeUtils.getChoiceBaseProperty(property);
    const dataType = TokenTypeUtils.getChoiceDataType(property);

    try {
      const validationResult = await this.modelProviderService.validateChoiceProperty(
        context.resourceType,
        baseProperty,
        property
      );

      const modifiers: EnhancedTokenModifier[] = [
        validationResult.isValid 
          ? EnhancedTokenModifier.CHOICE_SPECIFIC 
          : EnhancedTokenModifier.CONSTRAINT_ERROR
      ];

      return {
        line: context.lineNumber,
        startChar,
        length,
        tokenType: EnhancedTokenType.CHOICE_TYPE,
        tokenModifiers: modifiers.reduce((bits, mod) => bits | (1 << mod), 0),
        fhirContext: {
          resourceType: context.resourceType,
          propertyPath: currentPath,
          dataType,
          isChoiceType: true,
          choiceTypes: validationResult.validChoices
        }
      };
    } catch (error) {
      return this.createBasicPropertyToken(property, context, startChar, length)!;
    }
  }

  /**
   * Create an inherited property token
   */
  async createInheritedPropertyToken(
    property: string,
    context: TokenAnalysisContext,
    startChar: number,
    length: number
  ): Promise<EnhancedSemanticToken> {
    const modifiers: EnhancedTokenModifier[] = [EnhancedTokenModifier.INHERITED];

    return {
      line: context.lineNumber,
      startChar,
      length,
      tokenType: EnhancedTokenType.INHERITED_PROPERTY,
      tokenModifiers: modifiers.reduce((bits, mod) => bits | (1 << mod), 0),
      fhirContext: {
        resourceType: context.resourceType,
        propertyPath: [property],
        isInherited: true
      }
    };
  }

  /**
   * Create a constraint violation token
   */
  createConstraintViolationToken(
    property: string,
    violation: ConstraintViolationContext,
    context: TokenAnalysisContext,
    startChar: number,
    length: number
  ): EnhancedSemanticToken {
    const modifiers: EnhancedTokenModifier[] = [EnhancedTokenModifier.CONSTRAINT_ERROR];

    return {
      line: context.lineNumber,
      startChar,
      length,
      tokenType: EnhancedTokenType.CONSTRAINT_VIOLATION,
      tokenModifiers: modifiers.reduce((bits, mod) => bits | (1 << mod), 0),
      fhirContext: {
        resourceType: context.resourceType,
        propertyPath: [property],
        constraints: [{
          type: violation.constraintType,
          severity: violation.severity,
          description: `${violation.constraintType} constraint violation`,
          isViolated: true
        }]
      }
    };
  }

  /**
   * Create an enhanced property token with type information
   */
  async createEnhancedPropertyToken(
    property: string,
    currentPath: string[],
    context: TokenAnalysisContext,
    startChar: number,
    length: number
  ): Promise<EnhancedSemanticToken> {
    if (!this.modelProviderService || !context.resourceType) {
      return this.createBasicPropertyToken(property, context, startChar, length)!;
    }

    try {
      const typeInfo = await this.modelProviderService.getEnhancedTypeInfo(
        context.resourceType,
        currentPath.join('.')
      );

      const isRequired = typeInfo?.constraints.required || 
        TokenTypeUtils.isLikelyRequiredProperty(property, context.resourceType);

      const modifiers: EnhancedTokenModifier[] = [];
      if (isRequired) {
        modifiers.push(EnhancedTokenModifier.REQUIRED);
      } else {
        modifiers.push(EnhancedTokenModifier.OPTIONAL);
      }

      return {
        line: context.lineNumber,
        startChar,
        length,
        tokenType: isRequired ? EnhancedTokenType.REQUIRED_PROPERTY : EnhancedTokenType.PROPERTY,
        tokenModifiers: modifiers.reduce((bits, mod) => bits | (1 << mod), 0),
        fhirContext: {
          resourceType: context.resourceType,
          propertyPath: currentPath,
          dataType: typeInfo?.type.name,
          cardinality: typeInfo?.constraints.cardinality
        }
      };
    } catch (error) {
      return this.createBasicPropertyToken(property, context, startChar, length)!;
    }
  }

  /**
   * Create a basic property token without enhanced context
   */
  createBasicPropertyToken(
    property: string,
    context: TokenAnalysisContext,
    startChar: number,
    length: number
  ): EnhancedSemanticToken | null {
    return {
      line: context.lineNumber,
      startChar,
      length,
      tokenType: EnhancedTokenType.PROPERTY,
      tokenModifiers: 0,
      fhirContext: {
        resourceType: context.resourceType,
        propertyPath: [property]
      }
    };
  }

  /**
   * Check for constraint violations in property usage
   */
  async checkConstraintViolations(
    property: string,
    currentPath: string[],
    context: TokenAnalysisContext
  ): Promise<ConstraintViolationContext | null> {
    if (!this.modelProviderService || !context.resourceType) {
      return null;
    }

    try {
      const navigationResult = await this.modelProviderService.navigatePropertyPath(
        context.resourceType,
        currentPath
      );

      if (!navigationResult.isValid && navigationResult.errors.length > 0) {
        return {
          constraintType: 'type',
          severity: 'error',
          suggestedFix: `Property '${property}' not found`
        };
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Classify token with enhanced FHIR context
   */
  async classifyTokenWithEnhancedContext(
    node: any,
    currentPath: string[],
    context: TokenAnalysisContext
  ): Promise<TokenClassification | null> {
    const baseClassification = this.getBasicTokenClassification(node);
    
    if (!baseClassification) {
      return null;
    }

    // Enhance classification with FHIR context if ModelProvider is available
    if (this.modelProviderService && node.type === 'Identifier') {
      return await this.enhancePropertyClassification(node.value, currentPath, context, baseClassification);
    }

    return {
      tokenType: baseClassification.tokenType,
      modifiers: baseClassification.modifiers,
      confidence: 0.8
    };
  }

  /**
   * Get basic token classification without FHIR context
   */
  getBasicTokenClassification(node: any): { tokenType: EnhancedTokenType; modifiers: EnhancedTokenModifier[] } | null {
    switch (node.type) {
      case 'FunctionCall':
        return {
          tokenType: EnhancedTokenType.FUNCTION,
          modifiers: [EnhancedTokenModifier.DEFAULT_LIBRARY]
        };
      case 'Identifier':
      case 'MemberExpression':
        return {
          tokenType: EnhancedTokenType.PROPERTY,
          modifiers: []
        };
      case 'Literal':
        if (typeof node.value === 'string') {
          return { tokenType: EnhancedTokenType.STRING, modifiers: [] };
        } else if (typeof node.value === 'number') {
          return { tokenType: EnhancedTokenType.NUMBER, modifiers: [] };
        } else if (typeof node.value === 'boolean') {
          return { tokenType: EnhancedTokenType.BOOLEAN, modifiers: [] };
        }
        break;
      case 'BinaryExpression':
      case 'UnaryExpression':
        return {
          tokenType: EnhancedTokenType.OPERATOR,
          modifiers: []
        };
      case 'Keyword':
        return {
          tokenType: EnhancedTokenType.KEYWORD,
          modifiers: []
        };
    }
    return null;
  }

  /**
   * Enhance property classification with FHIR context
   */
  async enhancePropertyClassification(
    property: string,
    currentPath: string[],
    context: TokenAnalysisContext,
    baseClassification: { tokenType: EnhancedTokenType; modifiers: EnhancedTokenModifier[] }
  ): Promise<TokenClassification> {
    if (!this.modelProviderService || !context.resourceType) {
      return {
        tokenType: baseClassification.tokenType,
        modifiers: baseClassification.modifiers,
        confidence: 0.6
      };
    }

    try {
      // Check if it's a choice type
      if (TokenTypeUtils.isChoiceTypeProperty(property)) {
        return {
          tokenType: EnhancedTokenType.CHOICE_TYPE,
          modifiers: [EnhancedTokenModifier.CHOICE_SPECIFIC],
          confidence: 0.9
        };
      }

      // Check if it's inherited
      if (TokenTypeUtils.isLikelyInheritedProperty(property)) {
        return {
          tokenType: EnhancedTokenType.INHERITED_PROPERTY,
          modifiers: [EnhancedTokenModifier.INHERITED],
          confidence: 0.85
        };
      }

      // Check if it's required
      const isRequired = TokenTypeUtils.isLikelyRequiredProperty(property, context.resourceType);
      if (isRequired) {
        return {
          tokenType: EnhancedTokenType.REQUIRED_PROPERTY,
          modifiers: [EnhancedTokenModifier.REQUIRED],
          confidence: 0.8
        };
      }

      return {
        tokenType: baseClassification.tokenType,
        modifiers: [...baseClassification.modifiers, EnhancedTokenModifier.OPTIONAL],
        confidence: 0.7
      };
    } catch (error) {
      return {
        tokenType: baseClassification.tokenType,
        modifiers: baseClassification.modifiers,
        confidence: 0.5
      };
    }
  }

  /**
   * Build semantic tokens from enhanced token analysis
   */
  buildEnhancedSemanticTokens(enhancedTokens: EnhancedSemanticToken[]): SemanticTokens {
    const builder = new SemanticTokensBuilder();

    // Sort tokens by line and character position
    const sortedTokens = enhancedTokens.sort((a, b) => {
      if (a.line !== b.line) {
        return a.line - b.line;
      }
      return a.startChar - b.startChar;
    });

    for (const token of sortedTokens) {
      builder.push(
        token.line,
        token.startChar,
        token.length,
        token.tokenType,
        token.tokenModifiers
      );
    }

    return builder.build();
  }

  /**
   * Extract resource type from document text
   */
  extractResourceTypeFromDocument(text: string): string | undefined {
    // Look for patterns like "Patient.name" or "@Patient" 
    const resourceTypeMatch = text.match(/\b([A-Z]\w*)\./);
    if (resourceTypeMatch) {
      const candidateType = resourceTypeMatch[1];
      // Verify it's a valid FHIR resource type
      if (this.fhirPathService.isValidResourceType && this.fhirPathService.isValidResourceType(candidateType)) {
        return candidateType;
      }
    }

    // Look for explicit resource type declarations
    const declarationMatch = text.match(/@([A-Z]\w*)/);
    if (declarationMatch) {
      return declarationMatch[1];
    }

    return undefined;
  }
}
