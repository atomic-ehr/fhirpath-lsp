import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  DiagnosticSeverity,
  CompletionItemKind,
  SemanticTokensBuilder,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

// Import our services
import { FHIRPathService } from './parser/FHIRPathService';
import { DiagnosticProvider } from './providers/DiagnosticProvider';
import { DocumentService } from './services/DocumentService';
import { CompletionProvider } from './providers/CompletionProvider';
import { SemanticTokensProvider } from './providers/SemanticTokensProvider';
import { HoverProvider } from './providers/HoverProvider';
import { FHIRValidationProvider } from './providers/FHIRValidationProvider';
import { FHIRResourceService } from './services/FHIRResourceService';
import { FHIRPathContextService } from './services/FHIRPathContextService';

// Create a connection for the server
const connection = createConnection(ProposedFeatures.all);

// Create a text document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Initialize our services
const fhirPathService = new FHIRPathService();
const fhirResourceService = new FHIRResourceService();
const fhirPathContextService = new FHIRPathContextService(fhirResourceService);
const fhirValidationProvider = new FHIRValidationProvider(fhirPathService, fhirResourceService);
const diagnosticProvider = new DiagnosticProvider(fhirPathService, fhirPathContextService, fhirValidationProvider);
const documentService = new DocumentService(documents, fhirPathService);
const completionProvider = new CompletionProvider(fhirPathService, fhirResourceService);
const semanticTokensProvider = new SemanticTokensProvider(fhirPathService);
const hoverProvider = new HoverProvider(fhirPathService, fhirPathContextService);

// Token types for semantic highlighting
const tokenTypes = [
  'function',
  'parameter', 
  'variable',
  'property',
  'operator',
  'keyword',
  'string',
  'number',
  'boolean',
  'comment'
];

const tokenModifiers = [
  'declaration',
  'readonly',
  'deprecated',
  'modification',
  'documentation',
  'defaultLibrary'
];

// Server initialization
connection.onInitialize((params: InitializeParams): InitializeResult => {
  connection.console.log('FHIRPath Language Server initializing...');
  
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      
      // Phase 1: Basic diagnostics
      diagnosticProvider: {
        interFileDependencies: false,
        workspaceDiagnostics: false
      },
      
      // Phase 1: Semantic tokens for enhanced highlighting
      semanticTokensProvider: {
        legend: {
          tokenTypes,
          tokenModifiers
        },
        full: true,
        range: true
      },
      
      // Phase 2: Auto-completion (prepared but not implemented yet)
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['.', '[', '(', ' ', '"', "'"]
      },
      
      // Phase 2: Hover support (prepared but not implemented yet)
      hoverProvider: true,
      
      // Phase 3: Definition support (prepared but not implemented yet)
      definitionProvider: true
    }
  };
});

// Server initialized
connection.onInitialized(() => {
  connection.console.log('FHIRPath Language Server initialized successfully');
});

// Document change handling
documents.onDidChangeContent(async (change) => {
  connection.console.log(`Document changed: ${change.document.uri}`);
  await validateTextDocument(change.document);
});

// Document validation
async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  try {
    const diagnostics = await diagnosticProvider.provideDiagnostics(textDocument);
    connection.sendDiagnostics({ 
      uri: textDocument.uri, 
      diagnostics 
    });
  } catch (error) {
    connection.console.error(`Error validating document: ${error}`);
  }
}

// Semantic tokens provider
connection.onRequest('textDocument/semanticTokens/full', async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return { data: [] };
  }
  
  try {
    return await semanticTokensProvider.provideSemanticTokens(document, params);
  } catch (error) {
    connection.console.error(`Error generating semantic tokens: ${error}`);
    return { data: [] };
  }
});

// Semantic tokens range provider
connection.onRequest('textDocument/semanticTokens/range', async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return { data: [] };
  }
  
  try {
    return await semanticTokensProvider.provideSemanticTokensRange(document, params);
  } catch (error) {
    connection.console.error(`Error generating semantic tokens for range: ${error}`);
    return { data: [] };
  }
});

// Completion provider
connection.onCompletion(async (params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }
    
    return await completionProvider.provideCompletions(document, params);
  } catch (error) {
    connection.console.error(`Error providing completions: ${error}`);
    return [];
  }
});

// Hover provider
connection.onHover(async (params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }
    
    return await hoverProvider.provideHover(document, params);
  } catch (error) {
    connection.console.error(`Error providing hover: ${error}`);
    return null;
  }
});

// Shutdown handling
connection.onShutdown(() => {
  connection.console.log('FHIRPath Language Server shutting down');
});

// Listen for document events
documents.listen(connection);

// Start listening for connections
connection.listen();

connection.console.log('FHIRPath Language Server started and listening...');