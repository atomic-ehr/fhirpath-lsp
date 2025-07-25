import {
  CodeAction,
  CodeActionKind,
  CodeActionContext,
  TextDocument,
  Range,
  WorkspaceEdit,
  Command,
  Diagnostic
} from 'vscode-languageserver';

/**
 * FHIRPath-specific code action kinds
 */
export class FHIRPathCodeActionKind {
  // QuickFix actions
  static readonly QuickFix = CodeActionKind.QuickFix;
  static readonly QuickFixFunction = `${CodeActionKind.QuickFix}.function`;
  static readonly QuickFixSyntax = `${CodeActionKind.QuickFix}.syntax`;
  static readonly QuickFixBrackets = `${CodeActionKind.QuickFix}.brackets`;
  static readonly QuickFixString = `${CodeActionKind.QuickFix}.string`;
  static readonly QuickFixOperator = `${CodeActionKind.QuickFix}.operator`;

  // Refactor actions
  static readonly Refactor = CodeActionKind.Refactor;
  static readonly RefactorExtract = `${CodeActionKind.Refactor}.extract`;
  static readonly RefactorRename = `${CodeActionKind.Refactor}.rename`;
  static readonly RefactorOptimize = `${CodeActionKind.Refactor}.optimize`;
  static readonly RefactorSimplify = `${CodeActionKind.Refactor}.simplify`;

  // Source actions
  static readonly Source = CodeActionKind.Source;
  static readonly SourceOrganize = `${CodeActionKind.Source}.organize`;
  static readonly SourceFormat = `${CodeActionKind.Source}.format`;
  static readonly SourceFixAll = `${CodeActionKind.Source}.fixAll`;
  static readonly SourceRemoveUnused = `${CodeActionKind.Source}.removeUnused`;
}

/**
 * Code action provider interface
 */
export interface ICodeActionProvider {
  /**
   * Provide code actions for the given document and range
   */
  provideCodeActions(
    document: TextDocument,
    range: Range,
    context: CodeActionContext
  ): CodeAction[] | Promise<CodeAction[]>;

  /**
   * Resolve additional information for a code action (optional)
   */
  resolveCodeAction?(action: CodeAction): CodeAction | Promise<CodeAction>;
}

/**
 * Code action registration interface
 */
export interface CodeActionRegistration {
  kinds: string[];
  provider: ICodeActionProvider;
  priority: number;
}

/**
 * Enhanced code action with additional metadata
 */
export interface FHIRPathCodeAction extends CodeAction {
  /**
   * Priority for ordering actions (higher = shown first)
   */
  priority?: number;

  /**
   * Whether this action is preferred (shown with special UI)
   */
  isPreferred?: boolean;

  /**
   * Category for grouping actions
   */
  category?: string;

  /**
   * Additional metadata for the action
   */
  metadata?: {
    description?: string;
    tags?: string[];
    confidence?: number; // 0-1, confidence in the fix
  };
}

/**
 * Code action builder utility
 */
export class CodeActionBuilder {
  private action: FHIRPathCodeAction;

  constructor(title: string, kind: string) {
    this.action = {
      title,
      kind,
      diagnostics: [],
    };
  }

  static create(title: string, kind: string): CodeActionBuilder {
    return new CodeActionBuilder(title, kind);
  }

  withDiagnostics(diagnostics: Diagnostic[]): CodeActionBuilder {
    this.action.diagnostics = diagnostics;
    return this;
  }

  withEdit(edit: WorkspaceEdit): CodeActionBuilder {
    this.action.edit = edit;
    return this;
  }

  withCommand(command: Command): CodeActionBuilder {
    this.action.command = command;
    return this;
  }

  withPriority(priority: number): CodeActionBuilder {
    this.action.priority = priority;
    return this;
  }

  withPreferred(isPreferred: boolean = true): CodeActionBuilder {
    this.action.isPreferred = isPreferred;
    return this;
  }

  withCategory(category: string): CodeActionBuilder {
    this.action.category = category;
    return this;
  }

  withMetadata(metadata: {
    description?: string;
    tags?: string[];
    confidence?: number;
  }): CodeActionBuilder {
    this.action.metadata = metadata;
    return this;
  }

  build(): FHIRPathCodeAction {
    return { ...this.action };
  }
}

/**
 * Code action context with FHIRPath-specific information
 */
export interface FHIRPathCodeActionContext extends CodeActionContext {
  /**
   * The current FHIRPath expression being edited
   */
  expression?: string;

  /**
   * Parse tree/AST information if available
   */
  parseInfo?: any;

  /**
   * FHIR context information
   */
  fhirContext?: {
    resourceType?: string;
    version?: string;
  };
}