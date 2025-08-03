import { expect, test, describe, beforeEach } from 'bun:test';
import { Position } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ModelProviderService } from '../../services/ModelProviderService';
import { CompletionProvider } from '../../providers/CompletionProvider';
import { HoverProvider } from '../../providers/HoverProvider';
import { DiagnosticProvider } from '../../providers/DiagnosticProvider';
import { FHIRPathService } from '../../parser/FHIRPathService';
import { MockModelProvider } from '../helpers/MockModelProvider';

describe('ModelProvider Performance Tests', () => {
  let modelProviderService: ModelProviderService;
  let mockModelProvider: MockModelProvider;
  let completionProvider: CompletionProvider;
  let hoverProvider: HoverProvider;
  let diagnosticProvider: DiagnosticProvider;
  let fhirPathService: FHIRPathService;
  let mockConnection: any;

  beforeEach(async () => {
    mockConnection = {
      console: {
        log: () => {},
        error: () => {},
        warn: () => {}
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

    hoverProvider = new HoverProvider(
      mockConnection,
      fhirPathService,
      modelProviderService
    );

    diagnosticProvider = new DiagnosticProvider(
      mockConnection,
      fhirPathService
    );
  });

  describe('Type Resolution Performance', () => {
    test('should resolve basic types within performance targets', async () => {
      const typeNames = ['Patient', 'Observation', 'Condition', 'Procedure', 'MedicationRequest'];
      
      for (const typeName of typeNames) {
        const start = Date.now();
        const enhanced = await modelProviderService.getEnhancedTypeInfo(typeName);
        const duration = Date.now() - start;
        
        expect(enhanced).toBeDefined();
        expect(duration).toBeLessThan(200); // < 200ms for uncached resolution
      }
    });

    test('should benefit from caching on repeated requests', async () => {
      const typeName = 'Patient';
      
      // First request (uncached)
      const start1 = Date.now();
      await modelProviderService.getEnhancedTypeInfo(typeName);
      const duration1 = Date.now() - start1;
      
      // Second request (cached)
      const start2 = Date.now();
      await modelProviderService.getEnhancedTypeInfo(typeName);
      const duration2 = Date.now() - start2;
      
      expect(duration2).toBeLessThan(duration1);
      expect(duration2).toBeLessThan(50); // < 50ms for cached resolution
    });

    test('should handle concurrent type resolution efficiently', async () => {
      const typeNames = Array(20).fill(0).map((_, i) => 
        i % 4 === 0 ? 'Patient' : 
        i % 4 === 1 ? 'Observation' : 
        i % 4 === 2 ? 'Condition' : 'Procedure'
      );
      
      const start = Date.now();
      const promises = typeNames.map(name => 
        modelProviderService.getEnhancedTypeInfo(name)
      );
      const results = await Promise.all(promises);
      const duration = Date.now() - start;
      
      expect(results.every(r => r !== undefined)).toBe(true);
      expect(duration).toBeLessThan(1000); // < 1s for 20 concurrent requests
    });

    test('should handle large type hierarchies efficiently', async () => {
      const start = Date.now();
      const enhanced = await modelProviderService.getEnhancedTypeInfo('Patient');
      const duration = Date.now() - start;
      
      expect(enhanced).toBeDefined();
      expect(enhanced!.hierarchy.length).toBeGreaterThan(1);
      expect(duration).toBeLessThan(300); // < 300ms even for complex hierarchies
    });
  });

  describe('Property Navigation Performance', () => {
    test('should handle simple navigation efficiently', async () => {
      const paths = [
        ['name'],
        ['gender'],
        ['birthDate'],
        ['active'],
        ['id']
      ];
      
      for (const path of paths) {
        const start = Date.now();
        const result = await modelProviderService.navigatePropertyPath('Patient', path);
        const duration = Date.now() - start;
        
        expect(result.isValid).toBe(true);
        expect(duration).toBeLessThan(50); // < 50ms for simple navigation
      }
    });

    test('should handle deep navigation efficiently', async () => {
      const deepPaths = [
        ['name', 'given'],
        ['name', 'family'],
        ['name', 'period', 'start'],
        ['address', 'line'],
        ['telecom', 'value']
      ];
      
      for (const path of deepPaths) {
        const start = Date.now();
        const result = await modelProviderService.navigatePropertyPath('Patient', path);
        const duration = Date.now() - start;
        
        expect(duration).toBeLessThan(100); // < 100ms for deep navigation
      }
    });

    test('should handle choice type navigation efficiently', async () => {
      const choicePaths = [
        ['value'],
        ['effective'],
        ['component', 'value']
      ];
      
      for (const path of choicePaths) {
        const start = Date.now();
        const result = await modelProviderService.navigatePropertyPath('Observation', path);
        const duration = Date.now() - start;
        
        expect(duration).toBeLessThan(150); // < 150ms for choice type navigation
      }
    });
  });

  describe('Choice Type Resolution Performance', () => {
    test('should resolve choice types efficiently', async () => {
      const observationType = mockModelProvider.getType('Observation')!;
      const valueType = mockModelProvider.getElementType(observationType, 'value')!;
      
      const start = Date.now();
      const choices = await modelProviderService.resolveChoiceTypes(valueType);
      const duration = Date.now() - start;
      
      expect(choices.length).toBeGreaterThan(5);
      expect(duration).toBeLessThan(100); // < 100ms for choice type resolution
    });

    test('should handle multiple choice type resolutions efficiently', async () => {
      const observationType = mockModelProvider.getType('Observation')!;
      const valueType = mockModelProvider.getElementType(observationType, 'value')!;
      const effectiveType = mockModelProvider.getElementType(observationType, 'effective')!;
      
      const start = Date.now();
      const [valueChoices, effectiveChoices] = await Promise.all([
        modelProviderService.resolveChoiceTypes(valueType),
        modelProviderService.resolveChoiceTypes(effectiveType)
      ]);
      const duration = Date.now() - start;
      
      expect(valueChoices.length).toBeGreaterThan(0);
      expect(effectiveChoices.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(200); // < 200ms for multiple choice resolutions
    });
  });

  describe('Completion Performance', () => {
    test('should provide completions within target time', async () => {
      const testCases = [
        { content: 'Patient.', position: 8 },
        { content: 'Observation.', position: 12 },
        { content: 'Patient.name.', position: 13 },
        { content: 'Observation.value', position: 17 }
      ];
      
      for (const testCase of testCases) {
        const document = TextDocument.create(
          'test://test.fhirpath',
          'fhirpath',
          1,
          testCase.content
        );
        
        const start = Date.now();
        const completions = await completionProvider.provideCompletions(
          document,
          Position.create(0, testCase.position)
        );
        const duration = Date.now() - start;
        
        expect(completions).toBeDefined();
        expect(completions.length).toBeGreaterThan(0);
        expect(duration).toBeLessThan(100); // < 100ms for completion generation
      }
    });

    test('should handle complex expressions efficiently', async () => {
      const complexExpressions = [
        'Patient.name.where(use = "official").',
        'Observation.component.where(code.coding.system = "http://loinc.org").',
        'Patient.contact.where(relationship.coding.code = "emergency").'
      ];
      
      for (const expr of complexExpressions) {
        const document = TextDocument.create(
          'test://test.fhirpath',
          'fhirpath',
          1,
          expr
        );
        
        const start = Date.now();
        const completions = await completionProvider.provideCompletions(
          document,
          Position.create(0, expr.length)
        );
        const duration = Date.now() - start;
        
        expect(completions).toBeDefined();
        expect(duration).toBeLessThan(200); // < 200ms for complex expressions
      }
    });

    test('should benefit from completion caching', async () => {
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
      
      // Second request (should benefit from caching)
      const start2 = Date.now();
      await completionProvider.provideCompletions(document, position);
      const duration2 = Date.now() - start2;
      
      expect(duration2).toBeLessThanOrEqual(duration1);
    });
  });

  describe('Hover Performance', () => {
    test('should provide hover information efficiently', async () => {
      const testCases = [
        { content: 'Patient.name', position: 8 },
        { content: 'Observation.value', position: 13 },
        { content: 'Patient.name.given', position: 13 },
        { content: 'Observation.code.coding', position: 20 }
      ];
      
      for (const testCase of testCases) {
        const document = TextDocument.create(
          'test://test.fhirpath',
          'fhirpath',
          1,
          testCase.content
        );
        
        const start = Date.now();
        const hover = await hoverProvider.provideHover(
          document,
          Position.create(0, testCase.position)
        );
        const duration = Date.now() - start;
        
        expect(duration).toBeLessThan(50); // < 50ms for hover information
      }
    });
  });

  describe('Validation Performance', () => {
    test('should validate expressions efficiently', async () => {
      const expressions = [
        'Patient.name',
        'Observation.value',
        'Patient.name.given',
        'Observation.code.coding.system',
        'Patient.name.where(use = "official")',
        'Observation.component.where(code.coding.code = "8480-6")'
      ];
      
      for (const expr of expressions) {
        const document = TextDocument.create(
          'test://test.fhirpath',
          'fhirpath',
          1,
          expr
        );
        
        const start = Date.now();
        const diagnostics = await diagnosticProvider.provideDiagnostics(document);
        const duration = Date.now() - start;
        
        expect(diagnostics).toBeDefined();
        expect(duration).toBeLessThan(200); // < 200ms for validation
      }
    });

    test('should handle validation of invalid expressions efficiently', async () => {
      const invalidExpressions = [
        'Patient.nonexistentProperty',
        'Observation.invalidValue',
        'Patient.name.invalidProperty',
        'UnknownResource.property'
      ];
      
      for (const expr of invalidExpressions) {
        const document = TextDocument.create(
          'test://test.fhirpath',
          'fhirpath',
          1,
          expr
        );
        
        const start = Date.now();
        const diagnostics = await diagnosticProvider.provideDiagnostics(document);
        const duration = Date.now() - start;
        
        expect(diagnostics).toBeDefined();
        expect(duration).toBeLessThan(300); // < 300ms even for error cases
      }
    });
  });

  describe('Memory Usage', () => {
    test('should maintain reasonable memory usage under load', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Perform many operations
      const operations = [];
      for (let i = 0; i < 100; i++) {
        const typeName = ['Patient', 'Observation', 'Condition'][i % 3];
        operations.push(modelProviderService.getEnhancedTypeInfo(typeName));
      }
      
      await Promise.all(operations);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB
      
      expect(memoryIncrease).toBeLessThan(20); // < 20MB increase for 100 operations
    });

    test('should handle memory cleanup efficiently', async () => {
      // Fill cache with many types
      const typeNames = Array(50).fill(0).map((_, i) => `TestType${i}`);
      
      for (const typeName of typeNames) {
        await modelProviderService.getEnhancedTypeInfo(typeName);
      }
      
      const beforeCleanup = modelProviderService.getEnhancedTypeCacheStats();
      
      // Clear cache
      const start = Date.now();
      modelProviderService.clearEnhancedTypeCache();
      const cleanupDuration = Date.now() - start;
      
      const afterCleanup = modelProviderService.getEnhancedTypeCacheStats();
      
      expect(afterCleanup.size).toBeLessThan(beforeCleanup.size);
      expect(cleanupDuration).toBeLessThan(100); // < 100ms for cache cleanup
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle concurrent completion requests', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.'
      );
      
      const requests = Array(10).fill(0).map(() =>
        completionProvider.provideCompletions(
          document,
          Position.create(0, 8)
        )
      );
      
      const start = Date.now();
      const results = await Promise.all(requests);
      const duration = Date.now() - start;
      
      expect(results.every(r => r && r.length > 0)).toBe(true);
      expect(duration).toBeLessThan(500); // < 500ms for 10 concurrent requests
    });

    test('should handle mixed concurrent operations', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );
      
      const operations = [
        // Completions
        completionProvider.provideCompletions(document, Position.create(0, 8)),
        completionProvider.provideCompletions(document, Position.create(0, 12)),
        
        // Hover
        hoverProvider.provideHover(document, Position.create(0, 8)),
        hoverProvider.provideHover(document, Position.create(0, 12)),
        
        // Validation
        diagnosticProvider.provideDiagnostics(document),
        
        // Type resolution
        modelProviderService.getEnhancedTypeInfo('Patient'),
        modelProviderService.getEnhancedTypeInfo('Observation'),
        
        // Navigation
        modelProviderService.navigatePropertyPath('Patient', ['name']),
        modelProviderService.navigatePropertyPath('Patient', ['name', 'given'])
      ];
      
      const start = Date.now();
      const results = await Promise.all(operations);
      const duration = Date.now() - start;
      
      expect(results.every(r => r !== undefined)).toBe(true);
      expect(duration).toBeLessThan(1000); // < 1s for mixed operations
    });
  });

  describe('Stress Testing', () => {
    test('should handle rapid sequential requests', async () => {
      const documents = Array(20).fill(0).map((_, i) =>
        TextDocument.create(
          `test://test${i}.fhirpath`,
          'fhirpath',
          1,
          `Patient.${i % 2 === 0 ? 'name' : 'gender'}`
        )
      );
      
      const start = Date.now();
      
      for (const doc of documents) {
        await completionProvider.provideCompletions(
          doc,
          Position.create(0, 8)
        );
      }
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(2000); // < 2s for 20 sequential requests
    });

    test('should maintain performance under sustained load', async () => {
      const durations: number[] = [];
      
      // Perform operations in batches
      for (let batch = 0; batch < 5; batch++) {
        const batchStart = Date.now();
        
        const operations = Array(10).fill(0).map(() =>
          modelProviderService.getEnhancedTypeInfo('Patient')
        );
        
        await Promise.all(operations);
        
        const batchDuration = Date.now() - batchStart;
        durations.push(batchDuration);
      }
      
      // Performance should not degrade significantly
      const firstBatch = durations[0];
      const lastBatch = durations[durations.length - 1];
      
      expect(lastBatch).toBeLessThan(firstBatch * 2); // Should not more than double
    });
  });

  describe('Performance Regression Detection', () => {
    test('should meet all performance targets', async () => {
      const benchmarks = {
        typeResolution: 200,
        cachedTypeResolution: 50,
        simpleNavigation: 50,
        deepNavigation: 100,
        choiceTypeResolution: 100,
        completionGeneration: 100,
        hoverInformation: 50,
        validation: 200
      };
      
      // Type resolution (uncached)
      let start = Date.now();
      await modelProviderService.getEnhancedTypeInfo('Organization'); // Not cached yet
      let duration = Date.now() - start;
      expect(duration).toBeLessThan(benchmarks.typeResolution);
      
      // Type resolution (cached)
      start = Date.now();
      await modelProviderService.getEnhancedTypeInfo('Organization'); // Now cached
      duration = Date.now() - start;
      expect(duration).toBeLessThan(benchmarks.cachedTypeResolution);
      
      // Navigation
      start = Date.now();
      await modelProviderService.navigatePropertyPath('Patient', ['name']);
      duration = Date.now() - start;
      expect(duration).toBeLessThan(benchmarks.simpleNavigation);
      
      // Deep navigation
      start = Date.now();
      await modelProviderService.navigatePropertyPath('Patient', ['name', 'period', 'start']);
      duration = Date.now() - start;
      expect(duration).toBeLessThan(benchmarks.deepNavigation);
      
      // Choice type resolution
      const observationType = mockModelProvider.getType('Observation')!;
      const valueType = mockModelProvider.getElementType(observationType, 'value')!;
      start = Date.now();
      await modelProviderService.resolveChoiceTypes(valueType);
      duration = Date.now() - start;
      expect(duration).toBeLessThan(benchmarks.choiceTypeResolution);
      
      // Completion generation
      const document = TextDocument.create('test://test.fhirpath', 'fhirpath', 1, 'Patient.');
      start = Date.now();
      await completionProvider.provideCompletions(document, Position.create(0, 8));
      duration = Date.now() - start;
      expect(duration).toBeLessThan(benchmarks.completionGeneration);
      
      // Hover information
      start = Date.now();
      await hoverProvider.provideHover(document, Position.create(0, 8));
      duration = Date.now() - start;
      expect(duration).toBeLessThan(benchmarks.hoverInformation);
      
      // Validation
      start = Date.now();
      await diagnosticProvider.provideDiagnostics(document);
      duration = Date.now() - start;
      expect(duration).toBeLessThan(benchmarks.validation);
    });
  });
});