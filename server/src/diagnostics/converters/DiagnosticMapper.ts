import { ParseError } from '../../parser/FHIRPathService';
import { DiagnosticBuilder, DiagnosticCode } from '../DiagnosticBuilder';
import { CodeActionService } from '../../services/CodeActionService';
import { FHIRPathFunctionRegistry } from '../../services/FHIRPathFunctionRegistry';
import { IDiagnosticMapper } from './ErrorConverter';

/**
 * Maps parse errors to diagnostic codes and provides intelligent suggestions
 */
export class DiagnosticMapper implements IDiagnosticMapper {
  private readonly functionRegistry: FHIRPathFunctionRegistry;

  constructor(functionRegistry: FHIRPathFunctionRegistry) {
    this.functionRegistry = functionRegistry;
  }

  /**
   * Map parse error to appropriate diagnostic code
   */
  mapErrorToDiagnosticCode(error: ParseError): DiagnosticCode {
    const message = error.message.toLowerCase();

    if (message.includes('unknown function') || message.includes('undefined function')) {
      return DiagnosticCode.UnknownFunction;
    } else if (message.includes('unterminated string') || message.includes('string')) {
      return DiagnosticCode.UnterminatedString;
    } else if (message.includes('unexpected token') || message.includes('syntax')) {
      return DiagnosticCode.SyntaxError;
    } else if (message.includes('type') || message.includes('cannot convert')) {
      return DiagnosticCode.TypeError;
    } else if (message.includes('property') || message.includes('field')) {
      return DiagnosticCode.UnknownProperty;
    } else if (message.includes('operator')) {
      return DiagnosticCode.InvalidOperator;
    } else if (message.includes('literal') || message.includes('number') || message.includes('boolean')) {
      return DiagnosticCode.InvalidLiteral;
    } else if (message.includes('argument')) {
      return DiagnosticCode.MissingArgument;
    }

    return DiagnosticCode.SyntaxError; // Default fallback
  }

  /**
   * Add intelligent suggestions based on error type and context
   */
  addSuggestionsForError(
    builder: DiagnosticBuilder,
    error: ParseError,
    expression: string,
    startColumn: number,
    endColumn: number
  ): DiagnosticBuilder {
    const message = error.message.toLowerCase();
    const errorText = expression.substring(startColumn, endColumn);

    // Suggest corrections for common typos in function names
    if (message.includes('unknown function')) {
      const suggestions = this.getFunctionSuggestions(errorText);
      for (const suggestion of suggestions) {
        builder = builder.suggest(`Did you mean '${suggestion}'?`, suggestion);
      }
    }

    // Suggest fixes for unterminated strings
    else if (message.includes('unterminated string')) {
      builder = builder.suggest("Add closing quote", errorText + "'");
    }

    // Suggest fixes for common syntax errors
    else if (message.includes('unexpected token')) {
      if (errorText === '(') {
        builder = builder.suggest("Missing closing parenthesis", undefined);
      } else if (errorText === '[') {
        builder = builder.suggest("Missing closing bracket", undefined);
      } else if (errorText === '{') {
        builder = builder.suggest("Missing closing brace", undefined);
      }
    }

    // Suggest property name corrections
    else if (message.includes('unknown property')) {
      const suggestions = this.getPropertySuggestions(errorText);
      for (const suggestion of suggestions) {
        builder = builder.suggest(`Did you mean '${suggestion}'?`, suggestion);
      }
    }

    return builder;
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
   * Get suggestions for common syntax errors
   */
  getSyntaxSuggestions(errorText: string, errorType: string): string[] {
    const suggestions: string[] = [];

    switch (errorType.toLowerCase()) {
      case 'missing_parenthesis':
        suggestions.push('Add closing parenthesis )');
        break;
      case 'missing_bracket':
        suggestions.push('Add closing bracket ]');
        break;
      case 'missing_brace':
        suggestions.push('Add closing brace }');
        break;
      case 'unterminated_string':
        suggestions.push(`Add closing quote: ${errorText}'`);
        suggestions.push(`Add closing quote: ${errorText}"`);
        break;
      case 'invalid_operator':
        suggestions.push('Check operator syntax');
        suggestions.push('Use valid FHIRPath operators');
        break;
    }

    return suggestions;
  }

  /**
   * Check if error text matches common patterns
   */
  private matchesPattern(errorText: string, pattern: RegExp): boolean {
    return pattern.test(errorText);
  }

  /**
   * Get context-aware suggestions based on surrounding text
   */
  getContextualSuggestions(
    errorText: string,
    expression: string,
    position: number
  ): string[] {
    const suggestions: string[] = [];

    // Analyze context before and after the error
    const before = expression.substring(0, position);
    const after = expression.substring(position + errorText.length);

    // Check for common patterns and suggest fixes
    if (before.endsWith('.') && !errorText.includes('(')) {
      // Property access context
      suggestions.push(...this.getPropertySuggestions(errorText));
    } else if (errorText.includes('(') || after.startsWith('(')) {
      // Function call context
      suggestions.push(...this.getFunctionSuggestions(errorText.replace(/\(.*/, '')));
    }

    return suggestions;
  }
}
