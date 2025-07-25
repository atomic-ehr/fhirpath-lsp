import {
  ISymbolIndexService,
  SymbolIndex,
  SymbolEntry,
  IndexingStats,
  SearchOptions,
  FileChangeEvent,
} from '../types/WorkspaceSymbolTypes';

import { FHIRPathSymbolKind } from '../types/SymbolTypes';
import { FuzzySearchService } from './FuzzySearchService';

/**
 * Service for indexing and managing workspace symbols
 */
export class SymbolIndexService implements ISymbolIndexService {
  private index: SymbolIndex;
  private fuzzySearchService: FuzzySearchService;
  private indexingInProgress: Set<string> = new Set();
  private startTime: number = Date.now();

  constructor() {
    this.index = {
      symbols: new Map(),
      fileIndex: new Map(),
      kindIndex: new Map(),
      lastUpdated: new Map(),
      totalSymbols: 0,
      indexSize: 0,
      searchCache: new Map(),
      cacheHits: 0,
      cacheMisses: 0
    };
    
    this.fuzzySearchService = new FuzzySearchService();
  }

  /**
   * Initialize the index with workspace files
   */
  async initialize(workspaceFolders: string[]): Promise<void> {
    console.log(`Initializing symbol index for ${workspaceFolders.length} workspace folders`);
    
    // Clear existing index
    await this.clearIndex();
    
    const startTime = Date.now();
    let totalFiles = 0;
    
    for (const folder of workspaceFolders) {
      try {
        const files = await this.discoverFHIRPathFiles(folder);
        totalFiles += files.length;
        
        console.log(`Found ${files.length} FHIRPath files in ${folder}`);
        
        // Index files in batches to avoid blocking
        const batchSize = 10;
        for (let i = 0; i < files.length; i += batchSize) {
          const batch = files.slice(i, i + batchSize);
          await Promise.all(batch.map(file => this.indexFileIfNeeded(file)));
          
          // Yield control periodically
          if (i % 50 === 0) {
            await new Promise(resolve => setTimeout(resolve, 1));
          }
        }
      } catch (error) {
        console.error(`Error indexing workspace folder ${folder}:`, error);
      }
    }
    
    const indexingTime = Date.now() - startTime;
    console.log(`Index initialization complete: ${this.index.totalSymbols} symbols from ${totalFiles} files in ${indexingTime}ms`);
  }

  /**
   * Discover FHIRPath files in a directory
   */
  private async discoverFHIRPathFiles(folderPath: string): Promise<string[]> {
    // This would normally use file system operations
    // For now, return empty array as this needs integration with VS Code workspace API
    return [];
  }

  /**
   * Index a file if it hasn't been indexed or has been modified
   */
  private async indexFileIfNeeded(uri: string): Promise<void> {
    if (this.indexingInProgress.has(uri)) {
      return; // Already being indexed
    }
    
    try {
      this.indexingInProgress.add(uri);
      
      // Check if file needs reindexing (this would check file modification time)
      const needsReindex = await this.shouldReindexFile(uri);
      
      if (needsReindex) {
        // This would extract symbols from the file
        // For now, we'll simulate with empty array
        const symbols: SymbolEntry[] = [];
        await this.updateFile(uri, symbols);
      }
    } finally {
      this.indexingInProgress.delete(uri);
    }
  }

  /**
   * Check if a file should be reindexed
   */
  private async shouldReindexFile(uri: string): Promise<boolean> {
    const lastIndexed = this.index.lastUpdated.get(uri);
    if (!lastIndexed) return true;
    
    // This would check actual file modification time
    // For now, always return false to avoid reindexing
    return false;
  }

  /**
   * Add or update symbols for a file
   */
  async updateFile(uri: string, symbols: SymbolEntry[]): Promise<void> {
    // Remove existing symbols for this file
    await this.removeFile(uri);
    
    // Add new symbols
    for (const symbol of symbols) {
      this.addSymbolToIndex(symbol);
    }
    
    // Update file index
    this.index.fileIndex.set(uri, symbols);
    this.index.lastUpdated.set(uri, Date.now());
    
    // Update statistics
    this.updateIndexStats();
    
    // Clear search cache as index has changed
    this.clearSearchCache();
    
    console.log(`Updated ${symbols.length} symbols for file: ${uri}`);
  }

  /**
   * Add a symbol to all relevant indexes
   */
  private addSymbolToIndex(symbol: SymbolEntry): void {
    // Add to name index
    const nameKey = symbol.name.toLowerCase();
    if (!this.index.symbols.has(nameKey)) {
      this.index.symbols.set(nameKey, []);
    }
    this.index.symbols.get(nameKey)!.push(symbol);
    
    // Add to kind index
    if (!this.index.kindIndex.has(symbol.kind)) {
      this.index.kindIndex.set(symbol.kind, []);
    }
    this.index.kindIndex.get(symbol.kind)!.push(symbol);
    
    // Pre-compute search terms for efficiency
    symbol.searchTerms = this.generateSearchTerms(symbol);
    
    this.index.totalSymbols++;
  }

  /**
   * Generate search terms for a symbol
   */
  private generateSearchTerms(symbol: SymbolEntry): string[] {
    const terms = new Set<string>();
    
    // Add symbol name variants
    terms.add(symbol.name.toLowerCase());
    
    // Add context if available
    if (symbol.context) {
      terms.add(symbol.context.toLowerCase());
    }
    
    // Add FHIR path components
    if (symbol.fhirPath) {
      const pathParts = symbol.fhirPath.split('.');
      pathParts.forEach(part => terms.add(part.toLowerCase()));
    }
    
    // Add container name
    if (symbol.containerName) {
      terms.add(symbol.containerName.toLowerCase());
    }
    
    return Array.from(terms);
  }

  /**
   * Remove file from index
   */
  async removeFile(uri: string): Promise<void> {
    const existingSymbols = this.index.fileIndex.get(uri);
    if (!existingSymbols) return;
    
    // Remove symbols from all indexes
    for (const symbol of existingSymbols) {
      this.removeSymbolFromIndex(symbol);
    }
    
    // Remove from file index
    this.index.fileIndex.delete(uri);
    this.index.lastUpdated.delete(uri);
    
    // Update statistics
    this.updateIndexStats();
    
    // Clear search cache
    this.clearSearchCache();
    
    console.log(`Removed ${existingSymbols.length} symbols for file: ${uri}`);
  }

  /**
   * Remove a symbol from all indexes
   */
  private removeSymbolFromIndex(symbol: SymbolEntry): void {
    // Remove from name index
    const nameKey = symbol.name.toLowerCase();
    const nameEntries = this.index.symbols.get(nameKey);
    if (nameEntries) {
      const index = nameEntries.indexOf(symbol);
      if (index !== -1) {
        nameEntries.splice(index, 1);
        if (nameEntries.length === 0) {
          this.index.symbols.delete(nameKey);
        }
      }
    }
    
    // Remove from kind index
    const kindEntries = this.index.kindIndex.get(symbol.kind);
    if (kindEntries) {
      const index = kindEntries.indexOf(symbol);
      if (index !== -1) {
        kindEntries.splice(index, 1);
        if (kindEntries.length === 0) {
          this.index.kindIndex.delete(symbol.kind);
        }
      }
    }
    
    this.index.totalSymbols--;
  }

  /**
   * Search symbols by name
   */
  async search(query: string, options: SearchOptions = {}): Promise<SymbolEntry[]> {
    const {
      maxResults = 100,
      fuzzyThreshold = 0.3,
      includePrivate = true,
      searchInContent = false,
      sortByRelevance = true
    } = options;
    
    if (!query.trim()) {
      return [];
    }
    
    const cacheKey = `${query}:${JSON.stringify(options)}`;
    
    // Check cache first
    const cached = this.index.searchCache.get(cacheKey);
    if (cached) {
      this.index.cacheHits++;
      return cached.slice(0, maxResults).map(r => r.item);
    }
    
    this.index.cacheMisses++;
    
    // Perform search
    const startTime = Date.now();
    
    // Get all potential candidates
    const candidates = this.getAllCandidates(query, options);
    
    // Perform fuzzy search
    const searchKeys = ['name'];
    if (searchInContent) {
      searchKeys.push('detail', 'context');
    }
    
    const results = this.fuzzySearchService.search(query, candidates, {
      threshold: fuzzyThreshold,
      maxResults,
      keys: searchKeys
    });
    
    const searchTime = Date.now() - startTime;
    console.log(`Search for "${query}" found ${results.length} results in ${searchTime}ms`);
    
    // Cache results (limit cache size)
    if (this.index.searchCache.size > 1000) {
      // Remove oldest entries
      const keys = Array.from(this.index.searchCache.keys());
      for (let i = 0; i < 100; i++) {
        this.index.searchCache.delete(keys[i]);
      }
    }
    
    this.index.searchCache.set(cacheKey, results);
    
    return results.map(r => r.item);
  }

  /**
   * Get candidate symbols for search
   */
  private getAllCandidates(query: string, options: SearchOptions): SymbolEntry[] {
    const candidates: SymbolEntry[] = [];
    
    // If query is short, search all symbols
    if (query.length <= 2) {
      for (const entries of this.index.symbols.values()) {
        candidates.push(...entries);
      }
      return candidates.slice(0, 1000); // Limit for performance
    }
    
    // For longer queries, find symbols that might match
    const queryLower = query.toLowerCase();
    
    // Exact name matches
    const exactMatches = this.index.symbols.get(queryLower);
    if (exactMatches) {
      candidates.push(...exactMatches);
    }
    
    // Prefix matches
    for (const [name, entries] of this.index.symbols.entries()) {
      if (name.startsWith(queryLower) && name !== queryLower) {
        candidates.push(...entries);
      }
    }
    
    // Substring matches
    for (const [name, entries] of this.index.symbols.entries()) {
      if (name.includes(queryLower) && !name.startsWith(queryLower)) {
        candidates.push(...entries);
      }
    }
    
    // Remove duplicates
    const seen = new Set<SymbolEntry>();
    return candidates.filter(symbol => {
      if (seen.has(symbol)) return false;
      seen.add(symbol);
      return true;
    });
  }

  /**
   * Get all symbols in a file
   */
  getFileSymbols(uri: string): SymbolEntry[] {
    return this.index.fileIndex.get(uri) || [];
  }

  /**
   * Get symbols by kind
   */
  getSymbolsByKind(kind: FHIRPathSymbolKind): SymbolEntry[] {
    return this.index.kindIndex.get(kind) || [];
  }

  /**
   * Get index statistics
   */
  getStats(): IndexingStats {
    const totalFiles = this.index.fileIndex.size;
    const totalSymbols = this.index.totalSymbols;
    const memoryUsage = this.estimateMemoryUsage();
    const cacheHitRate = this.index.cacheHits / (this.index.cacheHits + this.index.cacheMisses) || 0;
    
    return {
      totalFiles,
      indexedFiles: totalFiles,
      totalSymbols,
      indexingTime: Date.now() - this.startTime,
      memoryUsage,
      lastIndexed: Math.max(...Array.from(this.index.lastUpdated.values()), 0),
      averageSearchTime: 50, // Would track this in real implementation
      cacheHitRate,
      indexUpdateTime: 10 // Would track this in real implementation
    };
  }

  /**
   * Estimate memory usage of the index
   */
  private estimateMemoryUsage(): number {
    // Rough estimation of memory usage
    let size = 0;
    
    // Estimate symbol storage
    size += this.index.totalSymbols * 200; // ~200 bytes per symbol
    
    // Estimate map overhead
    size += this.index.symbols.size * 50;
    size += this.index.fileIndex.size * 50;
    size += this.index.kindIndex.size * 50;
    
    // Estimate cache size
    size += this.index.searchCache.size * 100;
    
    return size;
  }

  /**
   * Update index statistics
   */
  private updateIndexStats(): void {
    this.index.indexSize = this.estimateMemoryUsage();
  }

  /**
   * Clear search cache
   */
  private clearSearchCache(): void {
    this.index.searchCache.clear();
    this.index.cacheHits = 0;
    this.index.cacheMisses = 0;
  }

  /**
   * Clear the entire index
   */
  async clearIndex(): Promise<void> {
    this.index.symbols.clear();
    this.index.fileIndex.clear();
    this.index.kindIndex.clear();
    this.index.lastUpdated.clear();
    this.index.totalSymbols = 0;
    this.index.indexSize = 0;
    this.clearSearchCache();
    
    console.log('Symbol index cleared');
  }

  /**
   * Handle file change events
   */
  async handleFileChange(event: FileChangeEvent): Promise<void> {
    switch (event.type) {
      case 'created':
      case 'changed':
        await this.indexFileIfNeeded(event.uri);
        break;
      case 'deleted':
        await this.removeFile(event.uri);
        break;
    }
  }

  /**
   * Get index health information
   */
  getIndexHealth(): {
    isHealthy: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    const stats = this.getStats();
    
    // Check memory usage
    if (stats.memoryUsage > 50 * 1024 * 1024) { // 50MB
      issues.push('High memory usage');
      recommendations.push('Consider clearing cache or reducing index size');
    }
    
    // Check cache hit rate
    if (stats.cacheHitRate < 0.5 && this.index.cacheHits + this.index.cacheMisses > 100) {
      issues.push('Low cache hit rate');
      recommendations.push('Cache may need tuning or queries are too diverse');
    }
    
    // Check indexing performance
    if (stats.averageSearchTime > 200) {
      issues.push('Slow search performance');
      recommendations.push('Index may need optimization or rebuild');
    }
    
    return {
      isHealthy: issues.length === 0,
      issues,
      recommendations
    };
  }
}