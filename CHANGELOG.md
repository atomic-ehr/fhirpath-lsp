# Changelog

All notable changes to the FHIRPath Language Server Protocol project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Plugin system architecture for extensible functionality
- Centralized configuration management with validation
- Structured logging system with context correlation
- Enhanced diagnostic system with multiple analyzers
- Code actions and quick fixes for automated improvements
- Inlay hints for inline evaluation results
- Background processing for performance-intensive operations
- Advanced caching with performance monitoring
- Resource monitoring and health checks

### Changed
- **BREAKING**: Restructured project architecture with new directory layout
- Enhanced provider implementations with plugin support
- Improved error handling with error boundaries
- Updated documentation to reflect current architecture

### Fixed
- **Critical**: Fixed hover provider undefined type error that caused semantic warnings
- Improved null safety across all providers
- Enhanced error recovery mechanisms

### Removed
- Deprecated task tracking files (replaced with integrated task management)
- Outdated ADR files (replaced with current architecture decisions)

## [0.1.0] - 2024-07-24

### Added
- Initial FHIRPath Language Server Protocol implementation
- VS Code extension client
- Basic LSP features (completion, hover, diagnostics, semantic tokens)
- TextMate grammar for syntax highlighting
- FHIR resource validation
- Performance caching
- Multi-expression support
- Live expression evaluation
- Context-aware features

### Core Features
- **Syntax Highlighting**: Comprehensive TextMate grammar
- **Error Detection**: Real-time syntax validation
- **Auto-completion**: Context-aware suggestions
- **Hover Documentation**: Rich tooltips with function documentation
- **FHIR Validation**: Resource path validation against FHIR R4
- **Performance Optimization**: LRU caching with metrics

### Architecture
- Clean separation of client, server, and shared components
- Service-oriented architecture with clear interfaces
- TypeScript implementation with comprehensive type safety
- Bun runtime support with Node.js compatibility
EOF < /dev/null