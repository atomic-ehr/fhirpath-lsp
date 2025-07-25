import { describe, test, expect, beforeEach, mock } from 'bun:test';
import {
  TextDocument,
  Range,
  Position,
  DiagnosticSeverity,
  Diagnostic,
} from 'vscode-languageserver';

import { FunctionNameQuickFixProvider } from '../../providers/quickfix/FunctionNameQuickFixProvider';
import { FHIRPathFunctionRegistry } from '../../services/FHIRPathFunctionRegistry';
import { FHIRPathCodeActionContext } from '../../types/CodeActionTypes';

describe('FunctionNameQuickFixProvider', () => {
  let provider: FunctionNameQuickFixProvider;
  let mockRegistry: FHIRPathFunctionRegistry;
  let testDocument: TextDocument;

  beforeEach(() => {
    // Mock the function registry
    mockRegistry = {
      getFunctions: mock(() => [
        { name: 'where', signature: '(criteria)', description: 'Filter collection' },
        { name: 'select', signature: '(projection)', description: 'Project values' },
        { name: 'first', signature: '()', description: 'Get first element' },
        { name: 'exists', signature: '(criteria)', description: 'Check existence' },
        { name: 'contains', signature: '(substring)', description: 'Check contains' },
      ]),
      getFunction: mock((name: string) => {
        const funcs = [
          { name: 'where', signature: '(criteria)', description: 'Filter collection' },
          { name: 'select', signature: '(projection)', description: 'Project values' },
        ];
        return funcs.find(f => f.name === name);
      }),
    } as unknown as FHIRPathFunctionRegistry;

    provider = new FunctionNameQuickFixProvider(mockRegistry);
    
    testDocument = TextDocument.create(
      'file:///test.fhirpath',
      'fhirpath',
      1,
      'Patient.name.whre(use = "official")'
    );
  });

  test('should identify fixable diagnostics', () => {
    const diagnostic: Diagnostic = {
      range: Range.create(Position.create(0, 13), Position.create(0, 17)),
      message: 'Unknown function whre',
      severity: DiagnosticSeverity.Error,
      code: 'E007',
      source: 'fhirpath-lsp'
    };

    expect(provider.canFix(diagnostic)).toBe(true);
  });

  test('should not fix non-function diagnostics', () => {
    const diagnostic: Diagnostic = {
      range: Range.create(Position.create(0, 0), Position.create(0, 5)),
      message: 'Syntax error',
      severity: DiagnosticSeverity.Error,
      code: 'E001',
      source: 'fhirpath-lsp'
    };

    expect(provider.canFix(diagnostic)).toBe(false);
  });

  test('should provide function name suggestions', async () => {
    const diagnostic: Diagnostic = {
      range: Range.create(Position.create(0, 13), Position.create(0, 17)),
      message: 'Unknown function whre',
      severity: DiagnosticSeverity.Error,
      code: 'E007',
      source: 'fhirpath-lsp'
    };

    const context: FHIRPathCodeActionContext = {
      diagnostics: [diagnostic],
    };

    const range = Range.create(Position.create(0, 13), Position.create(0, 17));
    const actions = await provider.provideCodeActions(testDocument, range, context);

    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0].title).toContain('where');
    expect(actions[0].kind).toBe('quickfix.function');
    expect(actions[0].isPreferred).toBe(true);
  });

  test('should handle case-insensitive matches', async () => {
    const upperCaseDoc = TextDocument.create(
      'file:///test.fhirpath',
      'fhirpath',
      1,
      'Patient.name.WHERE(use = "official")'
    );

    const diagnostic: Diagnostic = {
      range: Range.create(Position.create(0, 13), Position.create(0, 18)),
      message: 'Unknown function WHERE',
      severity: DiagnosticSeverity.Error,
      code: 'E007',
      source: 'fhirpath-lsp'
    };

    const context: FHIRPathCodeActionContext = {
      diagnostics: [diagnostic],
    };

    const range = Range.create(Position.create(0, 13), Position.create(0, 18));
    const actions = await provider.provideCodeActions(upperCaseDoc, range, context);

    expect(actions.length).toBeGreaterThan(0);
    expect(actions.some(action => action.title.includes('Fix case'))).toBe(true);
  });

  test('should prioritize suggestions by similarity', async () => {
    const diagnostic: Diagnostic = {
      range: Range.create(Position.create(0, 13), Position.create(0, 17)),
      message: 'Unknown function whre',
      severity: DiagnosticSeverity.Error,
      code: 'E007',
      source: 'fhirpath-lsp'
    };

    const context: FHIRPathCodeActionContext = {
      diagnostics: [diagnostic],
    };

    const range = Range.create(Position.create(0, 13), Position.create(0, 17));
    const actions = await provider.provideCodeActions(testDocument, range, context);

    // First suggestion should be 'where' (most similar to 'whre')
    expect(actions[0].title).toContain('where');
    expect(actions[0].priority).toBeGreaterThan(actions[1]?.priority || 0);
  });

  test('should handle multiple suggestions', async () => {
    const typoDoc = TextDocument.create(
      'file:///test.fhirpath',
      'fhirpath',
      1,
      'Patient.name.slect(given)'
    );

    const diagnostic: Diagnostic = {
      range: Range.create(Position.create(0, 13), Position.create(0, 18)),
      message: 'Unknown function slect',
      severity: DiagnosticSeverity.Error,
      code: 'E007',
      source: 'fhirpath-lsp'
    };

    const context: FHIRPathCodeActionContext = {
      diagnostics: [diagnostic],
    };

    const range = Range.create(Position.create(0, 13), Position.create(0, 18));
    const actions = await provider.provideCodeActions(typoDoc, range, context);

    expect(actions.length).toBeGreaterThan(0);
    expect(actions.some(action => action.title.includes('select'))).toBe(true);
  });

  test('should return empty array for no diagnostics', async () => {
    const context: FHIRPathCodeActionContext = {
      diagnostics: [],
    };

    const range = Range.create(Position.create(0, 0), Position.create(0, 10));
    const actions = await provider.provideCodeActions(testDocument, range, context);

    expect(actions).toEqual([]);
  });

  test('should handle extraction of function names correctly', async () => {
    const testCases = [
      // Simple function name
      { text: 'whre', expected: 'whre' },
      // Function call
      { text: 'whre(', expected: 'whre' },
      // Chained function
      { text: '.whre', expected: 'whre' },
      // Complex chain
      { text: 'Patient.whre', expected: 'whre' },
    ];

    for (const testCase of testCases) {
      const doc = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        testCase.text
      );

      const diagnostic: Diagnostic = {
        range: Range.create(Position.create(0, 0), Position.create(0, testCase.text.length)),
        message: `Unknown function ${testCase.expected}`,
        severity: DiagnosticSeverity.Error,
        code: 'E007',
        source: 'fhirpath-lsp'
      };

      const context: FHIRPathCodeActionContext = {
        diagnostics: [diagnostic],
      };

      const range = Range.create(Position.create(0, 0), Position.create(0, testCase.text.length));
      const actions = await provider.provideCodeActions(doc, range, context);

      if (actions.length > 0) {
        expect(actions[0].title).toContain('where');
      }
    }
  });
});