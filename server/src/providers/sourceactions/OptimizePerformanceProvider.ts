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

import { FHIRPathService } from '../../parser/FHIRPathService';

export class OptimizePerformanceProvider implements ICodeActionProvider {
  private fhirPathService: FHIRPathService;

  constructor(fhirPathService: FHIRPathService) {
    this.fhirPathService = fhirPathService;
  }

  async provideCodeActions(
    document: TextDocument,
    range: Range,
    context: FHIRPathCodeActionContext
  ): Promise<FHIRPathCodeAction[]> {
    const actions: FHIRPathCodeAction[] = [];

    try {
      const isSourceContext = context.only?.some(kind => 
        kind === FHIRPathCodeActionKind.Source ||
        kind === FHIRPathCodeActionKind.RefactorOptimize
      ) ?? true;

      if (!isSourceContext) {
        return actions;
      }

      const text = this.isEmptyRange(range) ? 
        document.getText() : 
        document.getText(range);

      // Basic optimization example
      if (text.includes('.where(true)')) {
        const optimized = text.replace(/\.where\(true\)/g, '');
        if (optimized !== text) {
          const action = CodeActionBuilder
            .create('Remove redundant where(true)', FHIRPathCodeActionKind.RefactorOptimize)
            .withPriority(80)
            .withCategory('performance')
            .build();
          actions.push(action);
        }
      }

    } catch (error) {
      console.error('Error providing optimization actions:', error);
    }

    return actions;
  }

  private isEmptyRange(range: Range): boolean {
    return range.start.line === range.end.line && 
           range.start.character === range.end.character;
  }
}
