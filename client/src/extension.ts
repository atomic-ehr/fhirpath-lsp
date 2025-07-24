import * as path from 'path';
import { 
  workspace, 
  ExtensionContext,
  window,
  commands
} from 'vscode';

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  const serverModule = context.asAbsolutePath(
    path.join('..', 'server', 'out', 'server.js')
  );
  
  const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };
  
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
  
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'fhirpath' },
      { scheme: 'untitled', language: 'fhirpath' }
    ],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.fhirpath'),
      configurationSection: 'fhirpath'
    },
    middleware: {
      provideCompletionItem: async (document, position, context, token, next) => {
        return next(document, position, context, token);
      }
    }
  };
  
  client = new LanguageClient(
    'fhirpathLanguageServer',
    'FHIRPath Language Server',
    serverOptions,
    clientOptions
  );
  
  const validateCommand = commands.registerCommand('fhirpath.validateExpression', () => {
    const editor = window.activeTextEditor;
    if (editor && editor.document.languageId === 'fhirpath') {
      window.showInformationMessage('Validating FHIRPath expression...');
      client.sendRequest('fhirpath/validate', {
        uri: editor.document.uri.toString(),
        content: editor.document.getText()
      });
    }
  });
  
  context.subscriptions.push(validateCommand);
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}