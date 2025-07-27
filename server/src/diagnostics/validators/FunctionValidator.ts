import { Diagnostic, Range, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { BaseExpressionValidator } from './IValidator';
import { FHIRPathFunctionRegistry } from '../../services/FHIRPathFunctionRegistry';
import { CodeActionService } from '../../services/CodeActionService';
import { DiagnosticBuilder, DiagnosticCode } from '../DiagnosticBuilder';

/**
 * Validator for FHIRPath function calls and property access
 */
export class FunctionValidator extends BaseExpressionValidator {
  private readonly functionRegistry: FHIRPathFunctionRegistry;

  constructor(functionRegistry: FHIRPathFunctionRegistry) {
    super('FunctionValidator');
    this.functionRegistry = functionRegistry;
  }

  async validateExpression(
    document: TextDocument,
    expression: string,
    lineOffset: number = 0,
    columnOffset: number = 0
  ): Promise<Diagnostic[]> {
    return this.validateFunctions(document, expression, lineOffset, columnOffset);
  }

  /**
   * Validate function calls in the expression
   */
  private validateFunctions(
    document: TextDocument,
    expression: string,
    lineOffset: number = 0,
    columnOffset: number = 0
  ): Diagnostic[] {
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

      // Pattern to match potential function calls: word followed by optional parentheses
      const functionPattern = /\b([a-zA-Z][a-zA-Z0-9_]*)\s*(?=\()/g;
      let match;

      while ((match = functionPattern.exec(expression)) !== null) {
        const functionName = match[1];
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
        }
      }

      // Also check for potential typos in property access (simpler pattern)
      const propertyPattern = /\.([a-zA-Z][a-zA-Z0-9_]*)/g;
      match = null;

      while ((match = propertyPattern.exec(expression)) !== null) {
        const propertyName = match[1];

        // Skip if this is a known function name (already checked above)
        if (allKnownNames.has(propertyName)) {
          continue;
        }

        // Check for common FHIR property typos
        const commonProperties = ['name', 'given', 'family', 'use', 'value', 'code', 'system', 'display',
                                 'active', 'gender', 'birthDate', 'address', 'telecom', 'identifier'];

        const propertySuggestions = this.getPropertySuggestions(propertyName);

        // Only create diagnostics for likely typos (edit distance <= 2)
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

    } catch (error) {
      console.error('Error in function validation:', error);
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
}
