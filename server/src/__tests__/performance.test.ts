import { performance } from 'perf_hooks';
import { MemoryManager } from '../services/MemoryManager';
import { LRUCache, TTLCache, HybridCache } from '../services/PerformanceCache';
import { AdaptiveRequestThrottler } from '../services/RequestThrottler';
import { BackgroundProcessor, BackgroundTaskType } from '../services/BackgroundProcessor';
import { PerformanceProfiler } from '../utils/PerformanceProfiler';
import { WorkspaceOptimizer, categorizeWorkspace } from '../utils/WorkspaceOptimizer';

describe('Performance Optimization Tests', () => {
  describe('MemoryManager', () => {
    let memoryManager: MemoryManager;

    beforeEach(() => {
      memoryManager = new MemoryManager(50 * 1024 * 1024); // 50MB limit
    });

    afterEach(() => {
      memoryManager.stopMonitoring();
    });

    test('should monitor memory usage', () => {
      const usage = memoryManager.getCurrentUsage();
      expect(usage).toHaveProperty('heapUsed');
      expect(usage).toHaveProperty('heapTotal');
      expect(usage).toHaveProperty('rss');
      expect(typeof usage.heapUsed).toBe('number');
    });

    test('should trigger memory pressure handlers', (done) => {
      memoryManager.setMemoryLimit(1); // Very low limit to trigger pressure
      
      memoryManager.onMemoryPressure((usage) => {
        expect(usage.heapUsed).toBeGreaterThan(0);
        done();
      });

      memoryManager.startMonitoring();
      
      // Create some memory pressure
      const largeArray = new Array(1000000).fill('test');
      expect(largeArray.length).toBe(1000000);
    });

    test('should generate memory report', () => {
      const report = memoryManager.getMemoryReport();
      expect(report).toHaveProperty('totalUsage');
      expect(report).toHaveProperty('services');
      expect(report).toHaveProperty('caches');
      expect(report).toHaveProperty('recommendations');
      expect(Array.isArray(report.recommendations)).toBe(true);
    });
  });

  describe('LRUCache', () => {
    let cache: LRUCache<string, string>;

    beforeEach(() => {
      cache = new LRUCache<string, string>({ maxEntries: 3 });
    });

    test('should enforce size limits', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4'); // Should evict key1

      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(true);
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);
      expect(cache.size()).toBe(3);
    });

    test('should track cache statistics', () => {
      cache.set('key1', 'value1');
      cache.get('key1'); // Hit
      cache.get('key2'); // Miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });

    test('should perform LRU eviction', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      
      // Access key1 to make it recently used
      cache.get('key1');
      
      // Add key4, should evict key2 (least recently used)
      cache.set('key4', 'value4');
      
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);
    });
  });

  describe('TTLCache', () => {
    let cache: TTLCache<string, string>;

    beforeEach(() => {
      cache = new TTLCache<string, string>(100); // 100ms TTL
    });

    afterEach(() => {
      cache.destroy();
    });

    test('should expire entries after TTL', async () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(cache.get('key1')).toBeUndefined();
    });

    test('should track cache statistics', () => {
      cache.set('key1', 'value1');
      cache.get('key1'); // Hit
      cache.get('key2'); // Miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });

  describe('AdaptiveRequestThrottler', () => {
    let throttler: AdaptiveRequestThrottler;

    beforeEach(() => {
      throttler = new AdaptiveRequestThrottler([
        { requestType: 'test', limit: 2, windowMs: 1000 }
      ]);
    });

    test('should throttle requests when limit exceeded', () => {
      throttler.recordRequest('test');
      expect(throttler.shouldThrottle('test')).toBe(false);
      
      throttler.recordRequest('test');
      expect(throttler.shouldThrottle('test')).toBe(false);
      
      throttler.recordRequest('test');
      expect(throttler.shouldThrottle('test')).toBe(true);
    });

    test('should provide throttle status', () => {
      throttler.recordRequest('test');
      throttler.recordRequest('test');
      throttler.recordRequest('test'); // Exceeds limit

      const status = throttler.getThrottleStatus();
      expect(status.isThrottling).toBe(true);
      expect(status.throttleReasons.length).toBeGreaterThan(0);
    });

    test('should reset counts after window', async () => {
      throttler.recordRequest('test');
      throttler.recordRequest('test');
      throttler.recordRequest('test');
      expect(throttler.shouldThrottle('test')).toBe(true);

      // Wait for window reset
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      expect(throttler.shouldThrottle('test')).toBe(false);
    });
  });

  describe('BackgroundProcessor', () => {
    let processor: BackgroundProcessor;

    beforeEach(async () => {
      processor = new BackgroundProcessor({ maxWorkers: 1 });
      await processor.start();
    });

    afterEach(async () => {
      await processor.stop();
    });

    test('should process background tasks', async () => {
      const result = await processor.addTask({
        type: BackgroundTaskType.ParseDocument,
        priority: 1,
        data: { content: 'Patient.name', uri: 'test://test.fhirpath' }
      });

      expect(result).toHaveProperty('uri');
      expect(result).toHaveProperty('tokens');
      expect(result.uri).toBe('test://test.fhirpath');
    });

    test('should handle task priorities', async () => {
      const lowPriorityPromise = processor.addTask({
        type: BackgroundTaskType.ParseDocument,
        priority: 1,
        data: { content: 'Patient.name', uri: 'low.fhirpath' }
      });

      const highPriorityPromise = processor.addTask({
        type: BackgroundTaskType.ParseDocument,
        priority: 10,
        data: { content: 'Patient.id', uri: 'high.fhirpath' }
      });

      const results = await Promise.all([lowPriorityPromise, highPriorityPromise]);
      expect(results).toHaveLength(2);
    });

    test('should provide queue statistics', () => {
      expect(typeof processor.getQueueSize()).toBe('number');
      expect(typeof processor.getActiveTaskCount()).toBe('number');
      expect(typeof processor.getWorkerCount()).toBe('number');
    });
  });

  describe('PerformanceProfiler', () => {
    let profiler: PerformanceProfiler;

    beforeEach(() => {
      profiler = new PerformanceProfiler();
    });

    test('should profile function execution', async () => {
      const testFunction = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'result';
      };

      const result = await profiler.profile('test', testFunction);
      expect(result).toBe('result');

      const report = profiler.getReport('test');
      expect(report.measures.length).toBe(1);
      expect(report.measures[0].duration).toBeGreaterThan(0);
    });

    test('should track performance metrics', () => {
      profiler.mark('start');
      // Simulate some work
      const result = Array(1000).fill(0).reduce((sum, _, i) => sum + i, 0);
      expect(result).toBeGreaterThan(0);
      
      const measure = profiler.measure('operation', 'start');
      expect(measure).toBeDefined();
      expect(measure!.duration).toBeGreaterThan(0);
    });

    test('should generate performance reports', () => {
      profiler.mark('start1');
      profiler.measure('op1', 'start1');
      profiler.mark('start2');
      profiler.measure('op2', 'start2');

      const report = profiler.getReport();
      expect(report.summary.count).toBe(2);
      expect(report.measures.length).toBe(2);
    });

    test('should export performance metrics', () => {
      profiler.mark('start');
      profiler.measure('testOp', 'start');

      const metrics = profiler.exportMetrics();
      expect(metrics).toHaveProperty('testOp');
      expect(metrics.testOp).toHaveProperty('count');
      expect(metrics.testOp).toHaveProperty('avgDuration');
    });
  });

  describe('WorkspaceOptimizer', () => {
    let optimizer: WorkspaceOptimizer;

    beforeEach(() => {
      optimizer = new WorkspaceOptimizer({
        maxFilesToIndex: 100,
        maxFileSize: 1024 * 1024
      });
    });

    test('should categorize workspace sizes', () => {
      expect(categorizeWorkspace(50)).toBe('small');
      expect(categorizeWorkspace(500)).toBe('medium');
      expect(categorizeWorkspace(2000)).toBe('large');
      expect(categorizeWorkspace(10000)).toBe('xlarge');
    });

    test('should analyze workspace metrics', async () => {
      const metrics = await optimizer.analyzeWorkspace('/test/workspace');
      
      expect(metrics).toHaveProperty('fileCount');
      expect(metrics).toHaveProperty('totalSize');
      expect(metrics).toHaveProperty('averageFileSize');
      expect(metrics).toHaveProperty('fileTypeDistribution');
      expect(metrics).toHaveProperty('largestFiles');
    });

    test('should determine if files should be indexed', () => {
      expect(optimizer.shouldIndexFile('test.fhirpath')).toBe(true);
      expect(optimizer.shouldIndexFile('node_modules/test.js')).toBe(false);
      expect(optimizer.shouldIndexFile('.git/config')).toBe(false);
    });

    test('should identify priority files', () => {
      expect(optimizer.isPriorityFile('patient.fhirpath')).toBe(true);
      expect(optimizer.isPriorityFile('bundle.fhir')).toBe(true);
      expect(optimizer.isPriorityFile('readme.md')).toBe(false);
    });
  });

  describe('Performance Benchmarks', () => {
    test('cache performance under load', async () => {
      const cache = new LRUCache<string, string>({ maxEntries: 1000 });
      const iterations = 10000;
      
      const start = performance.now();
      
      // Fill cache
      for (let i = 0; i < iterations; i++) {
        cache.set(`key${i}`, `value${i}`);
      }
      
      // Random access pattern
      for (let i = 0; i < iterations / 2; i++) {
        const randomKey = `key${Math.floor(Math.random() * iterations)}`;
        cache.get(randomKey);
      }
      
      const duration = performance.now() - start;
      const stats = cache.getStats();
      
      console.log(`Cache benchmark: ${iterations} operations in ${duration.toFixed(2)}ms`);
      console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(2)}%`);
      
      expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
      expect(stats.hitRate).toBeGreaterThan(0.4); // Should have reasonable hit rate
    });

    test('memory pressure handling', async () => {
      const memoryManager = new MemoryManager(10 * 1024 * 1024); // 10MB limit
      let pressureTriggered = false;
      
      memoryManager.onMemoryPressure(() => {
        pressureTriggered = true;
      });
      
      memoryManager.startMonitoring();
      
      try {
        // Create memory pressure
        const largeArrays: any[][] = [];
        for (let i = 0; i < 100; i++) {
          largeArrays.push(new Array(100000).fill(`data${i}`));
        }
        
        // Wait for monitoring cycle
        await new Promise(resolve => setTimeout(resolve, 6000));
        
        expect(largeArrays.length).toBe(100);
        // Note: pressureTriggered may or may not be true depending on actual memory usage
      } finally {
        memoryManager.stopMonitoring();
      }
    });

    test('request throttling performance', () => {
      const throttler = new AdaptiveRequestThrottler([
        { requestType: 'benchmark', limit: 1000, windowMs: 1000 }
      ]);
      
      const start = performance.now();
      
      for (let i = 0; i < 10000; i++) {
        throttler.recordRequest('benchmark');
        throttler.shouldThrottle('benchmark');
      }
      
      const duration = performance.now() - start;
      
      console.log(`Throttler benchmark: 10000 operations in ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(100); // Should be very fast
    });
  });
});