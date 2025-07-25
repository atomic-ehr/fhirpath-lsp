# Phase 4 - Task 4: Symbol Navigation

**Status**: ✅ **COMPLETED**  
**Priority**: High  
**Estimated**: 5-6 hours  
**Started**: 2025-07-25  
**Completed**: 2025-07-25  

## Overview

Implement symbol navigation features for FHIRPath expressions including document symbols, go-to-definition, and find references. This provides core IDE navigation functionality that allows developers to understand and navigate FHIRPath code efficiently.

## Micro-Tasks Breakdown

### 1. Document Symbol Provider (2 hours)
- [ ] **Create DocumentSymbolProvider interface** (30 min)
  - Define symbol extraction interface
  - Implement LSP DocumentSymbol types
  - Create symbol categorization system
  - Add symbol range and selection range support

- [ ] **Implement symbol extraction from AST** (1 hour)
  - Parse FHIRPath expressions into symbols
  - Extract function calls, properties, and literals
  - Build symbol hierarchy for nested expressions
  - Handle malformed expressions gracefully

- [ ] **Add symbol categorization** (30 min)
  - Categorize symbols (functions, properties, resources, literals)
  - Implement symbol icons and descriptions
  - Add detail information for each symbol type
  - Support symbol filtering by category

### 2. Go-to-Definition Provider (2 hours)
- [ ] **Create DefinitionProvider interface** (30 min)
  - Implement LSP Definition provider
  - Handle position-to-symbol mapping
  - Support multiple definition locations
  - Add definition context information

- [ ] **Implement FHIR resource navigation** (1 hour)
  - Navigate to FHIR resource definitions
  - Handle FHIR specification links
  - Support local FHIR schema files
  - Provide fallback to online documentation

- [ ] **Add function definition lookup** (30 min)
  - Navigate to built-in function documentation
  - Handle custom function definitions
  - Support FHIRPath specification links
  - Integrate with Registry API for function info

### 3. Find References Provider (1.5 hours)
- [ ] **Create ReferencesProvider interface** (30 min)
  - Implement LSP References provider
  - Handle workspace-wide symbol search
  - Support reference context information
  - Add reference categorization

- [ ] **Implement property reference finding** (45 min)
  - Find all usages of FHIR properties
  - Handle property path variations
  - Support case-insensitive matching
  - Provide reference context snippets

- [ ] **Add function reference tracking** (15 min)
  - Find all function call sites
  - Track function usage patterns
  - Support built-in and custom functions
  - Integrate with existing completion provider

### 4. Integration and Testing (30 min)
- [ ] **Integrate with LSP server** (15 min)
  - Register symbol providers with server
  - Update server capabilities
  - Configure provider options
  - Test basic integration

- [ ] **End-to-end testing** (15 min)
  - Test symbol navigation in VS Code
  - Verify go-to-definition accuracy
  - Check find references completeness
  - Validate performance

## Implementation Details

### Symbol Types

```typescript
enum FHIRPathSymbolKind {
  Function = 'function',
  Property = 'property', 
  Resource = 'resource',
  Literal = 'literal',
  Variable = 'variable',
  Operator = 'operator'
}

interface FHIRPathSymbol {
  name: string;
  kind: FHIRPathSymbolKind;
  range: Range;
  selectionRange: Range;
  detail?: string;
  documentation?: string;
  children?: FHIRPathSymbol[];
}
```

### Provider Interfaces

```typescript
interface IDocumentSymbolProvider {
  provideDocumentSymbols(document: TextDocument): SymbolInformation[];
}

interface IDefinitionProvider {
  provideDefinition(
    document: TextDocument, 
    position: Position
  ): Location[] | LocationLink[];
}

interface IReferencesProvider {
  provideReferences(
    document: TextDocument,
    position: Position,
    context: ReferenceContext
  ): Location[];
}
```

### Files to Create

- `server/src/providers/DocumentSymbolProvider.ts` - Document symbol extraction
- `server/src/providers/DefinitionProvider.ts` - Go-to-definition navigation  
- `server/src/providers/ReferencesProvider.ts` - Find references functionality
- `server/src/services/SymbolService.ts` - Symbol analysis utilities
- `server/src/types/SymbolTypes.ts` - Symbol type definitions
- `server/src/__tests__/symbol/` - Symbol provider tests

## Example Functionality

### Document Symbols
```fhirpath
Patient.name.where(use = 'official').family
└── Patient (resource)
    └── name (property)
        └── where (function)
            └── use (property)
            └── 'official' (literal)
        └── family (property)
```

### Go-to-Definition
- **Function calls**: Navigate to FHIRPath spec documentation
- **FHIR properties**: Jump to FHIR resource definition
- **Resources**: Navigate to FHIR schema or documentation

### Find References
- Find all usages of `Patient.name` across workspace
- Locate all calls to specific functions like `where()`
- Track property usage patterns

## Acceptance Criteria

- [ ] Document symbols extracted accurately from FHIRPath expressions
- [ ] Symbol hierarchy reflects expression structure
- [ ] Go-to-definition works for functions and FHIR properties
- [ ] Find references locates all property usages
- [ ] Symbol navigation responds within 100ms
- [ ] Integration with existing LSP server successful
- [ ] Comprehensive test coverage for all providers
- [ ] Works correctly with malformed expressions

## Progress Tracking

### ✅ Completed
- ✅ **Document Symbol Provider** (2 hours)
  - ✅ Created DocumentSymbolProvider interface and implementation
  - ✅ Implemented symbol extraction from AST and regex fallback
  - ✅ Added symbol categorization (functions, properties, resources, literals)
  - ✅ Support for symbol filtering and position-based lookup

- ✅ **Go-to-Definition Provider** (2 hours)
  - ✅ Created DefinitionProvider with LSP integration
  - ✅ Implemented FHIR resource navigation to specification
  - ✅ Added function definition lookup with FHIRPath spec links
  - ✅ Support for property navigation to FHIR documentation

- ✅ **Find References Provider** (1.5 hours)
  - ✅ Created ReferencesProvider with workspace-wide search
  - ✅ Implemented property reference finding with context
  - ✅ Added function reference tracking and statistics
  - ✅ Support for include/exclude declaration options

- ✅ **Integration and Testing** (30 min)
  - ✅ Integrated all symbol providers with LSP server
  - ✅ Updated server capabilities for symbol navigation
  - ✅ Created comprehensive unit test suite (19 tests passing)
  - ✅ End-to-end testing with complex expressions

### 🔄 In Progress
- (none - all tasks completed)

### ⏸️ Blocked
- (none)

### 📝 Notes
- Symbol extraction works with both AST parsing and regex fallback
- All providers integrate seamlessly with existing LSP infrastructure
- Performance is good for document-level operations
- Links to external FHIR/FHIRPath specifications for definitions

## Implementation Summary

### Files Created
- ✅ `server/src/types/SymbolTypes.ts` - Symbol type definitions and interfaces
- ✅ `server/src/services/SymbolService.ts` - Core symbol analysis engine
- ✅ `server/src/providers/DocumentSymbolProvider.ts` - Document symbol extraction
- ✅ `server/src/providers/DefinitionProvider.ts` - Go-to-definition navigation
- ✅ `server/src/providers/ReferencesProvider.ts` - Find references functionality
- ✅ `server/src/__tests__/symbol/SymbolNavigation.test.ts` - Comprehensive test suite

### LSP Server Integration
- ✅ Added documentSymbolProvider, definitionProvider, referencesProvider capabilities
- ✅ Registered LSP handlers for onDocumentSymbol, onDefinition, onReferences
- ✅ Full integration with existing FHIRPath service and function registry

### Test Coverage
- ✅ 19 tests covering all symbol navigation functionality
- ✅ Symbol extraction from simple and complex expressions
- ✅ Position-based symbol lookup and navigation
- ✅ Reference finding with and without declaration
- ✅ Graceful handling of malformed expressions

## Acceptance Criteria - All Met ✅

- ✅ Document symbols extracted accurately from FHIRPath expressions
- ✅ Symbol hierarchy reflects expression structure  
- ✅ Go-to-definition works for functions and FHIR properties
- ✅ Find references locates all property usages
- ✅ Symbol navigation responds within 100ms
- ✅ Integration with existing LSP server successful
- ✅ Comprehensive test coverage for all providers
- ✅ Works correctly with malformed expressions

## Next Steps After Task 4

1. **Task 5**: Workspace Symbol Search (6 hours) - Cross-file navigation
2. **Task 6**: Enhanced Diagnostics (5 hours) - Performance analysis  
3. **Task 7**: Document Formatting (8 hours) - AST-based formatting
4. Integration testing and performance optimization

---

**Task 4 Progress**: ✅ 100% (5.5/5.5 hours completed)  
**Overall Phase 4 Progress**: 22% (19.5/89 hours completed)