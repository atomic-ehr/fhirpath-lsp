import { Diagnostic, DiagnosticSeverity, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { BaseValidator } from './IValidator';

/**
 * Validator for FHIRPath directive usage (@resource, @inputfile, @input)
 */
export class DirectiveValidator extends BaseValidator {
  private static readonly VALID_RESOURCE_TYPES = [
    'Patient', 'Observation', 'Condition', 'Procedure', 'MedicationRequest',
    'DiagnosticReport', 'Encounter', 'Organization', 'Practitioner', 'Location',
    'Device', 'Medication', 'Substance', 'AllergyIntolerance', 'Immunization',
    'Bundle', 'Composition', 'DocumentReference', 'Binary', 'HealthcareService',
    'Appointment', 'AppointmentResponse', 'Schedule', 'Slot', 'Coverage',
    'Claim', 'ClaimResponse', 'ExplanationOfBenefit', 'Goal', 'CarePlan',
    'CareTeam', 'ServiceRequest', 'ActivityDefinition', 'PlanDefinition',
    'Questionnaire', 'QuestionnaireResponse', 'ValueSet', 'CodeSystem',
    'ConceptMap', 'StructureDefinition', 'CapabilityStatement', 'OperationDefinition'
  ];

  constructor() {
    super('DirectiveValidator');
  }

  async validate(document: TextDocument): Promise<Diagnostic[]> {
    return this.validateDirectives(document);
  }

  /**
   * Validate directive usage in the document
   */
  private validateDirectives(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    const directiveOccurrences: {
      inputfile: Array<{ line: number; position: Position; value?: string; valuePosition?: Position }>;
      input: Array<{ line: number; position: Position; value?: string; valuePosition?: Position }>;
      resource: Array<{ line: number; position: Position; value?: string; valuePosition?: Position }>;
    } = {
      inputfile: [],
      input: [],
      resource: []
    };

    // Find all directive occurrences and validate their values
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
      const line = lines[lineNumber];
      const trimmed = line.trim();

      if (trimmed.startsWith('//')) {
        const directiveMatch = trimmed.match(/\/\/\s*@(inputfile|input|resource)(\s+(.+))?$/);
        if (directiveMatch) {
          const directiveType = directiveMatch[1] as 'inputfile' | 'input' | 'resource';
          const value = directiveMatch[3]?.trim();
          const atIndex = line.indexOf('@');
          const position: Position = {
            line: lineNumber,
            character: atIndex
          };

          let valuePosition: Position | undefined;
          if (value) {
            const valueStartIndex = line.indexOf(value, atIndex);
            valuePosition = {
              line: lineNumber,
              character: valueStartIndex
            };
          }

          directiveOccurrences[directiveType].push({
            line: lineNumber,
            position,
            value,
            valuePosition
          });

          // Validate directive values
          if (directiveType === 'resource' && value) {
            this.validateResourceDirectiveValue(value, valuePosition!, diagnostics);
          } else if (directiveType === 'inputfile' && value) {
            this.validateInputFileDirectiveValue(value, valuePosition!, diagnostics);
          } else if (directiveType === 'input' && value) {
            this.validateInputDirectiveValue(value, valuePosition!, diagnostics);
          } else if (!value) {
            // Missing value
            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: {
                start: { line: lineNumber, character: line.length },
                end: { line: lineNumber, character: line.length }
              },
              message: `@${directiveType} directive requires a value`,
              source: 'fhirpath-directives',
              code: `missing-${directiveType}-value`
            });
          }
        }
      }
    }

    // Check for duplicate resource directives
    if (directiveOccurrences.resource.length > 1) {
      for (let i = 0; i < directiveOccurrences.resource.length - 1; i++) {
        const occurrence = directiveOccurrences.resource[i];
        const lastIndex = directiveOccurrences.resource.length - 1;
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: occurrence.position,
            end: {
              line: occurrence.position.line,
              character: occurrence.position.character + '@resource'.length
            }
          },
          message: `Duplicate @resource directive. The last one (line ${directiveOccurrences.resource[lastIndex].line + 1}) will be used.`,
          source: 'fhirpath-directives',
          code: 'duplicate-resource-directive'
        });
      }
    }

    // Check for conflicting inputfile and input directives
    if (directiveOccurrences.inputfile.length > 0 && directiveOccurrences.input.length > 0) {
      // Find which type appears last
      const lastInputfile = directiveOccurrences.inputfile[directiveOccurrences.inputfile.length - 1];
      const lastInput = directiveOccurrences.input[directiveOccurrences.input.length - 1];

      if (lastInputfile.line > lastInput.line) {
        // inputfile appears last, mark input directives as warnings
        for (const occurrence of directiveOccurrences.input) {
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
              start: occurrence.position,
              end: {
                line: occurrence.position.line,
                character: occurrence.position.character + '@input'.length
              }
            },
            message: `@input and @inputfile are mutually exclusive. The last directive (@inputfile on line ${lastInputfile.line + 1}) will be used.`,
            source: 'fhirpath-directives',
            code: 'conflicting-input-directives'
          });
        }
      } else {
        // input appears last, mark inputfile directives as warnings
        for (const occurrence of directiveOccurrences.inputfile) {
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
              start: occurrence.position,
              end: {
                line: occurrence.position.line,
                character: occurrence.position.character + '@inputfile'.length
              }
            },
            message: `@input and @inputfile are mutually exclusive. The last directive (@input on line ${lastInput.line + 1}) will be used.`,
            source: 'fhirpath-directives',
            code: 'conflicting-input-directives'
          });
        }
      }
    }

    // Check for duplicate inputfile directives
    if (directiveOccurrences.inputfile.length > 1) {
      for (let i = 0; i < directiveOccurrences.inputfile.length - 1; i++) {
        const occurrence = directiveOccurrences.inputfile[i];
        const lastIndex = directiveOccurrences.inputfile.length - 1;
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: occurrence.position,
            end: {
              line: occurrence.position.line,
              character: occurrence.position.character + '@inputfile'.length
            }
          },
          message: `Multiple @inputfile directives found. The last one (line ${directiveOccurrences.inputfile[lastIndex].line + 1}) will be used.`,
          source: 'fhirpath-directives',
          code: 'duplicate-inputfile-directive'
        });
      }
    }

    // Check for duplicate input directives
    if (directiveOccurrences.input.length > 1) {
      for (let i = 0; i < directiveOccurrences.input.length - 1; i++) {
        const occurrence = directiveOccurrences.input[i];
        const lastIndex = directiveOccurrences.input.length - 1;
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: occurrence.position,
            end: {
              line: occurrence.position.line,
              character: occurrence.position.character + '@input'.length
            }
          },
          message: `Multiple @input directives found. The last one (line ${directiveOccurrences.input[lastIndex].line + 1}) will be used.`,
          source: 'fhirpath-directives',
          code: 'duplicate-input-directive'
        });
      }
    }

    return diagnostics;
  }

  /**
   * Validate @resource directive value
   */
  private validateResourceDirectiveValue(value: string, valuePosition: Position, diagnostics: Diagnostic[]): void {
    if (!DirectiveValidator.VALID_RESOURCE_TYPES.includes(value)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: valuePosition,
          end: {
            line: valuePosition.line,
            character: valuePosition.character + value.length
          }
        },
        message: `Unknown FHIR resource type: '${value}'. Expected one of: ${DirectiveValidator.VALID_RESOURCE_TYPES.slice(0, 5).join(', ')}, ...`,
        source: 'fhirpath-directives',
        code: 'invalid-resource-type'
      });
    }
  }

  /**
   * Validate @inputfile directive value
   */
  private validateInputFileDirectiveValue(value: string, valuePosition: Position, diagnostics: Diagnostic[]): void {
    // Basic file validation
    if (!value.match(/\.(json|xml)$/i)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: valuePosition,
          end: {
            line: valuePosition.line,
            character: valuePosition.character + value.length
          }
        },
        message: `Input file should have .json or .xml extension: '${value}'`,
        source: 'fhirpath-directives',
        code: 'invalid-file-extension'
      });
    }

    // Check for potentially problematic characters
    if (value.includes(' ') && !value.startsWith('"') && !value.endsWith('"')) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: valuePosition,
          end: {
            line: valuePosition.line,
            character: valuePosition.character + value.length
          }
        },
        message: `File path contains spaces and should be quoted: '${value}'`,
        source: 'fhirpath-directives',
        code: 'unquoted-file-path'
      });
    }
  }

  /**
   * Validate @input directive value
   */
  private validateInputDirectiveValue(value: string, valuePosition: Position, diagnostics: Diagnostic[]): void {
    try {
      const parsedData = JSON.parse(value);

      // Check if it's a valid FHIR resource
      if (typeof parsedData === 'object' && parsedData !== null) {
        if (!parsedData.resourceType) {
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
              start: valuePosition,
              end: {
                line: valuePosition.line,
                character: valuePosition.character + value.length
              }
            },
            message: 'Input data should include a resourceType property for FHIR resources',
            source: 'fhirpath-directives',
            code: 'missing-resource-type'
          });
        } else {
          // Validate the resource type if present
          this.validateResourceDirectiveValue(parsedData.resourceType, {
            line: valuePosition.line,
            character: valuePosition.character + value.indexOf(`"${parsedData.resourceType}"`) + 1
          }, diagnostics);
        }
      }
    } catch (error) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: valuePosition,
          end: {
            line: valuePosition.line,
            character: valuePosition.character + value.length
          }
        },
        message: `Invalid JSON syntax: ${(error as Error).message}`,
        source: 'fhirpath-directives',
        code: 'invalid-json'
      });
    }
  }
}
