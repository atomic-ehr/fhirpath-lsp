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
import { ModelProviderService } from '../services/ModelProviderService';
import {
  EnhancedReference,
  ReferenceType,
  UsageType,
  ReferenceContext,
  ReferenceResolutionResult,
  ReferenceFinderConfig,
  EnhancedReferenceBuilder,
  ReferenceAnalysisUtils,
  ChoiceTypeReferenceContext,
  InheritedReferenceContext,
  CrossResourceReferenceContext
} from './EnhancedReferenceTypes';

/**
 * Enhanced provider for find references functionality in FHIRPath expressions with FHIR-aware intelligence
 */
export class ReferencesProvider implements IReferencesProvider {
  private modelProviderService?: ModelProviderService;
  private defaultConfig: ReferenceFinderConfig = {
    includeInherited: true,
    includeChoiceTypes: true,
    includeCrossResource: true,
    includeSemanticMatches: false,
    maxResults: 100,
    minConfidence: 0.5,
    groupResults: true,
    sortBy: 'relevance'
  };

  constructor(
    private connection: Connection,
    private symbolService: SymbolService,
    modelProviderService?: ModelProviderService
  ) {
    this.modelProviderService = modelProviderService;
    if (this.modelProviderService) {
      this.connection.console.log('ReferencesProvider initialized with ModelProvider integration');
    }
  }

  /**
   * Provide references for symbol at the given position with FHIR-aware enhancement
   */
  async provideReferences(
    document: TextDocument,
    position: Position,
    context: { includeDeclaration: boolean }
  ): Promise<Location[] | null> {
    try {
      this.connection.console.log(`Providing enhanced references for ${document.uri} at ${JSON.stringify(position)}`);

      // Try enhanced reference finding first if ModelProvider is available
      if (this.modelProviderService?.isInitialized()) {
        const enhancedResult = await this.findEnhancedReferences(
          document,
          position,
          { ...this.defaultConfig, groupResults: false }
        );
        
        if (enhancedResult.references.length > 0) {
          const locations = enhancedResult.references.map(ref => ({
            uri: ref.uri,
            range: ref.range
          }));
          
          this.connection.console.log(`Found ${locations.length} enhanced references`);
          return locations;
        }
      }

      // Fallback to basic reference finding
      const symbol = this.symbolService.findSymbolAtPosition(document, position);
      if (!symbol) {
        this.connection.console.log('No symbol found at position');
        return null;
      }

      this.connection.console.log(`Found symbol: ${symbol.name} (${symbol.kind})`);

      const references = this.findReferencesInDocument(
        document,
        symbol,
        context.includeDeclaration
      );
      
      if (references.length === 0) {
        this.connection.console.log(`No references found for symbol: ${symbol.name}`);
        return null;
      }

      this.connection.console.log(`Found ${references.length} basic references`);
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
   * Enhanced reference finding with FHIR-aware intelligence
   */
  async findEnhancedReferences(
    document: TextDocument,
    position: Position,
    config: Partial<ReferenceFinderConfig> = {}
  ): Promise<ReferenceResolutionResult> {
    const finalConfig = { ...this.defaultConfig, ...config };
    const result: ReferenceResolutionResult = {
      references: [],
      grouped: [],
      summary: {
        totalReferences: 0,
        exactMatches: 0,
        choiceTypeMatches: 0,
        inheritedMatches: 0,
        crossResourceMatches: 0,
        semanticMatches: 0,
        resourceTypes: [],
        mostCommonUsage: UsageType.READ
      },
      errors: []
    };

    try {
      if (!this.modelProviderService?.isInitialized()) {
        result.errors.push({
          message: 'ModelProvider not available for enhanced references',
          code: 'NO_MODEL_PROVIDER',
          severity: 'warning'
        });
        return result;
      }

      // Get symbol at position
      const symbol = this.symbolService.findSymbolAtPosition(document, position);
      if (!symbol) {
        result.errors.push({
          message: 'No symbol found at position',
          code: 'NO_SYMBOL',
          severity: 'info'
        });
        return result;
      }

      this.connection.console.log(`Finding enhanced references for: ${symbol.name} (${symbol.kind})`);

      const builder = new EnhancedReferenceBuilder();

      // Find basic property references
      await this.findPropertyReferences(document, symbol, builder, finalConfig);

      // Find choice type references if enabled
      if (finalConfig.includeChoiceTypes) {
        await this.findChoiceTypeReferences(document, symbol, builder, finalConfig);
      }

      // Find inherited property references if enabled
      if (finalConfig.includeInherited) {
        await this.findInheritedReferences(document, symbol, builder, finalConfig);
      }

      // Find cross-resource references if enabled
      if (finalConfig.includeCrossResource) {
        await this.findCrossResourceReferences(document, symbol, builder, finalConfig);
      }

      result.references = builder.build();

      // Filter by confidence
      result.references = result.references.filter(ref => ref.confidence >= finalConfig.minConfidence);

      // Sort by relevance
      this.sortReferences(result.references, finalConfig.sortBy);

      // Limit results
      if (result.references.length > finalConfig.maxResults) {
        result.references = result.references.slice(0, finalConfig.maxResults);
      }

      // Group results if enabled
      if (finalConfig.groupResults) {
        result.grouped = ReferenceAnalysisUtils.groupReferences(result.references);
      }

      // Calculate summary
      result.summary = this.calculateReferenceSummary(result.references);

      this.connection.console.log(
        `Enhanced reference finding completed: ${result.references.length} references, ` +
        `${result.grouped.length} groups, ${result.errors.length} errors`
      );

      return result;

    } catch (error) {
      this.connection.console.error(`Error in enhanced reference finding: ${error}`);
      result.errors.push({
        message: `Enhanced reference finding error: ${(error as Error).message}`,
        code: 'ENHANCED_REFERENCE_ERROR',
        severity: 'error'
      });
      return result;
    }
  }

  /**
   * Find property references in the document
   */
  private async findPropertyReferences(
    document: TextDocument,
    symbol: any,
    builder: EnhancedReferenceBuilder,
    config: ReferenceFinderConfig
  ): Promise<void> {
    try {
      const basicReferences = this.findReferencesInDocument(document, symbol, true);
      
      for (const location of basicReferences) {
        const context = this.buildReferenceContext(document, location, symbol);
        const usage = ReferenceAnalysisUtils.classifyUsageType(
          symbol.name,
          context.lineText,
          context.parentExpression
        );
        
        builder.addPropertyReference(location, symbol.name, context, usage);
      }
    } catch (error) {
      this.connection.console.error(`Error finding property references: ${error}`);
    }
  }

  /**
   * Find choice type references (e.g., value -> valueString, valueQuantity)
   */
  private async findChoiceTypeReferences(
    document: TextDocument,
    symbol: any,
    builder: EnhancedReferenceBuilder,
    config: ReferenceFinderConfig
  ): Promise<void> {
    try {
      if (!this.modelProviderService?.isInitialized()) return;

      // Check if this could be a choice type
      const isChoiceProperty = this.modelProviderService.isChoiceProperty(symbol.name);
      const baseProperty = isChoiceProperty ? 
        this.modelProviderService.extractBaseProperty(symbol.name) : symbol.name;

      // Find all choice type variations
      const choicePattern = new RegExp(`\\b${baseProperty}[A-Z][a-zA-Z]*\\b`, 'g');
      const documentText = document.getText();
      let match;
      
      while ((match = choicePattern.exec(documentText)) !== null) {
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);
        const range = Range.create(startPos, endPos);
        const location: Location = { uri: document.uri, range };
        
        const choiceProperty = match[0];
        const choiceType = this.modelProviderService.extractChoiceType(choiceProperty);
        
        if (choiceType) {
          const resourceType = this.extractResourceTypeFromContext(document, startPos);
          const choiceContext: ChoiceTypeReferenceContext = {
            baseProperty,
            choiceProperty,
            availableChoices: [], // Would be populated from ModelProvider
            resourceType: resourceType || 'Unknown',
            propertyPath: [choiceProperty]
          };
          
          const usage = ReferenceAnalysisUtils.classifyUsageType(
            choiceProperty,
            this.getLineText(document, range)
          );
          
          builder.addChoiceTypeReference(location, choiceContext, usage);
        }
      }
    } catch (error) {
      this.connection.console.error(`Error finding choice type references: ${error}`);
    }
  }

  /**
   * Find inherited property references (e.g., id from Resource)
   */
  private async findInheritedReferences(
    document: TextDocument,
    symbol: any,
    builder: EnhancedReferenceBuilder,
    config: ReferenceFinderConfig
  ): Promise<void> {
    try {
      if (!this.modelProviderService?.isInitialized()) return;

      // Check common inherited properties
      const inheritedProperties = ['id', 'meta', 'extension', 'text', 'language'];
      if (!inheritedProperties.includes(symbol.name)) return;

      // Find all references to this inherited property across different resource types
      const pattern = new RegExp(`\\b\\w+\\.${symbol.name}\\b`, 'g');
      const documentText = document.getText();
      let match;
      
      while ((match = pattern.exec(documentText)) !== null) {
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);
        const range = Range.create(startPos, endPos);
        const location: Location = { uri: document.uri, range };
        
        const fullExpression = match[0];
        const resourceType = fullExpression.split('.')[0];
        
        const inheritedContext: InheritedReferenceContext = {
          property: symbol.name,
          inheritedFrom: 'Resource', // Could be more specific with ModelProvider
          resourceType,
          inheritanceChain: ['Element', 'Resource'] // Simplified
        };
        
        const usage = ReferenceAnalysisUtils.classifyUsageType(
          symbol.name,
          this.getLineText(document, range)
        );
        
        builder.addInheritedReference(location, inheritedContext, usage);
      }
    } catch (error) {
      this.connection.console.error(`Error finding inherited references: ${error}`);
    }
  }

  /**
   * Find cross-resource references (similar properties across different resources)
   */
  private async findCrossResourceReferences(
    document: TextDocument,
    symbol: any,
    builder: EnhancedReferenceBuilder,
    config: ReferenceFinderConfig
  ): Promise<void> {
    try {
      // Find properties with same name across different resource types
      const commonProperties = ['status', 'active', 'name', 'code', 'category'];
      if (!commonProperties.includes(symbol.name)) return;

      const pattern = new RegExp(`\\b\\w+\\.${symbol.name}\\b`, 'g');
      const documentText = document.getText();
      let match;
      
      while ((match = pattern.exec(documentText)) !== null) {
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);
        const range = Range.create(startPos, endPos);
        const location: Location = { uri: document.uri, range };
        
        const fullExpression = match[0];
        const resourceType = fullExpression.split('.')[0];
        
        const crossResourceContext: CrossResourceReferenceContext = {
          property: symbol.name,
          sourceResourceType: 'Unknown', // Would extract from symbol context
          targetResourceTypes: [resourceType],
          semanticRelationship: 'same'
        };
        
        const usage = ReferenceAnalysisUtils.classifyUsageType(
          symbol.name,
          this.getLineText(document, range)
        );
        
        builder.addCrossResourceReference(location, crossResourceContext, usage, 0.8);
      }
    } catch (error) {
      this.connection.console.error(`Error finding cross-resource references: ${error}`);
    }
  }

  /**
   * Build reference context for a location
   */
  private buildReferenceContext(document: TextDocument, location: Location, symbol: any): ReferenceContext {
    const lineText = this.getLineText(document, location.range);
    const resourceType = this.extractResourceTypeFromContext(document, location.range.start) || 'Unknown';
    
    return {
      resourceType,
      propertyPath: [symbol.name],
      expressionType: ReferenceAnalysisUtils.getExpressionType(lineText),
      lineText,
      surroundingContext: this.getContextForLocation(document, location.range)
    };
  }

  /**
   * Extract resource type from expression context
   */
  private extractResourceTypeFromContext(document: TextDocument, position: Position): string | undefined {
    try {
      const lineText = document.getText(Range.create(
        Position.create(position.line, 0),
        Position.create(position.line + 1, 0)
      ));
      
      // Look for patterns like "Patient.name" or "Observation.value"
      const match = lineText.match(/\b([A-Z][a-zA-Z]+)\./); 
      return match ? match[1] : undefined;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Get line text for a range
   */
  private getLineText(document: TextDocument, range: Range): string {
    try {
      const lineRange = Range.create(
        Position.create(range.start.line, 0),
        Position.create(range.start.line + 1, 0)
      );
      return document.getText(lineRange).trim();
    } catch (error) {
      return '';
    }
  }

  /**
   * Sort references by specified criteria
   */
  private sortReferences(references: EnhancedReference[], sortBy: 'relevance' | 'location' | 'usage'): void {
    switch (sortBy) {
      case 'relevance':
        references.sort((a, b) => b.confidence - a.confidence);
        break;
      case 'location':
        references.sort((a, b) => {
          if (a.uri !== b.uri) return a.uri.localeCompare(b.uri);
          if (a.range.start.line !== b.range.start.line) {
            return a.range.start.line - b.range.start.line;
          }
          return a.range.start.character - b.range.start.character;
        });
        break;
      case 'usage':
        references.sort((a, b) => a.usage.localeCompare(b.usage));
        break;
    }
  }

  /**
   * Calculate summary statistics for references
   */
  private calculateReferenceSummary(references: EnhancedReference[]) {
    const summary = {
      totalReferences: references.length,
      exactMatches: 0,
      choiceTypeMatches: 0,
      inheritedMatches: 0,
      crossResourceMatches: 0,
      semanticMatches: 0,
      resourceTypes: [] as string[],
      mostCommonUsage: UsageType.READ
    };

    const usageCounts = new Map<UsageType, number>();
    const resourceTypeSet = new Set<string>();

    for (const ref of references) {
      // Count by type
      if (ref.metadata?.isExact) summary.exactMatches++;
      if (ref.metadata?.isChoiceType) summary.choiceTypeMatches++;
      if (ref.metadata?.isInherited) summary.inheritedMatches++;
      if (ref.type === ReferenceType.CROSS_RESOURCE_USAGE) summary.crossResourceMatches++;
      if (ref.metadata?.semanticSimilarity !== undefined) summary.semanticMatches++;

      // Track usage patterns
      const currentCount = usageCounts.get(ref.usage) || 0;
      usageCounts.set(ref.usage, currentCount + 1);

      // Track resource types
      resourceTypeSet.add(ref.context.resourceType);
    }

    summary.resourceTypes = Array.from(resourceTypeSet);

    // Find most common usage
    let maxCount = 0;
    for (const [usage, count] of usageCounts) {
      if (count > maxCount) {
        maxCount = count;
        summary.mostCommonUsage = usage;
      }
    }

    return summary;
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

  /**
   * Set ModelProvider for enhanced functionality
   */
  setModelProvider(modelProviderService: ModelProviderService): void {
    this.modelProviderService = modelProviderService;
    this.connection.console.log('ModelProvider set for ReferencesProvider');
  }
}