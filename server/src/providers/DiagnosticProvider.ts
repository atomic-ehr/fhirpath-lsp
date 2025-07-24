import {
  Diagnostic,
  DiagnosticSeverity,
  Position
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { FHIRPathService } from '../parser/FHIRPathService';

interface IValidator {
  validate(ast: any, document: TextDocument): Promise<Diagnostic[]>;
}

export class DiagnosticProvider {
  private validators: IValidator[] = [];
  
  constructor(private fhirPathService: FHIRPathService) {}
  
  async provideDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
    const text = document.getText();
    const diagnostics: Diagnostic[] = [];
    
    const parseResult = this.fhirPathService.parse(text);
    
    if (!parseResult.success) {
      return parseResult.errors.map(error => ({
        severity: DiagnosticSeverity.Error,
        range: {
          start: document.positionAt(error.offset),
          end: document.positionAt(error.offset + error.length)
        },
        message: error.message,
        source: 'fhirpath',
        code: 'syntax-error'
      }));
    }
    
    const validationErrors = this.fhirPathService.validate(text);
    for (const error of validationErrors) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: document.positionAt(error.offset),
          end: document.positionAt(error.offset + error.length)
        },
        message: error.message,
        source: 'fhirpath',
        code: 'validation-error'
      });
    }
    
    for (const validator of this.validators) {
      const issues = await validator.validate(parseResult.ast, document);
      diagnostics.push(...issues);
    }
    
    return diagnostics;
  }
}