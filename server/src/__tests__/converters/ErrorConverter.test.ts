import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { TextDocument, DiagnosticSeverity } from 'vscode-languageserver';
import { ErrorConverter, IDiagnosticMapper } from '../../diagnostics/converters/ErrorConverter';
import { ParseError } from '../../parser/FHIRPathService';
import { DiagnosticBuilder, DiagnosticCode } from '../../diagnostics/DiagnosticBuilder';

// Mock DiagnosticMapper
const mockDiagnosticMapper: IDiagnosticMapper = {
  mapErrorToDiagnosticCode: mock((error: ParseError) => DiagnosticCode.SyntaxError),
  addSuggestionsForError: mock((builder: DiagnosticBuilder) => builder)
};

describe('ErrorConverter', () => {
  let converter: ErrorConverter;
  let converterWithMapper: ErrorConverter;

  beforeEach(() => {
    converter = new ErrorConverter();
    converterWithMapper = new ErrorConverter(mockDiagnosticMapper);
    // Reset mocks
    mockDiagnosticMapper.mapErrorToDiagnosticCode.mockClear();
    mockDiagnosticMapper.addSuggestionsForError.mockClear();
  });

  describe('Parse Error Conversion', () => {
    test('should convert basic parse errors to diagnostics', async () => {
      const errors: ParseError[] = [{
        message: 'Unexpected token',
        line: 0,
        column: 5,
        length: 3,
        code: 'syntax-error'
      }];

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.where()'
      );

      const diagnostics = converter.convertParseErrorsToDiagnostics(errors, document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Error);
      expect(diagnostics[0].message).toBe('Unexpected token');
      expect(diagnostics[0].range.start.line).toBe(0);
      expect(diagnostics[0].range.start.character).toBe(5);
      expect(diagnostics[0].range.end.character).toBe(8);
      expect(diagnostics[0].code).toBe('syntax-error');
    });

    test('should handle errors with offset positioning', async () => {
      const errors: ParseError[] = [{
        message: 'Parse error',
        line: 0,
        column: 5,
        length: 4,
        offset: 8
      }];

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      // Mock document.positionAt
      const originalPositionAt = document.positionAt;
      document.positionAt = mock((offset: number) => {
        if (offset === 8) return { line: 0, character: 8 };
        if (offset === 12) return { line: 0, character: 12 };
        return originalPositionAt.call(document, offset);
      });

      const diagnostics = converter.convertParseErrorsToDiagnostics(errors, document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].range.start.character).toBe(8);
      expect(diagnostics[0].range.end.character).toBe(12);
    });

    test('should handle offset positioning errors gracefully', async () => {
      const errors: ParseError[] = [{
        message: 'Parse error',
        line: 0,
        column: 5,
        length: 4,
        offset: 100 // Invalid offset
      }];

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      // Mock document.positionAt to throw error
      document.positionAt = mock(() => {
        throw new Error('Invalid offset');
      });

      const diagnostics = converter.convertParseErrorsToDiagnostics(errors, document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].range.start.character).toBe(5); // Falls back to line/column
    });

    test('should ensure positions are within document bounds', async () => {
      const errors: ParseError[] = [{
        message: 'Parse error',
        line: 0,
        column: 100, // Beyond line length
        length: 10
      }];

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name' // Only 12 characters
      );

      const diagnostics = converter.convertParseErrorsToDiagnostics(errors, document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].range.start.character).toBeLessThanOrEqual(12);
      expect(diagnostics[0].range.end.character).toBeLessThanOrEqual(12);
    });

    test('should handle multiple parse errors', async () => {
      const errors: ParseError[] = [
        {
          message: 'Error 1',
          line: 0,
          column: 0,
          length: 3
        },
        {
          message: 'Error 2',
          line: 0,
          column: 5,
          length: 4
        },
        {
          message: 'Error 3',
          line: 1,
          column: 0,
          length: 2
        }
      ];

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name\n.where()'
      );

      const diagnostics = converter.convertParseErrorsToDiagnostics(errors, document);
      expect(diagnostics).toHaveLength(3);
      expect(diagnostics[0].message).toBe('Error 1');
      expect(diagnostics[1].message).toBe('Error 2');
      expect(diagnostics[2].message).toBe('Error 3');
      expect(diagnostics[2].range.start.line).toBe(1);
    });

    test('should respect maximum diagnostics limit', async () => {
      const errors: ParseError[] = Array.from({ length: 100 }, (_, i) => ({
        message: `Error ${i}`,
        line: 0,
        column: i,
        length: 1
      }));

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const diagnostics = converter.convertParseErrorsToDiagnostics(errors, document);
      expect(diagnostics.length).toBeLessThanOrEqual(50); // Should respect maxDiagnostics
    });
  });

  describe('Expression Parse Error Conversion', () => {
    test('should convert expression parse errors with position adjustment', async () => {
      const errors: ParseError[] = [{
        message: 'Syntax error',
        line: 0,
        column: 5,
        length: 4
      }];

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Some text\nPatient.name.where()'
      );

      const expr = {
        expression: 'Patient.name.where()',
        line: 1,
        column: 0
      };

      const diagnostics = converter.convertExpressionParseErrorsToDiagnostics(errors, document, expr);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].range.start.line).toBe(1);
      expect(diagnostics[0].range.start.character).toBe(5); // column offset + error column
    });

    test('should handle expression errors with diagnostic mapper', async () => {
      mockDiagnosticMapper.mapErrorToDiagnosticCode.mockReturnValueOnce(DiagnosticCode.UnknownFunction);
      mockDiagnosticMapper.addSuggestionsForError.mockReturnValueOnce(
        DiagnosticBuilder.error(DiagnosticCode.UnknownFunction)
          .withMessage('Unknown function with suggestion')
          .suggest('Did you mean "where"?', 'where')
      );

      const errors: ParseError[] = [{
        message: 'Unknown function',
        line: 0,
        column: 5,
        length: 4
      }];

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name.wher()'
      );

      const expr = {
        expression: 'Patient.name.wher()',
        line: 0,
        column: 0
      };

      const diagnostics = converterWithMapper.convertExpressionParseErrorsToDiagnostics(errors, document, expr);
      expect(diagnostics).toHaveLength(1);
      expect(mockDiagnosticMapper.mapErrorToDiagnosticCode).toHaveBeenCalledWith(errors[0]);
      expect(mockDiagnosticMapper.addSuggestionsForError).toHaveBeenCalled();
    });

    test('should fallback to basic diagnostic without mapper', async () => {
      const errors: ParseError[] = [{
        message: 'Parse error',
        line: 0,
        column: 5,
        length: 4,
        code: 'custom-error'
      }];

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const expr = {
        expression: 'Patient.name',
        line: 0,
        column: 0
      };

      const diagnostics = converter.convertExpressionParseErrorsToDiagnostics(errors, document, expr);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Error);
      expect(diagnostics[0].code).toBe('custom-error');
    });

    test('should handle expression errors without error code', async () => {
      const errors: ParseError[] = [{
        message: 'Parse error',
        line: 0,
        column: 5,
        length: 4
      }];

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const expr = {
        expression: 'Patient.name',
        line: 0,
        column: 0
      };

      const diagnostics = converter.convertExpressionParseErrorsToDiagnostics(errors, document, expr);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].code).toBe('syntax-error'); // Default fallback
    });
  });

  describe('Error Message Formatting', () => {
    test('should format error messages by removing position info', async () => {
      const errors: ParseError[] = [{
        message: 'Unexpected token at position 5 in expression',
        line: 0,
        column: 5,
        length: 1
      }];

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const diagnostics = converter.convertParseErrorsToDiagnostics(errors, document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe('Unexpected token in expression');
      expect(diagnostics[0].message).not.toContain('at position 5');
    });

    test('should normalize whitespace in error messages', async () => {
      const errors: ParseError[] = [{
        message: 'Parse   error   with   extra   spaces',
        line: 0,
        column: 0,
        length: 1
      }];

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const diagnostics = converter.convertParseErrorsToDiagnostics(errors, document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe('Parse error with extra spaces');
    });

    test('should trim error messages', async () => {
      const errors: ParseError[] = [{
        message: '  Parse error with leading and trailing spaces  ',
        line: 0,
        column: 0,
        length: 1
      }];

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const diagnostics = converter.convertParseErrorsToDiagnostics(errors, document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe('Parse error with leading and trailing spaces');
    });
  });

  describe('Internal Error Handling', () => {
    test('should create internal error diagnostic for Error objects', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const error = new Error('Internal processing error');
      const diagnostic = converter.createInternalErrorDiagnostic(document, error);

      expect(diagnostic.severity).toBe(DiagnosticSeverity.Error);
      expect(diagnostic.message).toBe('Internal error: Internal processing error');
      expect(diagnostic.code).toBe('internal-error');
      expect(diagnostic.range.start.line).toBe(0);
      expect(diagnostic.range.start.character).toBe(0);
      expect(diagnostic.range.end.character).toBe(12); // Length of document text
    });

    test('should create internal error diagnostic for unknown errors', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const error = 'String error';
      const diagnostic = converter.createInternalErrorDiagnostic(document, error);

      expect(diagnostic.severity).toBe(DiagnosticSeverity.Error);
      expect(diagnostic.message).toBe('Internal error: Unknown error');
      expect(diagnostic.code).toBe('internal-error');
    });

    test('should create internal error diagnostic for null/undefined errors', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const diagnostic1 = converter.createInternalErrorDiagnostic(document, null);
      const diagnostic2 = converter.createInternalErrorDiagnostic(document, undefined);

      expect(diagnostic1.message).toBe('Internal error: Unknown error');
      expect(diagnostic2.message).toBe('Internal error: Unknown error');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty error arrays', async () => {
      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const diagnostics = converter.convertParseErrorsToDiagnostics([], document);
      expect(diagnostics).toHaveLength(0);
    });

    test('should handle errors with zero length', async () => {
      const errors: ParseError[] = [{
        message: 'Error with zero length',
        line: 0,
        column: 5,
        length: 0
      }];

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const diagnostics = converter.convertParseErrorsToDiagnostics(errors, document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].range.end.character).toBeGreaterThan(diagnostics[0].range.start.character);
    });

    test('should handle errors with negative length', async () => {
      const errors: ParseError[] = [{
        message: 'Error with negative length',
        line: 0,
        column: 5,
        length: -1
      }];

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const diagnostics = converter.convertParseErrorsToDiagnostics(errors, document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].range.end.character).toBeGreaterThan(diagnostics[0].range.start.character);
    });

    test('should handle errors with negative line numbers', async () => {
      const errors: ParseError[] = [{
        message: 'Error with negative line',
        line: -1,
        column: 5,
        length: 3
      }];

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const diagnostics = converter.convertParseErrorsToDiagnostics(errors, document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].range.start.line).toBe(0); // Should be bounded to 0
    });

    test('should handle errors with negative column numbers', async () => {
      const errors: ParseError[] = [{
        message: 'Error with negative column',
        line: 0,
        column: -5,
        length: 3
      }];

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const diagnostics = converter.convertParseErrorsToDiagnostics(errors, document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].range.start.character).toBe(0); // Should be bounded to 0
    });

    test('should handle empty documents', async () => {
      const errors: ParseError[] = [{
        message: 'Parse error',
        line: 0,
        column: 0,
        length: 1
      }];

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        ''
      );

      const diagnostics = converter.convertParseErrorsToDiagnostics(errors, document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].range.start.character).toBe(0);
      expect(diagnostics[0].range.end.character).toBe(0);
    });

    test('should handle multi-line documents', async () => {
      const errors: ParseError[] = [{
        message: 'Parse error on second line',
        line: 1,
        column: 5,
        length: 4
      }];

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name\n.where(use = "official")'
      );

      const diagnostics = converter.convertParseErrorsToDiagnostics(errors, document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].range.start.line).toBe(1);
      expect(diagnostics[0].range.start.character).toBe(5);
    });
  });

  describe('Bounds Checking', () => {
    test('should handle line numbers beyond document bounds', async () => {
      const errors: ParseError[] = [{
        message: 'Error beyond document',
        line: 10, // Document only has 1 line
        column: 0,
        length: 1
      }];

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const diagnostics = converter.convertParseErrorsToDiagnostics(errors, document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].range.start.line).toBe(0); // Should be bounded to last line
    });

    test('should handle column numbers beyond line length', async () => {
      const errors: ParseError[] = [{
        message: 'Error beyond line',
        line: 0,
        column: 50, // Line is only 12 characters
        length: 5
      }];

      const document = TextDocument.create(
        'file:///test.fhirpath',
        'fhirpath',
        1,
        'Patient.name'
      );

      const diagnostics = converter.convertParseErrorsToDiagnostics(errors, document);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].range.start.character).toBeLessThanOrEqual(12);
      expect(diagnostics[0].range.end.character).toBeLessThanOrEqual(12);
    });
  });
});
