import {
  InlayHint,
  InlayHintParams,
  Position,
  Range,
  InlayHintKind
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { FHIRPathService } from '../parser/FHIRPathService';
import { FHIRPathContextService } from '../services/FHIRPathContextService';

export class InlayHintProvider {
  constructor(
    private fhirPathService: FHIRPathService,
    private fhirPathContextService?: FHIRPathContextService
  ) {}

  async provideInlayHints(
    document: TextDocument,
    params: InlayHintParams
  ): Promise<InlayHint[]> {
    if (!this.fhirPathContextService) {
      return [];
    }

    try {
      const hints: InlayHint[] = [];
      const text = document.getText();
      const lines = text.split('\n');

      // Parse context from the document
      const fhirContext = await this.fhirPathContextService.parseContext(document);
      if (!fhirContext.isValid || (!fhirContext.inputFile && !fhirContext.inputData)) {
        return [];
      }

      // Load context data
      const contextData = await this.fhirPathContextService.loadContextData(fhirContext, document.uri);
      if (!contextData) {
        return [];
      }

      // Process each line in the range
      for (let lineIndex = params.range.start.line; lineIndex <= params.range.end.line; lineIndex++) {
        if (lineIndex >= lines.length) break;

        const line = lines[lineIndex];
        const expressions = this.parseExpressionsFromLine(line, lineIndex);

        for (const expr of expressions) {
          // Skip if line is outside the requested range
          if (lineIndex < params.range.start.line || lineIndex > params.range.end.line) {
            continue;
          }

          try {
            // Validate that the expression's resource type matches the context resource type
            const expressionResourceType = this.extractResourceTypeFromExpression(expr.expression);
            if (expressionResourceType && fhirContext.resourceType && 
                expressionResourceType !== fhirContext.resourceType) {
              continue;
            }

            // Evaluate the expression
            const { evaluate } = require('@atomic-ehr/fhirpath');
            const result = evaluate(expr.expression, contextData);

            // Create inlay hint
            const resultText = this.formatResultForInlay(result);
            const hint: InlayHint = {
              position: { line: lineIndex, character: expr.endColumn },
              label: ` // ${resultText}`,
              kind: InlayHintKind.Type,
              paddingLeft: true
            };

            hints.push(hint);
          } catch (error) {
            // Skip expressions that fail to evaluate
            continue;
          }
        }
      }

      return hints;
    } catch (error) {
      console.error('Error providing inlay hints:', error);
      return [];
    }
  }

  private parseExpressionsFromLine(line: string, lineIndex: number): Array<{expression: string; startColumn: number; endColumn: number}> {
    const expressions: Array<{expression: string; startColumn: number; endColumn: number}> = [];
    
    // Skip comment lines and context declarations
    const trimmed = line.trim();
    if (!trimmed || 
        trimmed.startsWith('//') || 
        trimmed.startsWith('/*') ||
        trimmed.includes('@inputfile') ||
        trimmed.includes('@input') ||
        trimmed.includes('@resource')) {
      return [];
    }

    let currentExpression = '';
    let inString = false;
    let stringChar = '';
    let expressionStartColumn = 0;
    let foundFirstNonWhitespace = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const prevChar = i > 0 ? line[i - 1] : '';
      
      if (!foundFirstNonWhitespace && char !== ' ' && char !== '\t') {
        expressionStartColumn = i;
        foundFirstNonWhitespace = true;
      }
      
      if (!inString && (char === '"' || char === "'")) {
        inString = true;
        stringChar = char;
      } else if (inString && char === stringChar && prevChar !== '\\') {
        inString = false;
        stringChar = '';
      } else if (!inString && char === ';') {
        if (currentExpression.trim()) {
          expressions.push({
            expression: currentExpression.trim(),
            startColumn: expressionStartColumn,
            endColumn: i
          });
        }
        currentExpression = '';
        foundFirstNonWhitespace = false;
        
        // Find next non-whitespace character
        let nextStart = i + 1;
        while (nextStart < line.length && (line[nextStart] === ' ' || line[nextStart] === '\t')) {
          nextStart++;
        }
        expressionStartColumn = nextStart;
        continue;
      }
      
      currentExpression += char;
    }
    
    // Handle the last expression if it exists
    if (currentExpression.trim()) {
      expressions.push({
        expression: currentExpression.trim(),
        startColumn: expressionStartColumn,
        endColumn: line.length
      });
    }
    
    // If no semicolon-separated expressions, treat the whole line as one expression
    if (expressions.length === 0 && line.trim()) {
      let startCol = 0;
      for (let i = 0; i < line.length; i++) {
        if (line[i] !== ' ' && line[i] !== '\t') {
          startCol = i;
          break;
        }
      }
      expressions.push({
        expression: line.trim(),
        startColumn: startCol,
        endColumn: line.length
      });
    }
    
    return expressions;
  }

  private formatResultForInlay(result: any): string {
    if (result === null || result === undefined) {
      return 'null';
    } else if (Array.isArray(result)) {
      if (result.length === 0) {
        return '[0 items]';
      } else if (result.length === 1) {
        return this.formatValue(result[0]);
      } else {
        // Show actual items in the collection
        const formattedItems = result.slice(0, 3).map(item => this.formatValue(item)).join(', ');
        if (result.length > 3) {
          return `[${formattedItems}, +${result.length - 3} more]`;
        } else {
          return `[${formattedItems}]`;
        }
      }
    } else {
      return this.formatValue(result);
    }
  }

  private formatValue(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') {
      // Truncate long strings for inline display
      if (value.length > 20) {
        return `"${value.substring(0, 17)}..."`;
      }
      return `"${value}"`;
    }
    if (typeof value === 'boolean') return value.toString();
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'object') {
      if (value.resourceType) {
        return `${value.resourceType}/${value.id || '?'}`;
      }
      // For other objects, try to show a meaningful representation
      if (value.family && value.given) {
        // HumanName
        const given = Array.isArray(value.given) ? value.given.join(' ') : value.given;
        return `"${given} ${value.family}"`;
      }
      if (value.system && value.value) {
        // ContactPoint
        return `${value.system}:${value.value}`;
      }
      if (value.code && value.display) {
        // CodeableConcept or Coding
        return `${value.code}(${value.display})`;
      }
      if (value.value !== undefined && value.unit) {
        // Quantity
        return `${value.value}${value.unit}`;
      }
      return '{...}';
    }
    return String(value);
  }

  private extractResourceTypeFromExpression(expression: string): string | null {
    const fhirResourceTypes = [
      'Patient', 'Observation', 'Condition', 'Procedure', 'MedicationRequest',
      'DiagnosticReport', 'Encounter', 'Organization', 'Practitioner', 'Location',
      'Device', 'Medication', 'Substance', 'AllergyIntolerance', 'Immunization',
      'Bundle', 'Composition', 'DocumentReference', 'Binary', 'HealthcareService',
      'Endpoint', 'Schedule', 'Slot', 'Appointment', 'AppointmentResponse'
    ];

    // Match expressions that start with a resource type like "Patient.name", "Observation.value", etc.
    const match = expression.trim().match(/^([A-Z][a-zA-Z0-9]*)\./);
    if (match) {
      const resourceType = match[1];
      return fhirResourceTypes.includes(resourceType) ? resourceType : null;
    }
    return null;
  }
}