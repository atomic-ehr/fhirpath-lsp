import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, SemanticTokens } from 'vscode-languageserver';
import { FHIRPathService, ParseResult } from '../parser/FHIRPathService';

export interface DocumentState {
  parseResult: ParseResult;
  diagnostics: Diagnostic[];
  tokens?: SemanticTokens;
  version: number;
}

export interface DocumentAnalysis {
  diagnostics: Diagnostic[];
  tokens?: SemanticTokens;
}

export class DocumentService {
  private cache: Map<string, DocumentState> = new Map();
  
  constructor(private parser: FHIRPathService) {}
  
  async analyzeDocument(uri: string, content: string): Promise<DocumentAnalysis> {
    const parseResult = this.parser.parse(content);
    const diagnostics = this.generateDiagnostics(parseResult);
    
    this.cache.set(uri, { 
      parseResult, 
      diagnostics, 
      version: Date.now() 
    });
    
    return { diagnostics };
  }
  
  getDocumentState(uri: string): DocumentState | undefined {
    return this.cache.get(uri);
  }
  
  clearCache(uri: string): void {
    this.cache.delete(uri);
  }
  
  private generateDiagnostics(parseResult: ParseResult): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    
    if (!parseResult.success) {
      for (const error of parseResult.errors) {
        diagnostics.push({
          severity: 1, // Error
          range: {
            start: { line: error.line, character: error.column },
            end: { line: error.line, character: error.column + error.length }
          },
          message: error.message,
          source: 'fhirpath'
        });
      }
    }
    
    return diagnostics;
  }
}