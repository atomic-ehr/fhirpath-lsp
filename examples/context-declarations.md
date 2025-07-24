# FHIRPath Context Declarations

The FHIRPath Language Server supports context declarations in `.fhirpath` files to enable better validation and auto-completion. This allows you to specify the FHIR resource type and input data that your FHIRPath expressions should be validated against.

## Supported Context Declarations

### Resource Type Declaration

Specify the FHIR resource type that expressions should be evaluated against:

```fhirpath
// @resource Patient

// Now expressions are validated against Patient resource
name.where(use = "official").family
telecom.where(system = "phone").value
birthDate
```

### Input File Declaration

Specify an input file containing FHIR data:

```fhirpath
// @input patient-example.json

// The resource type is inferred from filename if possible
name.family
active = true
```

### Data Context Declaration

Specify inline JSON data or a file path:

```fhirpath
// @data file:./patient-data.json

// Or inline JSON
// @data { "resourceType": "Patient", "name": [{"family": "Doe"}] }

name.family
```

## Benefits

### 1. Context-Aware Validation

When you specify a resource type, the language server validates that:
- Properties exist on the specified resource type
- Property paths are correct according to FHIR specification
- Resource type mismatches are detected

Example error:
```fhirpath
// @resource Patient

// This will show an error
Observation.status  // Error: Resource type 'Observation' does not match context type 'Patient'
```

### 2. Enhanced Auto-Completion

With context declarations, auto-completion becomes more intelligent:
- Resource properties are suggested based on context
- Context resource type gets highest priority in suggestions
- Properties are filtered to match the resource type

### 3. Better Error Messages

Validation errors include context information:
```fhirpath
// @resource Patient

invalidProperty  // Error: Property 'invalidProperty' not found in Patient
```

## Example Files

### Patient Context Example

```fhirpath
// @resource Patient
// @input patient-john-doe.json

// Validate patient demographics
name.where(use = "official").exists()
birthDate <= today()
active = true

// Validate contact information
telecom.where(system = "phone").exists() or 
telecom.where(system = "email").exists()
```

### Observation Context Example

```fhirpath
// @resource Observation
// @input blood-pressure-reading.json

// Validate observation structure
status = "final"
category.coding.where(code = "vital-signs").exists()
code.coding.exists()
subject.reference.exists()

// Validate blood pressure components
component.where(code.coding.code = "8480-6").valueQuantity.value <= 180 and
component.where(code.coding.code = "8462-4").valueQuantity.value <= 120
```

## Error Handling

The language server provides clear error messages for context issues:

1. **Unknown Resource Type**
   ```
   Context error: Unknown FHIR resource type: InvalidResource
   ```

2. **Invalid Input File**
   ```
   Context error: Input file should be a JSON or XML file: data.txt
   ```

3. **Resource Type Mismatch**
   ```
   Resource type 'Observation' does not match context type 'Patient'
   ```

4. **Invalid Property Path**
   ```
   Property 'invalidProperty' not found in Patient at path 'Patient.invalidProperty'
   ```

## Best Practices

1. **Always specify resource type** for better validation and completion
2. **Use descriptive input filenames** that match the resource type
3. **Place context declarations at the top** of your .fhirpath files
4. **Use consistent naming** for input files across your project

## Technical Details

- Context declarations are parsed from comments starting with `@`
- Multiple context declarations are supported in a single file
- Resource type inference from filename uses common patterns
- Context information is cached for performance
- Validation respects the FHIR R4 specification by default

This feature makes FHIRPath development more productive by providing accurate validation and intelligent suggestions based on the actual FHIR resources you're working with.