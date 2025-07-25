# Phase 4 - Task 2: Quick Fix Actions

**Status**: ✅ **COMPLETED**  
**Priority**: High  
**Estimated**: 6 hours  
**Started**: 2025-07-25  
**Completed**: 2025-07-25  

## Overview

Implement concrete quick fix actions for common FHIRPath errors. These automated fixes will provide immediate value to developers by correcting syntax errors, typos, and common mistakes with a single click.

## Micro-Tasks Breakdown

### 1. Function Name Quick Fixes (2 hours)
- [ ] **Implement unknown function detection** (30 min)
  - Analyze diagnostic codes from DiagnosticProvider
  - Extract function names from error contexts
  - Identify typos vs completely unknown functions

- [ ] **Create function suggestion engine** (1 hour)
  - Use FHIRPathFunctionRegistry for available functions
  - Implement fuzzy matching with edit distance
  - Rank suggestions by similarity and popularity
  - Handle case-insensitive matches

- [ ] **Build function replacement actions** (30 min)
  - Generate "Did you mean X?" quick fixes
  - Create text replacement actions
  - Add multiple suggestions when appropriate
  - Mark as preferred for high confidence matches

### 2. Bracket and Syntax Fixes (2 hours)
- [ ] **Implement bracket mismatch detection** (45 min)
  - Detect missing opening/closing brackets `[`, `]`
  - Detect missing parentheses `(`, `)`
  - Handle nested bracket scenarios
  - Identify insertion points

- [ ] **Create bracket fix actions** (45 min)
  - Auto-insert missing brackets at correct positions
  - Fix bracket ordering issues
  - Handle multiple bracket problems in sequence
  - Provide clear action titles

- [ ] **Implement string literal fixes** (30 min)
  - Detect unterminated strings
  - Fix quote mismatch (single vs double)
  - Auto-complete string literals
  - Handle escaped quotes

### 3. Operator and Expression Fixes (1.5 hours)
- [ ] **Implement missing operator detection** (45 min)
  - Detect missing comparison operators (`=`, `!=`, `>`, `<`)
  - Identify missing logical operators (`and`, `or`)
  - Handle operator precedence issues
  - Detect missing path operators (`.`)

- [ ] **Create operator fix actions** (45 min)
  - Suggest appropriate operators based on context
  - Auto-insert missing operators
  - Fix operator spacing issues
  - Handle complex expression repairs

### 4. Integration and Testing (30 min)
- [ ] **Register quick fix providers** (15 min)
  - Register with main CodeActionProvider
  - Set appropriate priorities
  - Configure action kinds
  - Test provider registration

- [ ] **End-to-end testing** (15 min)
  - Test with sample error scenarios
  - Verify quick fixes appear in VS Code
  - Check action execution
  - Validate fix quality

## Implementation Details

### Quick Fix Provider Architecture

```typescript
interface IQuickFixProvider extends ICodeActionProvider {
  // Specific to quick fixes
  canFix(diagnostic: Diagnostic): boolean;
  provideFixes(
    document: TextDocument,
    diagnostic: Diagnostic,
    range: Range
  ): FHIRPathCodeAction[];
}
```

### Diagnostic Code Mapping

Based on existing diagnostic codes from Phase 1-3:
- `E007`: UnknownFunction → Function name suggestions
- `E001`: SyntaxError → Bracket/syntax fixes  
- `E008`: UnterminatedString → String literal fixes
- `E005`: InvalidOperator → Operator suggestions

### Files to Create

- `server/src/providers/quickfix/FunctionNameQuickFixProvider.ts`
- `server/src/providers/quickfix/BracketQuickFixProvider.ts`
- `server/src/providers/quickfix/StringLiteralQuickFixProvider.ts`
- `server/src/providers/quickfix/OperatorQuickFixProvider.ts`
- `server/src/providers/quickfix/index.ts` - Exports
- `server/src/__tests__/quickfix/` - Test files

## Example Quick Fixes

### Function Name Corrections
```fhirpath
// Error: Patient.whre(active = true)
// Quick Fix: "Did you mean 'where'?" → Patient.where(active = true)

// Error: Patient.name.gievn
// Quick Fix: "Did you mean 'given'?" → Patient.name.given
```

### Bracket Fixes
```fhirpath
// Error: Patient.name[use = 'official'
// Quick Fix: "Add missing closing bracket" → Patient.name[use = 'official']

// Error: Patient.name.where(use = 'official'
// Quick Fix: "Add missing closing parenthesis" → Patient.name.where(use = 'official')
```

### String and Operator Fixes
```fhirpath
// Error: Patient.name = 'John
// Quick Fix: "Add missing quote" → Patient.name = 'John'

// Error: Patient.active true
// Quick Fix: "Insert '=' operator" → Patient.active = true
```

## Acceptance Criteria

- [ ] Function name typos corrected with 95%+ accuracy for common functions
- [ ] Bracket/parentheses mismatches automatically fixable
- [ ] String literal errors resolved with single click
- [ ] Quick fixes appear within 100ms of diagnostic
- [ ] Actions clearly describe what they will do
- [ ] High-confidence fixes marked as "preferred"
- [ ] Multiple fix options provided when ambiguous
- [ ] Integration tests pass for all fix scenarios

## Progress Tracking

### ✅ Completed
- ✅ **Function Name Quick Fixes** (2 hours)
  - ✅ Implement unknown function detection
  - ✅ Create function suggestion engine with fuzzy matching
  - ✅ Build function replacement actions with confidence scoring
  - ✅ Add case-insensitive matching and common typo detection

- ✅ **Bracket & Syntax Fixes** (2 hours)
  - ✅ Implement bracket mismatch detection (square brackets, parentheses)
  - ✅ Create bracket fix actions with smart insertion positioning
  - ✅ Handle nested bracket scenarios and quote detection
  - ✅ Bracket replacement for mismatched pairs

- ✅ **String & Operator Fixes** (1.5 hours)
  - ✅ Implement missing operator detection and suggestions
  - ✅ Create operator fix actions with context awareness
  - ✅ Handle unterminated string detection and fixes
  - ✅ Auto-insert missing operators based on patterns

- ✅ **Integration & Testing** (30 min)
  - ✅ Register quick fix providers with main CodeActionProvider
  - ✅ Configure action priorities and kinds
  - ✅ Comprehensive unit test coverage (8 tests passing)
  - ✅ Successful build integration

### 🔄 In Progress
- (none)

### ⏸️ Blocked
- (none)

### 📝 Notes
- Focus on most common errors first (function names, brackets)
- Ensure fix quality over quantity
- Test with real-world FHIRPath expressions
- Consider user feedback for fix ranking

## Next Steps After Task 2

1. **Task 3**: Source Actions (4 hours) - Format document, organize code
2. **Task 4**: Symbol Navigation (5 hours) - Go-to-definition, find references
3. Performance optimization and user testing

---

**Task 2 Progress**: ✅ 100% (6/6 hours completed)  
**Overall Phase 4 Progress**: 11% (10/89 hours completed)