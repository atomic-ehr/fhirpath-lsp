import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { TextDocument, DiagnosticSeverity } from 'vscode-languageserver';
import { FunctionValidator } from '../../diagnostics/validators/FunctionValidator';
import { FHIRPathFunctionRegistry } from '../../services/FHIRPathFunctionRegistry';

// Mock FHIRPathFunctionRegistry
const mockFunctionRegistry = {
  getFunctions: mock(() => [
    { name: 'where', description: 'Filter collection' },
    { name: 'select', description: 'Transform collection' },
    { name: 'first', description: 'Get first element' },
    { name: 'last', description: 'Get last element' },
    { name: 'count', description: 'Count elements' },
    { name: 'exists', description: 'Check existence' },
    { name: 'empty', description: 'Check if empty' },
    { name: 'all', description: 'Check all elements' },
    { name: 'any', description: 'Check any element' },
    { name: 'substring', description: 'Extract substring' }
  ]),
  getOperators: mock(() => [
    { name: 'and', symbol: 'and' },
    { name: 'or', symbol: 'or' },
    { name: 'not', symbol: 'not' },
    { name: 'in', symbol: 'in' },
    { name: 'contains', symbol: 'contains' }
  ]),
  getKeywords: mock(() => [
    { keyword: 'true' },
    { keyword: 'false' },
    { keyword: 'null' },
    { keyword: 'today' },
    { keyword: 'now' }
  ])
} as unknown as FHIRPathFunctionRegistry;

describe('FunctionValidator', () => {
  let validator: FunctionValidator;

  beforeEach(() => {
    validator = new FunctionValidator(mockFunctionRegistry);
  });

  describe('Function Call Validation', () => {
    test('should validate known function calls', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.where(use = "official")'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name.where(use = "official")');
      expect(diagnostics).toHaveLength(0);
    });

    test('should report error for unknown function calls', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.unknownFunction()'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name.unknownFunction()');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Error);
      expect(diagnostics[0].message).toContain('Unknown function');
      expect(diagnostics[0].message).toContain('unknownFunction');
    });

    test('should provide suggestions for similar function names', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.wher(use = "official")'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name.wher(use = "official")');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain('Did you mean');
      expect(diagnostics[0].message).toContain('where');
    });

    test('should handle multiple unknown functions in one expression', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.unknownFunc1().unknownFunc2()'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name.unknownFunc1().unknownFunc2()');
      expect(diagnostics).toHaveLength(2);
      expect(diagnostics[0].message).toContain('unknownFunc1');
      expect(diagnostics[1].message).toContain('unknownFunc2');
    });

    test('should validate function calls with complex parameters', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.where(use = "official" and given.exists())'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name.where(use = "official" and given.exists())');
      expect(diagnostics).toHaveLength(0);
    });

    test('should handle function calls with whitespace', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.where  (use = "official")'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name.where  (use = "official")');
      expect(diagnostics).toHaveLength(0);
    });
  });

  describe('Property Access Validation', () => {
    test('should not report errors for known properties', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.given'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name.given');
      expect(diagnostics).toHaveLength(0);
    });

    test('should provide suggestions for property typos', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.nam'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.nam');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Warning);
      expect(diagnostics[0].message).toContain('Unknown property');
      expect(diagnostics[0].message).toContain('nam');
    });

    test('should handle chained property access', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.family.value'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name.family.value');
      expect(diagnostics).toHaveLength(0);
    });

    test('should not flag known function names as property errors', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.where'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name.where');
      expect(diagnostics).toHaveLength(0);
    });
  });

  describe('Position Accuracy', () => {
    test('should report accurate positions for function errors', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.unknownFunc()'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name.unknownFunc()');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].range.start.line).toBe(0);
      expect(diagnostics[0].range.start.character).toBe(13); // Position of 'unknownFunc'
      expect(diagnostics[0].range.end.character).toBe(24); // End of 'unknownFunc'
    });

    test('should handle multi-line expressions', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name\n  .unknownFunc()'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name\n  .unknownFunc()');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].range.start.line).toBe(1);
      expect(diagnostics[0].range.start.character).toBe(3); // Position after dot and spaces
    });

    test('should handle expressions with line and column offsets', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Some text\nPatient.name.unknownFunc()'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name.unknownFunc()', 1, 0);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].range.start.line).toBe(1);
      expect(diagnostics[0].range.start.character).toBe(13);
    });
  });

  describe('Suggestion Generation', () => {
    test('should provide multiple suggestions for function typos', async () => {
      // Mock the registry to return specific suggestions
      mockFunctionRegistry.getFunctions.mockReturnValueOnce([
        { name: 'where', description: 'Filter' },
        { name: 'when', description: 'Conditional' },
        { name: 'while', description: 'Loop' }
      ]);

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.whe()'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name.whe()');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain('Did you mean');
    });

    test('should not provide suggestions for very different function names', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.xyz123()'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name.xyz123()');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).not.toContain('Did you mean');
      expect(diagnostics[0].message).toContain('Check FHIRPath documentation');
    });

    test('should provide suggestions for property typos', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.nam'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.nam');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain('Unknown property');
    });
  });

  describe('Registry Integration', () => {
    test('should use function registry for validation', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.customFunc()'
      );

      // Verify registry methods are called
      await validator.validateExpression(document, 'Patient.name.customFunc()');

      expect(mockFunctionRegistry.getFunctions).toHaveBeenCalled();
      expect(mockFunctionRegistry.getOperators).toHaveBeenCalled();
      expect(mockFunctionRegistry.getKeywords).toHaveBeenCalled();
    });

    test('should validate operators from registry', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.and()'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name.and()');
      expect(diagnostics).toHaveLength(0); // 'and' is a known operator
    });

    test('should validate keywords from registry', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.true()'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name.true()');
      expect(diagnostics).toHaveLength(0); // 'true' is a known keyword
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty expressions', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        ''
      );

      const diagnostics = await validator.validateExpression(document, '');
      expect(diagnostics).toHaveLength(0);
    });

    test('should handle expressions without function calls', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name');
      expect(diagnostics).toHaveLength(0);
    });

    test('should handle malformed function calls', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.('
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name.(');
      expect(diagnostics).toHaveLength(0); // Should not crash
    });

    test('should handle nested function calls', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.where(given.exists()).first()'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name.where(given.exists()).first()');
      expect(diagnostics).toHaveLength(0);
    });

    test('should handle function calls with special characters', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.where($this.exists())'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name.where($this.exists())');
      expect(diagnostics).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle registry errors gracefully', async () => {
      // Mock registry to throw error
      const errorRegistry = {
        getFunctions: mock(() => { throw new Error('Registry error'); }),
        getOperators: mock(() => []),
        getKeywords: mock(() => [])
      } as unknown as FHIRPathFunctionRegistry;

      const errorValidator = new FunctionValidator(errorRegistry);
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.where()'
      );

      const diagnostics = await errorValidator.validateExpression(document, 'Patient.name.where()');
      expect(diagnostics).toHaveLength(0); // Should not crash
    });

    test('should handle null/undefined registry responses', async () => {
      const nullRegistry = {
        getFunctions: mock(() => null),
        getOperators: mock(() => undefined),
        getKeywords: mock(() => [])
      } as unknown as FHIRPathFunctionRegistry;

      const nullValidator = new FunctionValidator(nullRegistry);
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.where()'
      );

      const diagnostics = await nullValidator.validateExpression(document, 'Patient.name.where()');
      expect(diagnostics).toHaveLength(0); // Should handle gracefully
    });
  });

  describe('Document-level Validation', () => {
    test('should validate entire document', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.unknownFunc()'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain('unknownFunc');
    });

    test('should handle multi-line documents', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.where(use = "official")\n.unknownFunc()'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain('unknownFunc');
    });
  });
});
