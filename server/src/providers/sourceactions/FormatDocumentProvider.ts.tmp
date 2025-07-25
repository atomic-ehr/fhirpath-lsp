import {
  CodeAction,
  Range,
  TextDocument,
  WorkspaceEdit,
} from 'vscode-languageserver';

import {
  ICodeActionProvider,
  FHIRPathCodeAction,
  FHIRPathCodeActionContext,
  FHIRPathCodeActionKind,
  CodeActionBuilder,
} from '../../types/CodeActionTypes';

import { FormatterService, FormattingOptions } from '../../services/FormatterService';

/**
 * Provider for document formatting source actions
 */
export class FormatDocumentProvider implements ICodeActionProvider {
  private formatterService: FormatterService;

  constructor(formatterService: FormatterService) {
    this.formatterService = formatterService;
  }

  async provideCodeActions(
    document: TextDocument,
    range: Range,
    context: FHIRPathCodeActionContext
  ): Promise<FHIRPathCodeAction[]> {
    const actions: FHIRPathCodeAction[] = [];

    try {
      // Only provide format actions for source requests
      const isSourceContext = context.only?.some(kind => 
        kind === FHIRPathCodeActionKind.Source ||
        kind === FHIRPathCodeActionKind.SourceFormat
      ) ?? true;

      if (!isSourceContext) {
        return actions;
      }

      // Format Document action
      const formatDocumentAction = this.createFormatDocumentAction(document);
      if (formatDocumentAction) {
        actions.push(formatDocumentAction);
      }

      // Format Selection action (if range is not empty)
      if (!this.isEmptyRange(range)) {
        const formatSelectionAction = this.createFormatSelectionAction(document, range);
        if (formatSelectionAction) {
          actions.push(formatSelectionAction);
        }
      }

    } catch (error) {
      console.error('Error providing format actions:', error);
    }

    return actions;
  }

  /**
   * Create format document action
   */
  private createFormatDocumentAction(document: TextDocument): FHIRPathCodeAction | null {
    try {
      const options: FormattingOptions = this.getFormattingOptions();
      const edits = this.formatterService.formatDocument(document, options);

      if (edits.length === 0) {
        return null; // No changes needed
      }

      const workspaceEdit: WorkspaceEdit = {
        changes: {
          [document.uri]: edits
        }
      };

      return CodeActionBuilder
        .create('Format Document', FHIRPathCodeActionKind.SourceFormat)
        .withEdit(workspaceEdit)
        .withPriority(100)
        .withCategory('formatting')
        .withMetadata({
          description: 'Format the entire FHIRPath document with consistent style',
          tags: ['format', 'style', 'document'],
          confidence: 1.0
        })
        .build();

    } catch (error) {
      console.error('Error creating format document action:', error);
      return null;
    }
  }

  /**
   * Create format selection action
   */
  private createFormatSelectionAction(document: TextDocument, range: Range): FHIRPathCodeAction | null {
    try {
      const options: FormattingOptions = this.getFormattingOptions();
      const edits = this.formatterService.formatRange(document, range, options);

      if (edits.length === 0) {
        return null; // No changes needed
      }

      const workspaceEdit: WorkspaceEdit = {
        changes: {
          [document.uri]: edits
        }
      };

      return CodeActionBuilder
        .create('Format Selection', FHIRPathCodeActionKind.SourceFormat)
        .withEdit(workspaceEdit)
        .withPriority(90)
        .withCategory('formatting')
        .withMetadata({
          description: 'Format the selected FHIRPath expression with consistent style',
          tags: ['format', 'style', 'selection'],
          confidence: 1.0
        })
        .build();

    } catch (error) {
      console.error('Error creating format selection action:', error);
      return null;
    }
  }

  /**
   * Get formatting options from configuration
   * TODO: Read from VS Code settings when configuration system is implemented
   */
  private getFormattingOptions(): FormattingOptions {
    return {
      indentSize: 2,
      maxLineLength: 100,
      operatorSpacing: true,
      functionAlignment: true,
      bracketSpacing: false,
      trailingCommas: false,
      multiExpressionSpacing: 1,
    };
  }

  /**
   * Check if range is empty (no selection)
   */
  private isEmptyRange(range: Range): boolean {
    return range.start.line === range.end.line && 
           range.start.character === range.end.character;
  }
}