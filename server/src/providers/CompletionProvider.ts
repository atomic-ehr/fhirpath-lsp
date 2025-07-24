import {
  CompletionItem,
  CompletionItemKind,
  CompletionContext,
  Position
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { FHIRPathService } from '../parser/FHIRPathService';

export class CompletionProvider {
  private functionSignatures = new Map<string, CompletionItem>([
    ['where', {
      label: 'where',
      kind: CompletionItemKind.Function,
      detail: 'where(criteria: expression) -> collection',
      documentation: 'Filters the collection based on criteria'
    }],
    ['select', {
      label: 'select',
      kind: CompletionItemKind.Function,
      detail: 'select(projection: expression) -> collection',
      documentation: 'Projects each item in the collection'
    }],
    ['exists', {
      label: 'exists',
      kind: CompletionItemKind.Function,
      detail: 'exists(criteria?: expression) -> boolean',
      documentation: 'Returns true if any element matches criteria'
    }],
    ['count', {
      label: 'count',
      kind: CompletionItemKind.Function,
      detail: 'count() -> integer',
      documentation: 'Returns the number of items in the collection'
    }],
    ['first', {
      label: 'first',
      kind: CompletionItemKind.Function,
      detail: 'first() -> item',
      documentation: 'Returns the first item in the collection'
    }],
    ['last', {
      label: 'last',
      kind: CompletionItemKind.Function,
      detail: 'last() -> item',
      documentation: 'Returns the last item in the collection'
    }],
    ['matches', {
      label: 'matches',
      kind: CompletionItemKind.Function,
      detail: 'matches(regex: string) -> boolean',
      documentation: 'Tests if the string matches the regular expression'
    }],
    ['contains', {
      label: 'contains',
      kind: CompletionItemKind.Function,
      detail: 'contains(substring: string) -> boolean',
      documentation: 'Tests if the string contains the substring'
    }],
    ['startsWith', {
      label: 'startsWith',
      kind: CompletionItemKind.Function,
      detail: 'startsWith(prefix: string) -> boolean',
      documentation: 'Tests if the string starts with the prefix'
    }],
    ['endsWith', {
      label: 'endsWith',
      kind: CompletionItemKind.Function,
      detail: 'endsWith(suffix: string) -> boolean',
      documentation: 'Tests if the string ends with the suffix'
    }]
  ]);
  
  constructor(private fhirPathService: FHIRPathService) {}
  
  provideCompletions(
    document: TextDocument,
    position: Position,
    context: CompletionContext
  ): CompletionItem[] {
    const line = document.getText({
      start: { line: position.line, character: 0 },
      end: position
    });
    
    if (line.endsWith('.')) {
      return this.getPropertyCompletions(line);
    }
    
    return Array.from(this.functionSignatures.values());
  }
  
  resolveCompletion(item: CompletionItem): CompletionItem {
    return item;
  }
  
  private getPropertyCompletions(line: string): CompletionItem[] {
    const commonProperties: CompletionItem[] = [
      {
        label: 'id',
        kind: CompletionItemKind.Property,
        detail: 'Resource identifier'
      },
      {
        label: 'resourceType',
        kind: CompletionItemKind.Property,
        detail: 'FHIR resource type'
      },
      {
        label: 'meta',
        kind: CompletionItemKind.Property,
        detail: 'Resource metadata'
      }
    ];
    
    return commonProperties;
  }
}