# ADR-006: Performance Optimization and Caching Strategy

## Status
Accepted

## Context
The integration of ModelProvider-enhanced features (Tasks 1-12) has significantly improved the FHIRPath Language Server's intelligence and FHIR-awareness. However, this enhancement comes with performance costs:

1. **Type Resolution Overhead**: Frequent ModelProvider queries for type information
2. **Repeated Computations**: Same type paths resolved multiple times per session
3. **Memory Usage**: Large type hierarchies and choice type resolutions consuming memory
4. **Network Latency**: Remote FHIR specification lookups for definitions and documentation
5. **Startup Time**: Initial type loading and validation taking several seconds

Current performance bottlenecks identified:
- Type resolution: 200-500ms for complex hierarchies
- Completion generation: 150-300ms for choice types
- Validation cycles: 100-400ms for inheritance checks
- Reference finding: 300-800ms for cross-resource searches

Without optimization, the enhanced features could negatively impact developer experience through slow responsiveness.

## Decision
We will implement a comprehensive multi-level caching and performance optimization strategy to maintain sub-100ms response times for most LSP operations while preserving the enhanced FHIR-aware functionality.

### Key Design Decisions:

1. **Multi-Level Cache Architecture**: Memory, disk, and intelligent prefetching
2. **Category-Based Caching**: Different strategies for different data types
3. **Smart Invalidation**: Dependency-aware cache invalidation
4. **Request Optimization**: Batching, debouncing, and prefetching
5. **Performance Monitoring**: Real-time metrics and threshold monitoring
6. **Memory Management**: Intelligent cleanup and optimization

### Architecture:

```typescript
// Multi-level cache structure
interface CacheArchitecture {
  L1_Memory: LRUCache<string, any>;      // Hot data, <1ms access
  L2_Disk: FileSystemCache;              // Warm data, <10ms access  
  L3_Remote: NetworkCache;               // Cold data, <100ms access
}

// Cache categories with different strategies
enum CacheCategory {
  TYPE_INFO = 'typeInfo',           // Long TTL, high priority
  PROPERTY_PATHS = 'propertyPaths', // Medium TTL, medium priority
  CHOICE_TYPES = 'choiceTypes',     // Long TTL, high priority
  COMPLETIONS = 'completions',      // Short TTL, low priority
  VALIDATIONS = 'validations',      // Medium TTL, medium priority
}
```

## Implementation Strategy

### Phase 1: Core Caching Infrastructure
- Implement `CacheManager` with multi-level architecture
- Create `ModelProviderCache` with intelligent strategies
- Add basic performance monitoring

### Phase 2: Request Optimization
- Implement `PerformanceOptimizer` with batching and debouncing
- Add request coalescing and deduplication
- Implement predictive prefetching

### Phase 3: Advanced Features
- Smart cache invalidation with dependency tracking
- Cache warming strategies for startup optimization
- Memory management and cleanup automation

### Phase 4: Integration & Monitoring
- Integrate caching into all enhanced providers
- Comprehensive performance monitoring and alerting
- Performance regression testing

## Caching Strategies by Data Type

### Type Information (TypeInfo)
- **TTL**: 30 minutes (relatively stable)
- **Priority**: High (frequently accessed)
- **Invalidation**: On FHIR specification updates
- **Prefetch**: Common FHIR resources (Patient, Observation, etc.)

### Property Paths (Navigation Results)
- **TTL**: 15 minutes (moderately stable)
- **Priority**: Medium (context-dependent)
- **Invalidation**: On type definition changes
- **Prefetch**: Based on current editing context

### Choice Types (value[x] Resolutions)
- **TTL**: 30 minutes (stable)
- **Priority**: High (expensive to compute)
- **Invalidation**: On base type changes
- **Prefetch**: All common choice patterns

### Completions
- **TTL**: 5 minutes (context-sensitive)
- **Priority**: Low (can regenerate quickly)
- **Invalidation**: On document changes
- **Prefetch**: Not applicable (too context-specific)

### Validations
- **TTL**: 10 minutes (moderately stable)
- **Priority**: Medium (validation context changes)
- **Invalidation**: On constraint updates
- **Prefetch**: Common validation patterns

## Performance Targets

### Response Time Targets
- **Completion**: < 100ms (enhanced from 150-300ms)
- **Validation**: < 200ms (enhanced from 100-400ms)
- **Hover**: < 50ms (maintained)
- **Definition**: < 100ms (maintained)
- **References**: < 500ms (enhanced from 300-800ms)
- **Type Resolution**: < 50ms (enhanced from 200-500ms)

### Cache Performance Targets
- **Hit Rate**: > 85% for frequently accessed types
- **Memory Usage**: < 50MB for cache storage
- **Startup Time**: < 2s for essential cache warming
- **Cleanup Efficiency**: 90% reduction in redundant queries

### Memory Management
- **Memory Limit**: 50MB for L1 cache, 100MB for L2 cache
- **Cleanup Triggers**: 80% memory threshold, 5-minute intervals
- **Eviction Strategy**: LRU with usage frequency weighting

## Cache Invalidation Strategy

### File-Based Invalidation
```typescript
// Invalidate on file changes
onFileChanged(uri: string) -> invalidate related completions/validations
onConfigChanged() -> invalidate all caches
```

### Type-Based Invalidation
```typescript
// Invalidate on type changes
onTypeDefinitionChanged(typeName) -> invalidate type hierarchy, choice types
onPropertyChanged(type, property) -> invalidate property paths, completions
```

### Dependency-Based Invalidation
```typescript
// Build and use dependency graphs
TypeInfo.Patient -> depends on -> TypeInfo.Resource, TypeInfo.DomainResource
InvalidatePattern -> "Patient.*" -> affects all Patient-related caches
```

## Request Optimization Techniques

### Request Batching
```typescript
// Batch multiple type resolution requests
BatchProcessor<TypeInfo>(
  requests: string[],
  maxBatchSize: 50,
  maxWaitTime: 10ms
)
```

### Request Deduplication
```typescript
// Coalesce identical concurrent requests
RequestCoalescer<T>(
  ongoing: Map<string, Promise<T>>,
  keyGenerator: (args) => string
)
```

### Predictive Prefetching
```typescript
// Prefetch based on editing context
OnTypeSelected(Patient) -> prefetch(Patient.*, Resource.*, DomainResource.*)
OnPropertyAccess(value) -> prefetch(valueString, valueQuantity, etc.)
```

## Consequences

### Positive:
1. **Improved Responsiveness**: Sub-100ms response times for cached operations
2. **Better User Experience**: Reduced perceived latency during development
3. **Efficient Resource Usage**: Reduced redundant network and computation
4. **Scalable Performance**: Maintains performance as type library grows
5. **Predictable Behavior**: Consistent response times through caching

### Negative:
1. **Increased Complexity**: Multi-level caching logic and invalidation
2. **Memory Overhead**: Additional memory usage for cache storage
3. **Cache Consistency**: Risk of stale data if invalidation fails
4. **Debugging Difficulty**: Cache-related issues can be hard to trace

### Risks & Mitigations:
1. **Memory Leaks**: Implement automated cleanup and monitoring
2. **Cache Poisoning**: Validate cache entries and implement error recovery
3. **Performance Regression**: Continuous monitoring and alerting
4. **Cache Invalidation Bugs**: Comprehensive testing and conservative TTLs

## Monitoring and Observability

### Key Metrics
- Cache hit/miss ratios by category
- Average response times per operation
- Memory usage and cleanup efficiency
- Request batch sizes and deduplication rates
- Cache invalidation frequency and accuracy

### Performance Alerts
- Response time > threshold (configurable per operation)
- Cache hit rate < 70% (indicates ineffective caching)
- Memory usage > 80% of limit (cleanup needed)
- Excessive cache invalidations (potential invalidation bug)

### Performance Reports
- Daily performance summaries
- Cache effectiveness analysis
- Memory usage trends
- Slow operation identification

## Configuration Options

```typescript
interface PerformanceConfig {
  cache: {
    memoryLimit: 50MB;
    diskLimit: 100MB;
    ttl: {
      typeInfo: 30min;
      propertyPaths: 15min;
      choiceTypes: 30min;
      completions: 5min;
      validations: 10min;
    };
  };
  optimization: {
    batchSize: 50;
    batchTimeout: 10ms;
    prefetchEnabled: true;
    warmupOnStartup: true;
  };
  monitoring: {
    metricsEnabled: true;
    alertThresholds: {
      responseTime: 200ms;
      cacheHitRate: 70%;
      memoryUsage: 80%;
    };
  };
}
```

## Success Criteria
1. **Performance**: 90% of operations complete within target times
2. **Cache Efficiency**: >85% hit rate for frequently accessed data
3. **Memory Management**: Stable memory usage under sustained load
4. **Reliability**: No cache-related errors in normal operation
5. **Developer Experience**: Perceived improvement in responsiveness

## Related ADRs
- ADR-001: FHIRPath LSP Architectural Improvements
- ADR-003: Enhanced Type-Aware Diagnostics
- ADR-004: Enhanced Definition Provider
- ADR-005: Enhanced References Provider

## Implementation Timeline
- Week 1: Core caching infrastructure and ModelProviderCache
- Week 2: Performance optimization and request batching
- Week 3: Cache invalidation and warming strategies
- Week 4: Integration, monitoring, and comprehensive testing

## Approval
- Architecture Team: ✅ Approved
- Performance Team: ✅ Approved with continuous monitoring requirement
- QA Team: ✅ Approved with comprehensive performance testing requirement