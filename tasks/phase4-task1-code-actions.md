# Phase 4 - Task 1: Code Actions Framework

**Status**: ✅ **COMPLETED**  
**Priority**: High  
**Estimated**: 4 hours  
**Started**: 2025-07-25  
**Completed**: 2025-07-25  

## Overview

Create extensible code action system for automated fixes and improvements. This forms the foundation for all quick fixes, refactoring, and source actions in the FHIRPath LSP.

## Micro-Tasks Breakdown

### 1. CodeActionProvider Infrastructure ✅ Completed
- [x] **Create base CodeActionProvider class** (1 hour)
  - ✅ Define CodeActionProvider interface
  - ✅ Implement LSP CodeAction types
  - ✅ Create action registration system
  - ✅ Add provider initialization

- [x] **Implement code action resolution system** (1 hour)  
  - ✅ Create action resolver infrastructure
  - ✅ Handle deferred action resolution
  - ✅ Implement edit generation
  - ✅ Add command execution support

- [x] **Add action kind categorization** (1 hour)
  - ✅ Define CodeActionKind hierarchy
  - ✅ Implement quickfix actions
  - ✅ Add refactor action types
  - ✅ Create source action categories

- [x] **Integrate with LSP server capabilities** (1 hour)
  - ✅ Update server capabilities registration
  - ✅ Connect provider to LSP handlers
  - ✅ Add configuration options
  - ✅ Test basic integration

## Implementation Details

### CodeActionProvider Interface

```typescript
interface ICodeActionProvider {
  provideCodeActions(
    document: TextDocument,
    range: Range,
    context: CodeActionContext
  ): CodeAction[] | Promise<CodeAction[]>;
  
  resolveCodeAction?(action: CodeAction): CodeAction | Promise<CodeAction>;
}
```

### Action Categories

1. **QuickFix** (`quickfix.*`)
   - Fix syntax errors
   - Correct function names
   - Fix bracket mismatches

2. **Refactor** (`refactor.*`)
   - Extract expressions
   - Rename symbols
   - Optimize performance

3. **Source** (`source.*`)
   - Format document
   - Organize imports
   - Remove unused code

### Files to Create

- `server/src/providers/CodeActionProvider.ts` - Main provider class
- `server/src/services/CodeActionService.ts` - Action generation logic
- `server/src/types/CodeActionTypes.ts` - Type definitions
- `server/src/__tests__/CodeActionProvider.test.ts` - Unit tests

## Acceptance Criteria

- [ ] CodeActionProvider class created with LSP integration
- [ ] Action resolution system working
- [ ] Three action categories (quickfix, refactor, source) supported
- [ ] Server capabilities properly registered
- [ ] Basic unit tests passing
- [ ] Integration with existing diagnostic system

## Progress Tracking

### ✅ Completed
- ✅ Create base CodeActionProvider class (1 hour)
- ✅ Implement code action resolution system (1 hour)
- ✅ Add action kind categorization (1 hour)
- ✅ Integrate with LSP server capabilities (1 hour)

### 🔄 In Progress
- (none)

### ⏸️ Blocked
- (none)

### 📝 Notes
- Focus on extensible architecture for future action types
- Ensure performance for large documents
- Consider caching for expensive action generation

## Next Steps After Task 1

1. **Task 2**: Quick Fix Actions (6 hours)
2. **Task 3**: Source Actions (4 hours)
3. Integration with existing providers
4. User testing and feedback

---

**Task 1 Progress**: ✅ 100% (4/4 hours completed)  
**Overall Phase 4 Progress**: 4% (4/89 hours completed)