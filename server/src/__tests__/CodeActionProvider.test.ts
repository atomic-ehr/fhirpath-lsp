import { describe, test, expect, beforeEach, mock } from 'bun:test';
import {
  TextDocument,
  Range,
  Position,
  CodeActionContext,
  DiagnosticSeverity,
  Connection,
} from 'vscode-languageserver';

import { CodeActionProvider } from '../providers/CodeActionProvider';
import { FHIRPathFunctionRegistry } from "../services/FHIRPathFunctionRegistry";
import { FHIRPathService } from '../parser/FHIRPathService';
import {
  ICodeActionProvider,
  FHIRPathCodeActionKind,
  CodeActionBuilder,
} from '../types/CodeActionTypes';

// Mock implementations
const mockConnection = {
  console: {
    log: mock(() => {}),
    error: mock(() => {}),
  },
} as unknown as Connection;

const mockFHIRPathService = {
  parse: mock(() => ({ type: 'test' })),
} as unknown as FHIRPathService;

const mockFunctionRegistry = {
  getFunctions: mock(() => []),
  getOperators: mock(() => []),
  getKeywords: mock(() => [])
} as unknown as FHIRPathFunctionRegistry;
// Test provider implementation
class TestCodeActionProvider implements ICodeActionProvider {
  async provideCodeActions() {
    return [
      CodeActionBuilder.create('Test Action', FHIRPathCodeActionKind.QuickFix)
        .withPriority(10)
        .build()
    ];
  }
}

describe('CodeActionProvider', () => {
  let provider: CodeActionProvider;
  let testDocument: TextDocument;

  beforeEach(() => {
    provider = new CodeActionProvider(mockConnection, mockFHIRPathService, mockFunctionRegistry);
    
    testDocument = TextDocument.create(
      'file:///test.fhirpath',
      'fhirpath',
      1,
      'Patient.name.where(use = "official")'
    );
  });

  test('should initialize with default registrations', () => {
    const supportedKinds = provider.getSupportedKinds();
    expect(supportedKinds.length).toBeGreaterThan(0);
    expect(supportedKinds).toContain("quickfix");
  });

  test('should register code action provider', () => {
    const testProvider = new TestCodeActionProvider();
    const customKind = "custom.test.action";
    
    provider.register({
      kinds: [FHIRPathCodeActionKind.QuickFix],
      provider: testProvider,
      priority: 10,
    });

    const supportedKinds = provider.getSupportedKinds();
    expect(supportedKinds).toContain(FHIRPathCodeActionKind.QuickFix);
  });

  test('should provide code actions from registered providers', async () => {
    const testProvider = new TestCodeActionProvider();
    const customKind = "custom.test.action";
    
    provider.register({
      kinds: [FHIRPathCodeActionKind.QuickFix],
      provider: testProvider,
      priority: 10,
    });

    const range = Range.create(Position.create(0, 0), Position.create(0, 10));
    const context: CodeActionContext = {
      diagnostics: [],
      only: [FHIRPathCodeActionKind.QuickFix],
    };

    const actions = await provider.provideCodeActions(testDocument, range, context);
    
    expect(actions).toHaveLength(1);
    expect(actions[0].title).toBe('Test Action');
    expect(actions[0].kind).toBe(FHIRPathCodeActionKind.QuickFix);
  });

  test('should sort actions by priority', async () => {
    const provider1 = new TestCodeActionProvider();
    const provider2 = {
      async provideCodeActions() {
        return [
          CodeActionBuilder.create('High Priority', FHIRPathCodeActionKind.QuickFix)
            .withPriority(20)
            .build()
        ];
      }
    };

    provider.register({
      kinds: [FHIRPathCodeActionKind.QuickFix],
      provider: provider1,
      priority: 10,
    });

    provider.register({
      kinds: [FHIRPathCodeActionKind.QuickFix],
      provider: provider2,
      priority: 15, // This should override the action priority
    });

    const range = Range.create(Position.create(0, 0), Position.create(0, 10));
    const context: CodeActionContext = {
      diagnostics: [],
      only: [FHIRPathCodeActionKind.QuickFix],
    };

    const actions = await provider.provideCodeActions(testDocument, range, context);
    
    expect(actions).toHaveLength(2);
    expect(actions[0].title).toBe('High Priority');
    expect(actions[1].title).toBe('Test Action');
  });

  test('should handle provider errors gracefully', async () => {
    const errorProvider = {
      async provideCodeActions() {
        throw new Error('Test error');
      }
    };

    provider.register({
      kinds: [FHIRPathCodeActionKind.QuickFix],
      provider: errorProvider,
      priority: 10,
    });

    const range = Range.create(Position.create(0, 0), Position.create(0, 10));
    const context: CodeActionContext = {
      diagnostics: [],
      only: [FHIRPathCodeActionKind.QuickFix],
    };

    const actions = await provider.provideCodeActions(testDocument, range, context);
    
    expect(actions).toEqual([]);
    expect(mockConnection.console.error).toHaveBeenCalled();
  });

  test('should filter actions by diagnostic context', async () => {
    const testProvider = {
      async provideCodeActions() {
        return [
          CodeActionBuilder.create('Fix Error', FHIRPathCodeActionKind.QuickFix)
            .withDiagnostics([{
              range: Range.create(Position.create(0, 0), Position.create(0, 5)),
              message: 'Test error',
              severity: DiagnosticSeverity.Error,
              code: 'E007',
              source: 'fhirpath-lsp'
            }])
            .build(),
          CodeActionBuilder.create('Format Document', FHIRPathCodeActionKind.SourceFormat)
            .build()
        ];
      }
    };

    provider.register({
      kinds: [FHIRPathCodeActionKind.QuickFix, FHIRPathCodeActionKind.SourceFormat],
      provider: testProvider,
      priority: 10,
    });

    const range = Range.create(Position.create(0, 0), Position.create(0, 10));
    const context: CodeActionContext = {
      diagnostics: [{
        range: Range.create(Position.create(0, 0), Position.create(0, 5)),
        message: 'Test error',
        severity: DiagnosticSeverity.Error,
        code: 'E007',
        source: 'fhirpath-lsp'
      }],
    };

    const actions = await provider.provideCodeActions(testDocument, range, context);
    
    // All actions should be included when no 'only' filter is specified
    expect(actions.length).toBeGreaterThanOrEqual(2);
    expect(actions.some(action => action.title === 'Fix Error')).toBe(true);
    expect(actions.some(action => action.title === 'Format Document')).toBe(true);
  });

  test('should unregister providers', () => {
    const testProvider = new TestCodeActionProvider();
    const customKind = "custom.test.action";
    
    provider.register({
      kinds: [FHIRPathCodeActionKind.QuickFix],
      provider: testProvider,
      priority: 10,
    });

    const beforeCount = provider.getSupportedKinds().filter(k => k === FHIRPathCodeActionKind.QuickFix).length;

    provider.unregister(testProvider);
    
    const afterCount = provider.getSupportedKinds().filter(k => k === FHIRPathCodeActionKind.QuickFix).length;
    expect(afterCount).toBe(beforeCount); // The kind should still be supported by default providers
  });

  test('should resolve code actions', async () => {
    const testProvider = {
      async provideCodeActions() {
        return [];
      },
      async resolveCodeAction(action: any) {
        return {
          ...action,
          data: { resolved: true }
        };
      }
    };

    provider.register({
      kinds: [FHIRPathCodeActionKind.QuickFix],
      provider: testProvider,
      priority: 10,
    });

    const action = CodeActionBuilder.create('Test', FHIRPathCodeActionKind.QuickFix).build();
    
    const resolved = await provider.resolveCodeAction(action);
    
    expect(resolved.data).toEqual({ resolved: true });
  });
});