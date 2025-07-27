import { describe, test, expect, beforeEach } from 'bun:test';
import { TextDocument, DiagnosticSeverity } from 'vscode-languageserver';
import { DirectiveValidator } from '../../diagnostics/validators/DirectiveValidator';

describe('DirectiveValidator', () => {
  let validator: DirectiveValidator;

  beforeEach(() => {
    validator = new DirectiveValidator();
  });

  describe('Resource Directive Validation', () => {
    test('should validate valid resource types', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        '// @resource Patient\nPatient.name'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(0);
    });

    test('should report error for invalid resource type', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        '// @resource InvalidResource\nPatient.name'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Error);
      expect(diagnostics[0].message).toContain('Unknown FHIR resource type');
      expect(diagnostics[0].code).toBe('invalid-resource-type');
    });

    test('should report error for missing resource value', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        '// @resource\nPatient.name'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Error);
      expect(diagnostics[0].message).toBe('@resource directive requires a value');
      expect(diagnostics[0].code).toBe('missing-resource-value');
    });

    test('should warn about duplicate resource directives', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        '// @resource Patient\n// @resource Observation\nPatient.name'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Warning);
      expect(diagnostics[0].message).toContain('Duplicate @resource directive');
      expect(diagnostics[0].code).toBe('duplicate-resource-directive');
    });

    test('should validate all known FHIR resource types', async () => {
      const resourceTypes = [
        'Patient', 'Observation', 'Condition', 'Procedure', 'MedicationRequest',
        'DiagnosticReport', 'Encounter', 'Organization', 'Practitioner', 'Location',
        'Device', 'Medication', 'Substance', 'AllergyIntolerance', 'Immunization',
        'Bundle', 'Composition', 'DocumentReference', 'Binary', 'HealthcareService'
      ];

      for (const resourceType of resourceTypes) {
        const document = TextDocument.create(
          'file:///test.fhirpath',
          'fhirpath',
          1,
          `// @resource ${resourceType}\n${resourceType}.id`
        );

        const diagnostics = await validator.validate(document);
        expect(diagnostics).toHaveLength(0);
      }
    });
  });

  describe('InputFile Directive Validation', () => {
    test('should validate valid JSON file extension', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        '// @inputfile patient.json\nPatient.name'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(0);
    });

    test('should validate valid XML file extension', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        '// @inputfile patient.xml\nPatient.name'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(0);
    });

    test('should warn about invalid file extension', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        '// @inputfile patient.txt\nPatient.name'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Warning);
      expect(diagnostics[0].message).toContain('should have .json or .xml extension');
      expect(diagnostics[0].code).toBe('invalid-file-extension');
    });

    test('should warn about unquoted file path with spaces', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        '// @inputfile patient data.json\nPatient.name'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Warning);
      expect(diagnostics[0].message).toContain('should be quoted');
      expect(diagnostics[0].code).toBe('unquoted-file-path');
    });

    test('should accept quoted file path with spaces', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        '// @inputfile "patient data.json"\nPatient.name'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(0);
    });

    test('should report error for missing inputfile value', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        '// @inputfile\nPatient.name'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Error);
      expect(diagnostics[0].message).toBe('@inputfile directive requires a value');
      expect(diagnostics[0].code).toBe('missing-inputfile-value');
    });

    test('should warn about duplicate inputfile directives', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        '// @inputfile patient1.json\n// @inputfile patient2.json\nPatient.name'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Warning);
      expect(diagnostics[0].message).toContain('Multiple @inputfile directives found');
      expect(diagnostics[0].code).toBe('duplicate-inputfile-directive');
    });
  });

  describe('Input Directive Validation', () => {
    test('should validate valid JSON input with resourceType', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        '// @input {"resourceType": "Patient", "id": "123"}\nPatient.name'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(0);
    });

    test('should warn about missing resourceType in JSON input', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        '// @input {"id": "123", "name": "John"}\nPatient.name'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Warning);
      expect(diagnostics[0].message).toContain('should include a resourceType property');
      expect(diagnostics[0].code).toBe('missing-resource-type');
    });

    test('should validate resourceType in JSON input', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        '// @input {"resourceType": "InvalidResource", "id": "123"}\nPatient.name'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Error);
      expect(diagnostics[0].message).toContain('Unknown FHIR resource type');
      expect(diagnostics[0].code).toBe('invalid-resource-type');
    });

    test('should report error for invalid JSON syntax', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        '// @input {"resourceType": "Patient", "id": 123\nPatient.name'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Error);
      expect(diagnostics[0].message).toContain('Invalid JSON syntax');
      expect(diagnostics[0].code).toBe('invalid-json');
    });

    test('should report error for missing input value', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        '// @input\nPatient.name'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Error);
      expect(diagnostics[0].message).toBe('@input directive requires a value');
      expect(diagnostics[0].code).toBe('missing-input-value');
    });

    test('should warn about duplicate input directives', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        '// @input {"resourceType": "Patient"}\n// @input {"resourceType": "Observation"}\nPatient.name'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Warning);
      expect(diagnostics[0].message).toContain('Multiple @input directives found');
      expect(diagnostics[0].code).toBe('duplicate-input-directive');
    });
  });

  describe('Conflicting Directives', () => {
    test('should warn about conflicting input and inputfile directives (input last)', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        '// @inputfile patient.json\n// @input {"resourceType": "Patient"}\nPatient.name'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Warning);
      expect(diagnostics[0].message).toContain('@input and @inputfile are mutually exclusive');
      expect(diagnostics[0].code).toBe('conflicting-input-directives');
    });

    test('should warn about conflicting input and inputfile directives (inputfile last)', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        '// @input {"resourceType": "Patient"}\n// @inputfile patient.json\nPatient.name'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Warning);
      expect(diagnostics[0].message).toContain('@input and @inputfile are mutually exclusive');
      expect(diagnostics[0].code).toBe('conflicting-input-directives');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty document', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        ''
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(0);
    });

    test('should handle document with no directives', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.where(use = "official")'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(0);
    });

    test('should handle malformed directive syntax', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        '// @ resource Patient\nPatient.name'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(0);
    });

    test('should handle directive with extra whitespace', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        '//   @resource   Patient   \nPatient.name'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(0);
    });

    test('should handle multiple directives of different types', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        '// @resource Patient\n// @inputfile patient.json\nPatient.name'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].code).toBe('conflicting-input-directives');
    });
  });

  describe('Position Accuracy', () => {
    test('should report accurate positions for directive errors', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        '// @resource InvalidResource\nPatient.name'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].range.start.line).toBe(0);
      expect(diagnostics[0].range.start.character).toBeGreaterThan(10); // Should point to the value
      expect(diagnostics[0].range.end.character).toBeGreaterThan(diagnostics[0].range.start.character);
    });

    test('should report accurate positions for missing value errors', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        '// @resource\nPatient.name'
      );

      const diagnostics = await validator.validate(document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].range.start.line).toBe(0);
      expect(diagnostics[0].range.start.character).toBe(12); // End of line
    });
  });
});
