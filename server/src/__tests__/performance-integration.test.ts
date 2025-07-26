import { performance } from 'perf_hooks';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionProvider } from '../providers/CompletionProvider';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';
import { FHIRPathService } from '../parser/FHIRPathService';
import { FHIRPathContextService } from '../services/FHIRPathContextService';
import { FHIRResourceService } from '../services/FHIRResourceService';
import { cacheService } from '../services/CacheService';
import { getGlobalProfiler } from '../utils/PerformanceProfiler';

describe('Performance Integration Tests', () => {
  let fhirPathService: FHIRPathService;
  let fhirResourceService: FHIRResourceService;
  let fhirPathContextService: FHIRPathContextService;
  let completionProvider: CompletionProvider;
  let diagnosticProvider: DiagnosticProvider;
  
  beforeAll(() => {
    fhirPathService = new FHIRPathService();
    fhirResourceService = new FHIRResourceService();
    fhirPathContextService = new FHIRPathContextService(fhirResourceService);
    completionProvider = new CompletionProvider(fhirPathService, fhirResourceService);
    diagnosticProvider = new DiagnosticProvider(fhirPathService, fhirPathContextService);
  });

  beforeEach(() => {
    // Clear caches before each test
    cacheService.clearCache();
    getGlobalProfiler().clear();
  });

  describe('Completion Performance', () => {
    test('should provide completions within performance targets', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.'
      );

      const params = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 13 },
        context: { triggerKind: 2, triggerCharacter: '.' }
      };

      const start = performance.now();
      const completions = await completionProvider.provideCompletions(document, params);
      const duration = performance.now() - start;

      expect(Array.isArray(completions)).toBe(true);
      expect(duration).toBeLessThan(100); // Target: < 100ms
      
      console.log(`Completion response time: ${duration.toFixed(2)}ms`);
    });

    test('should benefit from caching on repeated requests', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.given'
      );

      const params = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 17 },
        context: { triggerKind: 2, triggerCharacter: '.' }
      };

      // First request (cache miss)
      const start1 = performance.now();
      const completions1 = await completionProvider.provideCompletions(document, params);
      const duration1 = performance.now() - start1;

      // Second request (cache hit)
      const start2 = performance.now();
      const completions2 = await completionProvider.provideCompletions(document, params);
      const duration2 = performance.now() - start2;

      expect(completions1).toEqual(completions2);
      expect(duration2).toBeLessThan(duration1); // Cache should be faster
      
      console.log(`First request: ${duration1.toFixed(2)}ms, Cached request: ${duration2.toFixed(2)}ms`);
      console.log(`Cache speedup: ${(duration1 / duration2).toFixed(2)}x`);
    });

    test('should handle large completion requests efficiently', async () => {
      const largeExpression = 'Patient.name.where(' + 'use = "official" and '.repeat(10) + 'family.exists())';
      const document = TextDocument.create(
        'test://large.fhirpath',
        'fhirpath',
        1,
        largeExpression + '.'
      );

      const params = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: largeExpression.length + 1 },
        context: { triggerKind: 2, triggerCharacter: '.' }
      };

      const start = performance.now();
      const completions = await completionProvider.provideCompletions(document, params);
      const duration = performance.now() - start;

      expect(Array.isArray(completions)).toBe(true);
      expect(duration).toBeLessThan(200); // Slightly higher target for complex expressions
      
      console.log(`Large expression completion: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Diagnostic Performance', () => {
    test('should provide diagnostics within performance targets', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.given.first()'
      );

      const start = performance.now();
      const diagnostics = await diagnosticProvider.provideDiagnostics(document);
      const duration = performance.now() - start;

      expect(Array.isArray(diagnostics)).toBe(true);
      expect(duration).toBeLessThan(200); // Target: < 200ms
      
      console.log(`Diagnostic response time: ${duration.toFixed(2)}ms`);
    });

    test('should benefit from caching on repeated validation', async () => {
      const document = TextDocument.create(
        'test://test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.where(use = "official")'
      );

      // First validation (cache miss)
      const start1 = performance.now();
      const diagnostics1 = await diagnosticProvider.provideDiagnostics(document);
      const duration1 = performance.now() - start1;

      // Second validation (cache hit)
      const start2 = performance.now();
      const diagnostics2 = await diagnosticProvider.provideDiagnostics(document);
      const duration2 = performance.now() - start2;

      expect(diagnostics1).toEqual(diagnostics2);
      expect(duration2).toBeLessThan(duration1); // Cache should be faster
      
      console.log(`First validation: ${duration1.toFixed(2)}ms, Cached validation: ${duration2.toFixed(2)}ms`);
    });

    test('should handle documents with errors efficiently', async () => {
      const document = TextDocument.create(
        'test://error.fhirpath',
        'fhirpath',
        1,
        'Patient.name.invalid[syntax error'
      );

      const start = performance.now();
      const diagnostics = await diagnosticProvider.provideDiagnostics(document);
      const duration = performance.now() - start;

      expect(Array.isArray(diagnostics)).toBe(true);
      expect(diagnostics.length).toBeGreaterThan(0); // Should find errors
      expect(duration).toBeLessThan(300); // Error handling might be slower
      
      console.log(`Error diagnostic time: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Memory Usage', () => {
    test('should maintain reasonable memory usage under load', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Simulate heavy usage
      const promises: Promise<any>[] = [];
      
      for (let i = 0; i < 100; i++) {
        const document = TextDocument.create(
          `test://doc${i}.fhirpath`,
          'fhirpath',
          1,
          `Patient.name.where(use = "test${i}").given.first()`
        );

        // Alternate between completions and diagnostics
        if (i % 2 === 0) {
          promises.push(completionProvider.provideCompletions(document, {
            textDocument: { uri: document.uri },
            position: { line: 0, character: 10 },
            context: { triggerKind: 1 }
          }));
        } else {
          promises.push(diagnosticProvider.provideDiagnostics(document));
        }
      }

      await Promise.all(promises);
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
      
      // Memory increase should be reasonable (less than 50MB for 100 operations)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    test('should benefit from cache size limits', () => {
      const cacheStats = cacheService.getCacheStats();
      
      // All caches should have reasonable sizes
      Object.values(cacheStats).forEach(stats => {
        expect(stats.size).toBeLessThanOrEqual(stats.maxSize);
        expect(stats.maxSize).toBeGreaterThan(0);
      });
      
      console.log('Cache stats:', cacheStats);
    });
  });

  describe('Scalability', () => {
    test('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = 20;
      const promises: Promise<any>[] = [];
      
      const start = performance.now();
      
      for (let i = 0; i < concurrentRequests; i++) {
        const document = TextDocument.create(
          `test://concurrent${i}.fhirpath`,
          'fhirpath',
          1,
          `Patient.name.where(family = "Test${i}")`
        );

        promises.push(
          completionProvider.provideCompletions(document, {
            textDocument: { uri: document.uri },
            position: { line: 0, character: 10 },
            context: { triggerKind: 1 }
          })
        );
      }

      const results = await Promise.all(promises);
      const duration = performance.now() - start;
      
      expect(results).toHaveLength(concurrentRequests);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
      
      console.log(`${concurrentRequests} concurrent requests completed in ${duration.toFixed(2)}ms`);
      console.log(`Average per request: ${(duration / concurrentRequests).toFixed(2)}ms`);
    });

    test('should maintain performance with document size', async () => {
      const sizes = [100, 500, 1000, 2000];
      const results: { size: number; duration: number }[] = [];
      
      for (const size of sizes) {
        const content = Array(size).fill('Patient.name.given').join(' | ');
        const document = TextDocument.create(
          `test://size${size}.fhirpath`,
          'fhirpath',
          1,
          content
        );

        const start = performance.now();
        await diagnosticProvider.provideDiagnostics(document);
        const duration = performance.now() - start;
        
        results.push({ size, duration });
      }
      
      console.log('Performance vs document size:');
      results.forEach(({ size, duration }) => {
        console.log(`  ${size} chars: ${duration.toFixed(2)}ms`);
      });
      
      // Performance should scale reasonably
      const largestDuration = results[results.length - 1].duration;
      expect(largestDuration).toBeLessThan(1000); // Even large documents should be under 1s
    });
  });

  describe('Performance Profiling', () => {
    test('should track performance metrics accurately', async () => {
      const profiler = getGlobalProfiler();
      
      // Perform some operations
      await completionProvider.provideCompletions(
        TextDocument.create('test://profile.fhirpath', 'fhirpath', 1, 'Patient.name'),
        {
          textDocument: { uri: 'test://profile.fhirpath' },
          position: { line: 0, character: 10 },
          context: { triggerKind: 1 }
        }
      );

      const report = profiler.getReport('completion');
      expect(report.measures.length).toBeGreaterThan(0);
      expect(report.summary.count).toBeGreaterThan(0);
      expect(report.summary.averageDuration).toBeGreaterThan(0);
      
      const metrics = profiler.exportMetrics();
      expect(metrics).toHaveProperty('completion');
      
      console.log('Performance metrics:', metrics);
    });
  });
});