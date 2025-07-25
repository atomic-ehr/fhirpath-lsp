# Phase 4 - Task 3: Source Actions

**Status**: ✅ Completed  
**Priority**: High  
**Estimated**: 4 hours  
**Started**: 2025-07-25  
**Completed**: 2025-07-25
## Overview

Implement source actions for document formatting, code organization, and optimization. Source actions provide high-level document transformations that improve code quality and maintainability.

## Micro-Tasks Breakdown

### 1. Document Formatting Actions (2 hours)
- [ ] **Implement FHIRPath formatter engine** (1 hour)
  - Create AST-based formatting system
  - Define formatting rules (indentation, spacing)
  - Handle multi-expression documents
  - Support configurable formatting preferences

- [ ] **Create format document action** (30 min)
  - Register "Format Document" source action
  - Apply formatting to entire document
  - Preserve semantic meaning while improving readability
  - Handle edge cases and malformed expressions

- [ ] **Add format selection action** (30 min)
  - Allow formatting of selected text ranges
  - Ensure partial formatting doesn't break syntax
  - Handle multi-line expression fragments
  - Provide clear feedback on formatting results

### 2. Code Organization Actions (1.5 hours)
- [ ] **Implement expression optimization** (45 min)
  - Detect inefficient expression patterns
  - Suggest performance improvements
  - Simplify complex nested expressions
  - Remove redundant conditions

- [ ] **Create sort/organize actions** (45 min)
  - Sort function parameters alphabetically
  - Organize logical expressions consistently
  - Group related conditions together
  - Standardize expression ordering

### 3. Code Quality Actions (30 min)
- [ ] **Remove unused expressions** (15 min)
  - Detect unreachable code paths
  - Remove redundant conditions
  - Clean up unused variables
  - Simplify boolean expressions

- [ ] **Add missing best practices** (15 min)
  - Suggest explicit type checks
  - Add null safety patterns
  - Recommend FHIR path optimizations
  - Insert performance hints

## Implementation Details

### Source Action Types

1. **Format Document** (`source.formatDocument`)
   - Full document formatting with consistent style
   - Configurable indentation and spacing
   - Multi-expression document support

2. **Optimize Performance** (`source.optimizePerformance`)
   - Replace inefficient patterns
   - Suggest better FHIR path navigation
   - Remove redundant operations

3. **Organize Code** (`source.organizeCode`)
   - Sort expressions consistently
   - Group related logic
   - Standardize formatting patterns

4. **Remove Unused** (`source.removeUnused`)
   - Clean up unreachable expressions
   - Remove redundant conditions
   - Simplify complex logic

### Formatting Rules

```typescript
interface FormattingOptions {
  indentSize: number;           // Default: 2
  maxLineLength: number;        // Default: 100
  operatorSpacing: boolean;     // Default: true
  functionAlignment: boolean;   // Default: true
  bracketSpacing: boolean;      // Default: false
  trailingCommas: boolean;      // Default: false
}
```

### Files to Create

- `server/src/services/FormatterService.ts` - Core formatting engine
- `server/src/providers/sourceactions/FormatDocumentProvider.ts`
- `server/src/providers/sourceactions/OptimizePerformanceProvider.ts`
- `server/src/providers/sourceactions/OrganizeCodeProvider.ts`
- `server/src/providers/sourceactions/RemoveUnusedProvider.ts`
- `server/src/providers/sourceactions/index.ts` - Exports
- `server/src/__tests__/sourceactions/` - Test files

## Example Source Actions

### Format Document
```fhirpath
// Before:
Patient.name.where(use='official'and family.exists())or Patient.name.where(use='usual')

// After:
Patient.name.where(use = 'official' and family.exists()) 
  or Patient.name.where(use = 'usual')
```

### Optimize Performance
```fhirpath
// Before:
Patient.name.where(true).where(use = 'official')

// After:
Patient.name.where(use = 'official')
```

### Organize Code
```fhirpath
// Before:
Patient.name.where(use = 'official' and family.exists() and given.exists())

// After:
Patient.name.where(
  family.exists() and 
  given.exists() and 
  use = 'official'
)
```

## Configuration Options

### VS Code Settings
```json
{
  "fhirpath.formatting.enabled": true,
  "fhirpath.formatting.indentSize": 2,
  "fhirpath.formatting.maxLineLength": 100,
  "fhirpath.formatting.operatorSpacing": true,
  "fhirpath.sourceActions.optimizePerformance": true,
  "fhirpath.sourceActions.organizeCode": true
}
```

## Acceptance Criteria

- [ ] Format Document action produces consistent, readable output
- [ ] Formatting preserves semantic meaning of expressions
- [ ] Performance optimization suggestions are accurate
- [ ] Code organization improves readability
- [ ] Source actions complete within 500ms for typical documents
- [ ] Actions work correctly with malformed expressions
- [ ] Integration with existing CodeActionProvider
- [ ] Configuration options properly respected
- [ ] Comprehensive unit test coverage

## Progress Tracking

### ✅ Completed
- ✅ **Document Formatting Actions** (2 hours)
  - ✅ FormatterService created with AST-based formatting
  - ✅ FormatDocumentProvider with format document and selection actions
  - ✅ Configurable formatting options and text-based fallback

- ✅ **Performance Optimization Actions** (1.5 hours)
  - ✅ OptimizePerformanceProvider with pattern-based optimizations
  - ✅ Redundant expression detection and removal
  - ✅ Boolean simplification and performance improvements

- ✅ **Code Organization Actions** (1 hour)
  - ✅ OrganizeCodeProvider for logical expression organization
  - ✅ Function parameter sorting and code structure improvements

- ✅ **Code Quality Actions** (30 min)
  - ✅ RemoveUnusedProvider for cleanup operations
  - ✅ Redundant boolean expression detection

- ✅ **Integration & Testing** (30 min)
  - ✅ Source action providers registered with CodeActionProvider
  - ✅ LSP integration with proper action kinds and priorities
  - ✅ TypeScript compilation successful

### 🔄 In Progress
- (none - all tasks completed)

### ⏸️ Blocked
- (none)

### 📝 Notes
- Focus on commonly used formatting patterns first
- Ensure formatting is reversible and predictable
- Consider user preferences for style choices
- Performance is critical for large documents

## Dependencies

- Existing CodeActionProvider (Task 1 ✅)
- FHIRPath AST parser from Phase 1-2
- Diagnostic system for error detection

## Next Steps After Task 3

1. **Task 4**: Symbol Navigation (5-6 hours) - Document symbols, go-to-definition
2. **Task 5**: Workspace Symbol Search (6 hours) - Cross-file navigation  
3. **Task 6**: Enhanced Diagnostics (5 hours) - Performance and quality analysis

---

**Task 3 Progress**: ✅ 100% (4/4 hours completed)  
**Overall Phase 4 Progress**: 16% (14/89 hours completed)