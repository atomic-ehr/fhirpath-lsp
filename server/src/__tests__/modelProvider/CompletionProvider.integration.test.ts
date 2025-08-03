import { expect, test, describe, beforeEach, mock } from 'bun:test';
import { Position, CompletionItemKind } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionProvider } from '../../providers/CompletionProvider';
import { ModelProviderService } from '../../services/ModelProviderService';
import { FHIRPathService } from '../../parser/FHIRPathService';
import { MockModelProvider } from '../helpers/MockModelProvider';

describe('CompletionProvider Integration Tests', () => {
  let completionProvider: CompletionProvider;
  let modelProviderService: ModelProviderService;
  let mockModelProvider: MockModelProvider;
  let fhirPathService: FHIRPathService;
  let mockConnection: any;

  beforeEach(async () => {
    mockConnection = {
      console: {
        log: mock(() => {}),
        error: mock(() => {}),
        warn: mock(() => {})
      }
    };

    mockModelProvider = new MockModelProvider();
    modelProviderService = new ModelProviderService(mockModelProvider);
    await modelProviderService.initialize();

    fhirPathService = new FHIRPathService();
    fhirPathService.setModelProvider(modelProviderService);

    completionProvider = new CompletionProvider(
      mockConnection,
      fhirPathService,
      modelProviderService
    );
  });

  describe('Choice Type Completions', () => {
    test('should provide choice expansions for value[x] types', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Observation.value'
      );

      const completions = await completionProvider.provideCompletions(
        document,
        Position.create(0, 17) // After 'value'
      );

      expect(completions).toBeDefined();
      expect(completions.length).toBeGreaterThan(5);

      const choiceCompletions = completions.filter(c => c.label.startsWith('value'));
      expect(choiceCompletions.length).toBeGreaterThan(5);
      expect(choiceCompletions.map(c => c.label)).toContain('valueString');
      expect(choiceCompletions.map(c => c.label)).toContain('valueQuantity');
      expect(choiceCompletions.map(c => c.label)).toContain('valueBoolean');
      expect(choiceCompletions.map(c => c.label)).toContain('valueCodeableConcept');
    });

    test('should provide choice expansions for effective[x] types', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Observation.effective'
      );

      const completions = await completionProvider.provideCompletions(
        document,
        Position.create(0, 20) // After 'effective'
      );

      const choiceCompletions = completions.filter(c => c.label.startsWith('effective'));
      expect(choiceCompletions.length).toBeGreaterThan(1);
      expect(choiceCompletions.map(c => c.label)).toContain('effectiveDateTime');
      expect(choiceCompletions.map(c => c.label)).toContain('effectivePeriod');
    });

    test('should provide choice completions for onset[x] in Condition', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Condition.onset'
      );

      const completions = await completionProvider.provideCompletions(
        document,
        Position.create(0, 15) // After 'onset'
      );

      const choiceCompletions = completions.filter(c => c.label.startsWith('onset'));
      expect(choiceCompletions.length).toBeGreaterThan(2);
      expect(choiceCompletions.map(c => c.label)).toContain('onsetDateTime');
      expect(choiceCompletions.map(c => c.label)).toContain('onsetAge');
      expect(choiceCompletions.map(c => c.label)).toContain('onsetPeriod');
    });

    test('should provide detailed information for choice type completions', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Observation.value'
      );

      const completions = await completionProvider.provideCompletions(
        document,
        Position.create(0, 17)
      );

      const valueStringCompletion = completions.find(c => c.label === 'valueString');
      expect(valueStringCompletion).toBeDefined();
      expect(valueStringCompletion!.kind).toBe(CompletionItemKind.Property);
      expect(valueStringCompletion!.detail).toContain('string');
      expect(valueStringCompletion!.documentation).toBeDefined();
    });
  });

  describe('Inherited Property Completions', () => {
    test('should include inherited properties from Resource', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.'
      );

      const completions = await completionProvider.provideCompletions(
        document,
        Position.create(0, 8) // After 'Patient.'
      );

      expect(completions).toBeDefined();
      expect(completions.length).toBeGreaterThan(10);

      // Should include properties from Resource
      expect(completions.map(c => c.label)).toContain('id');
      expect(completions.map(c => c.label)).toContain('meta');
      expect(completions.map(c => c.label)).toContain('implicitRules');
      expect(completions.map(c => c.label)).toContain('language');

      // Should include properties from DomainResource
      expect(completions.map(c => c.label)).toContain('text');
      expect(completions.map(c => c.label)).toContain('extension');

      // Should include Patient-specific properties
      expect(completions.map(c => c.label)).toContain('name');
      expect(completions.map(c => c.label)).toContain('gender');
      expect(completions.map(c => c.label)).toContain('birthDate');
    });

    test('should include inherited properties from DomainResource', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Observation.'
      );

      const completions = await completionProvider.provideCompletions(
        document,
        Position.create(0, 12) // After 'Observation.'
      );

      // Should include properties from Resource
      expect(completions.map(c => c.label)).toContain('id');
      expect(completions.map(c => c.label)).toContain('meta');

      // Should include properties from DomainResource
      expect(completions.map(c => c.label)).toContain('text');
      expect(completions.map(c => c.label)).toContain('contained');
      expect(completions.map(c => c.label)).toContain('extension');

      // Should include Observation-specific properties
      expect(completions.map(c => c.label)).toContain('status');
      expect(completions.map(c => c.label)).toContain('code');
      expect(completions.map(c => c.label)).toContain('value');
    });

    test('should mark inherited properties appropriately', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.'
      );

      const completions = await completionProvider.provideCompletions(
        document,
        Position.create(0, 8)
      );

      const idCompletion = completions.find(c => c.label === 'id');
      expect(idCompletion).toBeDefined();
      expect(idCompletion!.documentation).toContain('inherited');
      expect(idCompletion!.detail).toContain('Resource');
    });
  });

  describe('Multi-Level Navigation', () => {
    test('should provide correct completions for deep navigation', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.'
      );

      const completions = await completionProvider.provideCompletions(
        document,
        Position.create(0, 13) // After 'Patient.name.'
      );

      expect(completions).toBeDefined();
      expect(completions.length).toBeGreaterThan(5);

      // HumanName properties
      expect(completions.map(c => c.label)).toContain('family');
      expect(completions.map(c => c.label)).toContain('given');
      expect(completions.map(c => c.label)).toContain('use');
      expect(completions.map(c => c.label)).toContain('text');
      expect(completions.map(c => c.label)).toContain('prefix');
      expect(completions.map(c => c.label)).toContain('suffix');
      expect(completions.map(c => c.label)).toContain('period');
    });

    test('should handle complex navigation paths', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.period.'
      );

      const completions = await completionProvider.provideCompletions(
        document,
        Position.create(0, 20) // After 'Patient.name.period.'
      );

      // Period properties
      expect(completions.map(c => c.label)).toContain('start');
      expect(completions.map(c => c.label)).toContain('end');
    });

    test('should provide completions for CodeableConcept navigation', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Observation.code.'
      );

      const completions = await completionProvider.provideCompletions(
        document,
        Position.create(0, 17) // After 'Observation.code.'
      );

      // CodeableConcept properties
      expect(completions.map(c => c.label)).toContain('coding');
      expect(completions.map(c => c.label)).toContain('text');
    });

    test('should handle Coding navigation', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Observation.code.coding.'
      );

      const completions = await completionProvider.provideCompletions(
        document,
        Position.create(0, 24) // After 'Observation.code.coding.'
      );

      // Coding properties
      expect(completions.map(c => c.label)).toContain('system');
      expect(completions.map(c => c.label)).toContain('code');
      expect(completions.map(c => c.label)).toContain('display');
      expect(completions.map(c => c.label)).toContain('version');
      expect(completions.map(c => c.label)).toContain('userSelected');
    });
  });

  describe('Function Completions', () => {
    test('should provide FHIRPath function completions', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.wh'
      );

      const completions = await completionProvider.provideCompletions(
        document,
        Position.create(0, 15) // After 'wh'
      );

      expect(completions.map(c => c.label)).toContain('where');
    });

    test('should provide function completions with proper kind', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.se'
      );

      const completions = await completionProvider.provideCompletions(
        document,
        Position.create(0, 10) // After 'se'
      );

      const selectCompletion = completions.find(c => c.label === 'select');
      if (selectCompletion) {
        expect(selectCompletion.kind).toBe(CompletionItemKind.Function);
      }
    });
  });

  describe('Context-Aware Completions', () => {
    test('should provide different completions based on context', async () => {
      // Patient context
      const patientDoc = TextDocument.create(
        'test://patient.fhirpath',
        'fhirpath',
        1,
        'Patient.'
      );

      const patientCompletions = await completionProvider.provideCompletions(
        patientDoc,
        Position.create(0, 8)
      );

      // Observation context
      const observationDoc = TextDocument.create(
        'test://observation.fhirpath',
        'fhirpath',
        1,
        'Observation.'
      );

      const observationCompletions = await completionProvider.provideCompletions(
        observationDoc,
        Position.create(0, 12)
      );

      // Should have different properties
      expect(patientCompletions.map(c => c.label)).toContain('name');
      expect(patientCompletions.map(c => c.label)).toContain('birthDate');
      expect(observationCompletions.map(c => c.label)).toContain('value');
      expect(observationCompletions.map(c => c.label)).toContain('status');

      // Observation shouldn't have Patient-specific properties
      expect(observationCompletions.map(c => c.label)).not.toContain('birthDate');
    });

    test('should handle mixed expressions', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.where(use = "official").'
      );

      const completions = await completionProvider.provideCompletions(
        document,
        Position.create(0, 38) // After the where clause
      );

      // Should still provide HumanName properties after where clause
      expect(completions.map(c => c.label)).toContain('family');
      expect(completions.map(c => c.label)).toContain('given');
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed expressions gracefully', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient...'
      );

      const completions = await completionProvider.provideCompletions(
        document,
        Position.create(0, 10)
      );

      // Should return some completions or empty array, not throw
      expect(completions).toBeDefined();
      expect(Array.isArray(completions)).toBe(true);
    });

    test('should handle unknown resource types', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'UnknownResource.'
      );

      const completions = await completionProvider.provideCompletions(
        document,
        Position.create(0, 16)
      );

      // Should handle gracefully
      expect(completions).toBeDefined();
      expect(Array.isArray(completions)).toBe(true);
    });

    test('should handle ModelProvider failures gracefully', async () => {
      // Create a provider that throws errors
      const failingModelProvider = {
        getType: () => { throw new Error('ModelProvider failure'); },
        getElementType: () => { throw new Error('ModelProvider failure'); }
      } as any;

      const failingService = new ModelProviderService(failingModelProvider);
      const failingFhirPath = new FHIRPathService();
      failingFhirPath.setModelProvider(failingService);

      const failingProvider = new CompletionProvider(
        mockConnection,
        failingFhirPath,
        failingService
      );

      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.'
      );

      const completions = await failingProvider.provideCompletions(
        document,
        Position.create(0, 8)
      );

      // Should fallback gracefully
      expect(completions).toBeDefined();
      expect(Array.isArray(completions)).toBe(true);
    });
  });

  describe('Performance', () => {
    test('should provide completions within performance targets', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.'
      );

      const start = Date.now();
      const completions = await completionProvider.provideCompletions(
        document,
        Position.create(0, 8)
      );
      const duration = Date.now() - start;

      expect(completions).toBeDefined();
      expect(duration).toBeLessThan(100); // < 100ms for completion generation
    });

    test('should handle complex expressions efficiently', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Observation.component.where(code.coding.system = "http://loinc.org").value.'
      );

      const start = Date.now();
      const completions = await completionProvider.provideCompletions(
        document,
        Position.create(0, 76)
      );
      const duration = Date.now() - start;

      expect(completions).toBeDefined();
      expect(duration).toBeLessThan(200); // < 200ms for complex expressions
    });

    test('should cache results for repeated requests', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.'
      );
      const position = Position.create(0, 8);

      // First request
      const start1 = Date.now();
      await completionProvider.provideCompletions(document, position);
      const duration1 = Date.now() - start1;

      // Second request (should be faster due to caching)
      const start2 = Date.now();
      await completionProvider.provideCompletions(document, position);
      const duration2 = Date.now() - start2;

      expect(duration2).toBeLessThanOrEqual(duration1);
    });
  });

  describe('Completion Quality', () => {
    test('should provide meaningful documentation', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.'
      );

      const completions = await completionProvider.provideCompletions(
        document,
        Position.create(0, 8)
      );

      const nameCompletion = completions.find(c => c.label === 'name');
      expect(nameCompletion).toBeDefined();
      expect(nameCompletion!.documentation).toBeDefined();
      expect(typeof nameCompletion!.documentation === 'string' ? 
        nameCompletion!.documentation.length : 
        nameCompletion!.documentation!.value.length
      ).toBeGreaterThan(10);
    });

    test('should provide appropriate completion kinds', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.'
      );

      const completions = await completionProvider.provideCompletions(
        document,
        Position.create(0, 8)
      );

      // Property completions should have Property kind
      const propertyCompletions = completions.filter(c => 
        ['name', 'id', 'gender'].includes(c.label)
      );
      
      for (const completion of propertyCompletions) {
        expect(completion.kind).toBe(CompletionItemKind.Property);
      }
    });

    test('should sort completions appropriately', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.'
      );

      const completions = await completionProvider.provideCompletions(
        document,
        Position.create(0, 8)
      );

      // Common properties should appear before less common ones
      const nameIndex = completions.findIndex(c => c.label === 'name');
      const metaIndex = completions.findIndex(c => c.label === 'meta');
      
      if (nameIndex !== -1 && metaIndex !== -1) {
        expect(nameIndex).toBeLessThan(metaIndex); // name is more common than meta
      }
    });
  });

  describe('Regression Tests', () => {
    test('should maintain backward compatibility with basic completions', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.fam'
      );

      const completions = await completionProvider.provideCompletions(
        document,
        Position.create(0, 16) // After 'fam'
      );

      expect(completions.map(c => c.label)).toContain('family');
    });

    test('should not break when ModelProvider is unavailable', async () => {
      const providerWithoutModel = new CompletionProvider(
        mockConnection,
        fhirPathService
        // No ModelProvider
      );

      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.'
      );

      const completions = await providerWithoutModel.provideCompletions(
        document,
        Position.create(0, 8)
      );

      // Should still provide some basic completions
      expect(completions).toBeDefined();
      expect(Array.isArray(completions)).toBe(true);
    });
  });
});