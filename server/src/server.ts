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
import { FHIRPathFunctionRegistry } from './services/FHIRPathFunctionRegistry';
import { CodeActionProvider } from './providers/CodeActionProvider';
import { SymbolService } from './services/SymbolService';
import { DocumentSymbolProvider } from './providers/DocumentSymbolProvider';
import { DefinitionProvider } from './providers/DefinitionProvider';
import { ReferencesProvider } from './providers/ReferencesProvider';
import { WorkspaceSymbolProvider } from './providers/WorkspaceSymbolProvider';
import { RefactoringProvider } from './providers/RefactoringProvider';
import { InlayHintProvider } from './providers/InlayHintProvider';

// Production server infrastructure
import { ProductionServerManager, ServerManager } from './services/ServerManager';
import { ProductionErrorBoundary, ConsoleErrorReporter } from './services/ErrorBoundary';
import { ProductionResourceMonitor } from './services/ResourceMonitor';
import { ProductionHealthChecker } from './services/HealthChecker';

// Create a connection for the server
const connection = createConnection(ProposedFeatures.all);

// Initialize production infrastructure
const errorReporter = new ConsoleErrorReporter(connection);
const errorBoundary = new ProductionErrorBoundary(connection, errorReporter);
const resourceMonitor = new ProductionResourceMonitor(connection);
const healthChecker = new ProductionHealthChecker(connection);
const serverManager = new ProductionServerManager(
  connection,
  errorBoundary,
  resourceMonitor,
  healthChecker
);

// Create a text document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Initialize our services
const fhirPathService = new FHIRPathService();
const fhirResourceService = new FHIRResourceService();
const fhirPathContextService = new FHIRPathContextService(fhirResourceService);
const fhirPathFunctionRegistry = new FHIRPathFunctionRegistry();
const fhirValidationProvider = new FHIRValidationProvider(fhirPathService, fhirResourceService);
const diagnosticProvider = new DiagnosticProvider(fhirPathService, fhirPathContextService, fhirValidationProvider);
const documentService = new DocumentService(documents, fhirPathService);
const completionProvider = new CompletionProvider(fhirPathService, fhirResourceService);
const semanticTokensProvider = new SemanticTokensProvider(fhirPathService);
const hoverProvider = new HoverProvider(fhirPathService, fhirPathContextService);
const codeActionProvider = new CodeActionProvider(connection, fhirPathService, fhirPathFunctionRegistry);

// Symbol navigation providers
const symbolService = new SymbolService(fhirPathService, fhirPathFunctionRegistry);
const documentSymbolProvider = new DocumentSymbolProvider(connection, symbolService);
const definitionProvider = new DefinitionProvider(connection, symbolService, fhirPathFunctionRegistry);
const referencesProvider = new ReferencesProvider(connection, symbolService);
const workspaceSymbolProvider = new WorkspaceSymbolProvider(connection, symbolService);

// Refactoring provider
const refactoringProvider = new RefactoringProvider(symbolService, fhirPathService);

// Inlay hint provider
const inlayHintProvider = new InlayHintProvider(fhirPathService, fhirPathContextService);

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
connection.onInitialize(async (params: InitializeParams): Promise<InitializeResult> => {
  connection.console.log('FHIRPath Language Server initializing...');
  
  try {
    // Start the production server manager
    await serverManager.start();
    
    // Add cleanup handlers for server shutdown
    serverManager.addShutdownHandler(async () => {
      connection.console.log('Cleaning up services...');
      // Clear any intervals or timers
      // Close any open file handles
      // Cleanup service caches
    });
    
    // Add cleanup for workspace symbol provider
    serverManager.addShutdownHandler(async () => {
      try {
        // Cleanup workspace symbol provider if method exists
        const provider = workspaceSymbolProvider as any;
        if (provider && typeof provider.cleanup === 'function') {
          await provider.cleanup();
        }
      } catch (error) {
        connection.console.error(`Error cleaning up workspace symbol provider: ${error}`);
      }
    });
    
    // Add cleanup for diagnostic provider
    serverManager.addShutdownHandler(async () => {
      try {
        diagnosticProvider.clearValidationTimeout?.("*");
      } catch (error) {
        connection.console.error(`Error cleaning up diagnostic provider: ${error}`);
      }
    });
    
  } catch (error) {
    connection.console.error(`Failed to start server manager: ${error}`);
    // Continue with basic initialization even if server manager fails
  }

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
        triggerCharacters: ['.', '[', '(', ' ', '"', "'", '@']
      },

      // Phase 2: Hover support (prepared but not implemented yet)
      hoverProvider: true,

      // Phase 4: Symbol navigation support
      documentSymbolProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      workspaceSymbolProvider: true,

      // Phase 4: Refactoring support
      renameProvider: {
        prepareProvider: true
      },

      // Phase 4: Code actions for quick fixes and refactoring
      codeActionProvider: {
        codeActionKinds: [
          'quickfix',
          'quickfix.function',
          'quickfix.brackets',
          'quickfix.string',
          'quickfix.operator',
          'refactor',
          'source',
          'source.format',
          'source.organize',
          'source.fixAll'
        ],
        resolveProvider: true
      },

      // Phase 4: Document formatting support
      documentFormattingProvider: true,
      documentRangeFormattingProvider: true,
      
      // Inlay hints for expression evaluation
      inlayHintProvider: {
        resolveProvider: false
      }
    }
  };
});

// Server initialized
connection.onInitialized(async () => {
  connection.console.log('FHIRPath Language Server initialized successfully');
  
  // Track connection for resource monitoring
  resourceMonitor.trackConnection('connect');

  // Initialize workspace symbol provider if workspace folders are available
  try {
    const workspaceFolders = await connection.workspace.getWorkspaceFolders();
    if (workspaceFolders && workspaceFolders.length > 0) {
      const folderPaths = workspaceFolders.map(folder => folder.uri);
      await workspaceSymbolProvider.initialize(folderPaths);
    }
  } catch (error) {
    connection.console.error(`Error initializing workspace symbols: ${error}`);
  }
});

// Document change handling
documents.onDidChangeContent(async (change) => {
  connection.console.log(`Document changed: ${change.document.uri}`);
  
  try {
    await validateTextDocument(change.document);
  } catch (error) {
    errorBoundary.handleError(error as Error, {
      operation: 'document_validation',
      documentUri: change.document.uri,
      timestamp: new Date(),
      severity: 'medium'
    });
  }

  // Update workspace symbol index for changed document
  if (change.document.uri.endsWith('.fhirpath')) {
    try {
      await workspaceSymbolProvider.handleFileChanged(change.document.uri);
    } catch (error) {
      connection.console.error(`Error updating workspace symbols for ${change.document.uri}: ${error}`);
    }
  }
});

// Document validation with error boundary
async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  try {
    const diagnostics = await diagnosticProvider.provideDiagnostics(textDocument);
    connection.sendDiagnostics({
      uri: textDocument.uri,
      diagnostics
    });
  } catch (error) {
    errorBoundary.handleError(error as Error, {
      operation: 'provide_diagnostics',
      documentUri: textDocument.uri,
      timestamp: new Date(),
      severity: 'medium'
    });
    
    // Send empty diagnostics to clear any previous errors
    connection.sendDiagnostics({
      uri: textDocument.uri,
      diagnostics: []
    });
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

// Completion provider with error boundary
connection.onCompletion(async (params) => {
  try {
    connection.console.log(`Completion request: ${JSON.stringify({
      uri: params.textDocument.uri,
      position: params.position,
      triggerCharacter: params.context?.triggerCharacter,
      triggerKind: params.context?.triggerKind
    })}`);

    const document = documents.get(params.textDocument.uri);
    if (!document) {
      connection.console.log('Document not found for completion');
      return [];
    }

    const result = await completionProvider.provideCompletions(document, params);
    connection.console.log(`Completion result: ${result.length} items`);
    return result;
  } catch (error) {
    errorBoundary.handleError(error as Error, {
      operation: 'provide_completions',
      documentUri: params.textDocument.uri,
      timestamp: new Date(),
      severity: 'low'
    });
    return [];
  }
});

// Hover provider with error boundary
connection.onHover(async (params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }

    return await hoverProvider.provideHover(document, params);
  } catch (error) {
    errorBoundary.handleError(error as Error, {
      operation: 'provide_hover',
      documentUri: params.textDocument.uri,
      timestamp: new Date(),
      severity: 'low'
    });
    return null;
  }
});

// Code action provider with error boundary
connection.onCodeAction(async (params) => {
  try {
    connection.console.log(`Code action request received for ${params.textDocument.uri}`);
    connection.console.log(`Range: ${JSON.stringify(params.range)}`);
    connection.console.log(`Context: ${JSON.stringify(params.context)}`);

    const document = documents.get(params.textDocument.uri);
    if (!document) {
      connection.console.log('Document not found');
      return [];
    }

    const actions = await codeActionProvider.provideCodeActions(
      document,
      params.range,
      params.context
    );

    connection.console.log(`Returning ${actions.length} code actions`);

    // Log each action for debugging
    actions.forEach((action, i) => {
      connection.console.log(`Action ${i}: ${action.title}, kind: ${action.kind}, isPreferred: ${action.isPreferred}`);
    });

    return actions;
  } catch (error) {
    errorBoundary.handleError(error as Error, {
      operation: 'provide_code_actions',
      documentUri: params.textDocument.uri,
      timestamp: new Date(),
      severity: 'medium'
    });
    return [];
  }
});

// Code action resolve provider
connection.onCodeActionResolve(async (codeAction) => {
  try {
    return await codeActionProvider.resolveCodeAction(codeAction);
  } catch (error) {
    connection.console.error(`Error resolving code action: ${error}`);
    return codeAction;
  }
});

// Document formatting provider
connection.onDocumentFormatting(async (params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }

    // Simple FHIRPath formatting - remove extra whitespace and normalize
    const text = document.getText();
    const formatted = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n') + '\n';

    return [{
      range: {
        start: { line: 0, character: 0 },
        end: { line: document.lineCount, character: 0 }
      },
      newText: formatted
    }];
  } catch (error) {
    connection.console.error(`Error formatting document: ${error}`);
    return [];
  }
});

// Document range formatting provider
connection.onDocumentRangeFormatting(async (params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }

    // Get the text in the specified range
    const rangeText = document.getText(params.range);
    const formatted = rangeText.trim();

    if (formatted !== rangeText) {
      return [{
        range: params.range,
        newText: formatted
      }];
    }

    return [];
  } catch (error) {
    connection.console.error(`Error formatting document range: ${error}`);
    return [];
  }
});

// Document symbol provider
connection.onDocumentSymbol(async (params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }

    return documentSymbolProvider.provideDocumentSymbols(document);
  } catch (error) {
    connection.console.error(`Error providing document symbols: ${error}`);
    return [];
  }
});

// Definition provider
connection.onDefinition(async (params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }

    return await definitionProvider.provideDefinition(document, params.position);
  } catch (error) {
    connection.console.error(`Error providing definition: ${error}`);
    return null;
  }
});

// References provider
connection.onReferences(async (params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }

    return await referencesProvider.provideReferences(
      document,
      params.position,
      params.context
    );
  } catch (error) {
    connection.console.error(`Error providing references: ${error}`);
    return [];
  }
});

// Workspace symbol provider
connection.onWorkspaceSymbol(async (params) => {
  try {
    const query = params.query;

    if (!query.trim()) {
      return [];
    }

    const results = await workspaceSymbolProvider.search({
      query,
      maxResults: 100,
      fuzzySearch: true
    });

    // Convert to LSP WorkspaceSymbol format
    const workspaceSymbols = results.map(result => ({
      name: result.name,
      kind: result.kind,
      location: result.location,
      containerName: result.containerName
    }));

    connection.console.log(`Workspace symbol search for "${query}" returned ${workspaceSymbols.length} results`);

    return workspaceSymbols;
  } catch (error) {
    connection.console.error(`Error providing workspace symbols: ${error}`);
    return [];
  }
});

// Prepare rename provider
connection.onPrepareRename(async (params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }

    return await refactoringProvider.prepareRename(document, params.position);
  } catch (error) {
    connection.console.error(`Error preparing rename: ${error}`);
    return null;
  }
});

// Rename provider
connection.onRenameRequest(async (params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }

    return await refactoringProvider.provideRenameEdits(document, params.position, params.newName);
  } catch (error) {
    connection.console.error(`Error providing rename edits: ${error}`);
    return null;
  }
});

// Shutdown handling
connection.onShutdown(async () => {
  connection.console.log('FHIRPath Language Server shutting down');
  
  try {
    // Track connection disconnect
    resourceMonitor.trackConnection('disconnect');
    
    // Graceful shutdown through server manager
    await serverManager.stop();
  } catch (error) {
    connection.console.error(`Error during shutdown: ${error}`);
  }
});

// Listen for document events
documents.listen(connection);

// Start listening for connections
connection.listen();

// Add custom health check endpoint
connection.onRequest('fhirpath/health', () => {
  try {
    const health = serverManager.getHealth();
    const state = serverManager.getState();
    
    return {
      status: health.status,
      state,
      uptime: health.uptime,
      memory: health.memoryUsage,
      cpu: health.cpuUsage,
      connections: health.activeConnections,
      services: health.services,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: (error as Error).message,
      timestamp: new Date().toISOString()
    };
  }
});

// Add resource stats endpoint
connection.onRequest('fhirpath/resources', () => {
  try {
    return resourceMonitor.getResourceStats();
  } catch (error) {
    return {
      error: (error as Error).message,
      timestamp: new Date().toISOString()
    };
  }
});

// Inlay hint provider
connection.onRequest('textDocument/inlayHint', async (params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }

    return await inlayHintProvider.provideInlayHints(document, params);
  } catch (error) {
    connection.console.error(`Error providing inlay hints: ${error}`);
    return [];
  }
});

connection.console.log('FHIRPath Language Server started and listening...');
