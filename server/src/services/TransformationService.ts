import {
  TextDocument,
  Range,
  Position,
  WorkspaceEdit,
  TextEdit
} from 'vscode-languageserver';

import { FHIRPathService } from '../parser/FHIRPathService';

/**
 * Types of transformations available
 */
export enum TransformationType {
  SimplifyBoolean = 'simplify-boolean',
  OptimizePath = 'optimize-path',
  MergeExpressions = 'merge-expressions',
  SplitExpression = 'split-expression',
  RemoveRedundancy = 'remove-redundancy',
  NormalizeSpacing = 'normalize-spacing'
}

/**
 * Result of a transformation operation
 */
export interface TransformationResult {
  success: boolean;
  edits?: WorkspaceEdit;
  error?: string;
  originalText?: string;
  transformedText?: string;
  description?: string;
}

/**
 * A transformation rule
 */
interface TransformationRule {
  name: string;
  description: string;
  pattern: RegExp;
  replacement: string | ((substring: string, ...args: any[]) => string);
  validate?: (original: string, transformed: string) => boolean;
}

/**
 * Service for applying safe code transformations
 */
export class TransformationService {
  private booleanRules: TransformationRule[] = [];
  private pathRules: TransformationRule[] = [];
  private spacingRules: TransformationRule[] = [];

  constructor(private fhirPathService: FHIRPathService) {
    this.initializeBooleanRules();
    this.initializePathRules();
    this.initializeSpacingRules();
  }

  /**
   * Check if a transformation can be applied to the given range
   */
  canApplyTransformation(
    document: TextDocument,
    range: Range,
    type: TransformationType
  ): boolean {
    try {
      const text = this.getTextInRange(document.getText(), range);
      if (!text.trim()) return false;

      switch (type) {
        case TransformationType.SimplifyBoolean:
          return this.canSimplifyBoolean(text);
        case TransformationType.OptimizePath:
          return this.canOptimizePath(text);
        case TransformationType.RemoveRedundancy:
          return this.canRemoveRedundancy(text);
        case TransformationType.NormalizeSpacing:
          return this.canNormalizeSpacing(text);
        default:
          return false;
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Apply a transformation to the given range
   */
  async applyTransformation(
    document: TextDocument,
    range: Range,
    type: TransformationType
  ): Promise<TransformationResult> {
    try {
      const originalText = this.getTextInRange(document.getText(), range);
      if (!originalText.trim()) {
        return { success: false, error: 'No text to transform' };
      }

      let transformedText: string;
      let description: string;

      switch (type) {
        case TransformationType.SimplifyBoolean:
          const booleanResult = this.simplifyBooleanExpression(originalText);
          transformedText = booleanResult.text;
          description = booleanResult.description;
          break;

        case TransformationType.OptimizePath:
          const pathResult = this.optimizePathExpression(originalText);
          transformedText = pathResult.text;
          description = pathResult.description;
          break;

        case TransformationType.RemoveRedundancy:
          const redundancyResult = this.removeRedundancy(originalText);
          transformedText = redundancyResult.text;
          description = redundancyResult.description;
          break;

        case TransformationType.NormalizeSpacing:
          const spacingResult = this.normalizeSpacing(originalText);
          transformedText = spacingResult.text;
          description = spacingResult.description;
          break;

        default:
          return { success: false, error: `Unsupported transformation type: ${type}` };
      }

      // Check if anything actually changed
      if (transformedText === originalText) {
        return { success: false, error: 'No transformation needed' };
      }

      // Validate the result
      if (!await this.validateTransformation(originalText, transformedText)) {
        return { success: false, error: 'Transformation would create invalid syntax' };
      }

      // Create workspace edit
      const workspaceEdit: WorkspaceEdit = {
        changes: {
          [document.uri]: [{
            range,
            newText: transformedText
          }]
        }
      };

      return {
        success: true,
        edits: workspaceEdit,
        originalText,
        transformedText,
        description
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get available transformations for a given range
   */
  getAvailableTransformations(document: TextDocument, range: Range): TransformationType[] {
    const available: TransformationType[] = [];

    for (const type of Object.values(TransformationType)) {
      if (this.canApplyTransformation(document, range, type)) {
        available.push(type);
      }
    }

    return available;
  }

  // Private helper methods

  private initializeBooleanRules(): void {
    this.booleanRules = [
      {
        name: 'equals-true',
        description: 'Simplify "X = true" to "X"',
        pattern: /^(.+?)\s*=\s*true$/,
        replacement: '$1'
      },
      {
        name: 'not-equals-false',
        description: 'Simplify "X != false" to "X"',
        pattern: /^(.+?)\s*!=\s*false$/,
        replacement: '$1'
      },
      {
        name: 'equals-false',
        description: 'Simplify "X = false" to "not X"',
        pattern: /^(.+?)\s*=\s*false$/,
        replacement: 'not $1'
      },
      {
        name: 'true-and',
        description: 'Simplify "true and X" to "X"',
        pattern: /^true\s+and\s+(.+)$/,
        replacement: '$1'
      },
      {
        name: 'and-true',
        description: 'Simplify "X and true" to "X"',
        pattern: /^(.+?)\s+and\s+true$/,
        replacement: '$1'
      },
      {
        name: 'false-or',
        description: 'Simplify "false or X" to "X"',
        pattern: /^false\s+or\s+(.+)$/,
        replacement: '$1'
      },
      {
        name: 'or-false',
        description: 'Simplify "X or false" to "X"',
        pattern: /^(.+?)\s+or\s+false$/,
        replacement: '$1'
      },
      {
        name: 'double-negation',
        description: 'Remove double negation',
        pattern: /^not\s+not\s+(.+)$/,
        replacement: '$1'
      }
    ];
  }

  private initializePathRules(): void {
    this.pathRules = [
      {
        name: 'redundant-where-true',
        description: 'Remove redundant where(true)',
        pattern: /\.where\s*\(\s*true\s*\)/,
        replacement: ''
      },
      {
        name: 'count-greater-zero',
        description: 'Replace count() > 0 with exists()',
        pattern: /\.count\s*\(\s*\)\s*>\s*0/,
        replacement: '.exists()'
      },
      {
        name: 'count-equals-zero',
        description: 'Replace count() = 0 with empty()',
        pattern: /\.count\s*\(\s*\)\s*=\s*0/,
        replacement: '.empty()'
      },
      {
        name: 'length-greater-zero',
        description: 'Replace length() > 0 with exists()',
        pattern: /\.length\s*\(\s*\)\s*>\s*0/,
        replacement: '.exists()'
      },
      {
        name: 'double-where',
        description: 'Merge consecutive where clauses',
        pattern: /\.where\s*\(([^)]+)\)\s*\.where\s*\(([^)]+)\)/,
        replacement: '.where($1 and $2)'
      }
    ];
  }

  private initializeSpacingRules(): void {
    this.spacingRules = [
      {
        name: 'operator-spacing',
        description: 'Normalize spacing around operators',
        pattern: /(\w+)\s*([=!<>]+)\s*(\w+)/g,
        replacement: '$1 $2 $3'
      },
      {
        name: 'function-spacing',
        description: 'Normalize spacing in function calls',
        pattern: /(\w+)\s*\(\s*([^)]*)\s*\)/g,
        replacement: (match: string, funcName: string, params: string) => {
          return `${funcName}(${params.trim()})`;
        }
      },
      {
        name: 'dot-spacing',
        description: 'Remove spaces around dots',
        pattern: /\s*\.\s*/g,
        replacement: '.'
      }
    ];
  }

  private canSimplifyBoolean(text: string): boolean {
    return this.booleanRules.some(rule => {
      // Reset regex lastIndex to avoid issues with global flags
      rule.pattern.lastIndex = 0;
      return rule.pattern.test(text);
    });
  }

  private canOptimizePath(text: string): boolean {
    return this.pathRules.some(rule => {
      rule.pattern.lastIndex = 0;
      return rule.pattern.test(text);
    });
  }

  private canRemoveRedundancy(text: string): boolean {
    return text.includes('where(true)') ||
           text.includes('count() > 0') ||
           text.includes('count() = 0') ||
           /\.where\s*\([^)]+\)\s*\.where\s*\([^)]+\)/.test(text);
  }

  private canNormalizeSpacing(text: string): boolean {
    return /\s*[=!<>]+\s*/.test(text) ||
           /\w+\s*\(\s*[^)]*\s*\)/.test(text) ||
           /\s*\.\s*/.test(text);
  }

  private simplifyBooleanExpression(text: string): { text: string; description: string } {
    let result = text;
    const appliedRules: string[] = [];

    for (const rule of this.booleanRules) {
      const before = result;

      // Reset regex lastIndex to avoid state issues
      rule.pattern.lastIndex = 0;

      if (typeof rule.replacement === 'string') {
        result = result.replace(rule.pattern, rule.replacement);
      } else {
        result = result.replace(rule.pattern, rule.replacement);
      }

      if (result !== before) {
        appliedRules.push(rule.description);
      }
    }

    return {
      text: result.trim(),
      description: appliedRules.length > 0
        ? `Applied: ${appliedRules.join(', ')}`
        : 'Simplified boolean expression'
    };
  }

  private optimizePathExpression(text: string): { text: string; description: string } {
    let result = text;
    const appliedRules: string[] = [];

    for (const rule of this.pathRules) {
      const before = result;
      if (typeof rule.replacement === 'string') {
        result = result.replace(rule.pattern, rule.replacement);
      } else {
        result = result.replace(rule.pattern, rule.replacement);
      }

      if (result !== before) {
        appliedRules.push(rule.description);
      }
    }

    return {
      text: result,
      description: appliedRules.length > 0
        ? `Applied: ${appliedRules.join(', ')}`
        : 'Optimized path expression'
    };
  }

  private removeRedundancy(text: string): { text: string; description: string } {
    let result = text;
    const changes: string[] = [];

    // Remove redundant where(true)
    if (result.includes('where(true)')) {
      result = result.replace(/\.where\s*\(\s*true\s*\)/g, '');
      changes.push('removed where(true)');
    }

    // Optimize count comparisons
    if (result.includes('count() > 0')) {
      result = result.replace(/\.count\s*\(\s*\)\s*>\s*0/g, '.exists()');
      changes.push('replaced count() > 0 with exists()');
    }

    if (result.includes('count() = 0')) {
      result = result.replace(/\.count\s*\(\s*\)\s*=\s*0/g, '.empty()');
      changes.push('replaced count() = 0 with empty()');
    }

    return {
      text: result,
      description: changes.length > 0
        ? `Removed redundancy: ${changes.join(', ')}`
        : 'Removed redundant operations'
    };
  }

  private normalizeSpacing(text: string): { text: string; description: string } {
    let result = text;
    const changes: string[] = [];

    // Normalize operator spacing
    const operatorBefore = result;
    result = result.replace(/(\w+)\s*([=!<>]+)\s*(\w+)/g, '$1 $2 $3');
    if (result !== operatorBefore) {
      changes.push('normalized operator spacing');
    }

    // Normalize function call spacing
    const functionBefore = result;
    result = result.replace(/(\w+)\s*\(\s*([^)]*)\s*\)/g, (match, name, params) => {
      return `${name}(${params.trim()})`;
    });
    if (result !== functionBefore) {
      changes.push('normalized function spacing');
    }

    // Normalize dot spacing
    const dotBefore = result;
    result = result.replace(/\s*\.\s*/g, '.');
    if (result !== dotBefore) {
      changes.push('normalized dot spacing');
    }

    return {
      text: result,
      description: changes.length > 0
        ? `Normalized: ${changes.join(', ')}`
        : 'Normalized spacing'
    };
  }

  private async validateTransformation(original: string, transformed: string): Promise<boolean> {
    try {
      // Both original and transformed should parse successfully
      const originalResult = this.fhirPathService.parse(original);
      const transformedResult = this.fhirPathService.parse(transformed);

      return originalResult.success && transformedResult.success;
    } catch (error) {
      console.error('Error validating transformation:', error);
      return false;
    }
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
