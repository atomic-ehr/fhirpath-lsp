# ADR-001: FHIRPath Language Server Protocol Architecture

## Status
Accepted

## Context

We need to implement a Language Server Protocol (LSP) for FHIRPath expressions to provide intelligent code editing features in Visual Studio Code and other LSP-compliant editors. FHIRPath is a path-based navigation and extraction language used in HL7 FHIR for querying and manipulating healthcare data structures.

### Key Requirements
- Syntax highlighting for FHIRPath expressions
- Real-time error detection and validation
- Auto-completion for functions and FHIR resource paths
- Integration with existing @atomic-ehr/fhirpath library
- Cross-editor compatibility through LSP
- Performance suitable for real-time editing

### Current State Analysis
- Existing codebase has monorepo structure with client/server/shared workspaces
- ESBuild configuration already set up for TypeScript compilation
- Project configured to use Bun as runtime and package manager
- @atomic-ehr/fhirpath library available locally in ../fhirpath directory
- Basic project structure exists but implementation is incomplete

## Decision

We will implement a TypeScript-based Language Server using the LSP specification with the following architecture:

### Technology Stack
- **Parser**: @atomic-ehr/fhirpath v0.0.1 (https://github.com/atomic-ehr/fhirpath)
- **LSP Framework**: Microsoft vscode-languageserver-node
- **Build System**: ESBuild for fast compilation and bundling
- **Runtime**: Bun (preferred) with Node.js fallback
- **Testing**: Bun test with VS Code extension testing framework

### Architecture Components

```
┌─────────────────────────────────────────────────────────────┐
│                        VS Code                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            FHIRPath Extension (Client)               │   │
│  │  - Language Client Integration                       │   │
│  │  - Configuration Management                          │   │
│  │  - Command Registration                              │   │
│  └──────────────────┬──────────────────────────────────┘   │
│                     │ LSP Protocol (JSON-RPC)               │
└─────────────────────┼───────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────┐
│              FHIRPath Language Server                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Core Services                       │   │
│  │  - Document Manager      - Parser Service            │   │
│  │  - Diagnostic Provider   - Semantic Token Provider   │   │
│  │  - Completion Provider   - Cache Manager             │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │      @atomic-ehr/fhirpath v0.0.1 Integration        │   │
│  │  - AST Parsing          - Type Analysis             │   │
│  │  - Expression Evaluation - Lexer/Parser            │   │
│  │  - Expression Compilation - Registry System        │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Phases

#### Phase 1: Foundation (Weeks 1-3)
- LSP server initialization and client connection
- Basic FHIRPath parser integration
- TextMate grammar for syntax highlighting
- Diagnostic provider for syntax errors
- Document synchronization

**Success Criteria**:
- Extension loads and connects to language server
- Syntax highlighting works for FHIRPath keywords and operators
- Syntax errors show with precise location information
- Parser handles valid FHIRPath expressions from specification

#### Phase 2: Intelligence (Weeks 4-6)
- Auto-completion for FHIRPath functions and operators
- Semantic token provider for enhanced highlighting
- Hover information with function documentation
- FHIR resource path validation
- Performance optimization with caching

**Success Criteria**:
- Auto-completion responds under 200ms
- All FHIRPath 2.0 functions available in completion
- Semantic highlighting distinguishes different token types
- FHIR path validation catches invalid resource references

#### Phase 3: Advanced Features (Weeks 7-9)
- Go-to-definition for FHIR resources
- Code actions for error fixes
- Error recovery and partial parsing
- Workspace-wide symbol search
- Multi-file support

**Success Criteria**:
- Navigation to FHIR resource definitions works
- Error recovery handles incomplete expressions gracefully
- Memory usage stays under 50MB for server process
- All LSP features work reliably

## Rationale

### Why LSP Architecture?
- **Portability**: Enables support for multiple editors (VS Code, Vim, Neovim, Emacs)
- **Separation of Concerns**: Client handles UI integration, server handles language intelligence
- **Performance**: Server runs in separate process, preventing editor UI blocking
- **Standard Protocol**: Well-defined communication protocol simplifies debugging and testing
- **Ecosystem**: Leverages existing Microsoft LSP libraries and tooling

### Why @atomic-ehr/fhirpath v0.0.1?
- **TypeScript Native**: Complete TypeScript implementation with no FFI overhead
- **Rich AST**: Comprehensive Abstract Syntax Tree with position information for precise error reporting
- **Modular Architecture**: Separate lexer, parser, compiler, analyzer, and interpreter components
- **Local Development**: Available at ../fhirpath for rapid iteration and customization
- **Modern API**: Clean functional API with parse(), evaluate(), compile(), and analyze() functions
- **Registry System**: Extensible operation registry for custom functions and operators
- **Type Analysis**: Built-in analyzer for semantic analysis and type checking
- **GitHub Repository**: https://github.com/atomic-ehr/fhirpath with active development

### Why ESBuild?
- **Speed**: Orders of magnitude faster than webpack or rollup
- **Simplicity**: Minimal configuration required
- **TypeScript**: Native TypeScript support without additional tooling
- **Tree Shaking**: Automatic dead code elimination
- **Source Maps**: Debug support in development

## Alternatives Considered

| Alternative | Pros | Cons | Decision |
|-------------|------|------|----------|
| Direct VS Code Extension | Simple initial setup, no LSP complexity | Not portable to other editors | ❌ Rejected |
| TextMate Grammar Only | Very fast implementation | No dynamic features, limited intelligence | ❌ Rejected |
| HL7 FHIRPath.js Library | Official implementation, mature | JavaScript only, limited AST access, no position info | ❌ Rejected |
| Custom Parser Implementation | Full control over features | Duplicates existing work, high maintenance | ❌ Rejected |
| Tree-sitter Grammar | Very fast parsing, editor agnostic | Limited semantic analysis capabilities | ❌ Rejected |

## Implementation Details

### Project Structure
```
fhirpath-lsp/
├── client/                          # VS Code Extension
│   ├── src/extension.ts            # Extension entry point
│   ├── package.json                # Extension manifest
│   └── tsconfig.json
├── server/                          # Language Server
│   ├── src/
│   │   ├── server.ts               # LSP server entry
│   │   ├── parser/                 # FHIRPath parsing layer
│   │   ├── providers/              # LSP feature providers
│   │   └── services/               # Core services
│   └── tsconfig.json
├── shared/                          # Shared types and utilities
│   └── src/types.ts
├── syntaxes/
│   └── fhirpath.tmGrammar.json     # TextMate grammar
├── test/                            # Integration tests
├── build.js                        # ESBuild configuration
├── tsconfig.json                   # Composite project
└── package.json                    # Workspace configuration
```

### Key Dependencies
```json
{
  "dependencies": {
    "vscode-languageserver": "^9.0.1",
    "vscode-languageserver-textdocument": "^1.0.11",
    "vscode-languageclient": "^9.0.1",
    "@atomic-ehr/fhirpath": "file:../fhirpath",
    "lru-cache": "^10.1.0"
  }
}
```

### @atomic-ehr/fhirpath API Integration
The local @atomic-ehr/fhirpath library provides a comprehensive API:

```typescript
// Core API functions
import { parse, evaluate, compile, analyze } from '@atomic-ehr/fhirpath';

// Parse FHIRPath expression to AST
const expression = parse('Patient.name.given');
// expression.ast provides rich AST with position information

// Compile expression for performance
const compiled = compile(expression);

// Analyze expression for type information
const analysis = analyze(expression);

// Evaluate expression against data
const result = evaluate('Patient.name.given', patientData);
```

### Performance Targets
- Parse time: < 100ms for typical expressions
- Completion response: < 200ms
- Memory usage: < 50MB for server process
- Startup time: < 2 seconds
- File size support: Up to 10MB FHIRPath files

## Consequences

### Positive
- **Multi-editor Support**: LSP enables usage in various editors beyond VS Code
- **Maintainable Architecture**: Clear separation between client and server concerns
- **Performance**: Separate server process prevents blocking editor UI
- **Extensibility**: Easy to add new LSP features incrementally
- **TypeScript Integration**: Native TypeScript support throughout the stack
- **Developer Experience**: Fast build times and hot reload during development

### Negative
- **Complexity**: More complex setup than simple VS Code extension
- **Development Overhead**: Need to maintain both client and server components
- **Debugging**: More complex debugging setup with multiple processes
- **Bundle Size**: Larger extension size due to language server inclusion
- **Memory Usage**: Additional memory overhead for separate server process

### Risks and Mitigations
- **Parser API Stability**: Library is v0.0.1 - monitor for breaking changes, create abstraction layer
- **Performance Issues**: Implement caching, debouncing, and incremental parsing 
- **Local Dependency**: Library at ../fhirpath path - ensure proper build/packaging integration
- **Cross-platform Compatibility**: Test on Windows, macOS, and Linux early
- **VS Code API Changes**: Pin engine version, monitor VS Code API changelog

## Success Metrics

### Phase 1 Success Criteria
- Extension loads without errors in development environment
- Syntax highlighting works for all FHIRPath language constructs
- Syntax errors appear as diagnostics with accurate position information
- Parser successfully handles all examples from FHIRPath specification

### Phase 2 Success Criteria
- Auto-completion triggers within 200ms response time
- All FHIRPath 2.0 functions available in completion list
- Semantic highlighting distinguishes functions, operators, and literals
- FHIR resource path validation catches 90% of invalid references

### Phase 3 Success Criteria
- Go-to-definition works for FHIR resource references
- Error recovery provides meaningful diagnostics for incomplete expressions
- Language server memory usage remains stable under 50MB
- All implemented LSP features pass compliance tests

### Overall Project Success
- Developer adoption: > 100 daily active users within 6 months
- Performance: < 200ms average response time for all operations
- Reliability: < 1% crash rate during normal operation
- Quality: > 4.0/5.0 user satisfaction rating in VS Code marketplace

## Future Enhancements

1. **FHIR Context Integration**: Load FHIR resource schemas for enhanced validation
2. **Multi-file Support**: Cross-file references and workspace-wide analysis
3. **Debugging Support**: Step-through debugging of FHIRPath expressions
4. **Code Formatting**: Automatic code formatting and style enforcement
5. **Snippet Support**: Pre-defined templates for common FHIRPath patterns
6. **Web Extension**: Support for VS Code web and github.dev environments
7. **Language Variants**: Support for CQL and other FHIR-related languages

---

**Date**: 2024-07-24  
**Authors**: Development Team  
**Reviewers**: Architecture Team  
**Status**: Accepted