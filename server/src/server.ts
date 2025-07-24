import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  SemanticTokensBuilder
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { FHIRPathService } from './parser/FHIRPathService';
import { DiagnosticProvider } from './providers/DiagnosticProvider';
import { SemanticTokenProvider } from './providers/SemanticTokenProvider';
import { CompletionProvider } from './providers/CompletionProvider';
import { DocumentService } from './services/DocumentService';
import { CacheManager } from './services/CacheManager';

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

const tokenTypes = ['function', 'parameter', 'variable', 'property', 'operator', 'keyword', 'string', 'number', 'boolean', 'comment'];
const tokenModifiers = ['declaration', 'readonly', 'deprecated', 'modification', 'documentation', 'defaultLibrary'];

let fhirPathService: FHIRPathService;
let diagnosticProvider: DiagnosticProvider;
let semanticTokenProvider: SemanticTokenProvider;
let completionProvider: CompletionProvider;
let documentService: DocumentService;
let cacheManager: CacheManager;

connection.onInitialize((params: InitializeParams): InitializeResult => {
  fhirPathService = new FHIRPathService();
  diagnosticProvider = new DiagnosticProvider(fhirPathService);
  semanticTokenProvider = new SemanticTokenProvider(fhirPathService, { tokenTypes, tokenModifiers });
  completionProvider = new CompletionProvider(fhirPathService);
  documentService = new DocumentService(fhirPathService);
  cacheManager = new CacheManager();

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      diagnosticProvider: {
        interFileDependencies: false,
        workspaceDiagnostics: false
      },
      semanticTokensProvider: {
        legend: {
          tokenTypes,
          tokenModifiers
        },
        full: true,
        range: true
      },
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['.', '[', '(', ' ', '"', "'"]
      },
      hoverProvider: true,
      definitionProvider: true
    }
  };
});

connection.onInitialized(() => {
  connection.console.log('FHIRPath Language Server initialized');
});

documents.onDidChangeContent(change => {
  validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const diagnostics = await diagnosticProvider.provideDiagnostics(textDocument);
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.languages.semanticTokens.on(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return { data: [] };
  }
  return semanticTokenProvider.provideSemanticTokens(document);
});

connection.onCompletion(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }
  return completionProvider.provideCompletions(document, params.position, params.context);
});

connection.onCompletionResolve((item) => {
  return completionProvider.resolveCompletion(item);
});

connection.onRequest('fhirpath/validate', async (params: { uri: string; content: string }) => {
  const errors = fhirPathService.validate(params.content);
  return { errors };
});

documents.listen(connection);
connection.listen();