import {
  Diagnostic,
  DiagnosticSeverity,
  Position,
  Range
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { FHIRPathService } from '../parser/FHIRPathService';
import { FHIRResourceService } from '../services/FHIRResourceService';
import { FHIRPathContextService } from '../services/FHIRPathContextService';
import { FHIRPathFunctionRegistry } from '../services/FHIRPathFunctionRegistry';

export interface FHIRValidationResult {
  isValid: boolean;
  diagnostics: Diagnostic[];
}

export interface PathAnalysis {
  resourceType?: string;
  propertyPath: string;
  fullPath: string;
  position: Range;
  isValid: boolean;
  errors: string[];
  suggestions: string[];
}

export class FHIRValidationProvider {
  private contextService: FHIRPathContextService;

  constructor(
    private fhirPathService: FHIRPathService,
    private fhirResourceService: FHIRResourceService,
    private functionRegistry: FHIRPathFunctionRegistry
  ) {
    this.contextService = new FHIRPathContextService(fhirResourceService);
  }

  async validateDocument(document: TextDocument): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    try {
      // Parse context from the document
      const context = await this.contextService.parseContext(document);

      // Add context validation errors (but only critical ones that prevent analysis)
      if (!context.isValid) {
        // Filter to only show errors that prevent basic parsing and analysis
        // Also exclude "Unknown FHIR resource type" errors as they are already handled by directive validation
        const criticalErrors = context.errors.filter(error =>
          !error.includes('Input file not found') &&
          !error.includes('Failed to load context data') &&
          !error.includes('No input data provided') &&
          !error.includes('Unknown FHIR resource type')
        );

        criticalErrors.forEach(error => {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 1 }
            },
            message: `Context error: ${error}`,
            source: 'fhirpath-lsp',
            code: 'context-error'
          });
        });
      }

      // Try to load context data if available, but don't require it
      let contextData = null;
      if (context.isValid && (context.inputFile || context.inputData)) {
        try {
          contextData = await this.contextService.loadContextData(context, document.uri);
          if (contextData) {
            const source = context.inputFile ? `file ${context.inputFile}` : 'inline data';
            console.log(`Loaded context data from ${source} for resource type ${contextData.resourceType}`);
          }
        } catch (error) {
          console.warn('Context data not available, continuing with static analysis:', error);
          // Don't add error diagnostics for missing context data - allow static analysis
        }
      }

      // Extract FHIRPath expressions (excluding context declarations)
      const expressions = this.contextService.extractFHIRPathExpressions(document);

      // Validate each expression
      for (const expressionInfo of expressions) {
        let expressionDiagnostics: Diagnostic[] = [];

        if (context.resourceType) {
          // Validate with resource type context (data may or may not be available)
          expressionDiagnostics = await this.validateExpressionWithContext(
            expressionInfo.expression,
            context,
            document,
            expressionInfo.line,
            expressionInfo.column,
            contextData
          );
        } else {
          // Validate without any context - pure static analysis
          expressionDiagnostics = await this.validateExpressionWithoutContext(
            expressionInfo.expression,
            document,
            expressionInfo.line,
            expressionInfo.column
          );
        }

        diagnostics.push(...expressionDiagnostics);
      }

    } catch (error) {
      console.warn('Failed to validate document:', error);
    }

    return diagnostics;
  }

  private async validateExpressionWithoutContext(
    expression: string,
    document: TextDocument,
    line: number,
    column: number
  ): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    try {
      // Use context service for basic validation
      const validation = this.contextService.validateExpressionWithoutContext(expression);

      // Add errors as diagnostics
      validation.errors.forEach(error => {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line, character: column },
            end: { line, character: column + expression.length }
          },
          message: error,
          source: 'fhirpath-lsp',
          code: 'syntax-error'
        });
      });

      // Add warnings as diagnostics
      validation.warnings.forEach(warning => {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: { line, character: column },
            end: { line, character: column + expression.length }
          },
          message: warning,
          source: 'fhirpath-lsp',
          code: 'syntax-warning'
        });
      });

      // Also add basic FHIR pattern validation
      const fhirPatternValidation = this.validateFHIRPattern(expression);
      fhirPatternValidation.warnings.forEach(warning => {
        diagnostics.push({
          severity: DiagnosticSeverity.Information,
          range: {
            start: { line, character: column },
            end: { line, character: column + expression.length }
          },
          message: warning,
          source: 'fhirpath-lsp',
          code: 'fhir-pattern-info'
        });
      });

      // Try to parse with the FHIRPath service for additional validation
      try {
        const parseResult = this.fhirPathService.parse(expression);
        if (!parseResult.success && parseResult.errors) {
          parseResult.errors.forEach(error => {
            // Calculate the actual position within the document line
            // error.column is relative to the individual expression, so we add the expression's start column
            const errorColumn = Math.max(0, column + (error.column || 0));
            const errorLength = Math.max(1, error.length || 1);

            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: {
                start: { line, character: errorColumn },
                end: { line, character: errorColumn + errorLength }
              },
              message: `Parse error: ${error.message}`,
              source: 'fhirpath-lsp',
              code: error.code || 'fhirpath-parse-error'
            });
          });
        }
      } catch (parseError) {
        // If parsing completely fails, add a general error
        const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';

        // Try to extract position information from the error message
        let errorColumn = column;
        let errorLength = expression.length;

        // Look for position information in the error message
        const posMatch = errorMessage.match(/at position (\d+)/);
        if (posMatch) {
          const pos = parseInt(posMatch[1]);
          errorColumn = column + pos;
          errorLength = 1;
        }

        // Look for other position patterns
        const lineColMatch = errorMessage.match(/line (\d+), column (\d+)/);
        if (lineColMatch) {
          // If the error mentions line/column within the expression, adjust for document position
          const errorLine = parseInt(lineColMatch[1]) - 1; // Convert to 0-based
          const errorCol = parseInt(lineColMatch[2]) - 1; // Convert to 0-based

          // For single-line expressions, error line should be 0, so we use the document line
          if (errorLine === 0) {
            errorColumn = column + errorCol;
          }
        }

        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line, character: errorColumn },
            end: { line, character: errorColumn + errorLength }
          },
          message: `Parse error: ${errorMessage}`,
          source: 'fhirpath-lsp',
          code: 'fhirpath-parse-error'
        });
      }

    } catch (error) {
      console.warn('Error validating expression without context:', error);
    }

    return diagnostics;
  }

  private async validateExpressionWithContext(
    expression: string,
    context: any,
    document: TextDocument,
    line: number,
    column: number,
    contextData?: any
  ): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    try {
      // First, check for resource type mismatches before evaluation
      const resourceTypeError = this.validateResourceTypeUsage(expression, context);
      if (resourceTypeError) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line, character: column },
            end: { line, character: column + expression.length }
          },
          message: resourceTypeError,
          source: 'fhirpath-lsp',
          code: 'wrong-resource-type'
        });
        return diagnostics;
      }

      // Check for invalid properties on the current resource type
      const propertyError = this.validateResourceProperties(expression, context);
      if (propertyError) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line, character: column },
            end: { line, character: column + expression.length }
          },
          message: propertyError,
          source: 'fhirpath-lsp',
          code: 'invalid-property'
        });
        return diagnostics;
      }

      // Parse the FHIRPath expression
      const parseResult = this.fhirPathService.parse(expression);

      if (parseResult.success && parseResult.ast) {
        // If we have context data, try to evaluate the expression
        if (contextData) {
          try {
            // Use @atomic-ehr/fhirpath to evaluate the expression against the context data
            const { evaluate } = require('@atomic-ehr/fhirpath');
            const result = evaluate(expression, contextData);

            // The fact that evaluation succeeded means the expression is valid for this context
            console.log(`Expression "${expression.substring(0, 50)}..." evaluated successfully, result:`, result);

            // Evaluation successful - no diagnostic needed since inlay hints show the result

          } catch (evalError: any) {
            // Expression failed to evaluate against the context data
            console.warn(`Expression evaluation failed: ${evalError.message}`);

            // Check if this is a property access error (common case)
            if (evalError.message.includes('undefined') || evalError.message.includes('property')) {
              diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                  start: { line, character: column },
                  end: { line, character: column + expression.length }
                },
                message: `Expression may not be valid for the loaded context: ${evalError.message}`,
                source: 'fhirpath-lsp',
                code: 'context-evaluation-error'
              });
            } else {
              diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                  start: { line, character: column },
                  end: { line, character: column + expression.length }
                },
                message: `Expression evaluation error: ${evalError.message}`,
                source: 'fhirpath-lsp',
                code: 'evaluation-error'
              });
            }
          }
        } else {
          // No context data available - perform static analysis only
          console.log(`Performing static analysis for expression "${expression}" with resource type ${context.resourceType}`);

          // Perform static validation without evaluation
          const pathAnalyses = this.analyzeFHIRPathsWithContext(parseResult.ast, context, document, line, column);

          // Convert analyses to diagnostics
          pathAnalyses.forEach(analysis => {
            if (!analysis.isValid) {
              diagnostics.push(...this.createDiagnosticsFromAnalysis(analysis));
            }
          });

          // Also check for basic FHIR pattern validation without requiring data
          const fhirPatternValidation = this.validateFHIRPattern(expression);
          if (!fhirPatternValidation.isValid) {
            fhirPatternValidation.errors.forEach(error => {
              diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                  start: { line, character: column },
                  end: { line, character: column + expression.length }
                },
                message: error,
                source: 'fhirpath-lsp',
                code: 'fhir-pattern-warning'
              });
            });
          }
        }
      } else {
        // If parsing failed, fall back to basic validation
        const basicValidation = await this.validateExpressionWithoutContext(expression, document, line, column);
        diagnostics.push(...basicValidation);
      }
    } catch (error) {
      // If parsing fails completely, fall back to basic validation
      console.warn('Failed to parse expression for FHIR validation, falling back to basic validation:', error);
      const basicValidation = await this.validateExpressionWithoutContext(expression, document, line, column);
      diagnostics.push(...basicValidation);
    }

    return diagnostics;
  }

  /**
   * Validate that the expression doesn't reference incorrect resource types
   */
  private validateResourceTypeUsage(expression: string, context: any): string | null {
    if (!context.resourceType) {
      return null; // No context resource type to validate against
    }

    // List of known FHIR resource types
    const knownResourceTypes = [
      'Patient', 'Observation', 'Condition', 'Procedure', 'MedicationRequest',
      'Encounter', 'DiagnosticReport', 'Practitioner', 'Organization', 'Location',
      'Bundle', 'Device', 'Medication', 'AllergyIntolerance', 'CarePlan',
      'CareTeam', 'Claim', 'Coverage', 'Goal', 'ImagingStudy', 'Immunization',
      'List', 'Media', 'ProcedureRequest', 'Provenance', 'Questionnaire',
      'QuestionnaireResponse', 'ReferralRequest', 'RelatedPerson', 'Schedule',
      'Specimen', 'StructureDefinition', 'Subscription', 'Substance', 'ValueSet'
    ];

    // Check if expression starts with a resource type that doesn't match the context
    for (const resourceType of knownResourceTypes) {
      if (resourceType !== context.resourceType) {
        // Check for direct resource type reference at the start of expression
        const resourceTypePattern = new RegExp(`^\\s*${resourceType}\\s*\\.`);
        if (resourceTypePattern.test(expression)) {
          return `Invalid resource type '${resourceType}' in expression. Expected '${context.resourceType}' based on context.`;
        }

        // Check for resource type reference anywhere in the expression (less strict)
        const anywherePattern = new RegExp(`\\b${resourceType}\\s*\\.`);
        if (anywherePattern.test(expression)) {
          return `Invalid resource type '${resourceType}' found in expression. Current context is '${context.resourceType}'.`;
        }
      }
    }

    // Note: References to the same resource type (e.g., Patient.name in Patient context) are allowed
    // They don't generate errors and are handled by the property validation

    return null; // No resource type mismatch found
  }

  /**
   * Validate that properties in the expression exist on the current resource type
   */
  private validateResourceProperties(expression: string, context: any): string | null {
    if (!context.resourceType) {
      return null; // No context to validate against
    }

    // Check if this is a function call - functions should not be validated as properties
    if (this.isFunctionCall(expression)) {
      return null;
    }

    // Define valid properties for common FHIR resources
    const resourceProperties: { [key: string]: string[] } = {
      'Patient': [
        'id', 'meta', 'implicitRules', 'language', 'text', 'contained', 'extension', 'modifierExtension',
        'identifier', 'active', 'name', 'telecom', 'gender', 'birthDate', 'deceasedBoolean', 'deceasedDateTime',
        'address', 'maritalStatus', 'multipleBirthBoolean', 'multipleBirthInteger', 'photo', 'contact',
        'communication', 'generalPractitioner', 'managingOrganization', 'link'
      ],
      'Observation': [
        'id', 'meta', 'implicitRules', 'language', 'text', 'contained', 'extension', 'modifierExtension',
        'identifier', 'basedOn', 'partOf', 'status', 'category', 'code', 'subject', 'focus', 'encounter',
        'effectiveDateTime', 'effectivePeriod', 'effectiveTiming', 'effectiveInstant', 'issued', 'performer',
        'valueQuantity', 'valueCodeableConcept', 'valueString', 'valueBoolean', 'valueInteger', 'valueRange',
        'valueRatio', 'valueSampledData', 'valueTime', 'valueDateTime', 'valuePeriod', 'dataAbsentReason',
        'interpretation', 'note', 'bodySite', 'method', 'specimen', 'device', 'referenceRange', 'hasMember',
        'derivedFrom', 'component', 'value'
      ],
      'Condition': [
        'id', 'meta', 'implicitRules', 'language', 'text', 'contained', 'extension', 'modifierExtension',
        'identifier', 'clinicalStatus', 'verificationStatus', 'category', 'severity', 'code', 'bodySite',
        'subject', 'encounter', 'onsetDateTime', 'onsetAge', 'onsetPeriod', 'onsetRange', 'onsetString',
        'abatementDateTime', 'abatementAge', 'abatementPeriod', 'abatementRange', 'abatementString',
        'recordedDate', 'recorder', 'asserter', 'stage', 'evidence', 'note'
      ]
    };

    const validProperties = resourceProperties[context.resourceType];
    if (!validProperties) {
      return null; // Unknown resource type, can't validate
    }

    // Handle expressions that start with the same resource type (e.g., Patient.name in Patient context)
    const sameResourcePattern = new RegExp(`^\\s*${context.resourceType}\\s*\\.\\s*([a-zA-Z][a-zA-Z0-9]*)`);
    const sameResourceMatch = expression.match(sameResourcePattern);
    if (sameResourceMatch) {
      // Extract the property after the resource type prefix
      const rootProperty = sameResourceMatch[1];

      // Skip validation if the property name is the same as the resource type (e.g., Patient.Patient)
      // This handles cases where someone might reference the resource type itself
      if (rootProperty === context.resourceType) {
        return null; // Allow resource type self-reference
      }

      // Skip validation for function calls
      if (this.isFunctionName(rootProperty)) {
        return null;
      }

      // Validate the property
      if (!validProperties.includes(rootProperty)) {
        const belongsToResources = [];
        for (const [resourceType, properties] of Object.entries(resourceProperties)) {
          if (resourceType !== context.resourceType && properties.includes(rootProperty)) {
            belongsToResources.push(resourceType);
          }
        }

        if (belongsToResources.length > 0) {
          return `Property '${rootProperty}' does not exist on ${context.resourceType}. This property belongs to: ${belongsToResources.join(', ')}.`;
        } else {
          return `Property '${rootProperty}' does not exist on ${context.resourceType}.`;
        }
      }

      return null; // Valid property with resource type prefix
    }

    // Extract root-level property references from the expression (without resource type prefix)
    const propertyMatches = expression.match(/^\s*([a-zA-Z][a-zA-Z0-9]*)/);
    if (!propertyMatches) {
      return null; // No property reference at the start
    }

    const rootProperty = propertyMatches[1];

    // Skip validation if the property name is the same as the resource type (e.g., just "Patient")
    // This handles cases where someone references the resource type itself
    if (rootProperty === context.resourceType) {
      return null; // Allow resource type reference
    }

    // Skip validation for function calls
    if (this.isFunctionName(rootProperty)) {
      return null;
    }

    // Check if the root property exists on the current resource type
    if (!validProperties.includes(rootProperty)) {
      // Check if this property belongs to a different resource type
      const belongsToResources = [];
      for (const [resourceType, properties] of Object.entries(resourceProperties)) {
        if (resourceType !== context.resourceType && properties.includes(rootProperty)) {
          belongsToResources.push(resourceType);
        }
      }

      if (belongsToResources.length > 0) {
        return `Property '${rootProperty}' does not exist on ${context.resourceType}. This property belongs to: ${belongsToResources.join(', ')}.`;
      } else {
        return `Property '${rootProperty}' does not exist on ${context.resourceType}.`;
      }
    }

    return null; // Property is valid
  }

  private analyzeFHIRPathsWithContext(
    ast: any,
    context: any,
    document: TextDocument,
    baseLine: number,
    baseColumn: number
  ): PathAnalysis[] {
    const analyses: PathAnalysis[] = [];

    const traverse = (node: any, currentPath: string = '') => {
      if (!node || !node.type) {
        return;
      }

      // Handle different AST node types with context awareness
      switch (node.type) {
        case 'Identifier':
          if (this.isFHIRResourceType(node.value)) {
            // Check if this resource type matches the context
            if (context.resourceType && node.value !== context.resourceType) {
              const analysis = this.createContextMismatchAnalysis(
                node,
                document,
                node.value,
                context.resourceType
              );
              if (analysis) {
                analyses.push(analysis);
              }
            } else {
              // Valid resource type with context
              const analysis = this.analyzeResourcePath(node, document, node.value, '');
              if (analysis) {
                analyses.push(analysis);
              }
            }
          }
          break;

        case 'MemberExpression':
          const memberAnalysis = this.analyzeMemberExpressionWithContext(node, context, document);
          if (memberAnalysis) {
            analyses.push(memberAnalysis);
          }
          break;

        case 'BinaryExpression':
          // Check both sides of binary expressions
          if (node.left) traverse(node.left, currentPath);
          if (node.right) traverse(node.right, currentPath);
          return;

        case 'FunctionCall':
          // Analyze function arguments
          if (node.arguments && Array.isArray(node.arguments)) {
            node.arguments.forEach((arg: any) => traverse(arg, currentPath));
          }
          return;
      }

      // Recursively traverse child nodes
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach((child: any) => traverse(child, currentPath));
      }

      // Handle common node properties
      if (node.expression) traverse(node.expression, currentPath);
      if (node.object) traverse(node.object, currentPath);
      if (node.property) traverse(node.property, currentPath);
    };

    traverse(ast);
    return analyses;
  }

  private createContextMismatchAnalysis(
    node: any,
    document: TextDocument,
    foundType: string,
    expectedType: string
  ): PathAnalysis | null {
    const position = this.getNodeRange(node, document);
    if (!position) {
      return null;
    }

    return {
      resourceType: foundType,
      propertyPath: '',
      fullPath: foundType,
      position,
      isValid: false,
      errors: [`Resource type '${foundType}' does not match context type '${expectedType}'`],
      suggestions: [`Use '${expectedType}' to match the input context`]
    };
  }

  private analyzeMemberExpressionWithContext(
    node: any,
    context: any,
    document: TextDocument
  ): PathAnalysis | null {
    try {
      // Extract the full path from the member expression
      const pathInfo = this.extractPathFromMemberExpression(node);
      if (!pathInfo) {
        return null;
      }

      const { resourceType, propertyPath, fullPath } = pathInfo;

      // Use context resource type if available
      const contextResourceType = context.resourceType || resourceType;

      // Get position information
      const position = this.getNodeRange(node, document);
      if (!position) {
        return null;
      }

      // Validate the path with context
      const validation = this.fhirResourceService.validatePropertyPath(
        contextResourceType,
        propertyPath
      );

      return {
        resourceType: contextResourceType,
        propertyPath,
        fullPath,
        position,
        isValid: validation.isValid,
        errors: validation.errors,
        suggestions: validation.suggestions
      };
    } catch (error) {
      console.warn('Error analyzing member expression with context:', error);
      return null;
    }
  }

  private analyzeFHIRPaths(ast: any, document: TextDocument): PathAnalysis[] {
    const analyses: PathAnalysis[] = [];

    const traverse = (node: any, currentPath: string = '') => {
      if (!node || !node.type) {
        return;
      }

      // Handle different AST node types
      switch (node.type) {
        case 'Identifier':
          if (this.isFHIRResourceType(node.value)) {
            // This is a FHIR resource root
            const analysis = this.analyzeResourcePath(node, document, node.value, '');
            if (analysis) {
              analyses.push(analysis);
            }
          }
          break;

        case 'MemberExpression':
          const memberAnalysis = this.analyzeMemberExpression(node, document);
          if (memberAnalysis) {
            analyses.push(memberAnalysis);
          }
          break;

        case 'BinaryExpression':
          // Check both sides of binary expressions
          if (node.left) traverse(node.left, currentPath);
          if (node.right) traverse(node.right, currentPath);
          return;

        case 'FunctionCall':
          // Analyze function arguments
          if (node.arguments && Array.isArray(node.arguments)) {
            node.arguments.forEach((arg: any) => traverse(arg, currentPath));
          }
          return;
      }

      // Recursively traverse child nodes
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach((child: any) => traverse(child, currentPath));
      }

      // Handle common node properties
      if (node.expression) traverse(node.expression, currentPath);
      if (node.object) traverse(node.object, currentPath);
      if (node.property) traverse(node.property, currentPath);
    };

    traverse(ast);
    return analyses;
  }

  private analyzeMemberExpression(node: any, document: TextDocument): PathAnalysis | null {
    try {
      // Extract the full path from the member expression
      const pathInfo = this.extractPathFromMemberExpression(node);
      if (!pathInfo) {
        return null;
      }

      const { resourceType, propertyPath, fullPath } = pathInfo;

      // Get position information
      const position = this.getNodeRange(node, document);
      if (!position) {
        return null;
      }

      // Validate the path
      const validation = this.fhirResourceService.validatePropertyPath(resourceType, propertyPath);

      return {
        resourceType,
        propertyPath,
        fullPath,
        position,
        isValid: validation.isValid,
        errors: validation.errors,
        suggestions: validation.suggestions
      };
    } catch (error) {
      console.warn('Error analyzing member expression:', error);
      return null;
    }
  }

  private analyzeResourcePath(node: any, document: TextDocument, resourceType: string, propertyPath: string): PathAnalysis | null {
    const position = this.getNodeRange(node, document);
    if (!position) {
      return null;
    }

    // Check if resource type exists
    const resourceDefinition = this.fhirResourceService.getResourceDefinition(resourceType);
    if (!resourceDefinition) {
      return {
        resourceType,
        propertyPath,
        fullPath: resourceType,
        position,
        isValid: false,
        errors: [`Unknown FHIR resource type: ${resourceType}`],
        suggestions: this.getSimilarResourceTypes(resourceType)
      };
    }

    return {
      resourceType,
      propertyPath,
      fullPath: resourceType,
      position,
      isValid: true,
      errors: [],
      suggestions: []
    };
  }

  private extractPathFromMemberExpression(node: any): { resourceType: string; propertyPath: string; fullPath: string } | null {
    const pathParts: string[] = [];
    let current = node;

    // Traverse the member expression chain
    while (current) {
      if (current.type === 'MemberExpression') {
        if (current.property && current.property.name) {
          pathParts.unshift(current.property.name);
        }
        current = current.object;
      } else if (current.type === 'Identifier') {
        pathParts.unshift(current.value || current.name);
        break;
      } else {
        break;
      }
    }

    if (pathParts.length === 0) {
      return null;
    }

    const resourceType = pathParts[0];
    const propertyPath = pathParts.slice(1).join('.');
    const fullPath = pathParts.join('.');

    if (!this.isFHIRResourceType(resourceType)) {
      return null;
    }

    return { resourceType, propertyPath, fullPath };
  }

  private getNodeRange(node: any, document: TextDocument): Range | null {
    // Handle different position structures from the AST
    if (node.position) {
      try {
        const startPos = document.positionAt(node.position.offset || 0);
        // Calculate end position based on value length or default
        const length = node.value?.length || node.name?.length || 1;
        const endOffset = (node.position.offset || 0) + length;
        const endPos = document.positionAt(Math.min(endOffset, document.getText().length));

        return {
          start: startPos,
          end: endPos
        };
      } catch (error) {
        console.warn('Error calculating node range from position:', error);
        return null;
      }
    }

    // Fallback: use location if available
    if (node.location?.start && node.location?.end) {
      try {
        const startPos = document.positionAt(node.location.start.offset || 0);
        const endPos = document.positionAt(node.location.end.offset || (node.location.start.offset || 0) + 1);

        return {
          start: startPos,
          end: endPos
        };
      } catch (error) {
        console.warn('Error calculating node range from location:', error);
        return null;
      }
    }

    // Last resort: create a minimal range at document start
    return {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 }
    };
  }

  private createDiagnosticsFromAnalysis(analysis: PathAnalysis): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    analysis.errors.forEach(error => {
      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: analysis.position,
        message: error,
        source: 'fhirpath-lsp'
      };

      // Add suggestions as related information if available
      if (analysis.suggestions.length > 0) {
        diagnostic.message += `\n\nSuggestions:\n${analysis.suggestions.join('\n')}`;
      }

      diagnostics.push(diagnostic);
    });

    return diagnostics;
  }

  private isFHIRResourceType(name: string): boolean {
    const fhirResourceTypes = this.fhirResourceService.getAllResourceTypes();
    return fhirResourceTypes.includes(name);
  }

  private getSimilarResourceTypes(input: string): string[] {
    const allTypes = this.fhirResourceService.getAllResourceTypes();
    const inputLower = input.toLowerCase();

    return allTypes.filter(type => {
      const typeLower = type.toLowerCase();
      return typeLower.includes(inputLower) ||
             inputLower.includes(typeLower) ||
             this.calculateLevenshteinDistance(inputLower, typeLower) <= 2;
    }).slice(0, 5); // Limit to 5 suggestions
  }

  private calculateLevenshteinDistance(a: string, b: string): number {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

    for (let i = 0; i <= a.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= b.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + substitutionCost // substitution
        );
      }
    }

    return matrix[b.length][a.length];
  }

  // Validate specific FHIR patterns
  validateFHIRPattern(expression: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    suggestions: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Check for common FHIR validation patterns

    // 1. Check for invalid choice type usage
    if (expression.includes('.value') && !expression.includes('.value.as(')) {
      const match = expression.match(/(\w+)\.value(?!\s*\.as\()/);
      if (match) {
        errors.push(`Property 'value' is a choice type. Use '.value.as(Type)' to specify the type.`);
        suggestions.push(`Try: ${match[1]}.value.as(Quantity)`, `Try: ${match[1]}.value.as(string)`);
      }
    }

    // 2. Check for incorrect reference navigation
    if (expression.includes('.reference.')) {
      errors.push(`Cannot navigate properties on 'reference'. Use resolve() to access referenced resource.`);
      suggestions.push(`Try using: ${expression.replace('.reference.', '.resolve().')}`);
    }

    // 3. Check for invalid array access patterns
    const invalidArrayPattern = /\[([^=!<>]+)\](?!\.|$)/;
    const arrayMatch = expression.match(invalidArrayPattern);
    if (arrayMatch && !arrayMatch[1].match(/^\d+$/)) {
      errors.push(`Invalid array filter syntax: ${arrayMatch[0]}`);
      suggestions.push(`For filtering, use: [${arrayMatch[1]} = "value"]`);
      suggestions.push(`For indexing, use: [0] or [index]`);
    }

    // 4. Add informational warnings for expressions without context
    if (expression.match(/^[a-zA-Z][\w.]*$/)) {
      warnings.push('This expression will be evaluated against the configured resource context when input data is available.');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  /**
   * Check if expression contains a function call (has parentheses)
   */
  private isFunctionCall(expression: string): boolean {
    // Look for function call pattern: word followed by optional whitespace and opening parenthesis
    return /\b[a-zA-Z][a-zA-Z0-9]*\s*\(/.test(expression);
  }

  /**
   * Check if a word is a known FHIRPath function name
   */
  private isFunctionName(name: string): boolean {
    // Get functions from the function registry
    const functions = this.functionRegistry.getFunctions();
    const functionNames = functions.map(f => f.name);
    
    // Check if it's a known function
    if (functionNames.includes(name)) {
      return true;
    }

    // Common FHIRPath functions that might not be in registry
    const commonFunctions = [
      'where', 'exists', 'first', 'last', 'count', 'empty', 'all', 'any', 'select', 'distinct',
      'today', 'now', 'length', 'substring', 'contains', 'startsWith', 'endsWith', 'matches',
      'replace', 'split', 'join', 'upper', 'lower', 'toInteger', 'toString', 'toDecimal',
      'aggregate', 'combine', 'union', 'intersect', 'exclude', 'iif', 'trace', 'repeat',
      'ofType', 'as', 'is', 'extension', 'hasValue', 'getValue', 'children', 'descendants'
    ];
    
    return commonFunctions.includes(name);
  }
}
