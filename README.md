# FHIRPath Language Server Protocol

A Language Server Protocol (LSP) implementation for FHIRPath expressions, providing intelligent code editing features for Visual Studio Code.

## Current Status (Phase 1 - Complete)

✅ **Implemented Features:**
- **Syntax Highlighting**: TextMate grammar-based highlighting for FHIRPath expressions
- **Error Detection**: Real-time syntax error detection with accurate line/column reporting  
- **Semantic Tokens**: Enhanced highlighting using LSP semantic tokens
- **Basic Auto-completion**: Function signatures and basic property suggestions
- **Language Configuration**: Brackets, comments, and auto-closing pairs

🚧 **In Progress:**
- Advanced context-aware auto-completion
- Hover information with function documentation
- Go-to-definition support

## Features

- **Syntax Highlighting**: Comprehensive TextMate grammar supporting:
  - Keywords (where, select, exists, etc.)
  - Functions (count, first, matches, etc.)
  - Operators (arithmetic, comparison, logical)
  - String and numeric literals
  - Comments (line and block)
- **Error Detection**: Real-time parsing with @atomic-ehr/fhirpath
- **Semantic Tokens**: LSP-based semantic highlighting for improved accuracy
- **Auto-completion**: Basic function and property suggestions

## Installation

```bash
bun install
bun run compile
```

## Development

```bash
# Watch mode for development
bun run watch

# Build for production
NODE_ENV=production bun run build

# Run tests
bun test
```

## Architecture

The project follows a standard LSP architecture:

- **Client**: VS Code extension that communicates with the language server
- **Server**: Language server that provides language intelligence features
- **Shared**: Common types and utilities shared between client and server

## Project Structure

```
fhirpath-lsp/
├── client/               # VS Code extension
├── server/               # Language server
├── shared/               # Shared types
├── syntaxes/            # TextMate grammar
└── package.json         # Workspace configuration
```

## Testing

Press `F5` in VS Code to launch a new Extension Development Host with the extension loaded.

Create a file with `.fhirpath` extension to test the language features:

```fhirpath
// Example FHIRPath expressions
Patient.name.given
Patient.name.where(use = 'official').given.first()
Observation.value.as(Quantity).value > 10
```

## Technical Details

- **Parser**: @atomic-ehr/fhirpath (0.0.1-canary)
- **LSP Framework**: vscode-languageserver-node v9
- **Build System**: Bun bundler
- **Target**: VS Code 1.84.0+

## Roadmap

### Phase 2 (Next)
- Enhanced auto-completion with FHIR resource awareness
- Function parameter hints
- Snippet support

### Phase 3 (Future)
- Hover information with full documentation
- Go-to-definition for FHIR paths
- Find references
- Refactoring support
- Multi-file analysis

## License

MIT
