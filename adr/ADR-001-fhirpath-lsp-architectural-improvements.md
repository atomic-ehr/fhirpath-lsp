# ADR-001: FHIRPath LSP Architectural Improvements

## Status
**Accepted** - *2024-07-27*

## Context

The FHIRPath Language Server Protocol implementation has evolved significantly since its initial implementation. We need to document the architectural improvements that have been made to support enterprise-level features, extensibility, and performance requirements.

The original architecture was primarily focused on basic LSP features (completion, hover, diagnostics). The current requirements include:

1. **Extensibility**: Plugin system for custom providers and analyzers
2. **Configuration Management**: Centralized, validated configuration system
3. **Observability**: Structured logging and performance monitoring
4. **Reliability**: Error boundaries and graceful degradation
5. **Performance**: Advanced caching and background processing
6. **Code Quality**: Enhanced diagnostics and code analysis

## Decision

We have implemented a modular, layered architecture with the following key components:

### 1. Configuration Layer
- **Central Configuration Manager**: Unified configuration management
- **Multiple Configuration Sou
rces**: Workspace, user, environment, runtime
- **Schema-based Validation**: Type-safe configuration with validation
- **Real-time Updates**: Configuration changes without server restart

### 2. Plugin System Architecture
- **Provider Plugins**: Custom LSP providers (completion, hover, diagnostics)
- **Analyzer Plugins**: Code analysis and quality checks
- **Validator Plugins**: Custom validation rules
- **Built-in Plugins**: Core functionality as plugins
- **Lifecycle Management**: Plugin loading, dependency resolution, validation

### 3. Enhanced Diagnostic System
- **Multiple Analyzers**: Performance, code quality, FHIR best practices
- **Diagnostic Converters**: Transform analysis results to LSP diagnostics
- **Validation Pipeline**: Syntax, semantic, and custom validators
- **Configurable Rules**: User-customizable diagnostic rules

### 4. Structured Logging System
- **Context Correlation**: Request tracking and correlation IDs
- **Multiple Formatters**: Console, JSON, structured logging
- **Multiple Transports**: Console, file, remote logging
- **Performance Monitoring**: Automatic performance tracking
- **Configurable Filtering**: Level, component, and performance filters

### 5. Advanced Provider Features
- **Code Actions & Quick Fixes**: Automated code improvements
- **Inlay Hints**: Inline evaluation results and type information
- **Background Processing**: Asynchronous heavy operations
- **Advanced Caching**: Multi-level caching with performance monitoring

### 6. Service Layer Architecture
- **Background Processor**: Queue-based background task processing
- **Performance Cache**: Advanced caching with metrics
- **Resource Monitoring**: Memory and performance monitoring
- **Error Boundaries**: Comprehensive error handling and recovery

## Implementation Structure

```
server/src/
├── config/                    # Configuration management
│   ├── ConfigManager.ts       # Central configuration coordinator
│   ├── schemas/               # Configuration schemas and types
│   ├── loaders/               # Configuration source loaders
│   └── validators/            # Configuration validation
├── diagnostics/               # Enhanced diagnostic system
│   ├── converters/            # Diagnostic converters
│   └── validators/            # Validation implementations
├── logging/                   # Structured logging system
│   ├── formatters/            # Log format implementations
│   ├── transports/            # Log transport implementations
│   └── context/               # Logging context management
├── plugins/                   # Plugin system
│   ├── builtin/               # Built-in plugins
│   ├── interfaces/            # Plugin interfaces and contracts
│   ├── lifecycle/             # Plugin lifecycle management
│   └── registry/              # Plugin registration and discovery
├── providers/                 # Enhanced LSP providers
│   ├── quickfix/              # Quick fix implementations
│   └── sourceactions/         # Source action implementations
└── services/                  # Enhanced services
    ├── BackgroundProcessor.ts # Background task processing
    ├── PerformanceCache.ts    # Advanced caching
    └── ResourceMonitor.ts     # Resource monitoring
```

## Consequences

### Positive
- **Extensibility**: Easy to add new features through plugins
- **Maintainability**: Clear separation of concerns and modular design
- **Performance**: Advanced caching and background processing
- **Reliability**: Comprehensive error handling and monitoring
- **Observability**: Detailed logging and performance tracking
- **User Experience**: Rich features like quick fixes and inlay hints

### Negative
- **Complexity**: Increased codebase complexity
- **Learning Curve**: Steeper learning curve for contributors
- **Memory Usage**: Additional overhead from plugin system and logging

### Risks and Mitigation
- **Performance Impact**: Mitigated by aggressive caching and background processing
- **Configuration Complexity**: Mitigated by schema validation and clear documentation
- **Plugin System Overhead**: Mitigated by efficient plugin loading and lifecycle management

## Compliance

This architecture ensures compliance with:
- **LSP Specification**: Full compliance with Language Server Protocol
- **VS Code Extension Guidelines**: Follows VS Code extension best practices
- **TypeScript Best Practices**: Type-safe implementation with proper error handling
- **FHIR Specifications**: Accurate FHIR R4 resource validation

## Monitoring and Success Metrics

Success is measured by:
- **Performance**: Response times under target thresholds
- **Reliability**: Error rate below 1%
- **Extensibility**: Ease of adding new features
- **User Satisfaction**: Feature adoption and feedback
- **Resource Usage**: Memory usage within acceptable limits

## References

- [Language Server Protocol Specification](https://microsoft.github.io/language-server-protocol/)
- [VS Code Extension API](https://code.visualstudio.com/api)
- [FHIR R4 Specification](https://hl7.org/fhir/R4/)
- [FHIRPath Specification](https://hl7.org/fhirpath/)
EOF < /dev/null