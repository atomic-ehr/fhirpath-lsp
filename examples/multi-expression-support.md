# Multi-Expression Support in FHIRPath Files

The FHIRPath Language Server now supports multiple expressions in `.fhirpath` files, with both context-aware and context-free validation.

## Multi-Expression Syntax

### Multiple Lines
Each line can contain a separate FHIRPath expression:

```fhirpath
Patient.name.family
Patient.active = true
Patient.birthDate < today()
Observation.status = "final"
```

### Semicolon Separation
Multiple expressions can be placed on a single line, separated by semicolons:

```fhirpath
Patient.active; Observation.value; Condition.code
name.exists(); active = true; birthDate.exists()
```

### String Handling
Semicolons inside strings are properly handled and do not split expressions:

```fhirpath
Patient.name.where(family = "Smith; Johnson")
Observation.note.text.contains("test; result; data")
```

## Validation Without Context

When no context declarations are present, the language server provides:

### 1. Syntax Validation
- Balanced parentheses and brackets
- Proper string literal termination
- Valid operator placement
- Expression structure validation

```fhirpath
// Valid expressions
Patient.name.family
Observation.value.as(Quantity)
Condition.clinicalStatus.exists()

// Invalid syntax - will show errors
Patient.name..family          // Double dots not allowed
Observation.status =          // Incomplete expression
unclosedFunction(             // Unclosed parenthesis
Patient.name[                 // Unclosed bracket
```

### 2. Function Validation
- Checks against known FHIRPath function names
- Warns about potentially invalid functions

```fhirpath
Patient.name.exists()         // Valid function
Patient.name.count()          // Valid function
Patient.name.invalidFunc()    // Warning: Unknown function
```

### 3. Semantic Validation
- Basic FHIRPath expression structure
- Logical operator placement
- Function call syntax

```fhirpath
// Valid
Patient.name and Patient.active
Patient.name.exists() or Patient.deceased

// Invalid
and Patient.name              // Logical operator at start
Patient.name and             // Logical operator at end
```

## Validation With Context

When context declarations are present, additional validation is performed:

### Context-Aware Resource Validation

```fhirpath
// @resource Patient

// Valid - Patient properties
name.family
active = true
birthDate.exists()

// Invalid - not Patient properties
status = "final"             // Error: Property 'status' not found in Patient
category.coding              // Error: Property 'category' not found in Patient
```

### Resource Type Mismatch Detection

```fhirpath
// @resource Patient

// This will show an error
Observation.status           // Error: Resource type 'Observation' does not match context type 'Patient'
```

## Error Reporting

### Per-Expression Diagnostics
Each expression is validated independently with accurate positioning:

```fhirpath
Patient.name.family          // No errors
Observation.invalidProp      // Error on this line only
Condition.code.exists()      // No errors
```

### Detailed Error Messages

1. **Syntax Errors**
   ```
   Line 2: Unclosed parenthesis at position 15
   Line 5: Unterminated string literal
   ```

2. **Function Warnings**
   ```
   Line 3: Unknown function 'invalidFunc' - verify this is a valid FHIRPath function
   ```

3. **Context Errors**
   ```
   Line 7: Property 'status' not found in Patient
   Line 9: Resource type 'Observation' does not match context type 'Patient'
   ```

## Examples

### Basic Multi-Expression File

```fhirpath
// No context - basic validation only
Patient.name.family
Patient.active = true
Observation.status = "final"
Condition.clinicalStatus

// Multiple per line
Patient.name.exists(); Patient.active; Patient.birthDate

// Complex expressions
Patient.name.where(use = "official").family.exists() and Patient.active = true
Observation.component.where(code.coding.code = "8480-6").valueQuantity.value > 120
```

### Context-Aware Multi-Expression File

```fhirpath
// @resource Patient
// @input patient-data.json

// Valid Patient expressions
name.where(use = "official").family
telecom.where(system = "phone").value
address.where(use = "home").line.first()
birthDate < today()

// Multiple expressions with context validation
name.exists(); active = true; birthDate.exists()

// These will show context-specific errors
status = "final"                    // Not a Patient property
Observation.value                   // Wrong resource type

// Complex contextual validation
name.where(use = "official").exists() and 
active = true and 
birthDate <= today()
```

### Mixed Content File

```fhirpath
// @resource Observation

// Context comments and expressions mixed
status = "final"                    // Valid Observation property
category.coding.exists()            // Valid Observation property

// Multiple expressions
status.exists(); category.exists(); code.exists()

// Some invalid examples for demonstration
name.family                         // Error: Not an Observation property
Patient.active                      // Error: Wrong resource type in context
```

## Benefits

### 1. Flexible Development
- Write multiple test expressions in one file
- Mix simple and complex expressions
- Quick validation of multiple scenarios

### 2. Accurate Error Reporting
- Per-expression error positioning
- Context-aware validation when available
- Fallback to syntax validation without context

### 3. Enhanced Productivity
- Test multiple expressions simultaneously
- Clear error messages for each expression
- Support for both exploratory and structured development

## Best Practices

### 1. File Organization
```fhirpath
// Group related expressions
// @resource Patient

// Basic demographics
name.exists()
birthDate.exists()
gender.exists()

// Contact information
telecom.exists()
address.exists()

// Administrative
active = true
```

### 2. Expression Separation
```fhirpath
// Use separate lines for complex expressions
Patient.name.where(use = "official").family.exists()
Patient.telecom.where(system = "phone").value.matches("^\\d{3}-\\d{3}-\\d{4}$")

// Use semicolons for simple related expressions
name.exists(); active = true; birthDate.exists()
```

### 3. Context Usage
```fhirpath
// Always specify context for better validation
// @resource Patient

// Then write expressions without resource prefix
name.family              // Instead of Patient.name.family
active = true           // Instead of Patient.active = true
```

This multi-expression support makes the FHIRPath Language Server much more versatile for development, testing, and validation of FHIRPath expressions.