// Quick fix providers for FHIRPath Language Server
export { FunctionNameQuickFixProvider } from './FunctionNameQuickFixProvider';
export { BracketQuickFixProvider } from './BracketQuickFixProvider';
export { StringAndOperatorQuickFixProvider } from './StringAndOperatorQuickFixProvider';
export { AlwaysAvailableSourceActions } from './AlwaysAvailableSourceActions';

// Quick fix provider registry
import { FunctionNameQuickFixProvider } from './FunctionNameQuickFixProvider';
import { BracketQuickFixProvider } from './BracketQuickFixProvider';
import { StringAndOperatorQuickFixProvider } from './StringAndOperatorQuickFixProvider';
import { AlwaysAvailableSourceActions } from './AlwaysAvailableSourceActions';
import { FHIRPathFunctionRegistry } from '../../services/FHIRPathFunctionRegistry';
import { CodeActionRegistration, FHIRPathCodeActionKind } from '../../types/CodeActionTypes';

/**
 * Create and register all quick fix providers
 */
export function createQuickFixProviders(
  functionRegistry: FHIRPathFunctionRegistry
): CodeActionRegistration[] {
  return [
    // Always available source actions (ensures light bulb always appears)
    // HIGH PRIORITY to beat Copilot and other extensions
    {
      kinds: [
        FHIRPathCodeActionKind.Source,
        FHIRPathCodeActionKind.SourceFormat,
        FHIRPathCodeActionKind.SourceOrganize,
        FHIRPathCodeActionKind.SourceFixAll,
      ],
      provider: new AlwaysAvailableSourceActions(),
      priority: 1000, // VERY HIGH - beats most other extensions
    },
    
    // Function name quick fixes - HIGH PRIORITY for FHIRPath errors
    {
      kinds: [
        FHIRPathCodeActionKind.QuickFix,
        FHIRPathCodeActionKind.QuickFixFunction,
      ],
      provider: new FunctionNameQuickFixProvider(functionRegistry),
      priority: 950, // High priority for FHIRPath-specific fixes
    },
    
    // Bracket and parentheses fixes - HIGH PRIORITY for syntax errors
    {
      kinds: [
        FHIRPathCodeActionKind.QuickFix,
        FHIRPathCodeActionKind.QuickFixBrackets,
      ],
      provider: new BracketQuickFixProvider(),
      priority: 900, // High priority for syntax fixes
    },
    
    // String literal and operator fixes - HIGH PRIORITY for syntax errors
    {
      kinds: [
        FHIRPathCodeActionKind.QuickFix,
        FHIRPathCodeActionKind.QuickFixString,
        FHIRPathCodeActionKind.QuickFixOperator,
      ],
      provider: new StringAndOperatorQuickFixProvider(),
      priority: 850, // High priority for syntax fixes
    },
  ];
}