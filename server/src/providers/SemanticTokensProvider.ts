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
  constructor(private fhirPathService: FHIRPathService) {}

  async provideSemanticTokens(
    document: TextDocument,
    params: SemanticTokensParams
  ): Promise<SemanticTokens> {
    try {
      // Generate cache key based on document version
      const cacheKey = cacheService.generateSemanticTokensKey(document.uri, document.version);

      // Check cache first
      const cached = cacheService.getSemanticTokens(cacheKey);
      if (cached) {
        return cached;
      }

      // Generate tokens
      const text = document.getText();
      const tokens = await this.analyzeSemanticTokens(text, document);
      const result = this.buildSemanticTokens(tokens);

      // Cache the result
      cacheService.setSemanticTokens(cacheKey, result);

      return result;
    } catch (error) {
      console.error('Error providing semantic tokens:', error);
      return { data: [] };
    }
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
          tokens.push(...this.extractTokensFromAST(parseResult.ast, actualLineNumber, line));
        } else {
          // Fallback to regex-based tokenization
          tokens.push(...this.extractTokensWithRegex(line, actualLineNumber));
        }
      } catch (error) {
        // If parsing fails, use regex-based approach
        tokens.push(...this.extractTokensWithRegex(line, actualLineNumber));
      }
    }

    return tokens;
  }

  private extractTokensFromAST(ast: any, lineNumber: number, lineText: string): SemanticToken[] {
    const tokens: SemanticToken[] = [];

    // Recursive function to traverse AST nodes
    const traverse = (node: any) => {
      if (!node || !node.type) {
        return;
      }

      // Extract position information if available
      const start = node.location?.start || { offset: 0 };
      const end = node.location?.end || { offset: 0 };

      if (start.offset !== undefined && end.offset !== undefined) {
        const tokenLength = Math.max(1, end.offset - start.offset);
        const tokenType = this.getTokenTypeFromASTNode(node);
        const tokenModifiers = this.getTokenModifiersFromASTNode(node);

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
        node.children.forEach(traverse);
      }

      // Handle specific node properties that might contain child nodes
      ['left', 'right', 'expression', 'condition', 'projection'].forEach(prop => {
        if (node[prop]) {
          traverse(node[prop]);
        }
      });

      if (node.arguments && Array.isArray(node.arguments)) {
        node.arguments.forEach(traverse);
      }
    };

    traverse(ast);
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

  private getTokenModifiersFromASTNode(node: any): number {
    let modifiers = 0;

    // Mark built-in functions as default library
    if (node.type === 'FunctionCall' && this.isBuiltInFunction(node.name)) {
      modifiers |= (1 << TokenModifier.DEFAULT_LIBRARY);
    }

    // Mark FHIR resource types as readonly
    if (node.type === 'Identifier' && this.isFHIRResourceType(node.value)) {
      modifiers |= (1 << TokenModifier.READONLY);
    }

    return modifiers;
  }

  private extractTokensWithRegex(lineText: string, lineNumber: number): SemanticToken[] {
    const tokens: SemanticToken[] = [];

    // Define regex patterns for different token types
    const patterns = [
      // Functions (word followed by opening parenthesis)
      {
        regex: /\b(\w+)(?=\s*\()/g,
        type: TokenType.FUNCTION,
        modifiers: (1 << TokenModifier.DEFAULT_LIBRARY)
      },
      // FHIR resource types (common resource names at start or after dot)
      {
        regex: /\b(Patient|Observation|Condition|Procedure|MedicationRequest|DiagnosticReport|Encounter|Organization|Practitioner|Location|Device|Medication|Substance|AllergyIntolerance|Immunization)\b/g,
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
      // Keywords and operators (word-based)
      {
        regex: /\b(where|select|exists|all|empty|first|last|and|or|xor|implies|as|is|in|contains)\b/g,
        type: TokenType.KEYWORD,
        modifiers: 0
      },
      // Operators (symbols)
      {
        regex: /(<=|>=|!=|<|>|=)/g,
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
    const builtInFunctions = [
      'empty', 'exists', 'all', 'where', 'select', 'first', 'last', 'tail',
      'skip', 'take', 'distinct', 'count', 'contains', 'startsWith', 'endsWith',
      'matches', 'length', 'as', 'is', 'abs', 'ceiling', 'floor', 'round',
      'now', 'today'
    ];
    return builtInFunctions.includes(name);
  }

  private isFHIRResourceType(name: string): boolean {
    const fhirResourceTypes = [
      'Patient', 'Observation', 'Condition', 'Procedure', 'MedicationRequest',
      'DiagnosticReport', 'Encounter', 'Organization', 'Practitioner', 'Location',
      'Device', 'Medication', 'Substance', 'AllergyIntolerance', 'Immunization',
      'Bundle', 'Composition', 'DocumentReference', 'Binary', 'HealthcareService',
      'Endpoint', 'Schedule', 'Slot', 'Appointment', 'AppointmentResponse',
      'Account', 'ChargeItem', 'Coverage', 'EligibilityRequest', 'EligibilityResponse',
      'EnrollmentRequest', 'EnrollmentResponse', 'Claim', 'ClaimResponse', 'Invoice',
      'PaymentNotice', 'PaymentReconciliation', 'ExplanationOfBenefit'
    ];
    return fhirResourceTypes.includes(name);
  }
}
