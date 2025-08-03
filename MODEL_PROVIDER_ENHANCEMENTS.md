# LSP-Specific ModelProvider Enhancements

## Overview
This document outlines LSP-specific enhancements needed in the ModelProviderService wrapper to better integrate with the FHIRPath library's ModelProvider.

## Current Issues
1. Incomplete error handling when ModelProvider navigation fails
2. Limited caching of navigation results in LSP context
3. Missing user feedback for ModelProvider initialization issues

## LSP-Specific Enhancements

### 1. Enhanced Error Handling and User Feedback
**Priority: High**

```typescript
interface ModelProviderService {
  /**
   * Get user-friendly error messages for LSP clients
   */
  getNavigationError(resourceType: string, path: string[], error: Error): {
    message: string;
    suggestions: string[];
    code: string;
  };
  
  /**
   * Check ModelProvider health and provide status to LSP clients
   */
  getHealthStatus(): Promise<{
    healthy: boolean;
    initializationProgress: number;
    lastError?: string;
    capabilities: string[];
  }>;
}
```

### 2. LSP-Optimized Caching
**Priority: Medium**

- Cache navigation results specific to LSP completion contexts
- Invalidate cache based on document changes
- Memory-efficient caching for long-running LSP sessions

### 3. Progressive Enhancement
**Priority: Medium**

```typescript
interface ModelProviderService {
  /**
   * Enable features progressively as ModelProvider initializes
   */
  getAvailableFeatures(): {
    basicCompletion: boolean;
    nestedNavigation: boolean;
    choiceTypeResolution: boolean;
    referenceResolution: boolean;
  };
  
  /**
   * Subscribe to ModelProvider readiness changes
   */
  onReadinessChange(callback: (status: ReadinessStatus) => void): void;
}
```

### 4. LSP Performance Optimizations
**Priority: Medium**

- Debounced completion requests
- Bulk property resolution for multiple cursors
- Background preloading of common navigation paths
- Request cancellation for outdated completion requests

### 5. Development and Debugging Support
**Priority: Low**

```typescript
interface ModelProviderService {
  /**
   * Get detailed diagnostics for troubleshooting
   */
  getDiagnostics(): {
    modelProviderVersion: string;
    loadedTypes: number;
    cacheHitRate: number;
    averageNavigationTime: number;
    recentErrors: Array<{timestamp: number; error: string; context: string}>;
  };
  
  /**
   * Enable verbose logging for debugging
   */
  setDebugMode(enabled: boolean): void;
}
```

## Integration with FHIRPath Library

This service acts as a bridge between the LSP and the FHIRPath library's ModelProvider. It should:

1. **Adapt Interfaces**: Convert between LSP completion formats and FHIRPath TypeInfo
2. **Handle Async Operations**: Manage promises and async operations for LSP responsiveness  
3. **Provide Fallbacks**: Graceful degradation when FHIRPath ModelProvider is unavailable
4. **Cache Intelligently**: LSP-specific caching that complements library-level caching
5. **Report Status**: Clear status reporting for LSP client feedback

## Implementation Notes

### Initialization Workflow
```typescript
async initializeModelProviderService() {
  // 1. Initialize FHIRPath ModelProvider
  await this.fhirPathModelProvider.initialize();
  
  // 2. Verify core functionality
  const healthCheck = await this.getHealthStatus();
  if (!healthCheck.healthy) {
    throw new Error(`ModelProvider unhealthy: ${healthCheck.lastError}`);
  }
  
  // 3. Preload common types for LSP
  await this.preloadLSPEssentials();
  
  // 4. Start background optimization
  this.startBackgroundOptimization();
}
```

### Error Context Enhancement
```typescript
private enhanceErrorForLSP(error: Error, context: NavigationContext): LSPError {
  return {
    message: this.createUserFriendlyMessage(error),
    suggestions: this.generateSuggestions(context),
    code: this.mapToLSPErrorCode(error),
    severity: this.determineSeverity(error),
    relatedInformation: this.gatherRelatedInfo(context)
  };
}
```

## Benefits for LSP Users

1. **Better Error Messages**: Clear, actionable error messages instead of library internals
2. **Progressive Functionality**: Features become available as ModelProvider initializes
3. **Performance**: LSP-optimized caching and request handling
4. **Reliability**: Robust error handling and graceful degradation
5. **Debugging**: Clear diagnostics when things go wrong

## Related Files
- `server/src/services/ModelProviderService.ts` (LSP wrapper)
- See `FHIRPATH_LIBRARY_REQUIREMENTS.md` for core library changes