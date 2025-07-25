import {
  Range,
  Position,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import {
  FHIRPathSymbol,
  FHIRPathSymbolKind,
  SymbolExtractionResult,
  SymbolContext,
} from '../types/SymbolTypes';

import { FHIRPathService } from '../parser/FHIRPathService';
import { FHIRPathFunctionRegistry } from './FHIRPathFunctionRegistry';

/**
 * Service for analyzing and extracting symbols from FHIRPath expressions
 */
export class SymbolService {
  constructor(
    private fhirPathService: FHIRPathService,
    private functionRegistry: FHIRPathFunctionRegistry
  ) {}

  /**
   * Extract all symbols from a document
   */
  extractDocumentSymbols(document: TextDocument): SymbolExtractionResult {
    const text = document.getText();
    const symbols: FHIRPathSymbol[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Split document into expressions (by lines for now)
      const lines = text.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('//')) {
          continue; // Skip empty lines and comments
        }

        try {
          const lineSymbols = this.extractLineSymbols(document, i, line);
          symbols.push(...lineSymbols);
        } catch (error) {
          errors.push(`Line ${i + 1}: ${error}`);
        }
      }
    } catch (error) {
      errors.push(`Document parsing error: ${error}`);
    }

    return { symbols, errors, warnings };
  }

  /**
   * Extract symbols from a single line/expression
   */
  private extractLineSymbols(
    document: TextDocument,
    lineNumber: number,
    expression: string
  ): FHIRPathSymbol[] {
    const symbols: FHIRPathSymbol[] = [];
    
    try {
      // Try to parse the expression using the FHIRPath service
      const parseResult = this.fhirPathService.parse(expression);
      
      if (parseResult && parseResult.ast) {
        // Extract symbols from AST
        const astSymbols = this.extractFromAST(parseResult.ast, document, lineNumber);
        symbols.push(...astSymbols);
      } else {
        // If no AST, fall back to regex
        const regexSymbols = this.extractWithRegex(expression, document, lineNumber);
        symbols.push(...regexSymbols);
      }
    } catch (parseError) {
      // If parsing fails, try to extract symbols using regex patterns
      const regexSymbols = this.extractWithRegex(expression, document, lineNumber);
      symbols.push(...regexSymbols);
    }

    // If we still have no symbols, something went wrong - force regex extraction
    if (symbols.length === 0 && expression.trim().length > 0) {
      const regexSymbols = this.extractWithRegex(expression, document, lineNumber);
      symbols.push(...regexSymbols);
    }

    return symbols;
  }

  /**
   * Extract symbols from parsed AST
   */
  private extractFromAST(ast: any, document: TextDocument, lineNumber: number): FHIRPathSymbol[] {
    const symbols: FHIRPathSymbol[] = [];
    
    // This is a simplified implementation - would need to be expanded based on actual AST structure
    if (ast.type === 'PathExpression') {
      // Handle path expressions like Patient.name.family
      const pathSymbols = this.extractPathSymbols(ast, document, lineNumber);
      symbols.push(...pathSymbols);
    } else if (ast.type === 'FunctionCall') {
      // Handle function calls like where(), select(), etc.
      const functionSymbol = this.extractFunctionSymbol(ast, document, lineNumber);
      if (functionSymbol) {
        symbols.push(functionSymbol);
      }
    }

    // Recursively process child nodes
    if (ast.children) {
      for (const child of ast.children) {
        const childSymbols = this.extractFromAST(child, document, lineNumber);
        symbols.push(...childSymbols);
      }
    }

    return symbols;
  }

  /**
   * Extract symbols using regex patterns (fallback when parsing fails)
   */
  private extractWithRegex(
    expression: string,
    document: TextDocument,
    lineNumber: number
  ): FHIRPathSymbol[] {
    const symbols: FHIRPathSymbol[] = [];
    
    // Extract function calls: word followed by parentheses
    const functionPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
    let match;
    
    while ((match = functionPattern.exec(expression)) !== null) {
      const functionName = match[1];
      const startPos = match.index;
      const endPos = startPos + functionName.length;
      
      const range = Range.create(
        Position.create(lineNumber, startPos),
        Position.create(lineNumber, endPos)
      );

      symbols.push({
        name: functionName,
        kind: this.isBuiltInFunction(functionName) 
          ? FHIRPathSymbolKind.Function 
          : FHIRPathSymbolKind.Variable,
        range,
        selectionRange: range,
        detail: this.getFunctionDetail(functionName),
        isBuiltIn: this.isBuiltInFunction(functionName)
      });
    }

    // Extract individual identifiers (including resources and properties)
    const identifierPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
    const processedRanges = new Set<string>();
    
    while ((match = identifierPattern.exec(expression)) !== null) {
      const identifier = match[1];
      const startPos = match.index;
      const endPos = startPos + identifier.length;
      const rangeKey = `${lineNumber}:${startPos}:${endPos}`;
      
      // Skip if we already processed this range (avoid duplicates from function pattern)
      if (processedRanges.has(rangeKey)) {
        continue;
      }
      processedRanges.add(rangeKey);
      
      const range = Range.create(
        Position.create(lineNumber, startPos),
        Position.create(lineNumber, endPos)
      );

      // Determine if this is a function call by looking ahead
      const nextChar = expression[endPos];
      const isFunction = nextChar === '(' || /\s*\(/.test(expression.substring(endPos));
      
      if (isFunction && this.isBuiltInFunction(identifier)) {
        symbols.push({
          name: identifier,
          kind: FHIRPathSymbolKind.Function,
          range,
          selectionRange: range,
          detail: this.getFunctionDetail(identifier),
          isBuiltIn: true
        });
      } else if (this.isFHIRResource(identifier)) {
        symbols.push({
          name: identifier,
          kind: FHIRPathSymbolKind.Resource,
          range,
          selectionRange: range,
          fhirType: identifier
        });
      } else {
        // Look for context - check if this follows a dot pattern
        const beforeDot = expression.substring(0, startPos).match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\.\s*$/);
        const context = beforeDot ? beforeDot[1] : undefined;
        
        symbols.push({
          name: identifier,
          kind: FHIRPathSymbolKind.Property,
          range,
          selectionRange: range,
          context,
          fhirPath: context ? `${context}.${identifier}` : identifier
        });
      }
    }

    // Extract string literals
    const stringPattern = /'([^']*)'|"([^"]*)"/g;
    
    while ((match = stringPattern.exec(expression)) !== null) {
      const stringValue = match[1] || match[2];
      const startPos = match.index;
      const endPos = startPos + match[0].length;
      
      const range = Range.create(
        Position.create(lineNumber, startPos),
        Position.create(lineNumber, endPos)
      );

      symbols.push({
        name: `"${stringValue}"`,
        kind: FHIRPathSymbolKind.Literal,
        range,
        selectionRange: range,
        detail: `String literal: ${stringValue}`
      });
    }

    return symbols;
  }

  /**
   * Extract symbols from path expressions
   */
  private extractPathSymbols(ast: any, document: TextDocument, lineNumber: number): FHIRPathSymbol[] {
    // Simplified implementation - would need to be based on actual AST structure
    return [];
  }

  /**
   * Extract symbol from function call
   */
  private extractFunctionSymbol(ast: any, document: TextDocument, lineNumber: number): FHIRPathSymbol | null {
    // Simplified implementation - would need to be based on actual AST structure
    return null;
  }

  /**
   * Find symbol at a specific position
   */
  findSymbolAtPosition(document: TextDocument, position: Position): FHIRPathSymbol | null {
    const symbols = this.extractDocumentSymbols(document).symbols;
    
    for (const symbol of symbols) {
      if (this.isPositionInRange(position, symbol.range)) {
        return symbol;
      }
    }

    return null;
  }

  /**
   * Find all references to a symbol
   */
  findReferences(
    document: TextDocument,
    position: Position,
    includeDeclaration: boolean = true
  ): Range[] {
    const targetSymbol = this.findSymbolAtPosition(document, position);
    if (!targetSymbol) {
      return [];
    }

    const symbols = this.extractDocumentSymbols(document).symbols;
    const references: Range[] = [];

    for (const symbol of symbols) {
      if (symbol.name === targetSymbol.name && symbol.kind === targetSymbol.kind) {
        if (includeDeclaration || !this.rangesEqual(symbol.range, targetSymbol.range)) {
          references.push(symbol.range);
        }
      }
    }

    return references;
  }

  /**
   * Check if a function is built-in
   */
  private isBuiltInFunction(name: string): boolean {
    try {
      const functions = this.functionRegistry.getFunctions();
      return functions.some(func => func.name === name);
    } catch {
      // Fallback to common function names
      const commonFunctions = [
        'where', 'select', 'exists', 'all', 'empty', 'first', 'last',
        'count', 'distinct', 'union', 'intersect', 'exclude'
      ];
      return commonFunctions.includes(name.toLowerCase());
    }
  }

  /**
   * Check if a name is a FHIR resource
   */
  private isFHIRResource(name: string): boolean {
    const commonResources = [
      'Patient', 'Practitioner', 'Organization', 'Observation',
      'Condition', 'Procedure', 'MedicationRequest', 'DiagnosticReport',
      'Encounter', 'Bundle', 'OperationOutcome'
    ];
    return commonResources.includes(name);
  }

  /**
   * Get function detail information
   */
  private getFunctionDetail(name: string): string {
    try {
      const functions = this.functionRegistry.getFunctions();
      const func = functions.find(f => f.name === name);
      return func?.description || `Function: ${name}`;
    } catch {
      return `Function: ${name}`;
    }
  }

  /**
   * Check if position is within range
   */
  private isPositionInRange(position: Position, range: Range): boolean {
    if (position.line < range.start.line || position.line > range.end.line) {
      return false;
    }
    
    if (position.line === range.start.line && position.character < range.start.character) {
      return false;
    }
    
    if (position.line === range.end.line && position.character > range.end.character) {
      return false;
    }
    
    return true;
  }

  /**
   * Check if two ranges are equal
   */
  private rangesEqual(range1: Range, range2: Range): boolean {
    return (
      range1.start.line === range2.start.line &&
      range1.start.character === range2.start.character &&
      range1.end.line === range2.end.line &&
      range1.end.character === range2.end.character
    );
  }
}