import { test, expect } from 'bun:test';
import { RefactoringProvider, RefactoringType } from '../../providers/RefactoringProvider';
import { SymbolService } from '../../services/SymbolService';
import { FHIRPathService } from '../../parser/FHIRPathService';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Range } from 'vscode-languageserver';

// Setup test dependencies
const fhirPathService = new FHIRPathService();
const symbolService = new SymbolService(fhirPathService);
const refactoringProvider = new RefactoringProvider(symbolService, fhirPathService);

test('RefactoringProvider - prepareRename identifies renameable symbols', async () => {
  const document = TextDocument.create(
    'test://rename.fhirpath',
    'fhirpath',
    1,
    'let patientName = Patient.name\npatientName.given'
  );

  // Test position on variable name
  const position: Position = { line: 0, character: 6 }; // on "patientName"
  const range = await refactoringProvider.prepareRename(document, position);

  expect(range).not.toBeNull();
  if (range) {
    expect(range.start.line).toBe(0);
    expect(range.start.character).toBeGreaterThanOrEqual(4);
    expect(range.end.character).toBeGreaterThan(range.start.character);
  }
});

test('RefactoringProvider - prepareRename rejects non-renameable positions', async () => {
  const document = TextDocument.create(
    'test://rename.fhirpath',
    'fhirpath',
    1,
    'Patient.name.given'
  );

  // Test position on built-in property
  const position: Position = { line: 0, character: 2 }; // on "Patient"
  const range = await refactoringProvider.prepareRename(document, position);

  // Should not be able to rename built-in resource types
  expect(range).toBeNull();
});

test('RefactoringProvider - provideRenameEdits creates valid edits', async () => {
  const document = TextDocument.create(
    'test://rename.fhirpath',
    'fhirpath',
    1,
    'let oldName = Patient.name\noldName.given'
  );

  const position: Position = { line: 0, character: 6 }; // on "oldName"
  const newName = 'newName';

  const workspaceEdit = await refactoringProvider.provideRenameEdits(document, position, newName);

  expect(workspaceEdit).not.toBeNull();
  if (workspaceEdit?.changes) {
    const edits = workspaceEdit.changes[document.uri];
    expect(edits).toBeDefined();
    expect(edits.length).toBeGreaterThan(0);
    
    // Should replace both declaration and usage
    expect(edits.some(edit => edit.newText === newName)).toBe(true);
  }
});

test('RefactoringProvider - rejects invalid variable names', async () => {
  const document = TextDocument.create(
    'test://rename.fhirpath',
    'fhirpath',
    1,
    'let myVar = Patient.name'
  );

  const position: Position = { line: 0, character: 6 };
  const invalidName = '123invalid';

  const workspaceEdit = await refactoringProvider.provideRenameEdits(document, position, invalidName);

  expect(workspaceEdit).toBeNull();
});

test('RefactoringProvider - provides extract variable actions', async () => {
  const document = TextDocument.create(
    'test://extract.fhirpath',
    'fhirpath',
    1,
    'Patient.name.where(use = "official").given.first()'
  );

  const range: Range = {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 42 } // Select the whole expression
  };

  const actions = await refactoringProvider.provideRefactoringActions(document, range, { diagnostics: [] });

  expect(actions.length).toBeGreaterThan(0);
  const extractAction = actions.find(action => action.title.includes('Extract to variable'));
  expect(extractAction).toBeDefined();
  expect(extractAction?.kind).toBe('refactor.extract');
});

test('RefactoringProvider - provides simplify expression actions', async () => {
  const document = TextDocument.create(
    'test://simplify.fhirpath',
    'fhirpath',
    1,
    'Patient.active = true and Patient.name.count() > 0'
  );

  const range: Range = {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 44 }
  };

  const actions = await refactoringProvider.provideRefactoringActions(document, range, { diagnostics: [] });

  const simplifyAction = actions.find(action => action.title.includes('Simplify expression'));
  expect(simplifyAction).toBeDefined();
  expect(simplifyAction?.kind).toBe('refactor.rewrite');
});

test('RefactoringProvider - configuration management', () => {
  const originalConfig = refactoringProvider.getConfig();
  expect(originalConfig.enabled).toBe(true);

  // Update configuration
  refactoringProvider.updateConfig({ enabled: false });
  const updatedConfig = refactoringProvider.getConfig();
  expect(updatedConfig.enabled).toBe(false);

  // Reset for other tests
  refactoringProvider.updateConfig({ enabled: true });
});

test('RefactoringProvider - handles empty or invalid selections', async () => {
  const document = TextDocument.create(
    'test://empty.fhirpath',
    'fhirpath',
    1,
    'Patient.name'
  );

  const emptyRange: Range = {
    start: { line: 0, character: 5 },
    end: { line: 0, character: 5 } // Empty selection
  };

  const actions = await refactoringProvider.provideRefactoringActions(document, emptyRange, { diagnostics: [] });
  
  // Should handle gracefully and return no actions for empty selection
  expect(Array.isArray(actions)).toBe(true);
});

test('RefactoringProvider - executeRefactoring placeholder functionality', async () => {
  const document = TextDocument.create(
    'test://execute.fhirpath',
    'fhirpath',
    1,
    'Patient.name.given'
  );

  const range: Range = {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 17 }
  };

  // Test extract variable (should currently return not implemented)
  const result = await refactoringProvider.executeRefactoring(
    RefactoringType.ExtractVariable,
    document,
    range,
    { name: 'patientGiven' }
  );

  expect(result.success).toBe(false);
  expect(result.error).toContain('not yet implemented');
});

test('RefactoringProvider - error handling', async () => {
  const document = TextDocument.create(
    'test://error.fhirpath',
    'fhirpath',
    1,
    '' // Empty document
  );

  const position: Position = { line: 0, character: 0 };
  
  // Should handle gracefully without throwing
  const range = await refactoringProvider.prepareRename(document, position);
  expect(range).toBeNull();

  const workspaceEdit = await refactoringProvider.provideRenameEdits(document, position, 'newName');
  expect(workspaceEdit).toBeNull();
});