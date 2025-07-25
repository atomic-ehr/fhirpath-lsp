import {
  CodeAction,
  Range,
  TextDocument,
  WorkspaceEdit,
  TextEdit,
} from 'vscode-languageserver';

import {
  ICodeActionProvider,
  FHIRPathCodeAction,
  FHIRPathCodeActionContext,
  FHIRPathCodeActionKind,
  CodeActionBuilder,
} from '../../types/CodeActionTypes';

export class RemoveUnusedProvider implements ICodeActionProvider {

  async provideCodeActions(
    document: TextDocument,
    range: Range,
    context: FHIRPathCodeActionContext
  ): Promise<FHIRPathCodeAction[]> {
    const actions: FHIRPathCodeAction[] = [];

    try {
      const isSourceContext = context.only?.some(kind => 
        kind === FHIRPathCodeActionKind.Source ||
        kind === FHIRPathCodeActionKind.SourceRemoveUnused
      ) ?? true;

      if (!isSourceContext) {
        return actions;
      }

      const text = this.isEmptyRange(range) ? 
        document.getText() : 
        document.getText(range);

      // Basic unused detection examples
      if (text.includes('true and true')) {
        const action = CodeActionBuilder
          .create('Remove redundant boolean expression', FHIRPathCodeActionKind.SourceRemoveUnused)
          .withPriority(85)
          .withCategory('cleanup')
          .build();
        actions.push(action);
      }

      if (text.includes('.select(')) {
        const action = CodeActionBuilder
          .create('Remove unused select expressions', FHIRPathCodeActionKind.SourceRemoveUnused)
          .withPriority(75)
          .withCategory('cleanup')
          .build();
        actions.push(action);
      }

    } catch (error) {
      console.error('Error providing remove unused actions:', error);
    }

    return actions;
  }

  private isEmptyRange(range: Range): boolean {
    return range.start.line === range.end.line && 
           range.start.character === range.end.character;
  }
}
