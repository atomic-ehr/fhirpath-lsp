import {
  SymbolInformation,
  WorkspaceSymbol,
  Location,
  SymbolKind,
} from 'vscode-languageserver';

import { FHIRPathSymbolKind } from './SymbolTypes';

/**
 * Workspace symbol query parameters
 */
export interface WorkspaceSymbolQuery {
  query: string;
  maxResults?: number;
  symbolKinds?: FHIRPathSymbolKind[];
  includeDeclaration?: boolean;
  fuzzySearch?: boolean;
  caseSensitive?: boolean;
}

/**
 * Enhanced workspace symbol result with scoring
 */
export interface WorkspaceSymbolResult extends WorkspaceSymbol {
  score: number; // Relevance score (0-1, higher is better)
  context?: string; // Additional context information
  fhirPath?: string; // Full FHIR path if applicable
  fileUri: string; // Source file URI
}

/**
 * Symbol entry in the workspace index
 */
export interface SymbolEntry {
  name: string;
  kind: FHIRPathSymbolKind;
  location: Location;
  containerName?: string;
  context?: string;
  fhirPath?: string;
  detail?: string;
  
  // Indexing metadata
  fileUri: string;
  lastModified: number;
  searchTerms: string[]; // Pre-computed search terms for efficiency
}

/**
 * Workspace symbol index structure
 */
export interface SymbolIndex {
  // Primary symbol storage
  symbols: Map<string, SymbolEntry[]>; // name -> entries
  fileIndex: Map<string, SymbolEntry[]>; // fileUri -> entries
  kindIndex: Map<FHIRPathSymbolKind, SymbolEntry[]>; // kind -> entries
  
  // Metadata
  lastUpdated: Map<string, number>; // fileUri -> timestamp
  totalSymbols: number;
  indexSize: number; // Memory usage estimate
  
  // Search optimization
  searchCache: Map<string, WorkspaceSymbolResult[]>; // query -> results
  cacheHits: number;
  cacheMisses: number;
}

/**
 * Workspace symbol search options
 */
export interface SearchOptions {
  maxResults: number;
  fuzzyThreshold: number; // Minimum similarity score (0-1)
  includePrivate: boolean;
  searchInContent: boolean; // Search in symbol details/documentation
  sortByRelevance: boolean;
}

/**
 * File watching event for symbol indexing
 */
export interface FileChangeEvent {
  uri: string;
  type: 'created' | 'changed' | 'deleted';
  timestamp: number;
}

/**
 * Symbol indexing statistics
 */
export interface IndexingStats {
  totalFiles: number;
  indexedFiles: number;
  totalSymbols: number;
  indexingTime: number; // milliseconds
  memoryUsage: number; // bytes
  lastIndexed: number; // timestamp
  
  // Performance metrics
  averageSearchTime: number;
  cacheHitRate: number;
  indexUpdateTime: number;
}

/**
 * Fuzzy search result with scoring details
 */
export interface FuzzySearchResult {
  item: SymbolEntry;
  score: number;
  matches: {
    indices: number[][];
    key: string;
  }[];
}

/**
 * Workspace symbol provider interface
 */
export interface IWorkspaceSymbolProvider {
  /**
   * Search for symbols across the workspace
   */
  search(query: WorkspaceSymbolQuery): Promise<WorkspaceSymbolResult[]>;
  
  /**
   * Index a file for symbol search
   */
  indexFile(uri: string): Promise<void>;
  
  /**
   * Remove a file from the index
   */
  removeFile(uri: string): Promise<void>;
  
  /**
   * Get indexing statistics
   */
  getStats(): IndexingStats;
  
  /**
   * Clear the symbol index
   */
  clearIndex(): Promise<void>;
}

/**
 * Symbol index service interface
 */
export interface ISymbolIndexService {
  /**
   * Initialize the index with workspace files
   */
  initialize(workspaceFolders: string[]): Promise<void>;
  
  /**
   * Add or update symbols for a file
   */
  updateFile(uri: string, symbols: SymbolEntry[]): Promise<void>;
  
  /**
   * Remove file from index
   */
  removeFile(uri: string): Promise<void>;
  
  /**
   * Search symbols by name
   */
  search(query: string, options?: SearchOptions): Promise<SymbolEntry[]>;
  
  /**
   * Get all symbols in a file
   */
  getFileSymbols(uri: string): SymbolEntry[];
  
  /**
   * Get symbols by kind
   */
  getSymbolsByKind(kind: FHIRPathSymbolKind): SymbolEntry[];
  
  /**
   * Get index statistics
   */
  getStats(): IndexingStats;
}

/**
 * Fuzzy search service interface
 */
export interface IFuzzySearchService {
  /**
   * Perform fuzzy search on symbol names
   */
  search(
    query: string, 
    items: SymbolEntry[], 
    options?: {
      threshold?: number;
      maxResults?: number;
      keys?: string[];
    }
  ): FuzzySearchResult[];
  
  /**
   * Calculate similarity score between two strings
   */
  calculateScore(query: string, target: string): number;
  
  /**
   * Get search suggestions based on query
   */
  getSuggestions(query: string, items: SymbolEntry[]): string[];
}