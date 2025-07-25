# Phase 4: Advanced Language Features

**Timeline**: TBD  
**Status**: 🚀 Ready to Start  
**Priority**: High  

## Overview

This phase focuses on implementing advanced IDE features that enhance developer productivity, code quality, and navigation capabilities for FHIRPath development.

## Goals

1. **Code Actions & Quick Fixes** - Automated fixes for common errors and improvements
2. **Go-to-Definition & Find References** - Navigation for FHIR resources and function definitions
3. **Document Formatting** - Consistent and configurable FHIRPath expression formatting
4. **Workspace Symbol Search** - Cross-file symbol discovery and navigation
5. **Refactoring Support** - Safe renaming and code transformation operations
6. **Enhanced Diagnostics** - Advanced linting rules and performance suggestions

## Task Breakdown

### 1. Code Actions Framework [Priority: High]

Create extensible code action system for automated fixes:

- [ ] **CodeActionProvider Infrastructure** (4 hours)
  - Create base CodeActionProvider class
  - Implement code action resolution system
  - Add action kind categorization (quickfix, refactor, source)
  - Integrate with LSP server capabilities

- [ ] **Quick Fix Actions** (6 hours)
  - Fix unknown function names (suggest similar functions)
  - Auto-complete incomplete expressions
  - Fix bracket/parentheses mismatches
  - Correct string literal formatting
  - Add missing operators

- [ ] **Source Actions** (4 hours)
  - Format document action
  - Optimize expression performance
  - Extract common sub-expressions
  - Sort imports/declarations

### 2. Symbol Provider & Navigation [Priority: High]

Implement workspace-wide symbol navigation:

- [ ] **Document Symbol Provider** (5 hours)
  - Extract symbols from FHIRPath expressions
  - Support nested expression hierarchies
  - Categorize symbols (functions, resources, properties)
  - Implement symbol ranges and selection ranges

- [ ] **Go-to-Definition Provider** (6 hours)
  - Navigate to FHIR resource definitions
  - Jump to function implementations
  - Handle built-in vs custom functions
  - Support cross-file navigation

- [ ] **Find References Provider** (5 hours)
  - Find all usages of FHIR properties
  - Locate function call sites
  - Handle workspace-wide searches
  - Provide reference context

### 3. Document Formatting [Priority: Medium]

Create consistent FHIRPath expression formatting:

- [ ] **Formatter Engine** (8 hours)
  - Build AST-based formatting engine
  - Implement configurable formatting rules
  - Handle indentation and spacing
  - Support multi-expression documents
  - Add format-on-save capability

- [ ] **Formatting Rules** (4 hours)
  - Define default formatting style
  - Configure operator spacing
  - Handle function parameter alignment
  - Support bracket and parentheses formatting
  - Add line length limits

### 4. Workspace Symbol Search [Priority: Medium]

Enable cross-file symbol discovery:

- [ ] **Workspace Symbol Provider** (6 hours)
  - Index symbols across all FHIRPath files
  - Support fuzzy symbol matching
  - Categorize by symbol type
  - Implement efficient search algorithms
  - Cache symbol index for performance

- [ ] **Symbol Indexing** (4 hours)
  - Monitor file changes for index updates
  - Handle workspace folder changes
  - Implement incremental indexing
  - Add memory-efficient storage

### 5. Refactoring Operations [Priority: Low]

Safe code transformation operations:

- [ ] **Rename Provider** (8 hours)
  - Rename FHIR properties safely
  - Handle function parameter renaming
  - Support workspace-wide renaming
  - Validate rename conflicts
  - Preview rename changes

- [ ] **Extract Operations** (6 hours)
  - Extract common sub-expressions
  - Create reusable expression functions
  - Handle variable scoping
  - Maintain expression semantics

### 6. Enhanced Diagnostics [Priority: Medium]

Advanced semantic analysis and linting:

- [ ] **Performance Diagnostics** (5 hours)
  - Detect inefficient expressions
  - Suggest optimization opportunities
  - Warn about expensive operations
  - Recommend caching strategies

- [ ] **Code Quality Rules** (6 hours)
  - Detect unused expressions
  - Flag complex nested expressions
  - Suggest simplifications
  - Enforce style guidelines

- [ ] **FHIR Best Practices** (4 hours)
  - Validate FHIR path efficiency
  - Suggest resource navigation improvements
  - Check for deprecated FHIR elements
  - Recommend FHIR version compatibility

### 7. Testing & Documentation [Priority: Low]

Comprehensive testing and user documentation:

- [ ] **Unit Tests** (8 hours)
  - Test all code action scenarios
  - Validate symbol navigation accuracy
  - Test formatting rules and edge cases
  - Verify refactoring safety

- [ ] **Integration Tests** (6 hours)
  - Test workspace-wide operations
  - Validate cross-file navigation
  - Test performance under load
  - End-to-end feature testing

- [ ] **User Documentation** (4 hours)
  - Document configuration options
  - Create feature usage guides
  - Add troubleshooting sections
  - Update README with new features

## Technical Design

### Code Actions Architecture

```typescript
interface CodeActionProvider {
  provideCodeActions(
    document: TextDocument,
    range: Range,
    context: CodeActionContext
  ): CodeAction[];
}

interface CodeAction {
  title: string;
  kind: CodeActionKind;
  diagnostics?: Diagnostic[];
  edit?: WorkspaceEdit;
  command?: Command;
}
```

### Symbol System Design

```typescript
interface SymbolProvider {
  // Document symbols
  provideDocumentSymbols(document: TextDocument): SymbolInformation[];
  
  // Workspace symbols
  provideWorkspaceSymbols(query: string): SymbolInformation[];
  
  // Navigation
  provideDefinition(document: TextDocument, position: Position): Location[];
  provideReferences(document: TextDocument, position: Position): Location[];
}
```

### Formatter Configuration

```yaml
# .fhirpath-format.yml
formatting:
  indentSize: 2
  maxLineLength: 100
  operatorSpacing: true
  functionParameterAlignment: true
  bracketSpacing: false
  trailingCommas: false
  multiExpressionSpacing: 1
```

## Implementation Order

1. **Start with Code Actions** - Provides immediate value to users
2. **Add Symbol Navigation** - Core IDE functionality
3. **Implement Formatting** - Code quality improvement
4. **Build Workspace Search** - Discovery and exploration
5. **Create Refactoring** - Advanced transformation
6. **Enhanced Diagnostics** - Semantic analysis
7. **Testing & Documentation** - Quality assurance

## Success Criteria

- [ ] Code actions resolve 80%+ of common FHIRPath errors
- [ ] Go-to-definition works for all navigable symbols
- [ ] Formatter produces consistent, readable output
- [ ] Symbol search covers entire workspace efficiently
- [ ] Refactoring operations maintain semantic correctness
- [ ] Performance impact < 15% on existing features
- [ ] All features work smoothly in large workspaces (100+ files)

## Performance Targets

- **Code action resolution**: < 100ms
- **Go-to-definition**: < 50ms
- **Format document**: < 500ms
- **Workspace symbol search**: < 200ms initial, < 50ms subsequent
- **Find references**: < 300ms
- **Rename operation**: < 1000ms preview, < 2000ms execution
- **Memory overhead**: < 20MB for symbol indexing

## Configuration Options

### VS Code Settings

```json
{
  "fhirpath.codeActions.enabled": true,
  "fhirpath.formatting.enabled": true,
  "fhirpath.formatting.insertFinalNewline": true,
  "fhirpath.diagnostics.performance": true,
  "fhirpath.symbols.workspaceIndexing": true,
  "fhirpath.refactoring.enabled": true
}
```

## Files to Create/Modify

### New Providers
- `server/src/providers/CodeActionProvider.ts` - Code fixes and refactoring
- `server/src/providers/DocumentSymbolProvider.ts` - Document navigation
- `server/src/providers/WorkspaceSymbolProvider.ts` - Cross-file search
- `server/src/providers/DefinitionProvider.ts` - Go-to-definition
- `server/src/providers/ReferencesProvider.ts` - Find references
- `server/src/providers/RenameProvider.ts` - Symbol renaming
- `server/src/providers/DocumentFormattingProvider.ts` - Code formatting

### Services
- `server/src/services/SymbolIndexService.ts` - Workspace symbol indexing
- `server/src/services/FormatterService.ts` - Expression formatting
- `server/src/services/RefactoringService.ts` - Code transformations
- `server/src/services/CodeActionService.ts` - Action generation

### Configuration
- Update `server/src/server.ts` with new capabilities
- Add formatting and refactoring configuration options
- Update client settings schema

## Dependencies

### External Dependencies
```json
{
  "prettier": "^3.0.0",
  "@typescript-eslint/parser": "^6.0.0",
  "levenshtein": "^1.0.5"
}
```

### Internal Dependencies
- Phase 1-3 foundation (complete)
- Enhanced AST utilities
- Symbol resolution system
- Workspace management

## Risk Mitigation

- **Performance Impact**: Implement lazy loading and efficient caching
- **Memory Usage**: Use weak references and cleanup strategies
- **Complex Refactoring**: Start with simple operations, expand gradually
- **User Configuration**: Provide sensible defaults, extensive documentation
- **Cross-platform**: Test on Windows, macOS, Linux

## Notes

- Focus on user experience and immediate productivity gains
- All features should integrate seamlessly with existing functionality
- Maintain backward compatibility with existing configurations
- Consider future extensibility in API design
- Performance is critical for workspace-wide operations

---

**Implementation Summary**

**Total Estimated Hours**: 89 hours
**Expected Completion**: 3-4 weeks
**Dependencies**: Complete Phase 3 Registry Integration

### Priority Breakdown
- **High Priority**: Code Actions, Symbol Navigation (26 hours)
- **Medium Priority**: Formatting, Workspace Search, Enhanced Diagnostics (27 hours) 
- **Low Priority**: Refactoring, Testing, Documentation (36 hours)

**Next Phase**: Phase 5 - Integration & Polish (Server integration, packaging, distribution)