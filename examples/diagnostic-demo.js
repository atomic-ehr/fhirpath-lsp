#!/usr/bin/env node
"use strict";
/**
 * Demonstration of the enhanced DiagnosticBuilder system
 * This script shows how to use the new diagnostic API similar to the Rust example
 */
Object.defineProperty(exports, "__esModule", { value: true });
const DiagnosticBuilder_1 = require("../server/src/diagnostics/DiagnosticBuilder");
console.log('=== FHIRPath LSP Enhanced Diagnostics Demo ===\n');
// Example 1: Unknown function error (matching the issue description example)
console.log('Example 1: Unknown function error');
console.log('--------------------------------------');
const diagnostic1 = DiagnosticBuilder_1.DiagnosticBuilder.error(DiagnosticBuilder_1.DiagnosticCode.UnknownFunction)
    .withMessage("Unknown function 'whre'")
    .withSpan(DiagnosticBuilder_1.DiagnosticUtils.spanFromCoords(0, 10, 0, 14))
    .withSourceText("Patient.whre(active = true)")
    .suggest("Did you mean 'where'?", "where")
    .build();
console.log(DiagnosticBuilder_1.DiagnosticUtils.formatDiagnosticText(diagnostic1));
// Example 2: Unterminated string error
console.log('\nExample 2: Unterminated string error');
console.log('------------------------------------');
const diagnostic2 = DiagnosticBuilder_1.DiagnosticBuilder.error(DiagnosticBuilder_1.DiagnosticCode.UnterminatedString)
    .withMessage("Unterminated string literal")
    .withSpan(DiagnosticBuilder_1.DiagnosticUtils.spanFromCoords(0, 12, 0, 17))
    .withSourceText("Patient.name = 'test")
    .suggest("Add closing quote", "'test'")
    .build();
console.log(DiagnosticBuilder_1.DiagnosticUtils.formatDiagnosticText(diagnostic2));
// Example 3: Type error with multiple suggestions
console.log('\nExample 3: Type error with multiple suggestions');
console.log('-----------------------------------------------');
const diagnostic3 = DiagnosticBuilder_1.DiagnosticBuilder.error(DiagnosticBuilder_1.DiagnosticCode.TypeError)
    .withMessage("Cannot compare string with number")
    .withSpan(DiagnosticBuilder_1.DiagnosticUtils.spanFromCoords(0, 20, 0, 22))
    .withSourceText("Patient.name.length > '5'")
    .suggest("Convert to number", "5")
    .suggest("Use string comparison", "Patient.name.length.toString() > '5'")
    .withRelatedInformation("String comparison requires both operands to be strings", DiagnosticBuilder_1.DiagnosticUtils.spanFromCoords(0, 0, 0, 25))
    .build();
console.log(DiagnosticBuilder_1.DiagnosticUtils.formatDiagnosticText(diagnostic3));
// Example 4: Warning with hint
console.log('\nExample 4: Warning with performance hint');
console.log('----------------------------------------');
const diagnostic4 = DiagnosticBuilder_1.DiagnosticBuilder.warning(DiagnosticBuilder_1.DiagnosticCode.InvalidContext)
    .withMessage("Inefficient path expression")
    .withSpan(DiagnosticBuilder_1.DiagnosticUtils.spanFromCoords(0, 0, 0, 30))
    .withSourceText("Bundle.entry.resource.where(true)")
    .suggest("Use more specific filter", "Bundle.entry.resource.where(resourceType = 'Patient')")
    .build();
console.log(DiagnosticBuilder_1.DiagnosticUtils.formatDiagnosticText(diagnostic4));
// Example 5: Show LSP integration
console.log('\nExample 5: LSP Diagnostic conversion');
console.log('-----------------------------------');
const lspDiagnostic = DiagnosticBuilder_1.DiagnosticBuilder.error(DiagnosticBuilder_1.DiagnosticCode.UnknownProperty)
    .withMessage("Unknown property 'nam'")
    .withSpan(DiagnosticBuilder_1.DiagnosticUtils.spanFromCoords(0, 8, 0, 11))
    .withSourceText("Patient.nam.given")
    .suggest("Did you mean 'name'?", "name")
    .buildLSP();
console.log('LSP Diagnostic object:');
console.log(JSON.stringify(lspDiagnostic, null, 2));
// Example 6: Complex diagnostic with multiple related information
console.log('\nExample 6: Complex diagnostic with related information');
console.log('-----------------------------------------------------');
const diagnostic6 = DiagnosticBuilder_1.DiagnosticBuilder.error(DiagnosticBuilder_1.DiagnosticCode.CircularReference)
    .withMessage("Circular reference detected in expression")
    .withSpan(DiagnosticBuilder_1.DiagnosticUtils.spanFromCoords(2, 15, 2, 25))
    .withSourceText("Patient.link.other.link.other")
    .withRelatedInformation("First reference here", DiagnosticBuilder_1.DiagnosticUtils.spanFromCoords(0, 8, 0, 12))
    .withRelatedInformation("Circular reference starts here", DiagnosticBuilder_1.DiagnosticUtils.spanFromCoords(2, 8, 2, 12))
    .suggest("Break the circular reference", "Patient.link.other")
    .build();
console.log(DiagnosticBuilder_1.DiagnosticUtils.formatDiagnosticText(diagnostic6));
console.log('\n=== Demo Complete ===');
console.log('\nThe enhanced diagnostic system provides:');
console.log('• Rich error codes and categorization');
console.log('• Precise source location with spans');
console.log('• Intelligent suggestions with fixes');
console.log('• Related information for complex errors');
console.log('• Beautiful text formatting for display');
console.log('• Seamless LSP integration');
//# sourceMappingURL=diagnostic-demo.js.map