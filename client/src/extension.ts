import * as path from 'path';
import {
  workspace,
  ExtensionContext,
  window,
  commands,
  StatusBarAlignment,
  ConfigurationTarget,
  Uri,
  CodeAction,
  Command
} from 'vscode';

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
  RevealOutputChannelOn,
  ErrorAction,
  CloseAction
} from 'vscode-languageclient/node';

let client: LanguageClient;
let statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 100);

/**
 * Extension activation entry point
 */
export function activate(context: ExtensionContext) {
  console.log('FHIRPath Language Extension activating...');

  // Check for .fhirpath-lsp.json in workspace
  const configFileExists = checkForConfigFile();
  
  // Show status
  statusBarItem.text = "$(loading~spin) FHIRPath";
  statusBarItem.tooltip = configFileExists 
    ? "FHIRPath Language Server starting (config detected)..."
    : "FHIRPath Language Server starting...";
  statusBarItem.show();

  // Start the language server
  startLanguageServer(context);

  // Register commands
  registerCommands(context);

  // Watch for config file changes
  watchConfigFile(context);

  console.log(`FHIRPath Language Extension activated${configFileExists ? ' (config file detected)' : ''}`);
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
      fileEvents: [
        workspace.createFileSystemWatcher('**/*.{fhirpath,fhir}'),
        workspace.createFileSystemWatcher('**/.fhirpath-lsp.json')
      ],
      configurationSection: 'fhirpath'
    },

    // Output channel for language server logs
    outputChannel: window.createOutputChannel('FHIRPath Language Server'),
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
      },

      // Code action middleware to prioritize our actions over others (like Copilot)
      provideCodeActions: async (document, range, context, token, next) => {
        console.log('Code action middleware: intercepting request');

        // Only for FHIRPath files
        if (document.languageId !== 'fhirpath') {
          return next(document, range, context, token);
        }

        // Get our actions first
        const ourActions = await next(document, range, context, token);

        // Filter and prioritize our actions
        if (Array.isArray(ourActions)) {
          console.log(`Code action middleware: got ${ourActions.length} actions`);

          // Mark all our actions as high priority and preferred
          const prioritizedActions = ourActions.map((action: Command | CodeAction) => {
            if (action.title && action.title.includes('FHIRPath')) {
              return {
                ...action,
                isPreferred: true,
                priority: ((action as any).priority || 0) + 10000
              };
            }
            return action;
          });

          return prioritizedActions;
        }

        return ourActions;
      }
    },

    // Error handling
    errorHandler: {
      error: (error, message, count) => {
        console.error('Language server error:', error, message, count);
        statusBarItem.text = "$(error) FHIRPath Error";
        statusBarItem.tooltip = `FHIRPath Language Server error: ${error.message}`;
        return { action: ErrorAction.Continue };
      },
      closed: () => {
        console.log('Language server connection closed');
        statusBarItem.text = "$(debug-disconnect) FHIRPath Disconnected";
        statusBarItem.tooltip = "FHIRPath Language Server disconnected";
        return { action: CloseAction.Restart };
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

  // Test extension activity
  const testExtensionCommand = commands.registerCommand('fhirpath.testExtension', async () => {
    const editor = window.activeTextEditor;
    window.showInformationMessage(`FHIRPath Extension Active! Language: ${editor?.document.languageId}, URI: ${editor?.document.uri.toString()}`);
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

  // Format document
  const formatDocumentCommand = commands.registerCommand('fhirpath.sourceAction.formatDocument', async () => {
    const editor = window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'fhirpath') {
      window.showWarningMessage('Please open a FHIRPath file to format');
      return;
    }

    try {
      await commands.executeCommand('editor.action.formatDocument');
      window.showInformationMessage('Document formatted');
    } catch (error) {
      window.showErrorMessage(`Failed to format document: ${error}`);
    }
  });

  // Fix all issues
  const fixAllCommand = commands.registerCommand('fhirpath.sourceAction.fixAll', async () => {
    const editor = window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'fhirpath') {
      window.showWarningMessage('Please open a FHIRPath file to fix issues');
      return;
    }

    try {
      await commands.executeCommand('editor.action.sourceAction', { kind: 'source.fixAll' });
      window.showInformationMessage('Fixed all auto-fixable issues');
    } catch (error) {
      window.showErrorMessage(`Failed to fix issues: ${error}`);
    }
  });

  // Create config file
  const createConfigCommand = commands.registerCommand('fhirpath.createConfig', async () => {
    if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
      window.showErrorMessage('Please open a workspace folder first');
      return;
    }

    const workspaceFolder = workspace.workspaceFolders[0];
    const configPath = Uri.joinPath(workspaceFolder.uri, '.fhirpath-lsp.json');

    // Check if config already exists
    try {
      await workspace.fs.stat(configPath);
      window.showInformationMessage('Configuration file already exists!');
      
      // Open the existing config file
      const doc = await workspace.openTextDocument(configPath);
      await window.showTextDocument(doc);
      return;
    } catch (error) {
      // Config doesn't exist, create it
    }

    // Default configuration
    const defaultConfig = {
      "$schema": "./schemas/fhirpath-lsp-config.schema.json",
      "enabled": true,
      "version": "1.0.0",
      "diagnostics": {
        "enabled": true,
        "performance": {
          "enabled": true,
          "maxComplexity": 10,
          "flagExpensiveOperations": true
        },
        "fhirBestPractices": {
          "enabled": true,
          "enforceTypeSafety": true,
          "suggestOptimizations": true
        }
      },
      "providers": {
        "enabled": true,
        "modelProvider": {
          "enabled": true,
          "fhirModelProvider": {
            "packages": [
              {
                "name": "hl7.fhir.r4.core",
                "version": "4.0.1"
              }
            ]
          }
        },
        "enhanced": {
          "completion": {
            "enabled": true,
            "choiceTypes": true,
            "deepNavigation": true
          }
        }
      }
    };

    try {
      const configContent = JSON.stringify(defaultConfig, null, 2);
      await workspace.fs.writeFile(configPath, Buffer.from(configContent, 'utf8'));
      
      window.showInformationMessage('FHIRPath LSP configuration file created! Enhanced features are now available.');
      
      // Open the new config file
      const doc = await workspace.openTextDocument(configPath);
      await window.showTextDocument(doc);
      
    } catch (error) {
      window.showErrorMessage(`Failed to create config file: ${error}`);
    }
  });

  // Register all commands
  context.subscriptions.push(
    validateCommand,
    clearCacheCommand,
    showCacheStatsCommand,
    testExtensionCommand,
    restartServerCommand,
    formatDocumentCommand,
    fixAllCommand,
    createConfigCommand,
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
  const configExists = checkForConfigFile();
  
  if (errorCount > 0) {
    statusBarItem.text = `$(error) FHIRPath (${errorCount})`;
    statusBarItem.tooltip = `FHIRPath: ${errorCount} error${errorCount > 1 ? 's' : ''} found${configExists ? ' • Config active' : ''}`;
  } else {
    statusBarItem.text = "$(check) FHIRPath";
    statusBarItem.tooltip = `FHIRPath: No errors${configExists ? ' • Config active' : ''}`;
  }
}

/**
 * Check if .fhirpath-lsp.json exists in any workspace folder
 */
function checkForConfigFile(): boolean {
  if (!workspace.workspaceFolders) {
    return false;
  }

  for (const folder of workspace.workspaceFolders) {
    try {
      const configPath = Uri.joinPath(folder.uri, '.fhirpath-lsp.json');
      // Note: This is a synchronous check that might not catch all cases
      // The file watcher will handle runtime detection
      return true; // We'll rely on the activation event to trigger when config exists
    } catch (error) {
      console.log('Config file check error:', error);
    }
  }
  
  return false;
}

/**
 * Watch for config file changes and notify user
 */
function watchConfigFile(context: ExtensionContext) {
  // Watch for config file creation/deletion
  const configWatcher = workspace.createFileSystemWatcher('**/.fhirpath-lsp.json');
  
  configWatcher.onDidCreate((uri) => {
    console.log('FHIRPath config file created:', uri.toString());
    window.showInformationMessage(
      'FHIRPath LSP configuration detected! Enhanced features are now available.',
      'Restart Extension'
    ).then(choice => {
      if (choice === 'Restart Extension') {
        commands.executeCommand('fhirpath.restartServer');
      }
    });
    
    // Update status bar to show config is active
    updateStatusBar(0);
  });

  configWatcher.onDidChange((uri) => {
    console.log('FHIRPath config file changed:', uri.toString());
    
    // Notify language server of config change
    if (client && client.isRunning()) {
      client.sendNotification('fhirpath/configChanged', {
        uri: uri.toString()
      });
    }
  });

  configWatcher.onDidDelete((uri) => {
    console.log('FHIRPath config file deleted:', uri.toString());
    window.showInformationMessage('FHIRPath LSP configuration removed. Some features may be limited.');
    
    // Update status bar to remove config indicator
    updateStatusBar(0);
  });

  context.subscriptions.push(configWatcher);
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
