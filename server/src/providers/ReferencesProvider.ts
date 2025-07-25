import {
  Location,
  Position,
  Range,
  Connection,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import {
  IReferencesProvider,
  FHIRPathReference,
} from '../types/SymbolTypes';

import { SymbolService } from '../services/SymbolService';

/**
 * Provider for find references functionality in FHIRPath expressions
 */
export class ReferencesProvider implements IReferencesProvider {
  constructor(
    private connection: Connection,
    private symbolService: SymbolService
  ) {}

  /**
   * Provide references for symbol at the given position
   */
  async provideReferences(
    document: TextDocument,
    position: Position,
    context: { includeDeclaration: boolean }
  ): Promise<Location[] | null> {
    try {
      this.connection.console.log(`Providing references for ${document.uri} at ${JSON.stringify(position)}`);

      const symbol = this.symbolService.findSymbolAtPosition(document, position);
      if (!symbol) {
        this.connection.console.log('No symbol found at position');
        return null;
      }

      this.connection.console.log(`Found symbol: ${symbol.name} (${symbol.kind})`);

      // Find references in the current document
      const references = this.findReferencesInDocument(
        document,
        symbol,
        context.includeDeclaration
      );
      
      if (references.length === 0) {
        this.connection.console.log(`No references found for symbol: ${symbol.name}`);
        return null;
      }

      this.connection.console.log(`Found ${references.length} references`);
      return references;

    } catch (error) {
      this.connection.console.error(`Error providing references: ${error}`);
      return null;
    }
  }

  /**
   * Find references in a single document
   */
  private findReferencesInDocument(
    document: TextDocument,
    targetSymbol: any,
    includeDeclaration: boolean
  ): Location[] {
    const references: Location[] = [];
    
    try {
      // Get all symbols from the document
      const extractionResult = this.symbolService.extractDocumentSymbols(document);
      
      for (const symbol of extractionResult.symbols) {
        // Check if this symbol matches our target
        if (this.isMatchingSymbol(symbol, targetSymbol)) {
          // Skip the declaration if not requested
          if (!includeDeclaration && this.rangesEqual(symbol.range, targetSymbol.range)) {
            continue;
          }

          references.push({
            uri: document.uri,
            range: symbol.range
          });
        }
      }

    } catch (error) {
      this.connection.console.error(`Error finding references in document: ${error}`);
    }

    return references;
  }

  /**
   * Find references across multiple documents (workspace-wide)
   */
  async findWorkspaceReferences(
    targetSymbol: any,
    documents: TextDocument[],
    includeDeclaration: boolean = true
  ): Promise<Location[]> {
    const allReferences: Location[] = [];

    for (const document of documents) {
      try {
        const documentReferences = this.findReferencesInDocument(
          document,
          targetSymbol,
          includeDeclaration
        );
        allReferences.push(...documentReferences);
      } catch (error) {
        this.connection.console.error(`Error finding references in ${document.uri}: ${error}`);
      }
    }

    return allReferences;
  }

  /**
   * Find references with additional context information
   */
  async findReferencesWithContext(
    document: TextDocument,
    position: Position,
    includeDeclaration: boolean = true
  ): Promise<FHIRPathReference[]> {
    const symbol = this.symbolService.findSymbolAtPosition(document, position);
    if (!symbol) {
      return [];
    }

    const locations = this.findReferencesInDocument(document, symbol, includeDeclaration);
    const references: FHIRPathReference[] = [];

    for (const location of locations) {
      const context = this.getContextForLocation(document, location.range);
      const kind = this.rangesEqual(location.range, symbol.range) ? 'definition' : 'usage';

      references.push({
        location,
        context,
        kind
      });
    }

    return references;
  }

  /**
   * Check if two symbols match (same name and compatible kinds)
   */
  private isMatchingSymbol(symbol1: any, symbol2: any): boolean {
    // Basic name matching
    if (symbol1.name !== symbol2.name) {
      return false;
    }

    // Kind should match or be compatible
    if (symbol1.kind !== symbol2.kind) {
      // Allow some cross-kind matching for flexible references
      const compatibleKinds = this.getCompatibleKinds(symbol2.kind);
      if (!compatibleKinds.includes(symbol1.kind)) {
        return false;
      }
    }

    // For properties, check context if available
    if (symbol1.fhirPath && symbol2.fhirPath) {
      return symbol1.fhirPath === symbol2.fhirPath;
    }

    if (symbol1.context && symbol2.context) {
      return symbol1.context === symbol2.context;
    }

    return true;
  }

  /**
   * Get compatible symbol kinds for cross-kind matching
   */
  private getCompatibleKinds(kind: string): string[] {
    const compatibilityMap: { [key: string]: string[] } = {
      'function': ['function'],
      'property': ['property', 'variable'],
      'resource': ['resource', 'variable'],
      'literal': ['literal', 'constant'],
      'variable': ['variable', 'property'],
      'operator': ['operator']
    };

    return compatibilityMap[kind] || [kind];
  }

  /**
   * Get context text around a location for display
   */
  private getContextForLocation(document: TextDocument, range: Range): string {
    try {
      // Get the entire line containing the reference
      const lineStart = Position.create(range.start.line, 0);
      const lineEnd = Position.create(range.start.line + 1, 0);
      const lineRange = Range.create(lineStart, lineEnd);
      const lineText = document.getText(lineRange).trim();

      // If the line is too long, truncate around the reference
      const maxContextLength = 100;
      if (lineText.length <= maxContextLength) {
        return lineText;
      }

      // Calculate relative position in line
      const relativeStart = range.start.character;
      const relativeEnd = range.end.character;
      
      // Try to center the reference in the context
      const halfContext = Math.floor(maxContextLength / 2);
      let contextStart = Math.max(0, relativeStart - halfContext);
      let contextEnd = Math.min(lineText.length, contextStart + maxContextLength);

      // Adjust if we hit the end
      if (contextEnd === lineText.length) {
        contextStart = Math.max(0, contextEnd - maxContextLength);
      }

      let context = lineText.substring(contextStart, contextEnd);
      
      // Add ellipsis if truncated
      if (contextStart > 0) {
        context = '...' + context;
      }
      if (contextEnd < lineText.length) {
        context = context + '...';
      }

      return context;
    } catch (error) {
      this.connection.console.error(`Error getting context for location: ${error}`);
      return '';
    }
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

  /**
   * Find references by name across document
   */
  findReferencesByName(
    document: TextDocument,
    symbolName: string,
    symbolKind?: string
  ): Location[] {
    const references: Location[] = [];
    
    try {
      const extractionResult = this.symbolService.extractDocumentSymbols(document);
      
      for (const symbol of extractionResult.symbols) {
        if (symbol.name === symbolName) {
          if (!symbolKind || symbol.kind === symbolKind) {
            references.push({
              uri: document.uri,
              range: symbol.range
            });
          }
        }
      }
    } catch (error) {
      this.connection.console.error(`Error finding references by name: ${error}`);
    }

    return references;
  }

  /**
   * Get reference statistics for a symbol
   */
  getReferenceStats(document: TextDocument, symbolName: string): {
    totalReferences: number;
    functionCalls: number;
    propertyAccess: number;
    literals: number;
  } {
    const stats = {
      totalReferences: 0,
      functionCalls: 0,
      propertyAccess: 0,
      literals: 0
    };

    try {
      const references = this.findReferencesByName(document, symbolName);
      stats.totalReferences = references.length;

      const extractionResult = this.symbolService.extractDocumentSymbols(document);
      
      for (const symbol of extractionResult.symbols) {
        if (symbol.name === symbolName) {
          switch (symbol.kind) {
            case 'function':
              stats.functionCalls++;
              break;
            case 'property':
              stats.propertyAccess++;
              break;
            case 'literal':
              stats.literals++;
              break;
          }
        }
      }
    } catch (error) {
      this.connection.console.error(`Error getting reference stats: ${error}`);
    }

    return stats;
  }
}