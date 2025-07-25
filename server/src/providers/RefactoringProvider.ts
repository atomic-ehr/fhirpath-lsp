import {
  TextDocument,
  Position,
  Range,
  WorkspaceEdit,
  TextEdit,
  PrepareRenameParams,
  RenameParams,
  CodeActionParams,
  CodeAction,
  CodeActionKind,
  Command
} from 'vscode-languageserver';

import { SymbolService } from '../services/SymbolService';
import { FHIRPathService } from '../parser/FHIRPathService';
import { FHIRPathSymbol, FHIRPathSymbolKind } from '../types/SymbolTypes';

/**
 * Types of refactoring operations supported
 */
export enum RefactoringType {
  Rename = 'rename',
  ExtractVariable = 'extract-variable',
  ExtractFunction = 'extract-function',
  SimplifyExpression = 'simplify-expression',
  MergeExpressions = 'merge-expressions',
  SplitExpression = 'split-expression'
}

/**
 * Result of a refactoring operation
 */
export interface RefactoringResult {
  success: boolean;
  edits?: WorkspaceEdit;
  error?: string;
  preview?: RefactoringPreview;
}

/**
 * Preview information for refactoring operations
 */
export interface RefactoringPreview {
  type: RefactoringType;
  description: string;
  changes: Array<{
    uri: string;
    description: string;
    changes: TextEdit[];
  }>;
  warnings?: string[];
}

/**
 * Configuration for refactoring operations
 */
export interface RefactoringConfig {
  enabled: boolean;
  autoSuggestNames: boolean;
  confirmDestructive: boolean;
  maxPreviewChanges: number;
  safetyChecks: {
    semanticValidation: boolean;
    syntaxCheck: boolean;
    referenceIntegrity: boolean;
  };
}

/**
 * Default refactoring configuration
 */
const DEFAULT_REFACTORING_CONFIG: RefactoringConfig = {
  enabled: true,
  autoSuggestNames: true,
  confirmDestructive: true,
  maxPreviewChanges: 100,
  safetyChecks: {
    semanticValidation: true,
    syntaxCheck: true,
    referenceIntegrity: true
  }
};

/**
 * Main refactoring provider that coordinates all refactoring operations
 */
export class RefactoringProvider {
  private config: RefactoringConfig = DEFAULT_REFACTORING_CONFIG;

  constructor(
    private symbolService: SymbolService,
    private fhirPathService: FHIRPathService,
    config?: Partial<RefactoringConfig>
  ) {
    if (config) {
      this.config = { ...DEFAULT_REFACTORING_CONFIG, ...config };
    }
  }

  /**
   * Check if rename is possible at the given position
   */
  async prepareRename(document: TextDocument, position: Position): Promise<Range | null> {
    if (!this.config.enabled) {
      return null;
    }

    try {
      const symbols = this.symbolService.extractDocumentSymbols(document).symbols;
      const symbolAtPosition = this.findSymbolAtPosition(symbols, position);
      
      if (!symbolAtPosition || !this.canRenameSymbol(symbolAtPosition)) {
        return null;
      }

      return symbolAtPosition.range;
    } catch (error) {
      console.error('Error in prepareRename:', error);
      return null;
    }
  }

  /**
   * Provide rename edits for the symbol at the given position
   */
  async provideRenameEdits(
    document: TextDocument,
    position: Position,
    newName: string
  ): Promise<WorkspaceEdit | null> {
    if (!this.config.enabled) {
      return null;
    }

    try {
      // Validate the new name
      if (!this.isValidName(newName)) {
        return null;
      }

      const symbols = this.symbolService.extractDocumentSymbols(document).symbols;
      const symbolAtPosition = this.findSymbolAtPosition(symbols, position);
      
      if (!symbolAtPosition || !this.canRenameSymbol(symbolAtPosition)) {
        return null;
      }

      // Find all references to this symbol
      const references = await this.findAllReferences(document, symbolAtPosition);
      
      // Create workspace edit
      const workspaceEdit: WorkspaceEdit = {
        changes: {}
      };

      // For now, we'll only handle single-document renames
      // TODO: Implement workspace-wide rename in future iteration
      const edits: TextEdit[] = [];
      
      for (const reference of references) {
        edits.push({
          range: reference.range,
          newText: newName
        });
      }

      workspaceEdit.changes![document.uri] = edits;

      // Validate the result if safety checks are enabled
      if (this.config.safetyChecks.syntaxCheck) {
        const isValid = await this.validateRenameResult(document, workspaceEdit, newName);
        if (!isValid) {
          return null;
        }
      }

      return workspaceEdit;
    } catch (error) {
      console.error('Error in provideRenameEdits:', error);
      return null;
    }
  }

  /**
   * Provide code actions for refactoring operations
   */
  async provideRefactoringActions(
    document: TextDocument,
    range: Range,
    context: CodeActionParams['context']
  ): Promise<CodeAction[]> {
    if (!this.config.enabled) {
      return [];
    }

    const actions: CodeAction[] = [];

    try {
      // Extract variable action
      if (this.canExtractVariable(document, range)) {
        actions.push(this.createExtractVariableAction(document, range));
      }

      // Extract function action  
      if (this.canExtractFunction(document, range)) {
        actions.push(this.createExtractFunctionAction(document, range));
      }

      // Simplify expression action
      if (this.canSimplifyExpression(document, range)) {
        actions.push(this.createSimplifyExpressionAction(document, range));
      }

      return actions;
    } catch (error) {
      console.error('Error in provideRefactoringActions:', error);
      return [];
    }
  }

  /**
   * Execute a refactoring operation
   */
  async executeRefactoring(
    type: RefactoringType,
    document: TextDocument,
    range: Range,
    params?: any
  ): Promise<RefactoringResult> {
    if (!this.config.enabled) {
      return { success: false, error: 'Refactoring is disabled' };
    }

    try {
      switch (type) {
        case RefactoringType.ExtractVariable:
          return await this.executeExtractVariable(document, range, params?.name);
        
        case RefactoringType.ExtractFunction:
          return await this.executeExtractFunction(document, range, params?.name);
        
        case RefactoringType.SimplifyExpression:
          return await this.executeSimplifyExpression(document, range);
        
        default:
          return { success: false, error: `Unsupported refactoring type: ${type}` };
      }
    } catch (error) {
      console.error(`Error executing refactoring ${type}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Update refactoring configuration
   */
  updateConfig(config: Partial<RefactoringConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current refactoring configuration
   */
  getConfig(): RefactoringConfig {
    return { ...this.config };
  }

  // Private helper methods

  private findSymbolAtPosition(symbols: FHIRPathSymbol[], position: Position): FHIRPathSymbol | null {
    for (const symbol of symbols) {
      if (this.isPositionInRange(position, symbol.range)) {
        return symbol;
      }
    }
    return null;
  }

  private isPositionInRange(position: Position, range: Range): boolean {
    if (position.line < range.start.line || position.line > range.end.line) {
      return false;
    }
    
    if (position.line === range.start.line && position.character < range.start.character) {
      return false;
    }
    
    if (position.line === range.end.line && position.character > range.end.character) {
      return false;
    }
    
    return true;
  }

  private canRenameSymbol(symbol: FHIRPathSymbol): boolean {
    // Can rename variables, functions, and user-defined properties
    return [
      FHIRPathSymbolKind.Variable,
      FHIRPathSymbolKind.Function,
      FHIRPathSymbolKind.Parameter
    ].includes(symbol.kind);
  }

  private isValidName(name: string): boolean {
    // Basic validation for FHIRPath identifiers
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
  }

  private async findAllReferences(
    document: TextDocument,
    symbol: FHIRPathSymbol
  ): Promise<FHIRPathSymbol[]> {
    // For now, find all symbols with the same name in the same document
    // TODO: Implement workspace-wide reference finding
    const allSymbols = this.symbolService.extractDocumentSymbols(document).symbols;
    
    return allSymbols.filter(s => 
      s.name === symbol.name && 
      s.kind === symbol.kind &&
      s !== symbol
    );
  }

  private async validateRenameResult(
    document: TextDocument,
    workspaceEdit: WorkspaceEdit,
    newName: string
  ): Promise<boolean> {
    try {
      // Apply the edits temporarily to validate syntax
      const edits = workspaceEdit.changes?.[document.uri] || [];
      let text = document.getText();
      
      // Apply edits in reverse order to maintain positions
      const sortedEdits = edits.sort((a, b) => {
        const lineCompare = b.range.start.line - a.range.start.line;
        if (lineCompare !== 0) return lineCompare;
        return b.range.start.character - a.range.start.character;
      });

      for (const edit of sortedEdits) {
        const startOffset = this.getOffsetAt(text, edit.range.start);
        const endOffset = this.getOffsetAt(text, edit.range.end);
        text = text.substring(0, startOffset) + edit.newText + text.substring(endOffset);
      }

      // Try to parse the result
      const parseResult = this.fhirPathService.parse(text);
      return parseResult.success;
    } catch (error) {
      console.error('Error validating rename result:', error);
      return false;
    }
  }

  private getOffsetAt(text: string, position: Position): number {
    const lines = text.split('\n');
    let offset = 0;
    
    for (let i = 0; i < position.line && i < lines.length; i++) {
      offset += lines[i].length + 1; // +1 for newline
    }
    
    return offset + position.character;
  }

  // Extract operations (placeholder implementations)

  private canExtractVariable(document: TextDocument, range: Range): boolean {
    // Check if the selected range contains a valid expression
    const text = this.getTextInRange(document.getText(), range);
    return text.trim().length > 0 && !text.includes('\n');
  }

  private canExtractFunction(document: TextDocument, range: Range): boolean {
    // Check if the selected range contains a complex expression
    const text = this.getTextInRange(document.getText(), range);
    return text.trim().length > 10 && (text.includes('.') || text.includes('('));
  }

  private canSimplifyExpression(document: TextDocument, range: Range): boolean {
    // Check if the selected range contains simplifiable boolean logic
    const text = this.getTextInRange(document.getText(), range);
    return text.includes(' and ') || text.includes(' or ') || text.includes('= true') || text.includes('!= false');
  }

  private createExtractVariableAction(document: TextDocument, range: Range): CodeAction {
    return {
      title: 'Extract to variable',
      kind: CodeActionKind.RefactorExtract,
      command: {
        title: 'Extract Variable',
        command: 'fhirpath.refactor.extractVariable',
        arguments: [document.uri, range]
      }
    };
  }

  private createExtractFunctionAction(document: TextDocument, range: Range): CodeAction {
    return {
      title: 'Extract to function',
      kind: CodeActionKind.RefactorExtract,
      command: {
        title: 'Extract Function',
        command: 'fhirpath.refactor.extractFunction',
        arguments: [document.uri, range]
      }
    };
  }

  private createSimplifyExpressionAction(document: TextDocument, range: Range): CodeAction {
    return {
      title: 'Simplify expression',
      kind: CodeActionKind.RefactorRewrite,
      command: {
        title: 'Simplify Expression',
        command: 'fhirpath.refactor.simplifyExpression',
        arguments: [document.uri, range]
      }
    };
  }

  private async executeExtractVariable(
    document: TextDocument,
    range: Range,
    variableName?: string
  ): Promise<RefactoringResult> {
    // Placeholder implementation
    return { 
      success: false, 
      error: 'Extract variable not yet implemented' 
    };
  }

  private async executeExtractFunction(
    document: TextDocument,
    range: Range,
    functionName?: string
  ): Promise<RefactoringResult> {
    // Placeholder implementation
    return { 
      success: false, 
      error: 'Extract function not yet implemented' 
    };
  }

  private async executeSimplifyExpression(
    document: TextDocument,
    range: Range
  ): Promise<RefactoringResult> {
    // Placeholder implementation
    return { 
      success: false, 
      error: 'Simplify expression not yet implemented' 
    };
  }

  private getTextInRange(text: string, range: Range): string {
    const lines = text.split('\n');
    
    if (range.start.line === range.end.line) {
      return lines[range.start.line]?.substring(range.start.character, range.end.character) || '';
    }
    
    let result = '';
    for (let i = range.start.line; i <= range.end.line; i++) {
      if (i < lines.length) {
        if (i === range.start.line) {
          result += lines[i].substring(range.start.character);
        } else if (i === range.end.line) {
          result += '\n' + lines[i].substring(0, range.end.character);
        } else {
          result += '\n' + lines[i];
        }
      }
    }
    
    return result;
  }
}