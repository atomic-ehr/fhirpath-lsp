import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { TypeAwareValidator } from '../TypeAwareValidator';
import { FHIRPathService } from '../../../parser/FHIRPathService';
import { ModelProviderService } from '../../../services/ModelProviderService';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from 'vscode-languageserver/node';

describe('TypeAwareValidator', () => {
  let validator: TypeAwareValidator;
  let mockFHIRPathService: any;
  let mockModelProviderService: any;

  beforeEach(() => {
    // Mock FHIRPathService
    mockFHIRPathService = {
      analyzeWithContext: mock(async (expression: string, options?: any) => {
        // Simulate different analysis results based on expression
        if (expression.includes('invalidProperty')) {
          return {
            diagnostics: [{
              severity: 1,
              message: 'Property not found',
              expectedType: 'string',
              actualType: 'unknown'
            }]
          };
        }
        if (expression.includes('typeError')) {
          return {
            diagnostics: [{
              severity: 1,
              message: 'Type mismatch: expected string, got integer',
              expectedType: 'string',
              actualType: 'integer'
            }]
          };
        }
        return { diagnostics: [] };
      })
    };

    // Mock ModelProviderService
    mockModelProviderService = {
      isInitialized: () => true,
      navigatePropertyPath: mock(async (resourceType: string, pathParts: string[]) => {
        if (resourceType === 'Patient' && pathParts.includes('invalidProperty')) {
          return {
            isValid: false,
            errors: [`Property 'invalidProperty' not found on Patient`],
            finalType: null
          };
        }
        if (resourceType === 'Patient' && pathParts.includes('name')) {
          return {
            isValid: true,
            errors: [],
            finalType: { type: 'HumanName', singleton: false }
          };
        }
        return {
          isValid: true,
          errors: [],
          finalType: { type: resourceType, singleton: true }
        };
      }),
      getEnhancedTypeInfo: mock(async (typeName: string) => {
        if (typeName === 'HumanName') {
          return {
            choiceTypes: [],
            constraints: { cardinality: '0..*' }
          };
        }
        if (typeName === 'valueQuantity') {
          return {
            choiceTypes: [
              { type: { name: 'Quantity' } },
              { type: { name: 'string' } },
              { type: { name: 'boolean' } }
            ]
          };
        }
        return null;
      }),
      getModelProvider: () => ({
        getType: mock((resourceType: string) => {
          if (resourceType === 'Patient') {
            return { type: 'Patient', name: 'Patient' };
          }
          return null;
        }),
        getElementNames: mock((typeInfo: any) => {
          if (typeInfo.name === 'Patient') {
            return ['id', 'name', 'birthDate', 'gender', 'active'];
          }
          return [];
        })
      })
    };

    validator = new TypeAwareValidator(
      mockFHIRPathService,
      mockModelProviderService,
      {
        strictTypeChecking: true,
        enableContextValidation: true,
        enablePropertySuggestions: true,
        maxSuggestions: 3
      }
    );
  });

  describe('Type Compatibility Validation', () => {
    test('should detect type mismatches', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.typeError');
      
      const diagnostics = await validator.validate(document);
      
      expect(diagnostics.length).toBeGreaterThan(0);
      const typeDiagnostic = diagnostics.find(d => d.code === 'type-mismatch');
      expect(typeDiagnostic).toBeDefined();
      expect(typeDiagnostic?.severity).toBe(DiagnosticSeverity.Error);
      expect(typeDiagnostic?.message).toContain('Type mismatch');
    });

    test('should provide type conversion suggestions', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.typeError');
      
      const diagnostics = await validator.validate(document);
      
      const typeDiagnostic = diagnostics.find(d => d.code === 'type-mismatch');
      expect(typeDiagnostic?.data?.suggestions).toBeDefined();
      expect(typeDiagnostic?.data?.suggestions.length).toBeGreaterThan(0);
    });

    test('should detect single() on collection types', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.name.single()');
      
      const diagnostics = await validator.validate(document);
      
      const singleDiagnostic = diagnostics.find(d => d.code === 'single-on-collection');
      expect(singleDiagnostic).toBeDefined();
      expect(singleDiagnostic?.severity).toBe(DiagnosticSeverity.Warning);
    });

    test('should detect redundant boolean comparisons', async () => {
      // Mock the navigation to return a boolean type
      mockModelProviderService.navigatePropertyPath = mock(async () => ({
        isValid: true,
        errors: [],
        finalType: { type: 'boolean', singleton: true }
      }));

      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.active = true');
      
      const diagnostics = await validator.validate(document);
      
      const booleanDiagnostic = diagnostics.find(d => d.code === 'redundant-boolean-comparison');
      expect(booleanDiagnostic).toBeDefined();
    });
  });

  describe('Property Access Validation', () => {
    test('should detect invalid property access', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.invalidProperty');
      
      const diagnostics = await validator.validate(document);
      
      expect(diagnostics.length).toBeGreaterThan(0);
      const propertyDiagnostic = diagnostics.find(d => d.code === 'invalid-property-access');
      expect(propertyDiagnostic).toBeDefined();
      expect(propertyDiagnostic?.severity).toBe(DiagnosticSeverity.Error);
    });

    test('should provide property suggestions', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.invalidProperty');
      
      const diagnostics = await validator.validate(document);
      
      const propertyDiagnostic = diagnostics.find(d => d.code === 'invalid-property-access');
      expect(propertyDiagnostic?.data?.suggestions).toBeDefined();
      expect(propertyDiagnostic?.data?.suggestions.length).toBeGreaterThan(0);
    });

    test('should validate cardinality constraints', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.name');
      
      const diagnostics = await validator.validate(document);
      
      const cardinalityDiagnostic = diagnostics.find(d => d.code === 'cardinality-constraint');
      expect(cardinalityDiagnostic).toBeDefined();
      expect(cardinalityDiagnostic?.message).toContain('collection');
    });

    test('should detect deprecated properties', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.animal');
      
      const diagnostics = await validator.validate(document);
      
      const deprecatedDiagnostic = diagnostics.find(d => d.code === 'deprecated-property');
      expect(deprecatedDiagnostic).toBeDefined();
      expect(deprecatedDiagnostic?.severity).toBe(DiagnosticSeverity.Warning);
    });
  });

  describe('Context-Aware Validation', () => {
    test('should validate expression context', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Observation.component');
      
      const diagnostics = await validator.validate(document);
      
      // Should not produce context mismatch for valid context
      const contextDiagnostic = diagnostics.find(d => d.code === 'context-mismatch');
      expect(contextDiagnostic).toBeUndefined();
    });

    test('should detect inappropriate function usage', async () => {
      // Mock a context mismatch scenario
      mockFHIRPathService.analyzeWithContext = mock(async () => ({
        diagnostics: [{
          severity: 2,
          message: 'component property is not available on Patient resources'
        }]
      }));

      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.component');
      
      const diagnostics = await validator.validate(document);
      
      const contextDiagnostic = diagnostics.find(d => d.code === 'context-mismatch');
      expect(contextDiagnostic).toBeDefined();
      expect(contextDiagnostic?.severity).toBe(DiagnosticSeverity.Warning);
    });

    test('should provide context-specific suggestions', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Observation.name');
      
      const diagnostics = await validator.validate(document);
      
      const contextDiagnostic = diagnostics.find(d => d.data?.suggestions);
      if (contextDiagnostic) {
        expect(contextDiagnostic.data.suggestions).toBeDefined();
        expect(Array.isArray(contextDiagnostic.data.suggestions)).toBe(true);
      }
    });
  });

  describe('Batch Validation', () => {
    test('should validate multiple expressions efficiently', async () => {
      const expressions = [
        { text: 'Patient.name', line: 0, column: 0, length: 12, id: 'expr1' },
        { text: 'Patient.birthDate', line: 1, column: 0, length: 17, id: 'expr2' },
        { text: 'Observation.status', line: 2, column: 0, length: 18, id: 'expr3' }
      ];
      
      const results = await validator.validateBatch(expressions);
      
      expect(results.size).toBe(3);
      expect(results.has('expr1')).toBe(true);
      expect(results.has('expr2')).toBe(true);
      expect(results.has('expr3')).toBe(true);
    });

    test('should group expressions by resource type', async () => {
      const expressions = [
        { text: 'Patient.name', line: 0, column: 0, length: 12, id: 'expr1' },
        { text: 'Patient.birthDate', line: 1, column: 0, length: 17, id: 'expr2' },
        { text: 'Observation.status', line: 2, column: 0, length: 18, id: 'expr3' }
      ];
      
      const grouped = (validator as any).groupExpressionsByResourceType(expressions);
      
      expect(grouped.size).toBe(2);
      expect(grouped.has('Patient')).toBe(true);
      expect(grouped.has('Observation')).toBe(true);
      expect(grouped.get('Patient')?.length).toBe(2);
      expect(grouped.get('Observation')?.length).toBe(1);
    });
  });

  describe('Caching', () => {
    test('should cache validation results', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.name');
      
      // First validation
      await validator.validate(document);
      
      // Second validation should use cache
      await validator.validate(document);
      
      // ModelProvider should only be called once due to caching
      expect(mockModelProviderService.navigatePropertyPath).toHaveBeenCalledTimes(1);
    });

    test('should respect cache expiry', async () => {
      // Set short cache expiry for testing
      (validator as any).cacheExpiryMs = 1; // 1ms
      
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.name');
      
      await validator.validate(document);
      
      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 2));
      
      await validator.validate(document);
      
      // Should be called twice due to cache expiry
      expect(mockModelProviderService.navigatePropertyPath).toHaveBeenCalledTimes(2);
    });

    test('should clear caches', () => {
      validator.clearCaches();
      
      // Should not throw and should reset internal state
      expect(() => validator.clearCaches()).not.toThrow();
    });
  });

  describe('Configuration', () => {
    test('should respect strictTypeChecking configuration', async () => {
      validator.updateConfig({ strictTypeChecking: false });
      
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.typeError');
      
      const diagnostics = await validator.validate(document);
      
      // Should have fewer type-related diagnostics when strict checking is disabled
      const typeDiagnostics = diagnostics.filter(d => d.source === 'fhirpath-type-checker');
      expect(typeDiagnostics.length).toBe(0);
    });

    test('should respect enableContextValidation configuration', async () => {
      validator.updateConfig({ enableContextValidation: false });
      
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.component');
      
      const diagnostics = await validator.validate(document);
      
      // Should not perform context validation
      const contextDiagnostics = diagnostics.filter(d => d.source === 'fhirpath-context-validator');
      expect(contextDiagnostics.length).toBe(0);
    });

    test('should respect enablePropertySuggestions configuration', async () => {
      validator.updateConfig({ enablePropertySuggestions: false });
      
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.invalidProperty');
      
      const diagnostics = await validator.validate(document);
      
      const propertyDiagnostic = diagnostics.find(d => d.code === 'invalid-property-access');
      if (propertyDiagnostic?.data?.suggestions) {
        expect(propertyDiagnostic.data.suggestions.length).toBe(0);
      }
    });

    test('should respect maxSuggestions configuration', async () => {
      validator.updateConfig({ maxSuggestions: 1 });
      
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.typeError');
      
      const diagnostics = await validator.validate(document);
      
      const diagnosticWithSuggestions = diagnostics.find(d => d.data?.suggestions);
      if (diagnosticWithSuggestions) {
        expect(diagnosticWithSuggestions.data.suggestions.length).toBeLessThanOrEqual(1);
      }
    });

    test('should get current configuration', () => {
      const config = validator.getConfig();
      
      expect(config).toBeDefined();
      expect(config.strictTypeChecking).toBe(true);
      expect(config.enableContextValidation).toBe(true);
      expect(config.enablePropertySuggestions).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle ModelProviderService initialization failure', async () => {
      const validatorNoModel = new TypeAwareValidator(
        mockFHIRPathService,
        { isInitialized: () => false } as any
      );
      
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.name');
      
      const diagnostics = await validatorNoModel.validate(document);
      
      // Should not crash and should return empty diagnostics or fallback behavior
      expect(Array.isArray(diagnostics)).toBe(true);
    });

    test('should handle analysis failures gracefully', async () => {
      mockFHIRPathService.analyzeWithContext = mock(async () => {
        throw new Error('Analysis failed');
      });
      
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.name');
      
      const diagnostics = await validator.validate(document);
      
      // Should not crash and should handle errors gracefully
      expect(Array.isArray(diagnostics)).toBe(true);
    });

    test('should create validation error diagnostic for exceptions', async () => {
      // Mock a method to throw an error
      const originalMethod = (validator as any).validateTypeCompatibility;
      (validator as any).validateTypeCompatibility = mock(async () => {
        throw new Error('Validation error');
      });
      
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.name');
      
      const diagnostics = await validator.validate(document);
      
      const errorDiagnostic = diagnostics.find(d => d.code === 'validation-error');
      expect(errorDiagnostic).toBeDefined();
      expect(errorDiagnostic?.severity).toBe(DiagnosticSeverity.Error);
      
      // Restore original method
      (validator as any).validateTypeCompatibility = originalMethod;
    });
  });

  describe('Performance', () => {
    test('should validate single expression within performance target', async () => {
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.name');
      
      const start = performance.now();
      await validator.validate(document);
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(20); // 20ms target
    });

    test('should validate batch expressions within performance target', async () => {
      const expressions = Array.from({ length: 50 }, (_, i) => ({
        text: `Patient.property${i}`,
        line: i,
        column: 0,
        length: 15,
        id: `expr${i}`
      }));
      
      const start = performance.now();
      await validator.validateBatch(expressions);
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(500); // 500ms target for 50 expressions
    });
  });

  describe('String Similarity', () => {
    test('should calculate string similarity correctly', () => {
      const similarity1 = (validator as any).calculateSimilarity('name', 'nam');
      const similarity2 = (validator as any).calculateSimilarity('name', 'identifier');
      const similarity3 = (validator as any).calculateSimilarity('name', 'name');
      
      expect(similarity1).toBeGreaterThan(0.7);
      expect(similarity2).toBeLessThan(0.3);
      expect(similarity3).toBe(1.0);
    });

    test('should calculate Levenshtein distance correctly', () => {
      const distance1 = (validator as any).levenshteinDistance('cat', 'bat');
      const distance2 = (validator as any).levenshteinDistance('name', 'names');
      const distance3 = (validator as any).levenshteinDistance('same', 'same');
      
      expect(distance1).toBe(1);
      expect(distance2).toBe(1);
      expect(distance3).toBe(0);
    });
  });
});