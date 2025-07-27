import { Diagnostic } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Base interface for all validators in the diagnostic system
 */
export interface IValidator {
  /**
   * Validates the given document and returns diagnostics
   * @param document The document to validate
   * @returns Array of diagnostics found during validation
   */
  validate(document: TextDocument): Promise<Diagnostic[]>;
}

/**
 * Interface for validators that work with expressions
 */
export interface IExpressionValidator extends IValidator {
  /**
   * Validates a specific expression within a document
   * @param document The document containing the expression
   * @param expression The expression to validate
   * @param lineOffset The line offset of the expression in the document
   * @param columnOffset The column offset of the expression in the document
   * @returns Array of diagnostics found during validation
   */
  validateExpression(
    document: TextDocument,
    expression: string,
    lineOffset?: number,
    columnOffset?: number
  ): Promise<Diagnostic[]>;
}

/**
 * Context information passed to validators
 */
export interface ValidationContext {
  document: TextDocument;
  expression?: string;
  lineOffset?: number;
  columnOffset?: number;
  resourceType?: string;
  additionalData?: Record<string, any>;
}

/**
 * Base abstract class for validators
 */
export abstract class BaseValidator implements IValidator {
  protected readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  abstract validate(document: TextDocument): Promise<Diagnostic[]>;

  /**
   * Helper method to create validation context
   */
  protected createContext(
    document: TextDocument,
    expression?: string,
    lineOffset?: number,
    columnOffset?: number,
    additionalData?: Record<string, any>
  ): ValidationContext {
    return {
      document,
      expression,
      lineOffset,
      columnOffset,
      additionalData
    };
  }
}

/**
 * Base abstract class for expression validators
 */
export abstract class BaseExpressionValidator extends BaseValidator implements IExpressionValidator {
  constructor(name: string) {
    super(name);
  }

  abstract validateExpression(
    document: TextDocument,
    expression: string,
    lineOffset?: number,
    columnOffset?: number
  ): Promise<Diagnostic[]>;

  async validate(document: TextDocument): Promise<Diagnostic[]> {
    // Default implementation that validates the entire document as one expression
    const text = document.getText();
    return this.validateExpression(document, text, 0, 0);
  }
}
