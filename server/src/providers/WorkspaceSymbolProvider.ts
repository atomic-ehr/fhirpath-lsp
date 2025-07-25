import {
  WorkspaceSymbol,
  SymbolInformation,
  Connection,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import {
  IWorkspaceSymbolProvider,
  WorkspaceSymbolQuery,
  WorkspaceSymbolResult,
  SymbolEntry,
  IndexingStats,
} from '../types/WorkspaceSymbolTypes';

import { toSymbolKind } from '../types/SymbolTypes';
import { SymbolIndexService } from '../services/SymbolIndexService';
import { SymbolService } from '../services/SymbolService';

/**
 * Provider for workspace-wide symbol search functionality
 */
export class WorkspaceSymbolProvider implements IWorkspaceSymbolProvider {
  private symbolIndexService: SymbolIndexService;
  private documentSymbolService: SymbolService;
  private isInitialized: boolean = false;

  constructor(
    private connection: Connection,
    documentSymbolService: SymbolService
  ) {
    this.symbolIndexService = new SymbolIndexService();
    this.documentSymbolService = documentSymbolService;
  }

  /**
   * Initialize the workspace symbol provider
   */
  async initialize(workspaceFolders: string[]): Promise<void> {
    if (this.isInitialized) return;

    this.connection.console.log('Initializing workspace symbol provider...');
    
    try {
      await this.symbolIndexService.initialize(workspaceFolders);
      this.isInitialized = true;
      
      const stats = this.symbolIndexService.getStats();
      this.connection.console.log(
        `Workspace symbol provider initialized: ${stats.totalSymbols} symbols from ${stats.totalFiles} files`
      );
    } catch (error) {
      this.connection.console.error(`Failed to initialize workspace symbol provider: ${error}`);
    }
  }

  /**
   * Search for symbols across the workspace
   */
  async search(query: WorkspaceSymbolQuery): Promise<WorkspaceSymbolResult[]> {
    try {
      this.connection.console.log(`Workspace symbol search: "${query.query}"`);

      if (!this.isInitialized) {
        this.connection.console.warn('Workspace symbol provider not initialized, returning empty results');
        return [];
      }

      if (!query.query.trim()) {
        return [];
      }

      const startTime = Date.now();
      
      // Search using the index service
      const symbolEntries = await this.symbolIndexService.search(query.query, {
        maxResults: query.maxResults || 100,
        fuzzyThreshold: query.fuzzySearch !== false ? 0.3 : 1.0,
        includePrivate: true,
        searchInContent: true,
        sortByRelevance: true
      });

      // Convert to workspace symbol results
      const results = await this.convertToWorkspaceSymbols(symbolEntries, query);
      
      // Filter by symbol kinds if specified
      const filteredResults = this.filterByKinds(results, query.symbolKinds);
      
      // Sort and limit results
      const finalResults = this.sortAndLimitResults(filteredResults, query);

      const searchTime = Date.now() - startTime;
      this.connection.console.log(
        `Workspace symbol search completed: ${finalResults.length} results in ${searchTime}ms`
      );

      return finalResults;

    } catch (error) {
      this.connection.console.error(`Error in workspace symbol search: ${error}`);
      return [];
    }
  }

  /**
   * Convert symbol entries to workspace symbol results
   */
  private async convertToWorkspaceSymbols(
    entries: SymbolEntry[],
    query: WorkspaceSymbolQuery
  ): Promise<WorkspaceSymbolResult[]> {
    const results: WorkspaceSymbolResult[] = [];

    for (const entry of entries) {
      try {
        const workspaceSymbol: WorkspaceSymbolResult = {
          name: entry.name,
          kind: toSymbolKind(entry.kind),
          location: entry.location,
          containerName: entry.containerName,
          score: this.calculateRelevanceScore(entry, query.query),
          context: entry.context,
          fhirPath: entry.fhirPath,
          fileUri: entry.fileUri
        };

        // Add additional details if available
        if (entry.detail) {
          workspaceSymbol.containerName = entry.detail;
        }

        results.push(workspaceSymbol);
      } catch (error) {
        this.connection.console.error(`Error converting symbol entry: ${error}`);
      }
    }

    return results;
  }

  /**
   * Calculate relevance score for search results
   */
  private calculateRelevanceScore(entry: SymbolEntry, query: string): number {
    const queryLower = query.toLowerCase();
    const nameLower = entry.name.toLowerCase();
    
    // Exact match
    if (nameLower === queryLower) return 1.0;
    
    // Prefix match (high score)
    if (nameLower.startsWith(queryLower)) {
      return 0.95 - (query.length / entry.name.length * 0.1);
    }
    
    // Contains match
    if (nameLower.includes(queryLower)) {
      const index = nameLower.indexOf(queryLower);
      return 0.8 - (index / entry.name.length * 0.2);
    }
    
    // Context/path match
    if (entry.fhirPath && entry.fhirPath.toLowerCase().includes(queryLower)) {
      return 0.6;
    }
    
    if (entry.context && entry.context.toLowerCase().includes(queryLower)) {
      return 0.5;
    }
    
    // Default fuzzy score
    return 0.3;
  }

  /**
   * Filter results by symbol kinds
   */
  private filterByKinds(
    results: WorkspaceSymbolResult[],
    kinds?: string[]
  ): WorkspaceSymbolResult[] {
    if (!kinds || kinds.length === 0) {
      return results;
    }

    const allowedKinds = new Set(kinds);
    return results.filter(result => {
      const kindString = this.symbolKindToString(result.kind);
      return allowedKinds.has(kindString);
    });
  }

  /**
   * Convert SymbolKind enum to string
   */
  private symbolKindToString(kind: number): string {
    const kindMap: { [key: number]: string } = {
      5: 'class',      // Resource
      12: 'function',  // Function
      7: 'property',   // Property
      14: 'constant',  // Literal
      13: 'variable',  // Variable
      25: 'operator'   // Operator
    };
    
    return kindMap[kind] || 'unknown';
  }

  /**
   * Sort and limit search results
   */
  private sortAndLimitResults(
    results: WorkspaceSymbolResult[],
    query: WorkspaceSymbolQuery
  ): WorkspaceSymbolResult[] {
    // Sort by score (descending), then by name
    results.sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      return a.name.localeCompare(b.name);
    });

    // Limit results
    const maxResults = query.maxResults || 100;
    return results.slice(0, maxResults);
  }

  /**
   * Index a file for symbol search
   */
  async indexFile(uri: string): Promise<void> {
    try {
      this.connection.console.log(`Indexing file: ${uri}`);
      
      // This would normally read the file content
      // For now, we'll create a mock document and extract symbols
      const mockDocument = this.createMockDocument(uri, '');
      
      if (mockDocument) {
        const extractionResult = this.documentSymbolService.extractDocumentSymbols(mockDocument);
        
        // Convert to symbol entries
        const symbolEntries: SymbolEntry[] = extractionResult.symbols.map(symbol => ({
          name: symbol.name,
          kind: symbol.kind,
          location: {
            uri: mockDocument.uri,
            range: symbol.range
          },
          containerName: symbol.context,
          context: symbol.context,
          fhirPath: symbol.fhirPath,
          detail: symbol.detail,
          fileUri: mockDocument.uri,
          lastModified: Date.now(),
          searchTerms: [symbol.name.toLowerCase()]
        }));

        await this.symbolIndexService.updateFile(uri, symbolEntries);
        
        this.connection.console.log(`Indexed ${symbolEntries.length} symbols from ${uri}`);
      }
    } catch (error) {
      this.connection.console.error(`Error indexing file ${uri}: ${error}`);
    }
  }

  /**
   * Create a mock TextDocument for testing
   */
  private createMockDocument(uri: string, content: string): TextDocument | null {
    try {
      return TextDocument.create(uri, 'fhirpath', 1, content);
    } catch (error) {
      this.connection.console.error(`Error creating document for ${uri}: ${error}`);
      return null;
    }
  }

  /**
   * Remove a file from the index
   */
  async removeFile(uri: string): Promise<void> {
    try {
      await this.symbolIndexService.removeFile(uri);
      this.connection.console.log(`Removed file from index: ${uri}`);
    } catch (error) {
      this.connection.console.error(`Error removing file ${uri}: ${error}`);
    }
  }

  /**
   * Get indexing statistics
   */
  getStats(): IndexingStats {
    return this.symbolIndexService.getStats();
  }

  /**
   * Clear the symbol index
   */
  async clearIndex(): Promise<void> {
    try {
      await this.symbolIndexService.clearIndex();
      this.isInitialized = false;
      this.connection.console.log('Workspace symbol index cleared');
    } catch (error) {
      this.connection.console.error(`Error clearing index: ${error}`);
    }
  }

  /**
   * Handle workspace folder changes
   */
  async handleWorkspaceFoldersChanged(
    added: string[],
    removed: string[]
  ): Promise<void> {
    try {
      // Remove symbols from removed folders
      for (const folder of removed) {
        // This would remove all files under the folder
        this.connection.console.log(`Removing symbols from folder: ${folder}`);
      }

      // Add symbols from new folders
      for (const folder of added) {
        this.connection.console.log(`Adding symbols from folder: ${folder}`);
        // This would discover and index files in the new folder
      }
    } catch (error) {
      this.connection.console.error(`Error handling workspace folder changes: ${error}`);
    }
  }

  /**
   * Handle file system changes
   */
  async handleFileChanged(uri: string): Promise<void> {
    await this.indexFile(uri);
  }

  async handleFileDeleted(uri: string): Promise<void> {
    await this.removeFile(uri);
  }

  async handleFileCreated(uri: string): Promise<void> {
    await this.indexFile(uri);
  }

  /**
   * Get symbol suggestions for a partial query
   */
  async getSuggestions(partialQuery: string): Promise<string[]> {
    try {
      if (!this.isInitialized || !partialQuery.trim()) {
        return [];
      }

      const results = await this.search({
        query: partialQuery,
        maxResults: 10,
        fuzzySearch: true
      });

      return results.map(result => result.name);
    } catch (error) {
      this.connection.console.error(`Error getting suggestions: ${error}`);
      return [];
    }
  }

  /**
   * Get workspace symbol provider health status
   */
  getHealthStatus(): {
    isHealthy: boolean;
    message: string;
    stats: IndexingStats;
  } {
    const stats = this.getStats();
    const indexHealth = this.symbolIndexService.getIndexHealth();
    
    return {
      isHealthy: this.isInitialized && indexHealth.isHealthy,
      message: this.isInitialized 
        ? (indexHealth.isHealthy ? 'Workspace symbol provider is healthy' : indexHealth.issues.join(', '))
        : 'Workspace symbol provider not initialized',
      stats
    };
  }
}