import {
  Range,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import {
  ICodeActionProvider,
  FHIRPathCodeAction,
  FHIRPathCodeActionContext,
  FHIRPathCodeActionKind,
  CodeActionBuilder,
} from '../../types/CodeActionTypes';

/**
 * Provides source actions that are always available (don't require diagnostics)
 * This ensures the light bulb always appears for FHIRPath files
 */
export class AlwaysAvailableSourceActions implements ICodeActionProvider {

  /**
   * Provide code actions that are always available
   */
  async provideCodeActions(
    document: TextDocument,
    range: Range,
    context: FHIRPathCodeActionContext
  ): Promise<FHIRPathCodeAction[]> {
    console.log('AlwaysAvailableSourceActions.provideCodeActions called');
    const actions: FHIRPathCodeAction[] = [];

    // Always provide a format document action - HIGHEST PRIORITY
    const formatAction = CodeActionBuilder
      .create('🔧 Format FHIRPath Document', FHIRPathCodeActionKind.SourceFormat)
      .withPriority(10000) // SUPER HIGH - beats Copilot
      .withPreferred(true) // Mark as preferred
      .withCategory('FHIRPath Source')
      .withEdit({
        changes: {
          [document.uri]: [
            {
              range: { start: { line: 0, character: 0 }, end: { line: document.lineCount, character: 0 } },
              newText: document.getText().trim() + '\n'
            }
          ]
        }
      })
      .withMetadata({
        description: 'Format the FHIRPath document with proper indentation and spacing',
        tags: ['formatting', 'fhirpath'],
        confidence: 1.0
      })
      .build();

    actions.push(formatAction);

    // Always provide an organize action - HIGHEST PRIORITY
    const organizeAction = CodeActionBuilder
      .create('📋 Organize FHIRPath Expressions', FHIRPathCodeActionKind.SourceOrganize)
      .withPriority(9500) // SUPER HIGH
      .withPreferred(true) // Mark as preferred
      .withCategory('FHIRPath Source')
      .withEdit({
        changes: {
          [document.uri]: [
            {
              range: { start: { line: 0, character: 0 }, end: { line: document.lineCount, character: 0 } },
              newText: document.getText().split('\n').filter(line => line.trim()).join('\n') + '\n'
            }
          ]
        }
      })
      .withMetadata({
        description: 'Organize and clean up FHIRPath expressions',
        tags: ['organize', 'fhirpath'],
        confidence: 1.0
      })
      .build();

    actions.push(organizeAction);

    // Always provide a fix all action - HIGHEST PRIORITY
    const fixAllAction = CodeActionBuilder
      .create('⚡ Fix All FHIRPath Issues', FHIRPathCodeActionKind.SourceFixAll)
      .withPriority(9000) // SUPER HIGH
      .withPreferred(true) // Mark as preferred
      .withCategory('FHIRPath Source')
      .withCommand({
        title: 'Fix All FHIRPath Issues',
        command: 'fhirpath.sourceAction.fixAll'
      })
      .withMetadata({
        description: 'Automatically fix all FHIRPath syntax and semantic issues',
        tags: ['fix-all', 'fhirpath'],
        confidence: 1.0
      })
      .build();

    actions.push(fixAllAction);

    return actions;
  }
}