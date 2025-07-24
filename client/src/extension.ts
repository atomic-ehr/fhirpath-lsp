import * as path from 'path';
import {
  workspace,
  ExtensionContext,
  window,
  commands,
  StatusBarAlignment,
  ConfigurationTarget,
  Uri
} from 'vscode';

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
  RevealOutputChannelOn
} from 'vscode-languageclient/node';

let client: LanguageClient;
let statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 100);

/**
 * Extension activation entry point
 */
export function activate(context: ExtensionContext) {
  console.log('FHIRPath Language Extension activating...');

  // Show status
  statusBarItem.text = "$(loading~spin) FHIRPath";
  statusBarItem.tooltip = "FHIRPath Language Server starting...";
  statusBarItem.show();
  
  // Start the language server
  startLanguageServer(context);
  
  // Register commands
  registerCommands(context);
  
  console.log('FHIRPath Language Extension activated');
}

/**
 * Start the language server
 */
function startLanguageServer(context: ExtensionContext) {
  // Server module path
  const serverModule = context.asAbsolutePath(
    path.join('server', 'out', 'server.js')
  );

  // Debug options for the server
  const debugOptions = { 
    execArgv: ['--nolazy', '--inspect=6009'] 
  };

  // Server options
  const serverOptions: ServerOptions = {
    run: { 
      module: serverModule, 
      transport: TransportKind.ipc 
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions
    }
  };

  // Client options
  const clientOptions: LanguageClientOptions = {
    // Register the server for FHIRPath documents
    documentSelector: [
      { scheme: 'file', language: 'fhirpath' },
      { scheme: 'untitled', language: 'fhirpath' }
    ],
    
    // Synchronize the setting section 'fhirpath' to the server
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.{fhirpath,fhir}'),
      configurationSection: 'fhirpath'
    },

    // Output channel for language server logs
    outputChannel: window.createOutputChannel('FHIRPath Language Server'),
    outputChannelName: 'FHIRPath Language Server',
    revealOutputChannelOn: RevealOutputChannelOn.Never,

    // Middleware for handling requests/responses
    middleware: {
      // Custom completion provider middleware
      provideCompletionItem: async (document, position, context, token, next) => {
        // Add custom logic here if needed in the future
        return next(document, position, context, token);
      },

      // Custom diagnostic middleware  
      handleDiagnostics: (uri, diagnostics, next) => {
        // Update status bar based on diagnostics
        updateStatusBar(diagnostics.length);
        next(uri, diagnostics);
      }
    },

    // Error handling
    errorHandler: {
      error: (error, message, count) => {
        console.error('Language server error:', error, message, count);
        statusBarItem.text = "$(error) FHIRPath Error";
        statusBarItem.tooltip = `FHIRPath Language Server error: ${error.message}`;
        return { action: 'continue' };
      },
      closed: () => {
        console.log('Language server connection closed');
        statusBarItem.text = "$(debug-disconnect) FHIRPath Disconnected";
        statusBarItem.tooltip = "FHIRPath Language Server disconnected";
        return { action: 'restart' };
      }
    }
  };

  // Create the language client
  client = new LanguageClient(
    'fhirpathLanguageServer',
    'FHIRPath Language Server',
    serverOptions,
    clientOptions
  );

  // Start the client (and server)
  client.start().then(() => {
    console.log('FHIRPath Language Server started successfully');
    statusBarItem.text = "$(check) FHIRPath";
    statusBarItem.tooltip = "FHIRPath Language Server is running";
  }).catch(error => {
    console.error('Failed to start FHIRPath Language Server:', error);
    statusBarItem.text = "$(error) FHIRPath Failed";
    statusBarItem.tooltip = `Failed to start FHIRPath Language Server: ${error.message}`;
  });

  // Add to context subscriptions
  context.subscriptions.push(client);
}

/**
 * Register extension commands
 */
function registerCommands(context: ExtensionContext) {
  // Validate current expression
  const validateCommand = commands.registerCommand('fhirpath.validateExpression', async () => {
    const editor = window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'fhirpath') {
      window.showWarningMessage('Please open a FHIRPath file to validate');
      return;
    }

    const document = editor.document;
    const text = document.getText();
    
    if (!text.trim()) {
      window.showInformationMessage('Document is empty');
      return;
    }

    window.showInformationMessage('Validating FHIRPath expression...');
    
    try {
      // Trigger validation by requesting diagnostics
      await commands.executeCommand('vscode.executeDiagnosticProvider', document.uri);
      window.showInformationMessage('Validation complete');
    } catch (error) {
      window.showErrorMessage(`Validation failed: ${error}`);
    }
  });

  // Clear language server cache
  const clearCacheCommand = commands.registerCommand('fhirpath.clearCache', async () => {
    try {
      if (client && client.isRunning()) {
        await client.sendRequest('fhirpath/clearCache');
        window.showInformationMessage('FHIRPath cache cleared');
      } else {
        window.showWarningMessage('Language server is not running');
      }
    } catch (error) {
      window.showErrorMessage(`Failed to clear cache: ${error}`);
    }
  });

  // Show cache statistics
  const showCacheStatsCommand = commands.registerCommand('fhirpath.showCacheStats', async () => {
    try {
      if (client && client.isRunning()) {
        const stats = await client.sendRequest('fhirpath/cacheStats');
        const message = `Cache Stats:\\n${JSON.stringify(stats, null, 2)}`;
        window.showInformationMessage(message);
      } else {
        window.showWarningMessage('Language server is not running');
      }
    } catch (error) {
      window.showErrorMessage(`Failed to get cache stats: ${error}`);
    }
  });

  // Restart language server
  const restartServerCommand = commands.registerCommand('fhirpath.restartServer', async () => {
    try {
      if (client) {
        await client.stop();
        statusBarItem.text = "$(loading~spin) FHIRPath Restarting";
        statusBarItem.tooltip = "Restarting FHIRPath Language Server...";
      }
      
      // Wait a moment then restart
      setTimeout(() => {
        startLanguageServer(context);
      }, 1000);
      
      window.showInformationMessage('FHIRPath Language Server restarted');
    } catch (error) {
      window.showErrorMessage(`Failed to restart server: ${error}`);
    }
  });

  // Register all commands
  context.subscriptions.push(
    validateCommand,
    clearCacheCommand,
    showCacheStatsCommand,
    restartServerCommand,
    statusBarItem
  );

  // Configuration change handler
  const configChangeHandler = workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('fhirpath')) {
      console.log('FHIRPath configuration changed');
      // Notify server of configuration change
      if (client && client.isRunning()) {
        client.sendNotification('workspace/didChangeConfiguration', {
          settings: workspace.getConfiguration('fhirpath')
        });
      }
    }
  });

  context.subscriptions.push(configChangeHandler);
}

/**
 * Update status bar based on diagnostics
 */
function updateStatusBar(errorCount: number) {
  if (errorCount > 0) {
    statusBarItem.text = `$(error) FHIRPath (${errorCount})`;
    statusBarItem.tooltip = `FHIRPath: ${errorCount} error${errorCount > 1 ? 's' : ''} found`;
  } else {
    statusBarItem.text = "$(check) FHIRPath";
    statusBarItem.tooltip = "FHIRPath: No errors";
  }
}

/**
 * Extension deactivation
 */
export function deactivate(): Thenable<void> | undefined {
  console.log('FHIRPath Language Extension deactivating...');
  
  if (statusBarItem) {
    statusBarItem.dispose();
  }
  
  if (!client) {
    return undefined;
  }
  
  return client.stop().then(() => {
    console.log('FHIRPath Language Extension deactivated');
  });
}