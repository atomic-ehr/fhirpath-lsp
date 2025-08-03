# Task 15: Update Server Integration and Configuration

**Priority**: 🟠 Medium  
**Estimated Effort**: 3-4 hours  
**Dependencies**: All provider updates (Tasks 5-13)  
**Status**: Pending  

## Overview
Integrate all ModelProvider enhancements into the server initialization, add configuration options for new features, and ensure proper dependency injection and error handling.

## Files to Modify
- `server/src/server.ts`
- `server/src/config/schemas/ProviderConfig.ts`
- `server/src/config/validators/ProviderConfigValidator.ts`
- `server/src/services/__tests__/ServerIntegration.test.ts` *(new)*

## Acceptance Criteria
- [ ] Wire ModelProviderService into server initialization
- [ ] Update service dependency injection for all enhanced providers
- [ ] Add configuration options for new ModelProvider features
- [ ] Implement feature toggles for gradual rollout
- [ ] Update error handling and logging for ModelProvider failures
- [ ] Add health checks for ModelProvider status
- [ ] Ensure backward compatibility during transition

## Server Integration Changes

### Enhanced Service Initialization
```typescript
// server/src/server.ts
class FHIRPathLanguageServer {
  private modelProviderService?: ModelProviderService;
  private enhancedProviders: Map<string, any> = new Map();

  async initialize(params: InitializeParams): Promise<InitializeResult> {
    try {
      // Initialize ModelProvider first
      await this.initializeModelProvider();
      
      // Initialize enhanced services
      await this.initializeEnhancedServices();
      
      // Initialize providers with ModelProvider support
      await this.initializeEnhancedProviders();
      
      // Setup health monitoring
      this.setupModelProviderHealthChecks();
      
      return this.createInitializeResult();
    } catch (error) {
      this.logger.error('Server initialization failed', { error });
      throw error;
    }
  }

  private async initializeModelProvider(): Promise<void> {
    const config = this.configManager.getConfig().modelProvider;
    
    if (!config.enabled) {
      this.logger.info('ModelProvider disabled by configuration');
      return;
    }

    try {
      // Initialize FHIRPathService with ModelProvider
      await this.fhirPathService.initializeModelProvider(config.fhirModelProvider);
      
      // Create ModelProviderService wrapper
      this.modelProviderService = new ModelProviderService(
        this.fhirPathService.getModelProvider()
      );
      
      await this.modelProviderService.initialize();
      
      this.logger.info('ModelProvider initialized successfully');
    } catch (error) {
      this.logger.error('ModelProvider initialization failed', { error });
      
      if (config.required) {
        throw new Error('ModelProvider is required but failed to initialize');
      }
      
      this.logger.warn('Continuing without ModelProvider (fallback mode)');
    }
  }

  private async initializeEnhancedServices(): Promise<void> {
    // Initialize services that depend on ModelProvider
    if (this.modelProviderService) {
      this.enhancedProviders.set('typeHierarchy', 
        new TypeHierarchyService(this.modelProviderService)
      );
      
      this.enhancedProviders.set('smartRefactoring',
        new SmartRefactoringProvider(this.fhirPathService, this.modelProviderService)
      );
    }
  }

  private async initializeEnhancedProviders(): Promise<void> {
    const config = this.configManager.getConfig().providers;
    
    // Enhanced CompletionProvider
    if (config.completion.enhanced && this.modelProviderService) {
      this.completionProvider = new CompletionProvider(
        this.fhirPathService,
        this.fhirResourceService,
        this.modelProviderService
      );
      this.logger.info('Enhanced CompletionProvider initialized');
    }
    
    // Enhanced HoverProvider  
    if (config.hover.enhanced && this.modelProviderService) {
      this.hoverProvider = new HoverProvider(
        this.fhirPathService,
        this.modelProviderService
      );
      this.logger.info('Enhanced HoverProvider initialized');
    }
    
    // TypeAwareValidator
    if (config.diagnostics.typeAware && this.modelProviderService) {
      const typeAwareValidator = new TypeAwareValidator(
        this.fhirPathService,
        this.modelProviderService
      );
      
      this.diagnosticProvider.addValidator(typeAwareValidator);
      this.logger.info('TypeAwareValidator added to diagnostic pipeline');
    }
  }

  private setupModelProviderHealthChecks(): void {
    if (!this.modelProviderService) return;

    // Periodic health check
    setInterval(async () => {
      try {
        const healthStatus = await this.checkModelProviderHealth();
        if (!healthStatus.healthy) {
          this.logger.warn('ModelProvider health check failed', healthStatus);
        }
      } catch (error) {
        this.logger.error('ModelProvider health check error', { error });
      }
    }, 60000); // Check every minute
  }

  private async checkModelProviderHealth(): Promise<HealthStatus> {
    if (!this.modelProviderService) {
      return { healthy: false, reason: 'ModelProvider not initialized' };
    }

    try {
      // Test basic functionality
      const testType = await this.modelProviderService.getEnhancedTypeInfo('Patient');
      if (!testType) {
        return { healthy: false, reason: 'Unable to resolve Patient type' };
      }

      return { healthy: true };
    } catch (error) {
      return { 
        healthy: false, 
        reason: `ModelProvider error: ${error.message}` 
      };
    }
  }
}
```

### Configuration Schema Updates
```typescript
// server/src/config/schemas/ProviderConfig.ts
export interface ModelProviderConfig {
  enabled: boolean;
  required: boolean;
  fhirModelProvider: FHIRModelProviderConfig;
  caching: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
  performance: {
    enableOptimizations: boolean;
    batchSize: number;
    concurrentRequests: number;
  };
}

export interface EnhancedProviderConfig {
  completion: {
    enabled: boolean;
    enhanced: boolean;
    choiceTypes: boolean;
    inheritance: boolean;
    deepNavigation: boolean;
    maxCompletions: number;
  };
  hover: {
    enabled: boolean;
    enhanced: boolean;
    showHierarchy: boolean;
    showConstraints: boolean;
    showTerminology: boolean;
  };
  diagnostics: {
    enabled: boolean;
    typeAware: boolean;
    strictMode: boolean;
    enableSuggestions: boolean;
    maxSuggestions: number;
  };
  refactoring: {
    enabled: boolean;
    smart: boolean;
    enableOptimizations: boolean;
  };
}

export interface ProviderConfig extends BaseProviderConfig {
  modelProvider: ModelProviderConfig;
  enhanced: EnhancedProviderConfig;
}
```

### Default Configuration
```typescript
// Default configuration with feature toggles
const defaultConfig: ProviderConfig = {
  modelProvider: {
    enabled: true,
    required: false, // Allow fallback mode
    fhirModelProvider: {
      packages: [
        { name: 'hl7.fhir.r4.core', version: '4.0.1' }
      ],
      cacheDir: '.fhir-cache',
      registryUrl: 'https://packages.fhir.org'
    },
    caching: {
      enabled: true,
      ttl: 600000, // 10 minutes
      maxSize: 1000
    },
    performance: {
      enableOptimizations: true,
      batchSize: 50,
      concurrentRequests: 10
    }
  },
  enhanced: {
    completion: {
      enabled: true,
      enhanced: true,
      choiceTypes: true,
      inheritance: true,
      deepNavigation: true,
      maxCompletions: 100
    },
    hover: {
      enabled: true,
      enhanced: true,
      showHierarchy: true,
      showConstraints: true,
      showTerminology: true
    },
    diagnostics: {
      enabled: true,
      typeAware: true,
      strictMode: false,
      enableSuggestions: true,
      maxSuggestions: 5
    },
    refactoring: {
      enabled: false, // Experimental feature
      smart: false,
      enableOptimizations: false
    }
  }
};
```

### Configuration Validation
```typescript
// server/src/config/validators/ProviderConfigValidator.ts
export class ProviderConfigValidator extends BaseConfigValidator<ProviderConfig> {
  validate(config: ProviderConfig): ConfigValidationResult {
    const errors: ConfigValidationError[] = [];
    const warnings: ConfigValidationWarning[] = [];

    // Validate ModelProvider configuration
    if (config.modelProvider.enabled) {
      if (!config.modelProvider.fhirModelProvider.packages.length) {
        errors.push({
          path: 'modelProvider.fhirModelProvider.packages',
          message: 'At least one FHIR package must be specified'
        });
      }

      // Validate package versions
      config.modelProvider.fhirModelProvider.packages.forEach((pkg, index) => {
        if (!pkg.name || !pkg.version) {
          errors.push({
            path: `modelProvider.fhirModelProvider.packages[${index}]`,
            message: 'Package name and version are required'
          });
        }
      });
    }

    // Validate enhanced features dependencies
    if (config.enhanced.completion.enhanced && !config.modelProvider.enabled) {
      warnings.push({
        path: 'enhanced.completion.enhanced',
        message: 'Enhanced completions require ModelProvider to be enabled'
      });
    }

    if (config.enhanced.hover.enhanced && !config.modelProvider.enabled) {
      warnings.push({
        path: 'enhanced.hover.enhanced',  
        message: 'Enhanced hover requires ModelProvider to be enabled'
      });
    }

    // Validate performance settings
    if (config.modelProvider.performance.concurrentRequests > 50) {
      warnings.push({
        path: 'modelProvider.performance.concurrentRequests',
        message: 'High concurrent request limit may impact performance'
      });
    }

    return { errors, warnings, isValid: errors.length === 0 };
  }
}
```

### Graceful Degradation
```typescript
// Fallback behavior when ModelProvider is unavailable
private createFallbackProviders(): void {
  this.logger.info('Creating fallback providers without ModelProvider');
  
  // Use original providers with limited functionality
  this.completionProvider = new CompletionProvider(this.fhirPathService);
  this.hoverProvider = new HoverProvider(this.fhirPathService);
  
  // Disable advanced features
  this.configManager.updateConfig({
    enhanced: {
      completion: { enhanced: false },
      hover: { enhanced: false },
      diagnostics: { typeAware: false }
    }
  });
}
```

### Error Handling and Monitoring
```typescript
private handleModelProviderError(error: Error, context: string): void {
  this.logger.error(`ModelProvider error in ${context}`, {
    error: error.message,
    stack: error.stack,
    context
  });

  // Increment error metrics
  this.performanceMonitor.incrementCounter('modelProvider.errors', {
    context,
    errorType: error.constructor.name
  });

  // Check if we should disable ModelProvider temporarily
  if (this.shouldDisableModelProvider(error)) {
    this.temporarilyDisableModelProvider();
  }
}

private shouldDisableModelProvider(error: Error): boolean {
  // Define criteria for temporary disabling
  return error.message.includes('ECONNREFUSED') || 
         error.message.includes('timeout') ||
         error.message.includes('registry');
}
```

## Testing Requirements
- [ ] Test server initialization with ModelProvider enabled/disabled
- [ ] Test graceful degradation when ModelProvider fails
- [ ] Test configuration validation
- [ ] Test health checks and monitoring
- [ ] Test feature toggle functionality
- [ ] Test backward compatibility
- [ ] Test error handling and recovery

## Migration Strategy
1. **Phase 1**: Add configuration without enabling features
2. **Phase 2**: Enable enhanced features with feature toggles
3. **Phase 3**: Gradually enable features based on stability
4. **Phase 4**: Make enhanced features default (with fallback)

## Success Metrics
- Server starts successfully with and without ModelProvider
- All configuration options work correctly
- Health monitoring detects and reports issues
- Feature toggles allow safe rollout
- Backward compatibility is maintained
- Error handling prevents server crashes