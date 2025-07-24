# FHIRPath Language Server Protocol

A comprehensive Language Server Protocol implementation for FHIRPath with VS Code extension support, providing intelligent features for FHIR healthcare data queries.

## 🚀 Features

### ✅ Core Language Support (Phase 1)
- **Syntax Highlighting** - Comprehensive TextMate grammar for FHIRPath
- **Error Detection** - Real-time syntax validation with precise error positioning
- **Language Configuration** - Bracket matching, auto-closing, and folding support
- **Document Synchronization** - Incremental text updates with caching

### ✅ Intelligence Features (Phase 2)
- **Auto-completion** - Context-aware suggestions for functions, operators, and FHIR resources
- **Semantic Highlighting** - Enhanced syntax highlighting with proper token classification
- **Hover Documentation** - Rich tooltips with function documentation and live expression evaluation
- **FHIR Validation** - Resource path validation against FHIR R4 specifications
- **Performance Optimization** - Advanced LRU caching with performance metrics

### 🚀 Advanced Features
- **Multi-expression Support** - Parse and validate semicolon-separated expressions
- **Live Expression Evaluation** - Real-time evaluation in hover when context data is available
- **Rich Formatting** - Markdown documentation with collapsible sections and visual badges
- **Context Analysis** - Document-level context parsing and intelligent validation

## 📁 Project Structure

```
fhirpath-lsp/
├── client/                    # VS Code extension client
│   ├── src/extension.ts       # Extension entry point
│   └── package.json           # Extension manifest
├── server/                    # Language server implementation
│   ├── src/
│   │   ├── server.ts          # Main LSP server
│   │   ├── parser/
│   │   │   └── FHIRPathService.ts        # Parser integration
│   │   ├── providers/
│   │   │   ├── CompletionProvider.ts     # Auto-completion
│   │   │   ├── SemanticTokensProvider.ts # Semantic highlighting
│   │   │   ├── HoverProvider.ts          # Hover documentation
│   │   │   ├── DiagnosticProvider.ts     # Error detection
│   │   │   └── FHIRValidationProvider.ts # FHIR validation
│   │   └── services/
│   │       ├── FHIRPathFunctionRegistry.ts # Function definitions
│   │       ├── FHIRResourceService.ts      # FHIR resource schemas
│   │       ├── CacheService.ts             # Performance caching
│   │       ├── DocumentService.ts          # Document management
│   │       └── FHIRPathContextService.ts   # Context analysis
│   └── package.json
├── shared/                    # Shared types and utilities
│   ├── src/
│   │   ├── types.ts          # Common interfaces
│   │   └── index.ts          # Shared exports
│   └── package.json
├── syntaxes/
│   └── fhirpath.tmGrammar.json # TextMate grammar
├── test/                      # Test cases and examples
│   ├── *.fhirpath            # Test expressions
│   ├── patient-example.json  # Sample FHIR data
│   └── vital-signs-data.json # Sample context data
├── tasks/                     # Development task tracking
├── adr/                       # Architecture Decision Records
└── package.json              # Root workspace configuration
```

## 🛠️ Installation & Setup

### Prerequisites
- [Bun](https://bun.sh/) runtime (recommended) or Node.js 18+
- VS Code 1.84+

### Build from Source

1. **Clone the repository**
   ```bash
   git clone https://github.com/atomic-ehr/fhirpath-lsp.git
   cd fhirpath-lsp
   ```

2. **Install dependencies**
   ```bash
   bun install:all
   # or individually:
   # bun install && cd client && bun install && cd ../server && bun install && cd ../shared && bun install
   ```

3. **Build the extension**
   ```bash
   bun run build
   ```

4. **Run in development**
   ```bash
   bun run dev
   ```

## 🐛 Local Development & Debugging

### Development Environment Setup

1. **Open in VS Code**
   ```bash
   code .
   ```

2. **Install recommended extensions** (when prompted)
   - TypeScript and JavaScript Language Features
   - ESLint
   - Prettier

### Debugging the Extension

#### Method 1: Using the Development Script
```bash
bun run dev
```
This builds the extension and opens a new VS Code window with the extension loaded.

#### Method 2: Using VS Code Debug Configuration

1. **Open the project in VS Code**
2. **Go to Run and Debug (Ctrl+Shift+D)**
3. **Select "Launch Extension"** from the dropdown
4. **Press F5** or click the green play button

This will:
- Build the extension automatically
- Launch a new VS Code window (Extension Development Host)
- Attach the debugger to both client and server processes

#### Method 3: Manual Debugging Steps

1. **Build the project**
   ```bash
   bun run build
   ```

2. **Open Command Palette** (Ctrl+Shift+P)
3. **Run "Developer: Reload Window"** to reload the extension
4. **Open a `.fhirpath` file** to activate the extension

### Testing Language Features

1. **Create a test file** with `.fhirpath` extension:
   ```fhirpath
   // Test basic syntax highlighting
   Patient.name.where(use = 'official').given.first()
   
   // Test auto-completion (type Patient. and see suggestions)
   Patient.
   
   // Test FHIR validation (this should show an error)
   Patient.invalidProperty
   
   // Test multi-expression support
   Patient.name.given.first();
   Patient.birthDate
   ```

2. **Test features**:
   - **Syntax Highlighting**: Different colors for keywords, functions, strings
   - **Auto-completion**: Type `Patient.` and press Ctrl+Space
   - **Hover**: Hover over functions like `where()` or `first()`
   - **Error Detection**: Invalid syntax should show red squiggles
   - **FHIR Validation**: Invalid properties should show warnings

### Debugging with Context Data

1. **Add context declaration** at the top of your `.fhirpath` file:
   ```fhirpath
   // @context Patient test/patient-example.json
   Patient.name.given.first()
   ```

2. **Features with context**:
   - Hover shows actual evaluation results
   - More accurate FHIR validation
   - Enhanced completion suggestions

### Debugging Server Issues

1. **Enable server tracing** in VS Code settings:
   ```json
   {
     "fhirpath.trace.server": "verbose"
   }
   ```

2. **View server logs**:
   - Open **Output** panel (Ctrl+Shift+U)
   - Select **FHIRPath Language Server** from dropdown

3. **Common issues**:
   - **Server not starting**: Check the Output panel for errors
   - **Features not working**: Verify the server is running and connected
   - **Performance issues**: Check cache statistics in server logs

### Development Commands

```bash
# Build all workspaces
bun run build

# Build with watch mode
bun run watch

# Type checking
bun run typecheck

# Run tests
bun run test

# Clean build outputs
bun run clean

# Lint code
bun run lint

# Format code
bun run format

# Package extension for distribution
bun run package
```

### Debugging Configuration Files

The project includes VS Code debugging configurations in `.vscode/`:

- **launch.json**: Debug configurations for client and server
- **tasks.json**: Build tasks and shortcuts
- **settings.json**: Workspace-specific settings

## 📊 Performance Metrics

Current performance targets (all met):
- **Auto-completion response**: < 200ms
- **Semantic token generation**: < 100ms  
- **Hover information**: < 150ms
- **FHIR validation**: < 300ms
- **Memory usage**: < 35MB for server process
- **Cache hit rate**: > 80% for repeated operations

## 🧪 Testing

### Test Files Available
- `test/basic-test.fhirpath` - Basic syntax and functions
- `test/context-test.fhirpath` - Context-aware evaluation
- `test/diagnostic-test.fhirpath` - Error detection
- `test/multi-expression-test.fhirpath` - Multiple expressions
- `test/patient-example.json` - Sample FHIR Patient resource
- `test/vital-signs-data.json` - Sample observation data

### Running Tests
```bash
bun run test
```

## 📈 Implementation Status

### ✅ Phase 1: Foundation (Complete)
- [x] LSP server structure
- [x] Parser integration (@atomic-ehr/fhirpath)
- [x] TextMate grammar for syntax highlighting
- [x] Diagnostic provider for syntax errors
- [x] VS Code extension client
- [x] Document synchronization

### ✅ Phase 2: Intelligence (Complete)
- [x] Auto-completion provider with function registry
- [x] Semantic token provider for enhanced highlighting
- [x] Hover provider with comprehensive documentation
- [x] FHIR resource path validation
- [x] Performance optimization with caching
- [x] Multi-expression support
- [x] Live expression evaluation

### 🔄 Phase 3: Advanced Features (Planned)
- [ ] Code formatting and refactoring
- [ ] Go-to-definition and find references
- [ ] Workspace symbol search
- [ ] Integration with FHIR servers
- [ ] Advanced diagnostics and quick fixes

## 🏗️ Architecture

The project follows a clean architecture with clear separation of concerns:

- **Client**: VS Code extension handling UI interactions
- **Server**: Language server implementing LSP protocol
- **Shared**: Common types and utilities
- **Parser**: Integration with @atomic-ehr/fhirpath library
- **Providers**: Feature-specific implementations (completion, hover, etc.)
- **Services**: Core business logic and data management

See [ADR-001](adr/001-fhirpath-lsp-architecture.md) for detailed architecture decisions.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes following the existing code style
4. Add tests for new functionality
5. Ensure all tests pass (`bun run test`)
6. Run type checking (`bun run typecheck`)
7. Format code (`bun run format`)
8. Commit your changes (`git commit -m 'Add amazing feature'`)
9. Push to the branch (`git push origin feature/amazing-feature`)
10. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Related Projects

- [@atomic-ehr/fhirpath](https://github.com/atomic-ehr/fhirpath) - Core FHIRPath parser
- [FHIR R4 Specification](https://hl7.org/fhir/R4/)
- [FHIRPath Specification](https://hl7.org/fhirpath/)

## 📞 Support

- Create an [issue](https://github.com/atomic-ehr/fhirpath-lsp/issues) for bug reports
- Start a [discussion](https://github.com/atomic-ehr/fhirpath-lsp/discussions) for questions
- Check [existing issues](https://github.com/atomic-ehr/fhirpath-lsp/issues) before creating new ones

---

**Built with ❤️ by the Atomic EHR Team**