# ADR-007: Enhanced Completion Provider for Directives and Resource Types

## Status
Implemented - Legacy code removed, ModelProvider-only approach

## Context
The FHIRPath LSP completion system needed improvements in several key areas:

1. **@resource directive autocomplete**: Users needed better autocomplete for FHIR resource types when using the `@resource` directive
2. **@inputfile directive functionality**: The `@inputfile` directive needed to work reliably with file path completions
3. **Capitalized character suggestions**: When users started typing with capitalized characters (indicating resource types), the system should prioritize resource type suggestions
4. **Property and function suggestions**: After typing a dot, users needed both property completions and function completions for method chaining

## Decision

### 1. Model Provider Integration for Resource Types
- **Use ModelProvider's `getResourceTypes()` method** instead of hardcoded resource types
- Ensure all FHIR resource type completions come directly from the initialized model provider
- Implement fallback handling when model provider is not initialized

### 2. Enhanced @resource Directive Completion
- Integrate with `getFHIRResourceTypeCompletions()` to use model provider data
- Provide comprehensive documentation for each resource type in completions
- Sort resource types with common ones (Patient, Observation, etc.) getting higher priority

### 3. Improved @inputfile Directive Support
- Enhanced file path parsing to handle directories and files correctly  
- Support for reactive filtering based on partial file paths
- Proper handling of file extensions with JSON files getting priority
- Support for quoted file paths containing spaces

### 4. Capitalized Character Detection
- Detect when users type capitalized characters (e.g., `P`, `Pat`) indicating resource type input
- Prioritize FHIR resource types (CompletionItemKind.Class) in these scenarios
- Implement fuzzy matching for resource types while maintaining strict prefix matching for properties

### 5. Enhanced Dot Navigation Completions
- After dot (`.`), provide both property completions AND function completions
- Enable method chaining by always including relevant functions
- Maintain proper sorting with properties getting higher priority than functions

### 6. Improved Filtering and Sorting
- **Capitalized Input Handling**: Recognize patterns like `/^[A-Z]/` as resource type queries
- **Enhanced Filtering**: For resource types, allow both prefix and fuzzy matching
- **Priority Sorting**: Context resources → Common resources → Other resources → Properties → Functions

## Implementation Details

### Key Changes in CompletionProvider.ts

```typescript
// Enhanced resource completions with capitalized character detection
const isCapitalizedPattern = context.currentToken && /^[A-Z]/.test(context.currentToken);
const shouldPrioritizeResources = isCapitalizedPattern || !context.currentToken;

// Always include function completions after dot for method chaining  
if (context.isAfterDot || this.isPartialNavigation(context)) {
  const propertyCompletions = await this.getFHIRResourcePropertyCompletions(context, documentContext);
  completions.push(...propertyCompletions);
  
  const functionCompletions = this.getFunctionCompletions(context);
  completions.push(...functionCompletions);
}

// Enhanced filtering with capitalized input support
if (isCapitalizedInput) {
  filtered = completions.filter(item => {
    const itemLabel = item.label.toLowerCase();
    
    // Exact prefix match gets highest priority
    if (itemLabel.startsWith(currentToken)) {
      return true;
    }
    
    // For resource types (classes), also allow fuzzy matching
    if (item.kind === CompletionItemKind.Class) {
      return itemLabel.includes(currentToken);
    }
    
    return itemLabel.startsWith(currentToken);
  });
}
```

### File Path Completion Enhancements

```typescript
// Support for reactive filtering based on current token
if (context.directiveType === 'inputfile') {
  const currentToken = context.currentToken.toLowerCase();
  const isCompleteDirPath = currentToken.endsWith('/') || currentToken.endsWith('\\');
  
  if (isCompleteDirPath) {
    // Show all contents of directory
    filtered = completions;
  } else {
    // Extract filename pattern for filtering
    // Support paths like "./data/pat" -> filter by "pat"
  }
}
```

## Consequences

### Positive
- **Clean Architecture**: No backward compatibility code, single source of truth (ModelProvider)
- **Better Developer Experience**: Users get relevant completions based on their input patterns
- **Authoritative Data**: All FHIR types come directly from FHIR model provider
- **Enhanced File Support**: @inputfile directive works reliably with file system navigation
- **Method Chaining**: Users can chain properties and functions naturally with `.` navigation
- **Smart Prioritization**: Common resource types appear first, making frequent operations faster
- **Simplified Maintenance**: Removed hardcoded FHIR lists and legacy fallback logic

### Breaking Changes
- **ModelProvider Required**: FHIR completions now require properly initialized ModelProvider
- **No Hardcoded Fallbacks**: Removed all hardcoded FHIR resource lists and property mappings
- **Strict Dependencies**: System will warn/fail gracefully when ModelProvider unavailable

### Mitigation Strategies
- **Clear Logging**: Warnings when ModelProvider not available
- **Graceful Degradation**: Empty completions rather than broken behavior
- **Performance**: Existing caching minimizes ModelProvider calls
- **Documentation**: Clear requirements for ModelProvider initialization

## Validation

### Test Scenarios
1. **@resource Directive**: Type `@resource Pat` → Should suggest `Patient` and other matching resource types
2. **Capitalized Input**: Type `Obs` → Should prioritize `Observation` resource type
3. **Dot Navigation**: Type `Patient.` → Should show both properties (`name`, `identifier`, etc.) and functions (`where()`, `exists()`, etc.)
4. **File Path Completion**: Type `@inputfile ./data/` → Should show files in the data directory
5. **Mixed Context**: Verify that non-directive contexts still work properly

### Success Criteria
- All FHIR resource types from model provider appear in @resource completions
- Capitalized input prioritizes resource types appropriately
- File path completions work for relative and absolute paths
- Property and function completions both appear after dot navigation
- Performance remains acceptable for large resource type lists

## Notes
- This enhancement maintains backward compatibility with existing completion behavior
- The implementation leverages the existing `FHIRPathService.getAvailableResourceTypes()` method
- Future enhancements could include more sophisticated fuzzy matching algorithms
- The ADR serves as documentation for the decision to use model provider data rather than hardcoded resource lists