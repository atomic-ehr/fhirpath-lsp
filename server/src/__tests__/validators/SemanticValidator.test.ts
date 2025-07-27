import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { TextDocument, DiagnosticSeverity } from 'vscode-languageserver';
import { SemanticValidator } from '../../diagnostics/validators/SemanticValidator';
import { FHIRPathService } from '../../parser/FHIRPathService';
import { FHIRPathContextService } from '../../services/FHIRPathContextService';

// Mock FHIRPathService
const mockFHIRPathService = {
  parse: mock(() => ({ success: true, expression: 'Patient.name' })),
  analyze: mock(() => ({
    errors: [],
    warnings: []
  }))
} as unknown as FHIRPathService;

// Mock FHIRPathContextService
const mockFHIRPathContextService = {
  hasContextDeclarations: mock(() => false),
  extractFHIRPathExpressions: mock(() => [])
} as unknown as FHIRPathContextService;

describe('SemanticValidator', () => {
  let validator: SemanticValidator;

  beforeEach(() => {
    validator = new SemanticValidator(mockFHIRPathService, mockFHIRPathContextService);
    // Reset mocks
    mockFHIRPathService.analyze.mockClear();
    mockFHIRPathContextService.hasContextDeclarations.mockClear();
  });

  describe('Semantic Analysis Integration', () => {
    test('should handle successful semantic analysis with no errors', async () => {
      mockFHIRPathService.analyze.mockReturnValueOnce({
        errors: [],
        warnings: []
      });

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name');
      expect(diagnostics).toHaveLength(0);
      expect(mockFHIRPathService.analyze).toHaveBeenCalledWith('Patient.name');
    });

    test('should convert semantic analysis errors to diagnostics', async () => {
      mockFHIRPathService.analyze.mockReturnValueOnce({
        errors: [{
          message: 'Type mismatch error',
          location: {
            line: 1,
            column: 5,
            length: 4
          }
        }],
        warnings: []
      });

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Warning);
      expect(diagnostics[0].message).toBe('Type mismatch error');
      expect(diagnostics[0].code).toBe('semantic-warning');
    });

    test('should convert semantic analysis warnings to diagnostics', async () => {
      mockFHIRPathService.analyze.mockReturnValueOnce({
        errors: [],
        warnings: [{
          message: 'Potential performance issue',
          location: {
            line: 1,
            column: 8,
            length: 6
          }
        }]
      });

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Information);
      expect(diagnostics[0].message).toBe('Potential performance issue');
      expect(diagnostics[0].code).toBe('semantic-info');
    });

    test('should handle multiple errors and warnings', async () => {
      mockFHIRPathService.analyze.mockReturnValueOnce({
        errors: [
          {
            message: 'Error 1',
            location: { line: 1, column: 1, length: 3 }
          },
          {
            message: 'Error 2',
            location: { line: 1, column: 5, length: 4 }
          }
        ],
        warnings: [
          {
            message: 'Warning 1',
            location: { line: 1, column: 10, length: 2 }
          }
        ]
      });

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.where(use = "official")'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name.where(use = "official")');
      expect(diagnostics).toHaveLength(3);
      expect(diagnostics[0].message).toBe('Error 1');
      expect(diagnostics[1].message).toBe('Error 2');
      expect(diagnostics[2].message).toBe('Warning 1');
    });
  });

  describe('Position Adjustment', () => {
    test('should adjust positions for expression validation', async () => {
      mockFHIRPathService.analyze.mockReturnValueOnce({
        errors: [{
          message: 'Semantic error',
          location: {
            line: 1,
            column: 5,
            length: 4
          }
        }],
        warnings: []
      });

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Some text\nPatient.name'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name', 1, 0);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].range.start.line).toBe(1);
      expect(diagnostics[0].range.start.character).toBe(4); // column - 1 + 0 offset
    });

    test('should handle expressions without location information', async () => {
      mockFHIRPathService.analyze.mockReturnValueOnce({
        errors: [{
          message: 'Semantic error without location'
        }],
        warnings: []
      });

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name', 0, 0);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].range.start.line).toBe(0);
      expect(diagnostics[0].range.start.character).toBe(0);
      expect(diagnostics[0].range.end.character).toBe(12); // Length of expression
    });

    test('should ensure positions are within document bounds', async () => {
      mockFHIRPathService.analyze.mockReturnValueOnce({
        errors: [{
          message: 'Semantic error',
          location: {
            line: 1,
            column: 100, // Beyond line length
            length: 4
          }
        }],
        warnings: []
      });

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name', 0, 0);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].range.start.character).toBeLessThanOrEqual(12); // Line length
      expect(diagnostics[0].range.end.character).toBeLessThanOrEqual(12);
    });
  });

  describe('Context Validation', () => {
    test('should not warn for expressions with context declarations', async () => {
      mockFHIRPathContextService.hasContextDeclarations.mockReturnValueOnce(true);
      mockFHIRPathService.analyze.mockReturnValueOnce({
        errors: [],
        warnings: []
      });

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        '// @resource Patient\nname'
      );

      const diagnostics = await validator.validateExpression(document, 'name', 1, 0);
      expect(diagnostics).toHaveLength(0);
    });

    test('should warn for standalone property navigation without context', async () => {
      mockFHIRPathContextService.hasContextDeclarations.mockReturnValueOnce(false);
      mockFHIRPathService.analyze.mockReturnValueOnce({
        errors: [],
        warnings: []
      });

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'name'
      );

      const diagnostics = await validator.validateExpression(document, 'name', 0, 0);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Warning);
      expect(diagnostics[0].message).toContain('Cannot navigate property');
      expect(diagnostics[0].message).toContain('Add context declaration');
      expect(diagnostics[0].code).toBe('semantic-warning');
    });

    test('should not warn for resource-prefixed expressions', async () => {
      mockFHIRPathContextService.hasContextDeclarations.mockReturnValueOnce(false);
      mockFHIRPathService.analyze.mockReturnValueOnce({
        errors: [],
        warnings: []
      });

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name', 0, 0);
      expect(diagnostics).toHaveLength(0);
    });

    test('should validate known FHIR resource types in expressions', async () => {
      mockFHIRPathContextService.hasContextDeclarations.mockReturnValueOnce(false);
      mockFHIRPathService.analyze.mockReturnValueOnce({
        errors: [],
        warnings: []
      });

      const resourceTypes = ['Patient', 'Observation', 'Condition', 'Procedure', 'MedicationRequest'];

      for (const resourceType of resourceTypes) {
        const document = TextDocument.create(
          'file:///test.fhirpath',
          'fhirpath',
          1,
          `${resourceType}.id`
        );

        const diagnostics = await validator.validateExpression(document, `${resourceType}.id`, 0, 0);
        expect(diagnostics).toHaveLength(0);
      }
    });

    test('should handle common FHIR properties', async () => {
      mockFHIRPathContextService.hasContextDeclarations.mockReturnValueOnce(false);
      mockFHIRPathService.analyze.mockReturnValueOnce({
        errors: [],
        warnings: []
      });

      const commonProperties = ['name', 'active', 'id', 'status', 'code', 'value'];

      for (const property of commonProperties) {
        const document = TextDocument.create(
          'file:///test.fhirpath',
          'fhirpath',
          1,
          property
        );

        const diagnostics = await validator.validateExpression(document, property, 0, 0);
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain('Cannot navigate property');
      }
    });
  });

  describe('Parse Result Integration', () => {
    test('should handle validateSemantics with parse result', async () => {
      const parseResult = {
        success: true,
        expression: 'Patient.name'
      };

      mockFHIRPathService.analyze.mockReturnValueOnce({
        errors: [],
        warnings: []
      });

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const diagnostics = await validator.validateSemantics(document, parseResult);
      expect(diagnostics).toHaveLength(0);
      expect(mockFHIRPathService.analyze).toHaveBeenCalledWith('Patient.name');
    });

    test('should handle validateSemantics with offset-based positioning', async () => {
      const parseResult = {
        success: true,
        expression: 'Patient.name'
      };

      mockFHIRPathService.analyze.mockReturnValueOnce({
        errors: [{
          message: 'Semantic error',
          location: {
            offset: 8,
            length: 4
          }
        }],
        warnings: []
      });

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      // Mock document.positionAt
      const originalPositionAt = document.positionAt;
      document.positionAt = mock((offset: number) => {
        if (offset === 8) return { line: 0, character: 8 };
        if (offset === 12) return { line: 0, character: 12 };
        return originalPositionAt.call(document, offset);
      });

      const diagnostics = await validator.validateSemantics(document, parseResult);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].range.start.character).toBe(8);
      expect(diagnostics[0].range.end.character).toBe(12);
    });
  });

  describe('Error Handling', () => {
    test('should handle analyzer errors gracefully', async () => {
      mockFHIRPathService.analyze.mockImplementationOnce(() => {
        throw new Error('Analyzer error');
      });

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name');
      expect(diagnostics).toHaveLength(0); // Should not crash
    });

    test('should handle null/undefined analysis results', async () => {
      mockFHIRPathService.analyze.mockReturnValueOnce(null);

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name');
      expect(diagnostics).toHaveLength(0);
    });

    test('should handle null/undefined errors and warnings', async () => {
      mockFHIRPathService.analyze.mockReturnValueOnce({
        errors: [null, undefined, { message: 'Valid error', location: { line: 1, column: 1, length: 1 } }],
        warnings: [null, { message: 'Valid warning', location: { line: 1, column: 1, length: 1 } }]
      });

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name');
      expect(diagnostics).toHaveLength(2); // Only valid error and warning
      expect(diagnostics[0].message).toBe('Valid error');
      expect(diagnostics[1].message).toBe('Valid warning');
    });

    test('should handle context service errors gracefully', async () => {
      mockFHIRPathContextService.hasContextDeclarations.mockImplementationOnce(() => {
        throw new Error('Context service error');
      });
      mockFHIRPathService.analyze.mockReturnValueOnce({
        errors: [],
        warnings: []
      });

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'name'
      );

      const diagnostics = await validator.validateExpression(document, 'name');
      expect(diagnostics).toHaveLength(0); // Should handle gracefully
    });
  });

  describe('Document-level Validation', () => {
    test('should return empty array for document-level validation', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty expressions', async () => {
      mockFHIRPathService.analyze.mockReturnValueOnce({
        errors: [],
        warnings: []
      });

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        ''
      );

      const diagnostics = await validator.validateExpression(document, '');
      expect(diagnostics).toHaveLength(0);
    });

    test('should handle expressions with special characters', async () => {
      mockFHIRPathService.analyze.mockReturnValueOnce({
        errors: [],
        warnings: []
      });

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.where($this.exists())'
      );

      const diagnostics = await validator.validateExpression(document, 'Patient.name.where($this.exists())');
      expect(diagnostics).toHaveLength(0);
    });

    test('should handle very long expressions', async () => {
      const longExpression = 'Patient.name.where(use = "official")' + '.first()'.repeat(50);

      mockFHIRPathService.analyze.mockReturnValueOnce({
        errors: [],
        warnings: []
      });

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        longExpression
      );

      const diagnostics = await validator.validateExpression(document, longExpression);
      expect(diagnostics).toHaveLength(0);
    });

    test('should respect maximum diagnostics limit', async () => {
      const manyErrors = Array.from({ length: 100 }, (_, i) => ({
        message: `Error ${i}`,
        location: { line: 1, column: i, length: 1 }
      }));

      mockFHIRPathService.analyze.mockReturnValueOnce({
        errors: manyErrors,
        warnings: []
      });

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const diagnostics = await validator.validateSemantics(document, { expression: 'Patient.name' });
      expect(diagnostics.length).toBeLessThanOrEqual(50); // Should respect maxDiagnostics
    });
  });

  describe('Property Navigation Detection', () => {
    test('should detect property navigation patterns', async () => {
      mockFHIRPathContextService.hasContextDeclarations.mockReturnValueOnce(false);
      mockFHIRPathService.analyze.mockReturnValueOnce({
        errors: [],
        warnings: []
      });

      // Test various property navigation patterns
      const patterns = [
        'Patient.name',
        'Observation.value',
        'Bundle.entry'
      ];

      for (const pattern of patterns) {
        const document = TextDocument.create(
          'file:///test.fhirpath',
          'fhirpath',
          1,
          pattern
        );

        const diagnostics = await validator.validateExpression(document, pattern);
        expect(diagnostics).toHaveLength(0); // Should not warn for resource-prefixed expressions
      }
    });

    test('should detect standalone property navigation', async () => {
      mockFHIRPathContextService.hasContextDeclarations.mockReturnValueOnce(false);
      mockFHIRPathService.analyze.mockReturnValueOnce({
        errors: [],
        warnings: []
      });

      const standaloneProperties = ['name', 'active', 'status'];

      for (const property of standaloneProperties) {
        const document = TextDocument.create(
          'file:///test.fhirpath',
          'fhirpath',
          1,
          property
        );

        const diagnostics = await validator.validateExpression(document, property);
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain('Cannot navigate property');
      }
    });
  });
});
