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

export class OrganizeCodeProvider implements ICodeActionProvider {

  async provideCodeActions(
    document: TextDocument,
    range: Range,
    context: FHIRPathCodeActionContext
  ): Promise<FHIRPathCodeAction[]> {
    const actions: FHIRPathCodeAction[] = [];

    try {
      const isSourceContext = context.only?.some(kind => 
        kind === FHIRPathCodeActionKind.Source ||
        kind === FHIRPathCodeActionKind.SourceOrganize
      ) ?? true;

      if (!isSourceContext) {
        return actions;
      }

      const text = this.isEmptyRange(range) ? 
        document.getText() : 
        document.getText(range);

      // Basic organization example
      if (text.includes(' and ') || text.includes(' or ')) {
        const action = CodeActionBuilder
          .create('Organize logical expression', FHIRPathCodeActionKind.SourceOrganize)
          .withPriority(70)
          .withCategory('organization')
          .build();
        actions.push(action);
      }

    } catch (error) {
      console.error('Error providing organization actions:', error);
    }

    return actions;
  }

  private isEmptyRange(range: Range): boolean {
    return range.start.line === range.end.line && 
           range.start.character === range.end.character;
  }
}
