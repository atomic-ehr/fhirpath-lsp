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

// Plugin system
import { PluginManager, PluginSource } from './plugins/PluginManager';
import { CoreProvidersPlugin } from './plugins/builtin/CoreProvidersPlugin';
import { PerformanceAnalyzerPlugin } from './plugins/builtin/PerformanceAnalyzerPlugin';
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

// Performance optimization services
import { getMemoryManager } from './services/MemoryManager';
import { getBackgroundProcessor } from './services/BackgroundProcessor';
import { AdaptiveRequestThrottler } from './services/RequestThrottler';
import { getGlobalProfiler } from './utils/PerformanceProfiler';
import { getPerformanceMonitor } from './logging/PerformanceMonitor';
import { WorkspaceOptimizer, categorizeWorkspace } from './utils/WorkspaceOptimizer';

// Centralized configuration system
import { ConfigManager, DEFAULT_APP_CONFIG } from './config/ConfigManager';
import { ConfigNotificationService } from './config/ConfigNotificationService';
import { FileConfigLoaderFactory } from './config/loaders/FileConfigLoader';
import { EnvironmentConfigLoaderFactory } from './config/loaders/EnvironmentConfigLoader';
import { RuntimeConfigLoaderFactory } from './config/loaders/RuntimeConfigLoader';
import { DiagnosticConfigValidator } from './config/validators/DiagnosticConfigValidator';
import { ProviderConfigValidator } from './config/validators/ProviderConfigValidator';
import { CompositeConfigValidator } from './config/validators/ConfigValidator';
import { DiagnosticConfigAdapter } from './config/adapters/DiagnosticConfigAdapter';
import { PluginConfigValidator } from './config/validators/PluginConfigValidator';
import { PluginConfigAdapter } from './config/adapters/PluginConfigAdapter';

// Structured logging system
import { getLogger, configureLogging, LogLevel, correlationContext, requestContext } from './logging';
import { join } from 'path';

// Create a connection for the server
const connection = createConnection(ProposedFeatures.all);

// Configure structured logging
configureLogging({
  level: LogLevel.INFO,
  transports: [
    {
      type: 'console',
      name: 'server-console',
      level: LogLevel.INFO,
      enabled: true,
      options: {
        colorize: false, // LSP output should not have colors
        includeTimestamp: true,
        includeContext: true,
        includeSource: false
      }
    },
    {
      type: 'file',
      name: 'server-file',
      level: LogLevel.DEBUG,
      enabled: true,
      options: {
        filePath: join(process.cwd(), 'logs', 'fhirpath-lsp.log'),
        maxSize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5
      }
    }
  ],
  correlationId: {
    enabled: true,
    generator: 'short'
  },
  context: {
    includeSource: false,
    includePerformance: true,
    defaultTags: ['fhirpath-lsp', 'server']
  },
  performance: {
    enableTimers: true,
    enableMemoryTracking: true,
    enableCpuTracking: false
  }
});

// Create the main server logger
const logger = getLogger('server');

// Initialize production infrastructure
const errorReporter = new ConsoleErrorReporter(connection);
const errorBoundary = new ProductionErrorBoundary(connection, errorReporter);
const resourceMonitor = new ProductionResourceMonitor(connection);
const healthChecker = new ProductionHealthChecker(connection);

// Initialize performance optimization infrastructure
const memoryManager = getMemoryManager();
const backgroundProcessor = getBackgroundProcessor();
const requestThrottler = new AdaptiveRequestThrottler();
const profiler = getGlobalProfiler();
const performanceMonitor = getPerformanceMonitor({
  enabled: true,
  logLevel: LogLevel.INFO,
  memoryTracking: true,
  cpuTracking: false
});
const workspaceOptimizer = new WorkspaceOptimizer();

const serverManager = new ProductionServerManager(
  connection,
  errorBoundary,
  resourceMonitor,
  healthChecker
);

// Initialize centralized configuration system
const configManager = new ConfigManager();

// Register configuration loaders
const workspaceLoader = FileConfigLoaderFactory.createWorkspaceLoader(process.cwd());
const userLoader = FileConfigLoaderFactory.createUserLoader();
const envLoader = EnvironmentConfigLoaderFactory.createDefault();
const runtimeLoader = RuntimeConfigLoaderFactory.createEmpty();

configManager.registerLoader('workspace', workspaceLoader);
configManager.registerLoader('user', userLoader);
configManager.registerLoader('environment', envLoader);
configManager.registerLoader('runtime', runtimeLoader);

// Register configuration validators
const diagnosticValidator = new DiagnosticConfigValidator();
const providerValidator = new ProviderConfigValidator();
const pluginValidator = new PluginConfigValidator();
const compositeValidator = new CompositeConfigValidator('MainValidator');
compositeValidator.addValidator(diagnosticValidator);
compositeValidator.addValidator(providerValidator);
compositeValidator.addValidator(pluginValidator);
configManager.registerValidator('main', compositeValidator);

// Initialize configuration notification service
const configNotificationService = new ConfigNotificationService(configManager);

// Create configuration adapters
const diagnosticConfigAdapter = new DiagnosticConfigAdapter(
  configManager,
  configNotificationService
);

const pluginConfigAdapter = new PluginConfigAdapter(
  configManager,
  configNotificationService
);

// Create a text document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Initialize our services
const fhirPathService = new FHIRPathService();
const fhirResourceService = new FHIRResourceService();
const fhirPathContextService = new FHIRPathContextService(fhirResourceService);
const fhirPathFunctionRegistry = new FHIRPathFunctionRegistry();
const fhirValidationProvider = new FHIRValidationProvider(fhirPathService, fhirResourceService);
const diagnosticProvider = new DiagnosticProvider(
  fhirPathService,
  fhirPathContextService,
  fhirValidationProvider,
  diagnosticConfigAdapter.getEnhancedDiagnosticConfig()
);
const documentService = new DocumentService(documents, fhirPathService);
const completionProvider = new CompletionProvider(fhirPathService, fhirResourceService);
const semanticTokensProvider = new SemanticTokensProvider(fhirPathService);
const hoverProvider = new HoverProvider(fhirPathService, fhirPathContextService);
// Initialize plugin system - will be configured later from config manager
const pluginManager = new PluginManager(connection, {
  enabled: false, // Temporarily disabled until configuration is loaded
  sources: [],
  disabled: [],
  configuration: {}
});

// Legacy code action provider for backward compatibility
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

    // Add cleanup for configuration system
    serverManager.addShutdownHandler(async () => {
      try {
        diagnosticConfigAdapter.dispose();
        pluginConfigAdapter.dispose();
      } catch (error) {
        connection.console.error(`Error cleaning up configuration system: ${error}`);
      }
    });

    // Add cleanup for plugin system
    serverManager.addShutdownHandler(async () => {
      try {
        await pluginManager.dispose();
        connection.console.log('Plugin system disposed');
      } catch (error) {
        connection.console.error(`Error disposing plugin system: ${error}`);
      }
    });

  } catch (error) {
    connection.console.error(`Failed to start server manager: ${error}`);
    // Continue with basic initialization even if server manager fails
  }

  // Load configuration from all sources
  try {
    logger.info('Loading configuration...', { operation: 'loadConfiguration' });
    await configManager.loadConfiguration();
    logger.info('Configuration loaded successfully', { operation: 'loadConfiguration' });
  } catch (error) {
    logger.warn('Failed to load configuration', error, { operation: 'loadConfiguration' });
    logger.info('Using default configuration', { operation: 'loadConfiguration' });
  }

  // Initialize plugin system with loaded configuration
  try {
    logger.info('Initializing plugin system...', { operation: 'initializePlugins' });
    
    // Update plugin manager with loaded configuration
    const pluginConfig = pluginConfigAdapter.getPluginConfig();
    await (pluginManager as any).updateConfiguration(pluginConfig);
    
    if (pluginConfig.enabled) {
      await pluginManager.initialize();
      
      // Activate plugins for language support
      await pluginManager.activatePlugins({
        type: 'onLanguage',
        value: 'fhirpath'
      });
      
      logger.info('Plugin system initialized successfully', { 
        operation: 'initializePlugins'
      }, {
        pluginsEnabled: true
      });
    } else {
      logger.info('Plugin system is disabled in configuration', { 
        operation: 'initializePlugins'
      }, {
        pluginsEnabled: false
      });
    }
  } catch (error) {
    logger.error('Failed to initialize plugin system', error, { operation: 'initializePlugins' });
    logger.info('Continuing without plugin system', { operation: 'initializePlugins' });
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
  const context = requestContext.createRequestContext(
    'document',
    'contentChanged',
    change.document.uri
  );
  
  const docLogger = logger.withContext(context);
  const timer = docLogger.startPerformanceTimer('documentChange');

  docLogger.debug('Document content changed', { 
    operation: 'contentChanged' 
  }, {
    version: change.document.version,
    contentLength: change.document.getText().length
  });

  try {
    await validateTextDocument(change.document, docLogger);
    timer.end('Document validation completed');
  } catch (error) {
    docLogger.error('Document validation failed', error, { operation: 'contentChanged' });
    timer.end('Document validation failed');
    
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
      docLogger.debug('Workspace symbols updated');
    } catch (error) {
      docLogger.error('Error updating workspace symbols', error, { operation: 'updateWorkspaceSymbols' });
    }
  }
  
  requestContext.endRequest(context.requestId!);
});

// Document validation with error boundary
async function validateTextDocument(textDocument: TextDocument, parentLogger = logger): Promise<void> {
  const context = requestContext.createDiagnosticContext(
    textDocument.uri,
    textDocument.getText().substring(0, 100) + '...', // First 100 chars for context
    {
      parsePhase: 'validation'
    }
  );
  
  const diagnosticLogger = parentLogger.withContext(context);
  const timer = diagnosticLogger.startPerformanceTimer('validation');

  try {
    diagnosticLogger.debug('Starting document validation', {
      parsePhase: 'validation'
    }, {
      contentLength: textDocument.getText().length,
      version: textDocument.version
    });

    const diagnostics = await diagnosticProvider.provideDiagnostics(textDocument);
    
    connection.sendDiagnostics({
      uri: textDocument.uri,
      diagnostics
    });

    diagnosticLogger.info('Document validation completed', {
      parsePhase: 'validation'
    }, {
      diagnosticCount: diagnostics.length,
      errorCount: diagnostics.filter(d => d.severity === DiagnosticSeverity.Error).length,
      warningCount: diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning).length
    });
    
    timer.end(`Validation completed with ${diagnostics.length} diagnostics`);
  } catch (error) {
    diagnosticLogger.error('Diagnostic provider failed', error, { parsePhase: 'validation' });
    timer.end('Validation failed');
    
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
  const context = requestContext.createProviderContext(
    'completion',
    'provideCompletions', 
    params.textDocument.uri,
    {
      params: {
        position: params.position,
        triggerCharacter: params.context?.triggerCharacter,
        triggerKind: params.context?.triggerKind
      }
    }
  );
  
  const providerLogger = logger.withContext(context);
  const timer = providerLogger.startPerformanceTimer('completion');

  try {
    providerLogger.debug('Processing completion request', {
      provider: 'completion',
      method: 'provideCompletions'
    }, {
      position: params.position,
      triggerCharacter: params.context?.triggerCharacter
    });

    const document = documents.get(params.textDocument.uri);
    if (!document) {
      providerLogger.warn('Document not found for completion');
      timer.end('Completion failed - document not found');
      return [];
    }

    const result = await completionProvider.provideCompletions(document, params);
    
    providerLogger.info('Completion request completed', {
      provider: 'completion',
      method: 'provideCompletions'
    }, {
      resultCount: result.length
    });
    
    timer.end(`Completion completed with ${result.length} items`);
    return result;
  } catch (error) {
    providerLogger.error('Completion provider error', error, { provider: 'completion', method: 'provideCompletions' });
    timer.end('Completion failed with error');
    
    errorBoundary.handleError(error as Error, {
      operation: 'provide_completions',
      documentUri: params.textDocument.uri,
      timestamp: new Date(),
      severity: 'low'
    });
    return [];
  } finally {
    requestContext.endRequest(context.requestId!);
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
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      connection.console.log('Document not found');
      return [];
    }

    // Get providers from plugin system first
    const providerRegistry = pluginManager.getProviderRegistry();
    const pluginProviders = providerRegistry.getCodeActionProviders(document);
    
    if (pluginProviders.length > 0) {
      // Use plugin-based providers
      const allActions = [];
      
      for (const provider of pluginProviders) {
        try {
          const actions = await provider.provideCodeActions(document, params.range, params.context);
          if (Array.isArray(actions)) {
            allActions.push(...actions);
          }
        } catch (error) {
          connection.console.error(`Plugin provider error: ${error}`);
        }
      }
      
      return allActions;
    } else {
      // Fallback to legacy provider
      const actions = await codeActionProvider.provideCodeActions(
        document,
        params.range,
        params.context
      );

      return actions;
    }
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

// Start performance optimization services
async function startPerformanceServices() {
  try {
    // Start memory monitoring
    memoryManager.startMonitoring();

    // Start background processor
    await backgroundProcessor.start();

    // Setup profiler thresholds
    profiler.setThreshold('completion', 100);
    profiler.setThreshold('diagnostic', 200);
    profiler.setThreshold('hover', 50);

    connection.console.log('Performance optimization services started');
  } catch (error) {
    connection.console.error(`Failed to start performance services: ${error}`);
  }
}

// Enhanced request handling with throttling
function setupThrottledHandlers() {
  // Note: Request throttling is implemented within individual providers
  // using the AdaptiveRequestThrottler service
  connection.console.log('Request throttling configured in providers');
}

// Listen for document events
documents.listen(connection);

// Setup performance optimization
startPerformanceServices();
setupThrottledHandlers();

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

// Add performance metrics endpoint
connection.onRequest('fhirpath/performance', () => {
  try {
    const performanceReport = profiler.getReport();
    const memoryReport = memoryManager.getMemoryReport();
    const throttleStatus = requestThrottler.getThrottleStatus();
    const monitoringStats = performanceMonitor.getStatistics();
    const monitoringReport = performanceMonitor.getReport();

    logger.debug('Performance metrics requested', {
      operation: 'getPerformanceMetrics'
    }, {
      reportSize: performanceReport.measures.length,
      monitoringStatsCount: Array.isArray(monitoringStats) ? monitoringStats.length : 1
    });

    return {
      performance: performanceReport,
      monitoring: {
        statistics: monitoringStats,
        report: monitoringReport,
        enabled: performanceMonitor.isEnabled()
      },
      memory: memoryReport,
      throttling: throttleStatus,
      backgroundTasks: {
        queueSize: backgroundProcessor.getQueueSize(),
        activeCount: backgroundProcessor.getActiveTaskCount(),
        workerCount: backgroundProcessor.getWorkerCount()
      },
      correlationContext: correlationContext.getStats(),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Failed to generate performance metrics', error, { operation: 'getPerformanceMetrics' });
    
    return {
      error: (error as Error).message,
      timestamp: new Date().toISOString()
    };
  }
});

// Add workspace optimization endpoint
connection.onRequest('fhirpath/optimize', async (params: { rootPath: string }) => {
  try {
    await workspaceOptimizer.optimizeWorkspace(params.rootPath);
    return {
      status: 'optimized',
      timestamp: new Date().toISOString()
    };
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
