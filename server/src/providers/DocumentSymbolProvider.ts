import {
  DocumentSymbol,
  SymbolInformation,
  Connection,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import {
  IDocumentSymbolProvider,
  toDocumentSymbol,
  toSymbolInformation,
} from '../types/SymbolTypes';

import { SymbolService } from '../services/SymbolService';

/**
 * Provider for document symbols in FHIRPath expressions
 */
export class DocumentSymbolProvider implements IDocumentSymbolProvider {
  constructor(
    private connection: Connection,
    private symbolService: SymbolService
  ) {}

  /**
   * Provide document symbols for the given document
   */
  provideDocumentSymbols(document: TextDocument): DocumentSymbol[] {
    try {
      this.connection.console.log(`Providing document symbols for ${document.uri}`);

      const extractionResult = this.symbolService.extractDocumentSymbols(document);
      
      if (extractionResult.errors.length > 0) {
        this.connection.console.warn(`Symbol extraction errors: ${extractionResult.errors.join(', ')}`);
      }

      if (extractionResult.warnings.length > 0) {
        this.connection.console.warn(`Symbol extraction warnings: ${extractionResult.warnings.join(', ')}`);
      }

      // Convert FHIRPath symbols to LSP DocumentSymbols
      const documentSymbols = extractionResult.symbols.map(symbol => {
        const docSymbol = toDocumentSymbol(symbol);
        
        // Add FHIRPath-specific details
        if (symbol.fhirType) {
          docSymbol.detail = `${docSymbol.detail || ''} (${symbol.fhirType})`.trim();
        }
        
        if (symbol.fhirPath) {
          docSymbol.detail = `${docSymbol.detail || ''} [${symbol.fhirPath}]`.trim();
        }

        return docSymbol;
      });

      this.connection.console.log(`Found ${documentSymbols.length} document symbols`);
      return documentSymbols;

    } catch (error) {
      this.connection.console.error(`Error providing document symbols: ${error}`);
      return [];
    }
  }

  /**
   * Provide flat symbol information (alternative format)
   */
  provideSymbolInformation(document: TextDocument): SymbolInformation[] {
    try {
      const extractionResult = this.symbolService.extractDocumentSymbols(document);
      
      const symbolInformation = extractionResult.symbols.map(symbol => {
        const symInfo = toSymbolInformation(symbol);
        symInfo.location.uri = document.uri;
        return symInfo;
      });

      return symbolInformation;

    } catch (error) {
      this.connection.console.error(`Error providing symbol information: ${error}`);
      return [];
    }
  }

  /**
   * Get symbols filtered by kind
   */
  getSymbolsByKind(document: TextDocument, kinds: string[]): DocumentSymbol[] {
    const allSymbols = this.provideDocumentSymbols(document);
    
    return allSymbols.filter(symbol => {
      // Convert SymbolKind enum values to strings for comparison
      const symbolKindString = this.symbolKindToString(symbol.kind);
      return kinds.includes(symbolKindString);
    });
  }

  /**
   * Get symbol at specific position
   */
  getSymbolAtPosition(document: TextDocument, position: { line: number; character: number }): DocumentSymbol | null {
    const allSymbols = this.provideDocumentSymbols(document);
    
    for (const symbol of allSymbols) {
      if (this.isPositionInRange(position, symbol.range)) {
        return symbol;
      }
      
      // Check children recursively
      if (symbol.children) {
        for (const child of symbol.children) {
          if (this.isPositionInRange(position, child.range)) {
            return child;
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Convert SymbolKind enum to string
   */
  private symbolKindToString(kind: number): string {
    // Map SymbolKind enum values to strings
    const kindMap: { [key: number]: string } = {
      1: 'file',
      2: 'module', 
      3: 'namespace',
      4: 'package',
      5: 'class',
      6: 'method',
      7: 'property',
      8: 'field',
      9: 'constructor',
      10: 'enum',
      11: 'interface',
      12: 'function',
      13: 'variable',
      14: 'constant',
      15: 'string',
      16: 'number',
      17: 'boolean',
      18: 'array',
      19: 'object',
      20: 'key',
      21: 'null',
      22: 'enummember',
      23: 'struct',
      24: 'event',
      25: 'operator',
      26: 'typeparameter'
    };
    
    return kindMap[kind] || 'unknown';
  }

  /**
   * Check if position is within range
   */
  private isPositionInRange(
    position: { line: number; character: number },
    range: { start: { line: number; character: number }; end: { line: number; character: number } }
  ): boolean {
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
}