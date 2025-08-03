import { Diagnostic, Range, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { BaseExpressionValidator } from './IValidator';
import { FHIRPathFunctionRegistry } from '../../services/FHIRPathFunctionRegistry';
import { CodeActionService } from '../../services/CodeActionService';
import { DiagnosticBuilder, DiagnosticCode } from '../DiagnosticBuilder';
import { FHIRPathService } from '../../parser/FHIRPathService';

/**
 * Validator for FHIRPath function calls and property access
 */
export class FunctionValidator extends BaseExpressionValidator {
  private readonly functionRegistry: FHIRPathFunctionRegistry;
  private readonly fhirPathService?: FHIRPathService;

  constructor(functionRegistry: FHIRPathFunctionRegistry, fhirPathService?: FHIRPathService) {
    super('FunctionValidator');
    this.functionRegistry = functionRegistry;
    this.fhirPathService = fhirPathService;
  }

  async validateExpression(
    document: TextDocument,
    expression: string,
    lineOffset: number = 0,
    columnOffset: number = 0
  ): Promise<Diagnostic[]> {
    return await this.validateFunctions(document, expression, lineOffset, columnOffset);
  }

  /**
   * Validate function calls in the expression
   */
  private async validateFunctions(
    document: TextDocument,
    expression: string,
    lineOffset: number = 0,
    columnOffset: number = 0
  ): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    try {
      // Get all known functions from the registry
      const knownFunctions = this.functionRegistry.getFunctions();
      const knownFunctionNames = new Set(knownFunctions.map(f => f.name));

      // Get all operators and keywords from registry
      const knownOperators = new Set(this.functionRegistry.getOperators().map(op => op.name).filter(name => name));
      const knownKeywords = new Set(this.functionRegistry.getKeywords().map(kw => kw.keyword));

      // Combine all known function/operator/keyword names from registry
      const allKnownNames = new Set([...knownFunctionNames, ...knownOperators, ...knownKeywords]);

      // Pattern to match function calls with parentheses and capture arguments
      const functionPattern = /\b([a-zA-Z][a-zA-Z0-9_]*)\s*\(([^)]*)\)/g;
      let match;

      while ((match = functionPattern.exec(expression)) !== null) {
        const functionName = match[1];
        const argsString = match[2];
        const startPos = match.index;
        const endPos = match.index + functionName.length;

        // Check if this is an unknown function
        if (!allKnownNames.has(functionName)) {
          // Calculate the exact position within the expression
          // Need to account for newlines in multi-line expressions
          const beforeMatch = expression.substring(0, startPos);
          const newlineCount = (beforeMatch.match(/\n/g) || []).length;
          const lastNewlineIndex = beforeMatch.lastIndexOf('\n');

          // Calculate line and column positions
          const diagnosticLine = lineOffset + newlineCount;
          const columnInExpression = lastNewlineIndex === -1 ? startPos : startPos - lastNewlineIndex - 1;
          const startColumn = (newlineCount === 0 ? columnOffset : 0) + columnInExpression;
          const endColumn = startColumn + functionName.length;

          const range = Range.create(
            Position.create(diagnosticLine, startColumn),
            Position.create(diagnosticLine, endColumn)
          );

          // Get suggestions for this unknown function
          const suggestions = this.getFunctionSuggestions(functionName);

          // Create diagnostic with enhanced builder
          const diagnostic = DiagnosticBuilder.error(DiagnosticCode.UnknownFunction)
            .withMessage(`Unknown function '${functionName}'`)
            .withRange(range)
            .withSourceText(expression);

          // Add suggestions if we found any
          if (suggestions.length > 0) {
            const topSuggestion = suggestions[0];
            diagnostic.withMessage(`Unknown function '${functionName}'. Did you mean '${topSuggestion}'?`);

            // Add all suggestions as quick fix options
            suggestions.forEach((suggestion, index) => {
              if (index === 0) {
                diagnostic.suggest(`Change to '${suggestion}'`, suggestion);
              } else {
                diagnostic.suggest(`Or change to '${suggestion}'`, suggestion);
              }
            });
          } else {
            diagnostic.withMessage(`Unknown function '${functionName}'. Check FHIRPath documentation for available functions.`);
          }

          diagnostics.push(diagnostic.buildLSP());
        } else {
          // Function exists, now validate its arguments
          const functionDef = knownFunctions.find(f => f.name === functionName);
          if (functionDef) {
            const argValidationDiagnostics = this.validateFunctionArguments(
              functionName,
              functionDef,
              argsString,
              expression,
              match.index,
              lineOffset,
              columnOffset
            );
            diagnostics.push(...argValidationDiagnostics);
          }
        }
      }

      // Check for potential property access issues with model provider integration
      const propertyDiagnostics = await this.validatePropertyAccess(expression, lineOffset, columnOffset);
      diagnostics.push(...propertyDiagnostics);

    } catch (error) {
      console.error('Error in function validation:', error);
    }

    return diagnostics;
  }

  /**
   * Validate function arguments against registry definition
   */
  private validateFunctionArguments(
    functionName: string,
    functionDef: any,
    argsString: string,
    expression: string,
    functionStartPos: number,
    lineOffset: number,
    columnOffset: number
  ): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    try {
      // Parse arguments - simple split by comma for now (could be enhanced for nested expressions)
      const args = argsString.trim() ? argsString.split(',').map(arg => arg.trim()) : [];
      const expectedParams = functionDef.parameters || [];

      // Check argument count
      const requiredParams = expectedParams.filter((p: any) => !p.optional);
      const minArgs = requiredParams.length;
      const maxArgs = expectedParams.length;

      if (args.length < minArgs) {
        const argsStartPos = functionStartPos + functionName.length + 1; // +1 for opening parenthesis
        const range = Range.create(
          Position.create(lineOffset, columnOffset + argsStartPos),
          Position.create(lineOffset, columnOffset + argsStartPos + argsString.length)
        );

        const diagnostic = DiagnosticBuilder.error(DiagnosticCode.MissingArgument)
          .withMessage(`Function '${functionName}' requires at least ${minArgs} argument(s), but ${args.length} provided`)
          .withRange(range)
          .withSourceText(expression)
          .buildLSP();

        diagnostics.push(diagnostic);
      } else if (args.length > maxArgs && maxArgs > 0) {
        const argsStartPos = functionStartPos + functionName.length + 1;
        const range = Range.create(
          Position.create(lineOffset, columnOffset + argsStartPos),
          Position.create(lineOffset, columnOffset + argsStartPos + argsString.length)
        );

        const diagnostic = DiagnosticBuilder.warning(DiagnosticCode.TooManyArguments)
          .withMessage(`Function '${functionName}' accepts at most ${maxArgs} argument(s), but ${args.length} provided`)
          .withRange(range)
          .withSourceText(expression)
          .buildLSP();

        diagnostics.push(diagnostic);
      }

      // TODO: Add type validation for individual arguments when type system is more mature
      // This would check each argument against the expected parameter type from the registry

    } catch (error) {
      console.error(`Error validating arguments for function '${functionName}':`, error);
    }

    return diagnostics;
  }

  /**
   * Get function name suggestions for typos
   */
  private getFunctionSuggestions(errorText: string): string[] {
    // Get all available functions, operators, and keywords from the registry
    const allFunctions = this.functionRegistry.getFunctions();
    const allOperators = this.functionRegistry.getOperators();
    const allKeywords = this.functionRegistry.getKeywords();

    // Create a comprehensive list of all available names
    const functionNames = allFunctions.map(f => f.name);
    const operatorNames = allOperators.map(op => op.name).filter(name => name); // Some operators might not have names
    const keywordNames = allKeywords.map(kw => kw.keyword);

    // Combine all available names from the registry
    const allAvailableNames = [...functionNames, ...operatorNames, ...keywordNames];

    // Use CodeActionService to find similar strings with edit distance
    return CodeActionService.findSimilarStrings(
      errorText,
      allAvailableNames,
      2,  // Max edit distance
      3   // Max suggestions
    );
  }

  /**
   * Get property name suggestions for typos
   */
  private getPropertySuggestions(errorText: string): string[] {
    // Get all available functions, operators, and keywords from the registry for property suggestions
    // This includes functions that can be used in property access context
    const allFunctions = this.functionRegistry.getFunctions();
    const allKeywords = this.functionRegistry.getKeywords();

    // Create a comprehensive list of common FHIR properties and registry items
    const commonProperties = [
      'name', 'given', 'family', 'use', 'value', 'code', 'system', 'display',
      'active', 'gender', 'birthDate', 'address', 'telecom', 'identifier',
      'status', 'category', 'subject', 'effective', 'issued', 'performer'
    ];

    const functionNames = allFunctions.map(f => f.name);
    const keywordNames = allKeywords.map(kw => kw.keyword);

    // Combine properties with registry items for comprehensive suggestions
    const allPropertyCandidates = [...commonProperties, ...functionNames, ...keywordNames];

    // Use CodeActionService to find similar strings
    return CodeActionService.findSimilarStrings(
      errorText,
      allPropertyCandidates,
      2,  // Max edit distance
      3   // Max suggestions
    );
  }

  /**
   * Validate property access using model provider when available
   */
  private async validatePropertyAccess(
    expression: string,
    lineOffset: number = 0,
    columnOffset: number = 0
  ): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    try {
      // Get all known function names to skip them
      const knownFunctions = this.functionRegistry.getFunctions();
      const knownFunctionNames = new Set(knownFunctions.map(f => f.name));
      const knownOperators = new Set(this.functionRegistry.getOperators().map(op => op.name).filter(name => name));
      const knownKeywords = new Set(this.functionRegistry.getKeywords().map(kw => kw.keyword));
      const allKnownNames = new Set([...knownFunctionNames, ...knownOperators, ...knownKeywords]);

      // Pattern to match property access: dot followed by property name
      const propertyPattern = /\.([a-zA-Z][a-zA-Z0-9_]*)/g;
      let match;

      while ((match = propertyPattern.exec(expression)) !== null) {
        const propertyName = match[1];

        // Skip if this is a known function name (already checked above)
        if (allKnownNames.has(propertyName)) {
          continue;
        }

        // Check if property is valid using model provider
        const isValidProperty = await this.isValidProperty(expression, propertyName, match.index);

        if (!isValidProperty) {
          // Only create diagnostics for properties that fail model provider validation
          const propertySuggestions = this.getPropertySuggestions(propertyName);

          // Only create diagnostics for likely typos (edit distance <= 2) or if we have suggestions
          if (propertySuggestions.length > 0) {
            const startPos = match.index + 1; // +1 to skip the dot
            const endPos = startPos + propertyName.length;

            const lineNumber = lineOffset;
            const startColumn = columnOffset + startPos;
            const endColumn = columnOffset + endPos;

            const range = Range.create(
              Position.create(lineNumber, startColumn),
              Position.create(lineNumber, endColumn)
            );

            const diagnostic = DiagnosticBuilder.warning(DiagnosticCode.UnknownProperty)
              .withMessage(`Unknown property '${propertyName}'`)
              .withRange(range)
              .withSourceText(expression)
              .suggest(`Did you mean '${propertySuggestions[0]}'?`, propertySuggestions[0])
              .buildLSP();

            diagnostics.push(diagnostic);
          }
        }
      }
    } catch (error) {
      console.error('Error validating property access:', error);
    }

    return diagnostics;
  }

  /**
   * Check if a property is valid using the model provider
   */
  private async isValidProperty(expression: string, propertyName: string, dotIndex: number): Promise<boolean> {
    try {
      // If no FHIRPathService, fall back to basic validation
      if (!this.fhirPathService) {
        return this.isValidPropertyFallback(propertyName);
      }

      // Check if model provider is available and initialized
      const modelProvider = this.fhirPathService.getModelProvider();
      if (!modelProvider) {
        return this.isValidPropertyFallback(propertyName);
      }

      // Extract the context before the property to understand what we're navigating from
      const contextExpression = expression.substring(0, dotIndex);
      
      // Try to analyze the expression context to determine the current type
      const analysisResult = this.fhirPathService.analyze(contextExpression);
      if (analysisResult && analysisResult.ast) {
        // Try to get type information from the analysis result
        const typeInfo = (analysisResult.ast as any).typeInfo;
        if (typeInfo) {
          // Check if the property exists on the current type
          const availableProperties = this.fhirPathService.getResourceProperties(typeInfo.type || typeInfo.name);
          if (availableProperties.includes(propertyName)) {
            return true;
          }
        }
      }

      // Try to extract resource type from beginning of expression for validation
      const resourceTypeMatch = contextExpression.match(/^([A-Z]\w+)/);
      if (resourceTypeMatch) {
        const resourceType = resourceTypeMatch[1];
        if (this.fhirPathService.isValidResourceType(resourceType)) {
          const properties = this.fhirPathService.getResourceProperties(resourceType);
          if (properties.includes(propertyName)) {
            return true;
          }
        }
      }

      // Fall back to basic validation if model analysis fails
      return this.isValidPropertyFallback(propertyName);
    } catch (error) {
      console.warn(`Error checking property validity for '${propertyName}':`, error);
      // On error, fall back to basic validation to avoid false positives
      return this.isValidPropertyFallback(propertyName);
    }
  }

  /**
   * Fallback validation when model provider is not available
   */
  private isValidPropertyFallback(propertyName: string): boolean {
    // Common FHIR properties that should not trigger warnings
    const commonProperties = [
      'name', 'given', 'family', 'use', 'value', 'code', 'system', 'display',
      'active', 'gender', 'birthDate', 'address', 'telecom', 'identifier',
      'status', 'category', 'subject', 'effective', 'issued', 'performer',
      'text', 'extension', 'id', 'meta', 'implicitRules', 'language',
      'contained', 'resourceType', 'reference', 'type', 'period', 'assigner'
    ];

    return commonProperties.includes(propertyName);
  }
}
