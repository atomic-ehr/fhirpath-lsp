import { TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { FHIRPathService, ParseResult } from '../parser/FHIRPathService';

/**
 * Document state information
 */
interface DocumentState {
  version: number;
  lastParseResult?: ParseResult;
  lastValidated?: number;
  isValid?: boolean;
}

/**
 * Manages document lifecycle and caching for FHIRPath files
 */
export class DocumentService {
  private documentStates = new Map<string, DocumentState>();
  private readonly cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor(
    private documents: TextDocuments<TextDocument>,
    private fhirPathService: FHIRPathService
  ) {
    this.setupEventHandlers();
  }

  /**
   * Set up document event handlers
   */
  private setupEventHandlers(): void {
    // Document opened
    this.documents.onDidOpen((event) => {
      console.log(`Document opened: ${event.document.uri}`);
      this.initializeDocumentState(event.document);
    });

    // Document changed
    this.documents.onDidChangeContent((event) => {
      console.log(`Document changed: ${event.document.uri}`);
      this.updateDocumentState(event.document);
    });

    // Document closed
    this.documents.onDidClose((event) => {
      console.log(`Document closed: ${event.document.uri}`);
      this.cleanupDocumentState(event.document.uri);
    });

    // Document saved
    this.documents.onDidSave?.((event) => {
      console.log(`Document saved: ${event.document.uri}`);
      // Could trigger additional validation or formatting here
    });
  }

  /**
   * Initialize state for a newly opened document
   */
  private initializeDocumentState(document: TextDocument): void {
    const state: DocumentState = {
      version: document.version,
      lastValidated: Date.now()
    };

    this.documentStates.set(document.uri, state);

    // Trigger initial parsing
    this.parseDocument(document);
  }

  /**
   * Update state when document content changes
   */
  private updateDocumentState(document: TextDocument): void {
    const state = this.documentStates.get(document.uri);
    if (state) {
      state.version = document.version;
      state.lastValidated = Date.now();
      // Clear cached parse result as content has changed
      state.lastParseResult = undefined;
      state.isValid = undefined;
    }
  }

  /**
   * Clean up state when document is closed
   */
  private cleanupDocumentState(uri: string): void {
    this.documentStates.delete(uri);
  }

  /**
   * Get document by URI
   */
  getDocument(uri: string): TextDocument | undefined {
    return this.documents.get(uri);
  }

  /**
   * Get all open documents
   */
  getAllDocuments(): TextDocument[] {
    return this.documents.all();
  }

  /**
   * Get document state
   */
  getDocumentState(uri: string): DocumentState | undefined {
    return this.documentStates.get(uri);
  }

  /**
   * Parse document and cache result
   */
  async parseDocument(document: TextDocument): Promise<ParseResult> {
    const state = this.documentStates.get(document.uri);
    
    // Return cached result if available and document hasn't changed
    if (state?.lastParseResult && state.version === document.version) {
      return state.lastParseResult;
    }

    try {
      const text = document.getText().trim();
      
      // Skip empty documents
      if (!text) {
        const emptyResult: ParseResult = {
          success: true,
          errors: []
        };
        
        if (state) {
          state.lastParseResult = emptyResult;
          state.isValid = true;
        }
        
        return emptyResult;
      }

      // Parse the document
      const parseResult = this.fhirPathService.parse(text);
      
      // Update state
      if (state) {
        state.lastParseResult = parseResult;
        state.isValid = parseResult.success;
        state.lastValidated = Date.now();
      }

      return parseResult;
      
    } catch (error) {
      console.error(`Error parsing document ${document.uri}:`, error);
      
      const errorResult: ParseResult = {
        success: false,
        errors: [{
          message: `Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          line: 0,
          column: 0,
          offset: 0,
          length: 1,
          code: 'parse-error'
        }]
      };
      
      if (state) {
        state.lastParseResult = errorResult;
        state.isValid = false;
      }
      
      return errorResult;
    }
  }

  /**
   * Check if document is a FHIRPath file
   */
  isFHIRPathDocument(document: TextDocument): boolean {
    const uri = document.uri.toLowerCase();
    return uri.endsWith('.fhirpath') || uri.endsWith('.fhir');
  }

  /**
   * Get all FHIRPath documents
   */
  getFHIRPathDocuments(): TextDocument[] {
    return this.documents.all().filter(doc => this.isFHIRPathDocument(doc));
  }

  /**
   * Get document statistics
   */
  getDocumentStats(uri: string): { 
    lines: number; 
    characters: number; 
    words: number; 
    isValid?: boolean;
    lastParsed?: number;
  } | undefined {
    const document = this.documents.get(uri);
    const state = this.documentStates.get(uri);
    
    if (!document) {
      return undefined;
    }

    const text = document.getText();
    const lines = document.lineCount;
    const characters = text.length;
    const words = text.split(/\s+/).filter(word => word.length > 0).length;

    return {
      lines,
      characters,
      words,
      isValid: state?.isValid,
      lastParsed: state?.lastValidated
    };
  }

  /**
   * Validate all open FHIRPath documents
   */
  async validateAllDocuments(): Promise<Map<string, ParseResult>> {
    const results = new Map<string, ParseResult>();
    const fhirPathDocs = this.getFHIRPathDocuments();
    
    for (const document of fhirPathDocs) {
      try {
        const result = await this.parseDocument(document);
        results.set(document.uri, result);
      } catch (error) {
        console.error(`Error validating document ${document.uri}:`, error);
      }
    }
    
    return results;
  }

  /**
   * Clear expired cache entries
   */
  cleanupExpiredCache(): void {
    const now = Date.now();
    
    for (const [uri, state] of this.documentStates.entries()) {
      if (state.lastValidated && (now - state.lastValidated) > this.cacheTimeout) {
        // Clear cached parse result but keep the state
        state.lastParseResult = undefined;
        state.isValid = undefined;
      }
    }
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats(): {
    totalDocuments: number;
    cachedParseResults: number;
    fhirPathDocuments: number;
    parserCacheStats: any;
  } {
    const totalDocuments = this.documents.all().length;
    const cachedParseResults = Array.from(this.documentStates.values())
      .filter(state => state.lastParseResult).length;
    const fhirPathDocuments = this.getFHIRPathDocuments().length;
    const parserCacheStats = this.fhirPathService.getCacheStats();

    return {
      totalDocuments,
      cachedParseResults,
      fhirPathDocuments,
      parserCacheStats
    };
  }

  /**
   * Force refresh of a document's parse state
   */
  async refreshDocument(uri: string): Promise<ParseResult | undefined> {
    const document = this.documents.get(uri);
    if (!document) {
      return undefined;
    }

    // Clear cached state
    const state = this.documentStates.get(uri);
    if (state) {
      state.lastParseResult = undefined;
      state.isValid = undefined;
    }

    // Reparse
    return await this.parseDocument(document);
  }
}