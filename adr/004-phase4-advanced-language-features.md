# ADR-004: Phase 4 Advanced Language Features

## Status

Proposed

## Context

Phases 1-3 of the FHIRPath LSP implementation have successfully delivered:
- ✅ Phase 1: Foundation & Core Parsing - Complete LSP infrastructure and syntax support
- ✅ Phase 2: Intelligence & Auto-completion - Advanced code intelligence with FHIR validation  
- ✅ Phase 3: Registry Integration - Dynamic function registry using @atomic-ehr/fhirpath API

The LSP now provides a solid foundation with intelligent features. The next logical phase should focus on advanced language features that enhance developer productivity and code quality.

## Decision

We will implement Phase 4: Advanced Language Features, focusing on:

1. **Code Actions & Quick Fixes** - Automated fixes for common errors and improvements
2. **Go-to-Definition & Find References** - Navigation for FHIR resources and custom functions
3. **Document Formatting** - Consistent FHIRPath expression formatting
4. **Workspace Symbol Search** - Cross-file symbol discovery
5. **Refactoring Support** - Safe renaming and extraction operations
6. **Enhanced Diagnostics** - Advanced linting rules and performance suggestions

### Implementation Strategy

1. **Code Actions Framework**: Build extensible code action system with common fixes
2. **Symbol Provider**: Implement workspace-wide symbol indexing for navigation
3. **Formatter**: Create opinionated FHIRPath formatter with configurable rules
4. **Advanced Diagnostics**: Add semantic analysis beyond syntax validation
5. **Refactoring Engine**: Safe transformation operations for FHIRPath expressionsA

## Consequences

### Positive

- **Developer Productivity**: Quick fixes and refactoring reduce manual work
- **Code Quality**: Formatting and advanced diagnostics improve consistency
- **Navigation**: Go-to-definition enables faster codebase exploration
- **Maintainability**: Refactoring support makes large changes safer
- **Professional Feel**: Advanced IDE features provide modern development experience

### Negative

- **Complexity**: Advanced features require sophisticated AST analysis
- **Performance**: Symbol indexing and workspace analysis may impact startup time
- **Configuration**: Formatter and linting rules need user-configurable options
- **Testing**: Complex transformations require extensive test coverage

### Neutral

- **API Surface**: New features expand the LSP server's API
- **Documentation**: Advanced features need comprehensive user documentation

## Implementation Plan

1. Implement code actions framework with basic fixes
2. Create symbol provider for go-to-definition
3. Build document formatter with configurable rules
4. Add workspace symbol search capabilities
5. Implement find references functionality
6. Create refactoring operations (rename, extract)
7. Add advanced diagnostic rules
8. Comprehensive testing and documentation

## Success Criteria

- Code actions provide fixes for 80%+ of common errors
- Go-to-definition works for FHIR resources and functions
- Formatter produces consistent, readable output
- Symbol search covers entire workspace
- Refactoring operations maintain semantic correctness
- Performance impact < 15% on existing features