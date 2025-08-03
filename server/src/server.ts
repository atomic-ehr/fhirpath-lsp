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
import { ModelProviderService } from './services/ModelProviderService';

// Built-in functionality (previously plugins)
import { createQuickFixProviders } from './providers/quickfix';
import { createSourceActionProviders } from './providers/sourceactions';
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

// Enhanced provider configuration
import type { HealthStatus } from './config/schemas/ProviderConfig';

// Simple logging
import { join } from 'node:path';

// Simple logger implementation
class SimpleLogger {
  debug(message: string, ...args: any[]) {
    // Only log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  }
  
  info(message: string, ...args: any[]) {
    console.info(`[INFO] ${message}`, ...args);
  }
  
  warn(message: string, ...args: any[]) {
    console.warn(`[WARN] ${message}`, ...args);
  }
  
  error(message: string, ...args: any[]) {
    console.error(`[ERROR] ${message}`, ...args);
  }
}

const logger = new SimpleLogger();

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
const compositeValidator = new CompositeConfigValidator('MainValidator');
compositeValidator.addValidator(diagnosticValidator);
compositeValidator.addValidator(providerValidator);
configManager.registerValidator('main', compositeValidator);

// Initialize configuration notification service
const configNotificationService = new ConfigNotificationService(configManager);

// Create configuration adapters
const diagnosticConfigAdapter = new DiagnosticConfigAdapter(
  configManager,
  configNotificationService
);


// Create a text document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Initialize our services
const fhirPathService = new FHIRPathService();

// Initialize ModelProviderService (will be properly configured when ModelProvider is available)
let modelProviderService: ModelProviderService | undefined;

// ModelProvider state tracking
let isModelProviderAvailable = false;
let modelProviderHealthCheck: NodeJS.Timeout | null = null;
let modelProviderFailures = 0;
const enhancedProviders = new Map<string, any>();

// Initialize FHIRResourceService with FHIRPathService for dynamic resource definitions
const fhirResourceService = new FHIRResourceService(fhirPathService);
const fhirPathContextService = new FHIRPathContextService(fhirResourceService);
const fhirPathFunctionRegistry = new FHIRPathFunctionRegistry();
const fhirValidationProvider = new FHIRValidationProvider(fhirPathService, fhirResourceService, fhirPathFunctionRegistry);
const diagnosticProvider = new DiagnosticProvider(
  fhirPathService,
  fhirPathContextService,
  fhirValidationProvider,
  diagnosticConfigAdapter.getEnhancedDiagnosticConfig()
);
const documentService = new DocumentService(documents, fhirPathService);
// These providers will be created after ModelProvider initialization
let completionProvider: CompletionProvider;
let semanticTokensProvider: SemanticTokensProvider;
let hoverProvider: HoverProvider;

// Code action providers (built-in functionality)
const quickFixProviders = createQuickFixProviders(fhirPathFunctionRegistry);
const sourceActionProviders = createSourceActionProviders(connection, fhirPathService);
const codeActionProvider = new CodeActionProvider(connection, fhirPathService, fhirPathFunctionRegistry);

// Symbol navigation providers
const symbolService = new SymbolService(fhirPathService, fhirPathFunctionRegistry);
const documentSymbolProvider = new DocumentSymbolProvider(connection, symbolService);
const definitionProvider = new DefinitionProvider(connection, symbolService, fhirPathFunctionRegistry, modelProviderService);
const referencesProvider = new ReferencesProvider(connection, symbolService);
const workspaceSymbolProvider = new WorkspaceSymbolProvider(connection, symbolService);

// Refactoring provider
const refactoringProvider = new RefactoringProvider(symbolService, fhirPathService);

// Inlay hint provider
const inlayHintProvider = new InlayHintProvider(fhirPathService, fhirPathContextService);

// Token types for semantic highlighting (must match EnhancedTokenType enum order)
const tokenTypes = [
  'function',           // 0 - FUNCTION
  'parameter',          // 1 - PARAMETER
  'variable',           // 2 - VARIABLE
  'property',           // 3 - PROPERTY
  'operator',           // 4 - OPERATOR
  'keyword',            // 5 - KEYWORD
  'string',             // 6 - STRING
  'number',             // 7 - NUMBER
  'boolean',            // 8 - BOOLEAN
  'comment',            // 9 - COMMENT
  'choiceType',         // 10 - CHOICE_TYPE
  'inheritedProperty',  // 11 - INHERITED_PROPERTY
  'requiredProperty',   // 12 - REQUIRED_PROPERTY
  'constraintViolation', // 13 - CONSTRAINT_VIOLATION
  'typeCast',           // 14 - TYPE_CAST
  'resourceReference',  // 15 - RESOURCE_REFERENCE
  'deprecatedElement',  // 16 - DEPRECATED_ELEMENT
  'extensionProperty',  // 17 - EXTENSION_PROPERTY
  'backboneElement',    // 18 - BACKBONE_ELEMENT
  'primitiveType'       // 19 - PRIMITIVE_TYPE
];

const tokenModifiers = [
  'declaration',        // 0 - DECLARATION
  'readonly',           // 1 - READONLY
  'deprecated',         // 2 - DEPRECATED
  'modification',       // 3 - MODIFICATION
  'documentation',      // 4 - DOCUMENTATION
  'defaultLibrary',     // 5 - DEFAULT_LIBRARY
  'optional',           // 6 - OPTIONAL
  'required',           // 7 - REQUIRED
  'choiceBase',         // 8 - CHOICE_BASE
  'choiceSpecific',     // 9 - CHOICE_SPECIFIC
  'inherited',          // 10 - INHERITED
  'constraintError',    // 11 - CONSTRAINT_ERROR
  'bindingRequired',    // 12 - BINDING_REQUIRED
  'bindingExtensible',  // 13 - BINDING_EXTENSIBLE
  'profiled',           // 14 - PROFILED
  'sliced'              // 15 - SLICED
];

/**
 * Initialize ModelProvider with enhanced configuration and error handling
 */
async function initializeModelProvider(): Promise<void> {
  try {
    logger.info('Initializing FHIR model provider...');
    
    const config = configManager.getConfig();
    const modelProviderConfig = config.providers?.modelProvider;
    
    if (!modelProviderConfig?.enabled) {
      logger.info('ModelProvider disabled by configuration');
      return;
    }

    await fhirPathService.initializeModelProvider(modelProviderConfig.fhirModelProvider);
    
    // Create ModelProviderService instance with the initialized model provider
    const modelProvider = fhirPathService.getModelProvider();
    if (modelProvider) {
      modelProviderService = new ModelProviderService(modelProvider, {
        enableLogging: true,
        enableHealthChecks: true,
        retryAttempts: 3,
        timeoutMs: 5000
      });
      await modelProviderService.initialize();
    }
    
    isModelProviderAvailable = true;
    modelProviderFailures = 0;
    
    // Initialize enhanced services
    await initializeEnhancedServices();
    
    // Setup health monitoring
    setupModelProviderHealthChecks();
    
    logger.info('✅ FHIR model provider initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to initialize FHIR model provider', error);
    
    const config = configManager.getConfig();
    const modelProviderConfig = config.providers?.modelProvider;
    
    if (modelProviderConfig?.required) {
      throw new Error('ModelProvider is required but failed to initialize');
    }
    
    logger.warn('Continuing without ModelProvider (fallback mode)');
    createFallbackProviders();
  }
}

/**
 * Initialize enhanced services that depend on ModelProvider
 */
async function initializeEnhancedServices(): Promise<void> {
  if (!isModelProviderAvailable) {
    return;
  }

  logger.info('Initializing enhanced services...');
  
  // Create providers with ModelProvider now that it's available
  completionProvider = new CompletionProvider(fhirPathService, modelProviderService, fhirResourceService);
  semanticTokensProvider = new SemanticTokensProvider(fhirPathService, modelProviderService);
  hoverProvider = new HoverProvider(fhirPathService, fhirPathContextService, modelProviderService);
  
  logger.info('✅ Enhanced services initialized with ModelProvider');
}

/**
 * Setup health monitoring for ModelProvider
 */
function setupModelProviderHealthChecks(): void {
  if (!isModelProviderAvailable) {
    return;
  }

  const config = configManager.getConfig();
  const healthConfig = config.providers?.healthCheck;
  
  if (!healthConfig?.enabled) {
    return;
  }

  logger.info('Setting up ModelProvider health checks');
  
  modelProviderHealthCheck = setInterval(async () => {
    try {
      const healthStatus = await checkModelProviderHealth();
      if (!healthStatus.healthy) {
        modelProviderFailures++;
        logger.warn(`ModelProvider health check failed (${modelProviderFailures} failures): ${healthStatus.reason}`);
        
        if (modelProviderFailures >= (healthConfig.maxFailures || 3)) {
          logger.error(`ModelProvider exceeded max failures (${modelProviderFailures}), disabling temporarily`);
          
          temporarilyDisableModelProvider();
        }
      } else {
        // Reset failure count on successful health check
        if (modelProviderFailures > 0) {
          logger.info('ModelProvider health restored');
          modelProviderFailures = 0;
        }
      }
    } catch (error) {
      logger.error('ModelProvider health check error', error);
      handleModelProviderError(error as Error, 'healthCheck');
    }
  }, healthConfig.intervalMs || 60000);
}

/**
 * Check ModelProvider health status
 */
async function checkModelProviderHealth(): Promise<HealthStatus> {
  if (!isModelProviderAvailable) {
    return { healthy: false, reason: 'ModelProvider not initialized' };
  }

  try {
    // Test basic functionality by checking if we can get available resource types
    const resourceTypes = fhirPathService.getAvailableResourceTypes();
    if (!resourceTypes || resourceTypes.length === 0) {
      return { healthy: false, reason: 'No resource types available from ModelProvider' };
    }

    // Test type resolution for a common resource
    const isPatientValid = fhirPathService.isValidResourceType('Patient');
    if (!isPatientValid) {
      return { healthy: false, reason: 'Unable to resolve Patient resource type' };
    }

    return { healthy: true, timestamp: new Date() };
  } catch (error) {
    return { 
      healthy: false, 
      reason: `ModelProvider error: ${(error as Error).message}`,
      timestamp: new Date()
    };
  }
}

/**
 * Handle ModelProvider errors with appropriate recovery strategies
 */
function handleModelProviderError(error: Error, context: string): void {
  logger.error(`ModelProvider error in ${context}: ${error.message}`);


  // Check if we should disable ModelProvider temporarily
  if (shouldDisableModelProvider(error)) {
    temporarilyDisableModelProvider();
  }
}

/**
 * Determine if ModelProvider should be temporarily disabled
 */
function shouldDisableModelProvider(error: Error): boolean {
  const errorMessage = error.message.toLowerCase();
  
  // Define criteria for temporary disabling
  return errorMessage.includes('econnrefused') || 
         errorMessage.includes('timeout') ||
         errorMessage.includes('registry') ||
         errorMessage.includes('network') ||
         errorMessage.includes('fetch');
}

/**
 * Temporarily disable ModelProvider and create fallback providers
 */
function temporarilyDisableModelProvider(): void {
  logger.warn('Temporarily disabling ModelProvider');
  
  isModelProviderAvailable = false;
  
  if (modelProviderHealthCheck) {
    clearInterval(modelProviderHealthCheck);
    modelProviderHealthCheck = null;
  }
  
  createFallbackProviders();
  
  // Schedule re-enabling attempt after 5 minutes
  setTimeout(() => {
    logger.info('Attempting to re-enable ModelProvider');
    initializeModelProvider().catch(error => {
      logger.error('Failed to re-enable ModelProvider', error);
    });
  }, 300000); // 5 minutes
}

/**
 * Create fallback providers when ModelProvider is unavailable
 */
function createFallbackProviders(): void {
  logger.info('Creating fallback providers without ModelProvider');
  
  // Create providers without ModelProvider for basic functionality
  completionProvider = new CompletionProvider(fhirPathService, undefined, fhirResourceService);
  semanticTokensProvider = new SemanticTokensProvider(fhirPathService, undefined);
  hoverProvider = new HoverProvider(fhirPathService, fhirPathContextService, undefined);
  
  logger.info('⚠️ Fallback providers created (limited functionality)');
  
  // Update configuration to reflect fallback state
  try {
    const currentConfig = configManager.getConfig();
    if (currentConfig.providers?.enhanced) {
      // Disable enhanced features
      logger.info('Enhanced features disabled in fallback mode');
    }
  } catch (error) {
    logger.error('Failed to update configuration for fallback mode', error);
  }
}

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
      } catch (error) {
        connection.console.error(`Error cleaning up configuration system: ${error}`);
      }
    });


  } catch (error) {
    connection.console.error(`Failed to start server manager: ${error}`);
    // Continue with basic initialization even if server manager fails
  }

  // Load configuration from all sources
  try {
    logger.info('Loading configuration...');
    await configManager.loadConfiguration();
    logger.info('Configuration loaded successfully');
  } catch (error) {
    logger.warn('Failed to load configuration', error);
    logger.info('Using default configuration');
  }

  // Create initial providers (will be recreated with ModelProvider if available)
  logger.info('Creating initial providers...');
  completionProvider = new CompletionProvider(fhirPathService, undefined, fhirResourceService);
  semanticTokensProvider = new SemanticTokensProvider(fhirPathService, undefined);
  hoverProvider = new HoverProvider(fhirPathService, fhirPathContextService, undefined);
  logger.info('Initial providers created');

  // Initialize model provider with enhanced configuration
  await initializeModelProvider();

  // Initialize built-in functionality (previously plugins)
  try {
    logger.info('Initializing built-in functionality...');
    
    // Built-in functionality is always enabled and doesn't need special initialization
    logger.info('Built-in functionality ready');
  } catch (error) {
    logger.error('Failed to initialize built-in functionality', error);
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
  connection.console.log('FHIRPath Language Server post-initialization setup...');
  
  connection.console.log('FHIRPath Language Server initialized successfully');


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
  logger.debug('Document content changed', change.document.uri);

  try {
    await validateTextDocument(change.document);
  } catch (error) {
    logger.error('Document validation failed', error);
    
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
      logger.debug('Workspace symbols updated');
    } catch (error) {
      logger.error('Error updating workspace symbols', error);
    }
  }
});

// Document validation
async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  try {
    logger.debug('Starting document validation', textDocument.uri);

    const diagnostics = await diagnosticProvider.provideDiagnostics(textDocument);
    
    connection.sendDiagnostics({
      uri: textDocument.uri,
      diagnostics
    });

    logger.info(`Document validation completed with ${diagnostics.length} diagnostics`);
  } catch (error) {
    logger.error('Diagnostic provider failed', error);
    
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

// Completion provider
connection.onCompletion(async (params) => {
  try {
    logger.debug('Processing completion request', params.textDocument.uri);

    const document = documents.get(params.textDocument.uri);
    if (!document) {
      logger.warn('Document not found for completion');
      return [];
    }

    const result = await completionProvider.provideCompletions(document, params);
    
    logger.info(`Completion completed with ${result.length} items`);
    return result;
  } catch (error) {
    logger.error('Completion provider error', error);
    
    errorBoundary.handleError(error as Error, {
      operation: 'provide_completions',
      documentUri: params.textDocument.uri,
      timestamp: new Date(),
      severity: 'low'
    });
    return [];
  }
});

// Completion resolve handler
connection.onCompletionResolve(async (item) => {
  try {
    logger.debug('Processing completion resolve request');

    const result = await completionProvider.resolveCompletionItem(item);
    
    logger.info('Completion resolve completed');
    return result;
  } catch (error) {
    logger.error('Completion resolve provider error', error);
    
    errorBoundary.handleError(error as Error, {
      operation: 'resolve_completion_item',
      documentUri: item.data?.documentUri || 'unknown',
      timestamp: new Date(),
      severity: 'low'
    });
    return item; // Return original item if resolve fails
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

    // Use built-in providers directly
    const allActions = [];
    
    // Apply quick fix providers
    for (const registration of quickFixProviders) {
      try {
        const actions = await registration.provider.provideCodeActions(document, params.range, params.context);
        if (Array.isArray(actions)) {
          allActions.push(...actions);
        }
      } catch (error) {
        connection.console.error(`Quick fix provider error: ${error}`);
      }
    }
    
    // Apply source action providers
    for (const registration of sourceActionProviders) {
      try {
        const actions = await registration.provider.provideCodeActions(document, params.range, params.context);
        if (Array.isArray(actions)) {
          allActions.push(...actions);
        }
      } catch (error) {
        connection.console.error(`Source action provider error: ${error}`);
      }
    }
    
    // Fallback to legacy provider if no actions found
    if (allActions.length === 0) {
      const legacyActions = await codeActionProvider.provideCodeActions(
        document,
        params.range,
        params.context
      );
      allActions.push(...legacyActions);
    }

    return allActions;
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

// Add ModelProvider health endpoint
connection.onRequest('fhirpath/modelProvider/health', async () => {
  try {
    return await checkModelProviderHealth();
  } catch (error) {
    return {
      healthy: false,
      error: (error as Error).message,
      timestamp: new Date()
    };
  }
});

// Shutdown handling with ModelProvider cleanup
connection.onShutdown(async () => {
  connection.console.log('FHIRPath Language Server shutting down');

  try {
    // Cleanup ModelProvider health checks
    if (modelProviderHealthCheck) {
      clearInterval(modelProviderHealthCheck);
      modelProviderHealthCheck = null;
      logger.info('ModelProvider health checks stopped');
    }

    // Additional cleanup for enhanced services
    enhancedProviders.clear();
    isModelProviderAvailable = false;
    modelProviderFailures = 0;

    logger.info('ModelProvider cleanup completed');
  } catch (error) {
    logger.error('Error during ModelProvider cleanup', error);
  }

});
