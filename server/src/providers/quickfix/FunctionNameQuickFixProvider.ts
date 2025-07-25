import {
  Range,
  Diagnostic,
  Position,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import {
  ICodeActionProvider,
  FHIRPathCodeAction,
  FHIRPathCodeActionContext,
  FHIRPathCodeActionKind,
  CodeActionBuilder,
} from '../../types/CodeActionTypes';

import { CodeActionService } from '../../services/CodeActionService';
import { FHIRPathFunctionRegistry } from '../../services/FHIRPathFunctionRegistry';

/**
 * Provides quick fixes for unknown function names by suggesting similar function names
 */
export class FunctionNameQuickFixProvider implements ICodeActionProvider {
  private functionRegistry: FHIRPathFunctionRegistry;

  constructor(functionRegistry: FHIRPathFunctionRegistry) {
    this.functionRegistry = functionRegistry;
  }

  /**
   * Check if this provider can fix the given diagnostic
   */
  canFix(diagnostic: Diagnostic): boolean {
    return diagnostic.code === 'E007' || 
           (typeof diagnostic.code === 'object' && diagnostic.code.value === 'E007');
  }

  /**
   * Provide code actions for function name corrections
   */
  async provideCodeActions(
    document: TextDocument,
    range: Range,
    context: FHIRPathCodeActionContext
  ): Promise<FHIRPathCodeAction[]> {
    const actions: FHIRPathCodeAction[] = [];

    // Only process diagnostics that we can fix
    const relevantDiagnostics = (context.diagnostics || []).filter(d => this.canFix(d));
    
    if (relevantDiagnostics.length === 0) {
      return actions;
    }

    for (const diagnostic of relevantDiagnostics) {
      const fixActions = await this.createFunctionNameFixes(document, diagnostic);
      actions.push(...fixActions);
    }

    return actions;
  }

  /**
   * Create function name correction actions for a diagnostic
   */
  private async createFunctionNameFixes(
    document: TextDocument,
    diagnostic: Diagnostic
  ): Promise<FHIRPathCodeAction[]> {
    const actions: FHIRPathCodeAction[] = [];

    try {
      // Extract the unknown function name from the diagnostic range
      const unknownFunction = this.extractFunctionName(document, diagnostic.range);
      
      if (!unknownFunction) {
        return actions;
      }

      // Get all available function names
      const availableFunctions = this.functionRegistry.getFunctions();
      const functionNames = availableFunctions.map(f => f.name);

      // Find similar function names
      const suggestions = CodeActionService.findSimilarStrings(
        unknownFunction,
        functionNames,
        2, // Max edit distance
        3  // Max suggestions
      );

      // Create quick fix actions for each suggestion
      for (let i = 0; i < suggestions.length; i++) {
        const suggestion = suggestions[i];
        const isTopSuggestion = i === 0;
        const confidence = this.calculateConfidence(unknownFunction, suggestion);

        // Create the replacement action with FHIRPath branding
        const action = CodeActionService.createTextReplacement(
          `🔍 FHIRPath: Did you mean '${suggestion}'?`,
          FHIRPathCodeActionKind.QuickFixFunction,
          document,
          diagnostic.range,
          suggestion,
          [diagnostic]
        );

        // Enhance the action with SUPER HIGH metadata to beat Copilot
        const enhancedAction = CodeActionBuilder.create(action.title, action.kind!)
          .withEdit(action.edit!)
          .withDiagnostics([diagnostic])
          .withPriority(isTopSuggestion ? 5000 : 4500 - i * 100) // SUPER HIGH
          .withPreferred(isTopSuggestion && confidence > 0.8)
          .withCategory('FHIRPath Functions')
          .withMetadata({
            description: `FHIRPath function suggestion: Replace '${unknownFunction}' with '${suggestion}'`,
            tags: ['typo-fix', 'function-name', 'fhirpath'],
            confidence: confidence
          })
          .build();

        actions.push(enhancedAction);
      }

      // If we have high-confidence matches, also offer case-correction
      const exactCaseInsensitiveMatch = functionNames.find(
        name => name.toLowerCase() === unknownFunction.toLowerCase()
      );

      if (exactCaseInsensitiveMatch && exactCaseInsensitiveMatch !== unknownFunction) {
        const caseAction = CodeActionService.createTextReplacement(
          `🔧 FHIRPath: Fix case to '${exactCaseInsensitiveMatch}'`,
          FHIRPathCodeActionKind.QuickFixFunction,
          document,
          diagnostic.range,
          exactCaseInsensitiveMatch,
          [diagnostic]
        );

        const enhancedCaseAction = CodeActionBuilder.create(caseAction.title, caseAction.kind!)
          .withEdit(caseAction.edit!)
          .withDiagnostics([diagnostic])
          .withPriority(5500) // SUPER HIGH - higher than other suggestions
          .withPreferred(true)
          .withCategory('FHIRPath Functions')
          .withMetadata({
            description: `FHIRPath case correction: Fix case of '${unknownFunction}' to '${exactCaseInsensitiveMatch}'`,
            tags: ['case-fix', 'function-name', 'fhirpath'],
            confidence: 1.0
          })
          .build();

        actions.unshift(enhancedCaseAction); // Add at beginning
      }

    } catch (error) {
      console.error('Error creating function name fixes:', error);
    }

    return actions;
  }

  /**
   * Extract the function name from the diagnostic range
   */
  private extractFunctionName(document: TextDocument, range: Range): string | null {
    try {
      const text = document.getText(range);
      
      // Handle different patterns:
      // 1. Simple function name: "whre"
      // 2. Function call: "whre("
      // 3. Chained function: ".whre"
      
      // Remove common prefixes/suffixes
      let functionName = text.trim();
      
      // Remove leading dot (for chained functions)
      if (functionName.startsWith('.')) {
        functionName = functionName.substring(1);
      }
      
      // Remove opening parenthesis (for function calls)
      if (functionName.endsWith('(')) {
        functionName = functionName.substring(0, functionName.length - 1);
      }
      
      // Extract just the function name (handle cases like "Patient.whre")
      const parts = functionName.split('.');
      functionName = parts[parts.length - 1];
      
      // Validate it looks like a function name
      if (/^[a-zA-Z][a-zA-Z0-9_]*$/.test(functionName)) {
        return functionName;
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting function name:', error);
      return null;
    }
  }

  /**
   * Calculate confidence score for a suggestion (0-1)
   */
  private calculateConfidence(original: string, suggestion: string): number {
    const editDistance = CodeActionService.calculateEditDistance(
      original.toLowerCase(),
      suggestion.toLowerCase()
    );
    
    const maxLength = Math.max(original.length, suggestion.length);
    
    // Confidence decreases with edit distance relative to string length
    const confidence = Math.max(0, 1 - (editDistance / maxLength));
    
    // Boost confidence for exact case-insensitive matches
    if (original.toLowerCase() === suggestion.toLowerCase()) {
      return 1.0;
    }
    
    // Boost confidence for common typos
    if (this.isCommonTypo(original, suggestion)) {
      return Math.min(1.0, confidence + 0.2);
    }
    
    return confidence;
  }

  /**
   * Check if this is a common typo pattern
   */
  private isCommonTypo(original: string, suggestion: string): boolean {
    const common_typos = [
      // Common FHIRPath function typos
      ['whre', 'where'],
      ['slect', 'select'],
      ['frist', 'first'],
      ['exsits', 'exists'],
      ['contin', 'contains'],
      ['distint', 'distinct'],
      ['lenght', 'length'],
      ['matche', 'matches'],
      ['replac', 'replace'],
      ['substrin', 'substring'],
    ];
    
    const originalLower = original.toLowerCase();
    const suggestionLower = suggestion.toLowerCase();
    
    return common_typos.some(([typo, correct]) => 
      originalLower === typo && suggestionLower === correct
    );
  }

  /**
   * Get comprehensive function information for a function name
   */
  private getFunctionInfo(functionName: string): string {
    const func = this.functionRegistry.getFunction(functionName);
    if (!func) {
      return '';
    }

    const parts = [
      `**${func.name}${func.signature}**`,
      func.description,
    ];

    if (func.examples && func.examples.length > 0) {
      parts.push(`Example: \`${func.examples[0]}\``);
    }

    return parts.join('\n\n');
  }
}