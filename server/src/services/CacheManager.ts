import { LRUCache } from 'lru-cache';
import { ParseResult } from '../parser/FHIRPathService';
import { Diagnostic, SemanticTokens } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

interface CachedDocument {
  version: number;
  parseResult: ParseResult;
  diagnostics: Diagnostic[];
  tokens: SemanticTokens;
}

export class CacheManager {
  private parseCache: LRUCache<string, ParseResult>;
  private documentCache = new WeakMap<TextDocument, DocumentState>();
  
  constructor() {
    this.parseCache = new LRUCache<string, ParseResult>({
      max: 100,
      ttl: 1000 * 60 * 5 // 5 minutes
    });
  }
  
  getCachedParse(content: string): ParseResult | undefined {
    return this.parseCache.get(content);
  }
  
  setCachedParse(content: string, result: ParseResult): void {
    this.parseCache.set(content, result);
  }
  
  getDocumentCache(document: TextDocument): DocumentState | undefined {
    return this.documentCache.get(document);
  }
  
  setDocumentCache(document: TextDocument, state: DocumentState): void {
    this.documentCache.set(document, state);
  }
  
  clear(): void {
    this.parseCache.clear();
  }
}

interface DocumentState {
  version: number;
  parseResult: ParseResult;
  diagnostics: Diagnostic[];
}