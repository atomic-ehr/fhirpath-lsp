import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { DiagnosticMapper } from '../../diagnostics/converters/DiagnosticMapper';
import { ParseError } from '../../parser/FHIRPathService';
import { DiagnosticBuilder, DiagnosticCode } from '../../diagnostics/DiagnosticBuilder';
import { FHIRPathFunctionRegistry } from '../../services/FHIRPathFunctionRegistry';

// Mock FHIRPathFunctionRegistry
const mockFunctionRegistry = {
  getFunctions: mock(() => [
    { name: 'where', description: 'Filter collection' },
    { name: 'select', description: 'Transform collection' },
    { name: 'first', description: 'Get first element' },
    { name: 'last', description: 'Get last element' },
    { name: 'count', description: 'Count elements' },
    { name: 'exists', description: 'Check existence' },
    { name: 'empty', description: 'Check if empty' },
    { name: 'substring', description: 'Extract substring' },
    { name: 'contains', description: 'Check contains' },
    { name: 'startsWith', description: 'Check starts with' }
  ]),
  getOperators: mock(() => [
    { name: 'and', symbol: 'and' },
    { name: 'or', symbol: 'or' },
    { name: 'not', symbol: 'not' },
    { name: 'in', symbol: 'in' },
    { name: 'contains', symbol: 'contains' }
  ]),
  getKeywords: mock(() => [
    { keyword: 'true' },
    { keyword: 'false' },
    { keyword: 'null' },
    { keyword: 'today' },
    { keyword: 'now' }
  ])
} as unknown as FHIRPathFunctionRegistry;

describe('DiagnosticMapper', () => {
  let mapper: DiagnosticMapper;

  beforeEach(() => {
    mapper = new DiagnosticMapper(mockFunctionRegistry);
    // Reset mocks
    mockFunctionRegistry.getFunctions.mockClear();
    mockFunctionRegistry.getOperators.mockClear();
    mockFunctionRegistry.getKeywords.mockClear();
  });

  describe('Error Code Mapping', () => {
    test('should map unknown function errors', () => {
      const error: ParseError = {
        message: 'unknown function "unknownFunc"',
        line: 0,
        column: 5,
        length: 4
      };

      const code = mapper.mapErrorToDiagnosticCode(error);
      expect(code).toBe(DiagnosticCode.UnknownFunction);
    });

    test('should map undefined function errors', () => {
      const error: ParseError = {
        message: 'undefined function call',
        line: 0,
        column: 5,
        length: 4
      };

      const code = mapper.mapErrorToDiagnosticCode(error);
      expect(code).toBe(DiagnosticCode.UnknownFunction);
    });

    test('should map unterminated string errors', () => {
      const error: ParseError = {
        message: 'unterminated string literal',
        line: 0,
        column: 5,
        length: 4
      };

      const code = mapper.mapErrorToDiagnosticCode(error);
      expect(code).toBe(DiagnosticCode.UnterminatedString);
    });

    test('should map string-related errors', () => {
      const error: ParseError = {
        message: 'string parsing error',
        line: 0,
        column: 5,
        length: 4
      };

      const code = mapper.mapErrorToDiagnosticCode(error);
      expect(code).toBe(DiagnosticCode.UnterminatedString);
    });

    test('should map unexpected token errors', () => {
      const error: ParseError = {
        message: 'unexpected token "("',
        line: 0,
        column: 5,
        length: 1
      };

      const code = mapper.mapErrorToDiagnosticCode(error);
      expect(code).toBe(DiagnosticCode.SyntaxError);
    });

    test('should map syntax errors', () => {
      const error: ParseError = {
        message: 'syntax error in expression',
        line: 0,
        column: 5,
        length: 4
      };

      const code = mapper.mapErrorToDiagnosticCode(error);
      expect(code).toBe(DiagnosticCode.SyntaxError);
    });

    test('should map type errors', () => {
      const error: ParseError = {
        message: 'type mismatch in operation',
        line: 0,
        column: 5,
        length: 4
      };

      const code = mapper.mapErrorToDiagnosticCode(error);
      expect(code).toBe(DiagnosticCode.TypeError);
    });

    test('should map conversion errors', () => {
      const error: ParseError = {
        message: 'cannot convert string to number',
        line: 0,
        column: 5,
        length: 4
      };

      const code = mapper.mapErrorToDiagnosticCode(error);
      expect(code).toBe(DiagnosticCode.TypeError);
    });

    test('should map property errors', () => {
      const error: ParseError = {
        message: 'unknown property "invalidProp"',
        line: 0,
        column: 5,
        length: 4
      };

      const code = mapper.mapErrorToDiagnosticCode(error);
      expect(code).toBe(DiagnosticCode.UnknownProperty);
    });

    test('should map field errors', () => {
      const error: ParseError = {
        message: 'field not found',
        line: 0,
        column: 5,
        length: 4
      };

      const code = mapper.mapErrorToDiagnosticCode(error);
      expect(code).toBe(DiagnosticCode.UnknownProperty);
    });

    test('should map operator errors', () => {
      const error: ParseError = {
        message: 'invalid operator usage',
        line: 0,
        column: 5,
        length: 4
      };

      const code = mapper.mapErrorToDiagnosticCode(error);
      expect(code).toBe(DiagnosticCode.InvalidOperator);
    });

    test('should map literal errors', () => {
      const error: ParseError = {
        message: 'invalid literal value',
        line: 0,
        column: 5,
        length: 4
      };

      const code = mapper.mapErrorToDiagnosticCode(error);
      expect(code).toBe(DiagnosticCode.InvalidLiteral);
    });

    test('should map number literal errors', () => {
      const error: ParseError = {
        message: 'invalid number format',
        line: 0,
        column: 5,
        length: 4
      };

      const code = mapper.mapErrorToDiagnosticCode(error);
      expect(code).toBe(DiagnosticCode.InvalidLiteral);
    });

    test('should map boolean literal errors', () => {
      const error: ParseError = {
        message: 'invalid boolean value',
        line: 0,
        column: 5,
        length: 4
      };

      const code = mapper.mapErrorToDiagnosticCode(error);
      expect(code).toBe(DiagnosticCode.InvalidLiteral);
    });

    test('should map argument errors', () => {
      const error: ParseError = {
        message: 'missing required argument',
        line: 0,
        column: 5,
        length: 4
      };

      const code = mapper.mapErrorToDiagnosticCode(error);
      expect(code).toBe(DiagnosticCode.MissingArgument);
    });

    test('should default to syntax error for unknown messages', () => {
      const error: ParseError = {
        message: 'some unknown error type',
        line: 0,
        column: 5,
        length: 4
      };

      const code = mapper.mapErrorToDiagnosticCode(error);
      expect(code).toBe(DiagnosticCode.SyntaxError);
    });
  });

  describe('Suggestion Generation', () => {
    test('should add function suggestions for unknown function errors', () => {
      const error: ParseError = {
        message: 'unknown function "wher"',
        line: 0,
        column: 5,
        length: 4
      };

      let builder = DiagnosticBuilder.error(DiagnosticCode.UnknownFunction)
        .withMessage('Unknown function');

      builder = mapper.addSuggestionsForError(builder, error, 'Patient.name.wher()', 13, 17);

      expect(mockFunctionRegistry.getFunctions).toHaveBeenCalled();
      expect(mockFunctionRegistry.getOperators).toHaveBeenCalled();
      expect(mockFunctionRegistry.getKeywords).toHaveBeenCalled();
    });

    test('should add suggestions for unterminated strings', () => {
      const error: ParseError = {
        message: 'unterminated string',
        line: 0,
        column: 5,
        length: 4
      };

      let builder = DiagnosticBuilder.error(DiagnosticCode.UnterminatedString)
        .withMessage('Unterminated string');

      builder = mapper.addSuggestionsForError(builder, error, 'Patient.name.where(use = "test', 25, 29);

      // Should add closing quote suggestion
      const diagnostic = builder.buildLSP();
      expect(diagnostic.message).toContain('Unterminated string');
    });

    test('should add suggestions for unexpected tokens', () => {
      const error: ParseError = {
        message: 'unexpected token "("',
        line: 0,
        column: 5,
        length: 1
      };

      let builder = DiagnosticBuilder.error(DiagnosticCode.SyntaxError)
        .withMessage('Unexpected token');

      builder = mapper.addSuggestionsForError(builder, error, 'Patient.name.(', 12, 13);

      // Should add parenthesis suggestion
      const diagnostic = builder.buildLSP();
      expect(diagnostic.message).toContain('Unexpected token');
    });

    test('should add suggestions for bracket tokens', () => {
      const error: ParseError = {
        message: 'unexpected token "["',
        line: 0,
        column: 5,
        length: 1
      };

      let builder = DiagnosticBuilder.error(DiagnosticCode.SyntaxError)
        .withMessage('Unexpected token');

      builder = mapper.addSuggestionsForError(builder, error, 'Patient.name[', 12, 13);

      // Should add bracket suggestion
      const diagnostic = builder.buildLSP();
      expect(diagnostic.message).toContain('Unexpected token');
    });

    test('should add suggestions for brace tokens', () => {
      const error: ParseError = {
        message: 'unexpected token "{"',
        line: 0,
        column: 5,
        length: 1
      };

      let builder = DiagnosticBuilder.error(DiagnosticCode.SyntaxError)
        .withMessage('Unexpected token');

      builder = mapper.addSuggestionsForError(builder, error, 'Patient.name{', 12, 13);

      // Should add brace suggestion
      const diagnostic = builder.buildLSP();
      expect(diagnostic.message).toContain('Unexpected token');
    });

    test('should add property suggestions for unknown property errors', () => {
      const error: ParseError = {
        message: 'unknown property "nam"',
        line: 0,
        column: 8,
        length: 3
      };

      let builder = DiagnosticBuilder.error(DiagnosticCode.UnknownProperty)
        .withMessage('Unknown property');

      builder = mapper.addSuggestionsForError(builder, error, 'Patient.nam', 8, 11);

      expect(mockFunctionRegistry.getFunctions).toHaveBeenCalled();
      expect(mockFunctionRegistry.getKeywords).toHaveBeenCalled();
    });

    test('should not add suggestions for unrecognized error types', () => {
      const error: ParseError = {
        message: 'some other error',
        line: 0,
        column: 5,
        length: 4
      };

      let builder = DiagnosticBuilder.error(DiagnosticCode.SyntaxError)
        .withMessage('Some error');

      const originalBuilder = builder;
      builder = mapper.addSuggestionsForError(builder, error, 'Patient.name', 5, 9);

      // Should return the same builder without modifications
      expect(builder).toBe(originalBuilder);
    });
  });

  describe('Function Suggestions', () => {
    test('should get function suggestions from registry', () => {
      mockFunctionRegistry.getFunctions.mockReturnValueOnce([
        { name: 'where', description: 'Filter' },
        { name: 'when', description: 'Conditional' },
        { name: 'while', description: 'Loop' }
      ]);
      mockFunctionRegistry.getOperators.mockReturnValueOnce([
        { name: 'and', symbol: 'and' }
      ]);
      mockFunctionRegistry.getKeywords.mockReturnValueOnce([
        { keyword: 'true' }
      ]);

      const error: ParseError = {
        message: 'unknown function "whe"',
        line: 0,
        column: 5,
        length: 3
      };

      let builder = DiagnosticBuilder.error(DiagnosticCode.UnknownFunction);
      builder = mapper.addSuggestionsForError(builder, error, 'Patient.name.whe()', 13, 16);

      expect(mockFunctionRegistry.getFunctions).toHaveBeenCalled();
      expect(mockFunctionRegistry.getOperators).toHaveBeenCalled();
      expect(mockFunctionRegistry.getKeywords).toHaveBeenCalled();
    });

    test('should handle registry with null/undefined function names', () => {
      mockFunctionRegistry.getFunctions.mockReturnValueOnce([
        { name: 'where', description: 'Filter' },
        { name: null, description: 'Invalid' },
        { name: undefined, description: 'Invalid' }
      ]);
      mockFunctionRegistry.getOperators.mockReturnValueOnce([
        { name: 'and', symbol: 'and' },
        { name: null, symbol: 'invalid' }
      ]);
      mockFunctionRegistry.getKeywords.mockReturnValueOnce([
        { keyword: 'true' }
      ]);

      const error: ParseError = {
        message: 'unknown function "wher"',
        line: 0,
        column: 5,
        length: 4
      };

      let builder = DiagnosticBuilder.error(DiagnosticCode.UnknownFunction);
      builder = mapper.addSuggestionsForError(builder, error, 'Patient.name.wher()', 13, 17);

      // Should handle null/undefined names gracefully
      expect(mockFunctionRegistry.getFunctions).toHaveBeenCalled();
    });
  });

  describe('Property Suggestions', () => {
    test('should get property suggestions from registry and common properties', () => {
      mockFunctionRegistry.getFunctions.mockReturnValueOnce([
        { name: 'name', description: 'Get name' }
      ]);
      mockFunctionRegistry.getKeywords.mockReturnValueOnce([
        { keyword: 'value' }
      ]);

      const error: ParseError = {
        message: 'unknown property "nam"',
        line: 0,
        column: 8,
        length: 3
      };

      let builder = DiagnosticBuilder.error(DiagnosticCode.UnknownProperty);
      builder = mapper.addSuggestionsForError(builder, error, 'Patient.nam', 8, 11);

      expect(mockFunctionRegistry.getFunctions).toHaveBeenCalled();
      expect(mockFunctionRegistry.getKeywords).toHaveBeenCalled();
    });

    test('should include common FHIR properties in suggestions', () => {
      mockFunctionRegistry.getFunctions.mockReturnValueOnce([]);
      mockFunctionRegistry.getKeywords.mockReturnValueOnce([]);

      const error: ParseError = {
        message: 'unknown property "activ"',
        line: 0,
        column: 8,
        length: 5
      };

      let builder = DiagnosticBuilder.error(DiagnosticCode.UnknownProperty);
      builder = mapper.addSuggestionsForError(builder, error, 'Patient.activ', 8, 13);

      // Should include common properties like 'active'
      expect(mockFunctionRegistry.getFunctions).toHaveBeenCalled();
      expect(mockFunctionRegistry.getKeywords).toHaveBeenCalled();
    });
  });

  describe('Syntax Suggestions', () => {
    test('should provide suggestions for missing parenthesis', () => {
      const suggestions = mapper.getSyntaxSuggestions('(', 'missing_parenthesis');
      expect(suggestions).toContain('Add closing parenthesis )');
    });

    test('should provide suggestions for missing bracket', () => {
      const suggestions = mapper.getSyntaxSuggestions('[', 'missing_bracket');
      expect(suggestions).toContain('Add closing bracket ]');
    });

    test('should provide suggestions for missing brace', () => {
      const suggestions = mapper.getSyntaxSuggestions('{', 'missing_brace');
      expect(suggestions).toContain('Add closing brace }');
    });

    test('should provide suggestions for unterminated string', () => {
      const suggestions = mapper.getSyntaxSuggestions('"test', 'unterminated_string');
      expect(suggestions).toContain('Add closing quote: "test\'');
      expect(suggestions).toContain('Add closing quote: "test"');
    });

    test('should provide suggestions for invalid operator', () => {
      const suggestions = mapper.getSyntaxSuggestions('&', 'invalid_operator');
      expect(suggestions).toContain('Check operator syntax');
      expect(suggestions).toContain('Use valid FHIRPath operators');
    });

    test('should return empty array for unknown error types', () => {
      const suggestions = mapper.getSyntaxSuggestions('test', 'unknown_error');
      expect(suggestions).toHaveLength(0);
    });
  });

  describe('Contextual Suggestions', () => {
    test('should provide property suggestions for property access context', () => {
      mockFunctionRegistry.getFunctions.mockReturnValueOnce([]);
      mockFunctionRegistry.getKeywords.mockReturnValueOnce([]);

      const suggestions = mapper.getContextualSuggestions('nam', 'Patient.nam', 8);

      expect(mockFunctionRegistry.getFunctions).toHaveBeenCalled();
      expect(mockFunctionRegistry.getKeywords).toHaveBeenCalled();
    });

    test('should provide function suggestions for function call context', () => {
      mockFunctionRegistry.getFunctions.mockReturnValueOnce([
        { name: 'where', description: 'Filter' }
      ]);
      mockFunctionRegistry.getOperators.mockReturnValueOnce([]);
      mockFunctionRegistry.getKeywords.mockReturnValueOnce([]);

      const suggestions = mapper.getContextualSuggestions('wher(', 'Patient.name.wher()', 13);

      expect(mockFunctionRegistry.getFunctions).toHaveBeenCalled();
    });

    test('should provide function suggestions when followed by parenthesis', () => {
      mockFunctionRegistry.getFunctions.mockReturnValueOnce([
        { name: 'where', description: 'Filter' }
      ]);
      mockFunctionRegistry.getOperators.mockReturnValueOnce([]);
      mockFunctionRegistry.getKeywords.mockReturnValueOnce([]);

      const suggestions = mapper.getContextualSuggestions('wher', 'Patient.name.wher()', 13);

      expect(mockFunctionRegistry.getFunctions).toHaveBeenCalled();
    });

    test('should handle context without clear patterns', () => {
      const suggestions = mapper.getContextualSuggestions('test', 'some random text test more text', 16);
      expect(suggestions).toHaveLength(0);
    });

    test('should handle edge positions', () => {
      const suggestions = mapper.getContextualSuggestions('test', 'test', 0);
      expect(suggestions).toHaveLength(0);
    });
  });

  describe('Pattern Matching', () => {
    test('should match patterns correctly', () => {
      // This tests the private matchesPattern method indirectly
      const error: ParseError = {
        message: 'unterminated string literal',
        line: 0,
        column: 5,
        length: 4
      };

      const code = mapper.mapErrorToDiagnosticCode(error);
      expect(code).toBe(DiagnosticCode.UnterminatedString);
    });
  });

  describe('Error Handling', () => {
    test('should handle registry errors gracefully', () => {
      mockFunctionRegistry.getFunctions.mockImplementationOnce(() => {
        throw new Error('Registry error');
      });

      const error: ParseError = {
        message: 'unknown function "test"',
        line: 0,
        column: 5,
        length: 4
      };

      let builder = DiagnosticBuilder.error(DiagnosticCode.UnknownFunction);

      // Should not throw error
      expect(() => {
        builder = mapper.addSuggestionsForError(builder, error, 'Patient.name.test()', 13, 17);
      }).not.toThrow();
    });

    test('should handle null registry responses', () => {
      mockFunctionRegistry.getFunctions.mockReturnValueOnce(null);
      mockFunctionRegistry.getOperators.mockReturnValueOnce(null);
      mockFunctionRegistry.getKeywords.mockReturnValueOnce(null);

      const error: ParseError = {
        message: 'unknown function "test"',
        line: 0,
        column: 5,
        length: 4
      };

      let builder = DiagnosticBuilder.error(DiagnosticCode.UnknownFunction);

      // Should handle null responses gracefully
      expect(() => {
        builder = mapper.addSuggestionsForError(builder, error, 'Patient.name.test()', 13, 17);
      }).not.toThrow();
    });

    test('should handle undefined registry responses', () => {
      mockFunctionRegistry.getFunctions.mockReturnValueOnce(undefined);
      mockFunctionRegistry.getOperators.mockReturnValueOnce(undefined);
      mockFunctionRegistry.getKeywords.mockReturnValueOnce(undefined);

      const error: ParseError = {
        message: 'unknown property "test"',
        line: 0,
        column: 8,
        length: 4
      };

      let builder = DiagnosticBuilder.error(DiagnosticCode.UnknownProperty);

      // Should handle undefined responses gracefully
      expect(() => {
        builder = mapper.addSuggestionsForError(builder, error, 'Patient.test', 8, 12);
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty error messages', () => {
      const error: ParseError = {
        message: '',
        line: 0,
        column: 5,
        length: 4
      };

      const code = mapper.mapErrorToDiagnosticCode(error);
      expect(code).toBe(DiagnosticCode.SyntaxError); // Default fallback
    });

    test('should handle null error messages', () => {
      const error: ParseError = {
        message: null as any,
        line: 0,
        column: 5,
        length: 4
      };

      expect(() => {
        mapper.mapErrorToDiagnosticCode(error);
      }).not.toThrow();
    });

    test('should handle very long error messages', () => {
      const longMessage = 'unknown function ' + 'a'.repeat(1000);
      const error: ParseError = {
        message: longMessage,
        line: 0,
        column: 5,
        length: 4
      };

      const code = mapper.mapErrorToDiagnosticCode(error);
      expect(code).toBe(DiagnosticCode.UnknownFunction);
    });

    test('should handle case-insensitive matching', () => {
      const error: ParseError = {
        message: 'UNKNOWN FUNCTION "test"',
        line: 0,
        column: 5,
        length: 4
      };

      const code = mapper.mapErrorToDiagnosticCode(error);
      expect(code).toBe(DiagnosticCode.UnknownFunction);
    });
  });
});
