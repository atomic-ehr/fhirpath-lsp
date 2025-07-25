import {
  Range,
  Position,
  Location,
  LocationLink,
  SymbolInformation,
  DocumentSymbol,
  SymbolKind,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * FHIRPath-specific symbol kinds
 */
export enum FHIRPathSymbolKind {
  Function = 'function',
  Property = 'property',
  Resource = 'resource',
  Literal = 'literal',
  Variable = 'variable',
  Operator = 'operator',
  Expression = 'expression',
  Parameter = 'parameter'
}

/**
 * Enhanced symbol information for FHIRPath
 */
export interface FHIRPathSymbol {
  name: string;
  kind: FHIRPathSymbolKind;
  range: Range;
  selectionRange: Range;
  detail?: string;
  documentation?: string;
  children?: FHIRPathSymbol[];
  
  // Additional FHIRPath-specific information
  fhirType?: string;
  fhirPath?: string;
  isBuiltIn?: boolean;
  returnType?: string;
  context?: string;
}

/**
 * Symbol provider interfaces
 */
export interface IDocumentSymbolProvider {
  provideDocumentSymbols(document: TextDocument): SymbolInformation[] | DocumentSymbol[];
}

export interface IDefinitionProvider {
  provideDefinition(
    document: TextDocument,
    position: Position
  ): Location[] | LocationLink[] | null;
}

export interface IReferencesProvider {
  provideReferences(
    document: TextDocument,
    position: Position,
    context: { includeDeclaration: boolean }
  ): Location[] | null;
}

/**
 * Symbol analysis context
 */
export interface SymbolContext {
  document: TextDocument;
  expression: string;
  position: Position;
  fhirResourceType?: string;
  fhirVersion?: string;
}

/**
 * Definition result with additional context
 */
export interface FHIRPathDefinition {
  location: Location | LocationLink;
  kind: 'fhir-property' | 'fhir-resource' | 'function' | 'operator';
  description?: string;
  documentation?: string;
  url?: string; // Link to FHIR specification or documentation
}

/**
 * Reference result with context
 */
export interface FHIRPathReference {
  location: Location;
  context: string; // Surrounding text for context
  kind: 'usage' | 'definition' | 'declaration';
}

/**
 * Symbol extraction result
 */
export interface SymbolExtractionResult {
  symbols: FHIRPathSymbol[];
  errors: string[];
  warnings: string[];
}

/**
 * Convert FHIRPath symbol kind to LSP symbol kind
 */
export function toSymbolKind(fhirKind: FHIRPathSymbolKind): SymbolKind {
  switch (fhirKind) {
    case FHIRPathSymbolKind.Function:
      return SymbolKind.Function;
    case FHIRPathSymbolKind.Property:
      return SymbolKind.Property;
    case FHIRPathSymbolKind.Resource:
      return SymbolKind.Class;
    case FHIRPathSymbolKind.Literal:
      return SymbolKind.Constant;
    case FHIRPathSymbolKind.Variable:
      return SymbolKind.Variable;
    case FHIRPathSymbolKind.Operator:
      return SymbolKind.Operator;
    case FHIRPathSymbolKind.Expression:
      return SymbolKind.Object;
    case FHIRPathSymbolKind.Parameter:
      return SymbolKind.Variable;
    default:
      return SymbolKind.Object;
  }
}

/**
 * Convert FHIRPath symbol to LSP DocumentSymbol
 */
export function toDocumentSymbol(fhirSymbol: FHIRPathSymbol): DocumentSymbol {
  return {
    name: fhirSymbol.name,
    detail: fhirSymbol.detail,
    kind: toSymbolKind(fhirSymbol.kind),
    range: fhirSymbol.range,
    selectionRange: fhirSymbol.selectionRange,
    children: fhirSymbol.children?.map(toDocumentSymbol)
  };
}

/**
 * Convert FHIRPath symbol to LSP SymbolInformation
 */
export function toSymbolInformation(
  fhirSymbol: FHIRPathSymbol,
  containerName?: string
): SymbolInformation {
  return {
    name: fhirSymbol.name,
    kind: toSymbolKind(fhirSymbol.kind),
    location: {
      uri: '', // Will be filled by provider
      range: fhirSymbol.range
    },
    containerName
  };
}