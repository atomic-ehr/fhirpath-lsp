# Phase 5 - Task 6: Cross-Platform Compatibility

**Timeline**: 2-3 days  
**Status**: 🚀 Ready to Start  
**Priority**: Medium  
**Estimated Hours**: 15 hours  

## Overview

This task focuses on ensuring the FHIRPath Language Server works consistently and optimally across all major platforms (Windows, macOS, and Linux). It includes comprehensive platform testing, platform-specific optimizations, and deployment packaging for different operating systems and architectures.

## Objectives

1. **Platform Testing** - Comprehensive testing across Windows, macOS, and Linux distributions
2. **Platform-Specific Features** - Implement native integrations and optimizations for each platform
3. **Deployment Packaging** - Create platform-specific installers and deployment options

## Task Breakdown

### 1. Platform Testing (8 hours)

#### 1.1 Windows Compatibility Testing
- [ ] Test on Windows 10 and Windows 11
- [ ] Verify PowerShell and Command Prompt compatibility
- [ ] Test Windows-specific file path handling
- [ ] Validate Windows registry integration
- [ ] Test Windows Defender compatibility

#### 1.2 macOS Compatibility Testing
- [ ] Test on macOS Monterey, Ventura, and Sonoma
- [ ] Verify Apple Silicon (M1/M2) compatibility
- [ ] Test macOS security and privacy features
- [ ] Validate Gatekeeper and notarization
- [ ] Test macOS-specific file system features

#### 1.3 Linux Distribution Testing
- [ ] Test on Ubuntu LTS versions (20.04, 22.04)
- [ ] Test on CentOS/RHEL 8 and 9
- [ ] Test on Debian stable and testing
- [ ] Test on Fedora latest versions
- [ ] Test on Arch Linux and derivatives

#### 1.4 ARM64 Architecture Support
- [ ] Test on Apple Silicon Macs (M1/M2)
- [ ] Test on ARM64 Linux systems
- [ ] Test on Windows ARM64 devices
- [ ] Verify native ARM64 performance
- [ ] Test cross-architecture compatibility

#### 1.5 Container Deployment Testing
- [ ] Test Docker container deployment
- [ ] Test Kubernetes deployment
- [ ] Test container orchestration platforms
- [ ] Verify container security and isolation
- [ ] Test container performance and scaling

### 2. Platform-Specific Features (4 hours)

#### 2.1 Native File System Integration
- [ ] Implement Windows file association handling
- [ ] Add macOS Finder integration
- [ ] Create Linux desktop file entries
- [ ] Support platform-specific file watchers
- [ ] Handle platform-specific path separators

#### 2.2 Platform-Specific Shortcuts
- [ ] Implement Windows keyboard shortcuts
- [ ] Add macOS Command key combinations
- [ ] Create Linux desktop environment shortcuts
- [ ] Support platform-specific accessibility shortcuts
- [ ] Add context menu integrations

#### 2.3 OS-Specific Configuration Paths
- [ ] Use Windows AppData directories
- [ ] Use macOS Application Support directories
- [ ] Use Linux XDG Base Directory specification
- [ ] Handle platform-specific environment variables
- [ ] Support system-wide vs user-specific configurations

#### 2.4 Native Notification Systems
- [ ] Integrate with Windows notification system
- [ ] Use macOS Notification Center
- [ ] Support Linux desktop notifications (libnotify)
- [ ] Handle notification permissions and preferences
- [ ] Implement notification action buttons

#### 2.5 Platform Performance Optimizations
- [ ] Optimize for Windows file system performance
- [ ] Leverage macOS unified memory architecture
- [ ] Optimize for Linux process scheduling
- [ ] Use platform-specific threading models
- [ ] Implement platform-specific caching strategies

### 3. Deployment Packaging (3 hours)

#### 3.1 Platform-Specific Installers
- [ ] Create Windows MSI installer
- [ ] Build macOS PKG installer
- [ ] Create Linux DEB packages
- [ ] Build Linux RPM packages
- [ ] Generate platform-specific installation scripts

#### 3.2 Portable Deployment Options
- [ ] Create Windows portable executable
- [ ] Build macOS app bundle
- [ ] Create Linux AppImage
- [ ] Generate cross-platform ZIP archives
- [ ] Support standalone deployment

#### 3.3 Docker Container Images
- [ ] Build multi-architecture Docker images
- [ ] Create Alpine Linux based images
- [ ] Build Ubuntu-based images
- [ ] Support Windows container images
- [ ] Implement container health checks

#### 3.4 Package Manager Integration
- [ ] Publish to Windows Package Manager (winget)
- [ ] Submit to macOS Homebrew
- [ ] Create Linux distribution packages
- [ ] Support Snap package format
- [ ] Add Flatpak support

#### 3.5 Silent Installation Options
- [ ] Support Windows silent installation
- [ ] Add macOS command-line installation
- [ ] Create Linux unattended installation
- [ ] Support enterprise deployment tools
- [ ] Add installation configuration options

## Technical Implementation

### Platform Detection and Adaptation

```typescript
interface PlatformAdapter {
  getPlatform(): Platform;
  getArchitecture(): Architecture;
  getConfigPath(): string;
  getDataPath(): string;
  getCachePath(): string;
  showNotification(message: string, options?: NotificationOptions): Promise<void>;
  openFileManager(path: string): Promise<void>;
  registerFileAssociation(extension: string): Promise<void>;
}

enum Platform {
  Windows = 'win32',
  macOS = 'darwin',
  Linux = 'linux'
}

enum Architecture {
  x64 = 'x64',
  ARM64 = 'arm64',
  x86 = 'ia32'
}

class CrossPlatformAdapter implements PlatformAdapter {
  private platform: Platform;
  private architecture: Architecture;
  
  constructor() {
    this.platform = process.platform as Platform;
    this.architecture = process.arch as Architecture;
  }
  
  getPlatform(): Platform {
    return this.platform;
  }
  
  getArchitecture(): Architecture {
    return this.architecture;
  }
  
  getConfigPath(): string {
    switch (this.platform) {
      case Platform.Windows:
        return path.join(process.env.APPDATA || '', 'fhirpath-lsp');
      case Platform.macOS:
        return path.join(process.env.HOME || '', 'Library', 'Application Support', 'fhirpath-lsp');
      case Platform.Linux:
        return path.join(process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || '', '.config'), 'fhirpath-lsp');
      default:
        return path.join(process.env.HOME || '', '.fhirpath-lsp');
    }
  }
  
  async showNotification(message: string, options?: NotificationOptions): Promise<void> {
    switch (this.platform) {
      case Platform.Windows:
        await this.showWindowsNotification(message, options);
        break;
      case Platform.macOS:
        await this.showMacOSNotification(message, options);
        break;
      case Platform.Linux:
        await this.showLinuxNotification(message, options);
        break;
    }
  }
  
  private async showWindowsNotification(message: string, options?: NotificationOptions): Promise<void> {
    // Use Windows Toast notifications
    const { exec } = require('child_process');
    const command = `powershell -Command "New-BurntToastNotification -Text '${message}'"`;
    exec(command);
  }
  
  private async showMacOSNotification(message: string, options?: NotificationOptions): Promise<void> {
    // Use macOS osascript for notifications
    const { exec } = require('child_process');
    const command = `osascript -e 'display notification "${message}" with title "FHIRPath LSP"'`;
    exec(command);
  }
  
  private async showLinuxNotification(message: string, options?: NotificationOptions): Promise<void> {
    // Use libnotify for Linux notifications
    const { exec } = require('child_process');
    const command = `notify-send "FHIRPath LSP" "${message}"`;
    exec(command);
  }
}
```

### Platform-Specific File Handling

```typescript
interface FileSystemAdapter {
  watchFiles(pattern: string, callback: FileWatchCallback): FileWatcher;
  resolveExecutable(name: string): Promise<string>;
  getFileAssociations(extension: string): Promise<string[]>;
  openWithDefaultApplication(filePath: string): Promise<void>;
  createDesktopShortcut(options: ShortcutOptions): Promise<void>;
}

interface FileWatchCallback {
  (event: 'add' | 'change' | 'unlink', filePath: string): void;
}

interface ShortcutOptions {
  name: string;
  target: string;
  arguments?: string[];
  workingDirectory?: string;
  icon?: string;
}

class PlatformFileSystemAdapter implements FileSystemAdapter {
  private platform: Platform;
  
  constructor(platform: Platform) {
    this.platform = platform;
  }
  
  watchFiles(pattern: string, callback: FileWatchCallback): FileWatcher {
    switch (this.platform) {
      case Platform.Windows:
        return this.createWindowsFileWatcher(pattern, callback);
      case Platform.macOS:
        return this.createMacOSFileWatcher(pattern, callback);
      case Platform.Linux:
        return this.createLinuxFileWatcher(pattern, callback);
      default:
        return this.createGenericFileWatcher(pattern, callback);
    }
  }
  
  async resolveExecutable(name: string): Promise<string> {
    const extension = this.platform === Platform.Windows ? '.exe' : '';
    const executableName = name + extension;
    
    // Search in PATH
    const pathDirs = (process.env.PATH || '').split(path.delimiter);
    
    for (const dir of pathDirs) {
      const fullPath = path.join(dir, executableName);
      try {
        await fs.access(fullPath, fs.constants.X_OK);
        return fullPath;
      } catch {
        // Continue searching
      }
    }
    
    throw new Error(`Executable '${name}' not found in PATH`);
  }
  
  async createDesktopShortcut(options: ShortcutOptions): Promise<void> {
    switch (this.platform) {
      case Platform.Windows:
        await this.createWindowsShortcut(options);
        break;
      case Platform.macOS:
        await this.createMacOSAlias(options);
        break;
      case Platform.Linux:
        await this.createLinuxDesktopFile(options);
        break;
    }
  }
  
  private async createLinuxDesktopFile(options: ShortcutOptions): Promise<void> {
    const desktopContent = `[Desktop Entry]
Version=1.0
Type=Application
Name=${options.name}
Exec=${options.target} ${options.arguments?.join(' ') || ''}
Icon=${options.icon || ''}
Terminal=false
Categories=Development;
`;
    
    const desktopDir = path.join(process.env.HOME || '', 'Desktop');
    const desktopFile = path.join(desktopDir, `${options.name}.desktop`);
    
    await fs.writeFile(desktopFile, desktopContent);
    await fs.chmod(desktopFile, 0o755);
  }
}
```

### Container Deployment Configuration

```dockerfile
# Multi-stage Dockerfile for cross-platform deployment
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM node:18-alpine AS runtime

# Install platform-specific dependencies
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    && update-ca-certificates

# Create non-root user
RUN addgroup -g 1001 -S fhirpath && \
    adduser -S fhirpath -u 1001

WORKDIR /app
COPY --from=builder --chown=fhirpath:fhirpath /app/dist ./dist
COPY --from=builder --chown=fhirpath:fhirpath /app/node_modules ./node_modules
COPY --from=builder --chown=fhirpath:fhirpath /app/package.json ./

USER fhirpath

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node dist/healthcheck.js

CMD ["node", "dist/server.js"]
```

## Files to Create/Modify

### New Files
- `src/platform/PlatformAdapter.ts` - Platform detection and adaptation
- `src/platform/FileSystemAdapter.ts` - Platform-specific file operations
- `src/platform/NotificationAdapter.ts` - Platform-specific notifications
- `scripts/build-windows.js` - Windows build script
- `scripts/build-macos.js` - macOS build script
- `scripts/build-linux.js` - Linux build script
- `installers/windows/setup.iss` - Windows Inno Setup script
- `installers/macos/build-pkg.sh` - macOS package build script
- `installers/linux/build-deb.sh` - Debian package build script
- `installers/linux/build-rpm.sh` - RPM package build script
- `docker/Dockerfile` - Multi-platform Docker image
- `docker/docker-compose.yml` - Container orchestration
- `.github/workflows/build-platforms.yml` - Multi-platform CI/CD

### Modified Files
- `package.json` - Add platform-specific scripts and dependencies
- `server/src/server.ts` - Integrate platform adapter
- `client/src/extension.ts` - Add platform-specific client features
- `README.md` - Add platform-specific installation instructions

## Testing Strategy

### Platform Testing Matrix
- [ ] Windows 10 x64 + VS Code latest
- [ ] Windows 11 x64 + VS Code latest
- [ ] Windows 11 ARM64 + VS Code latest
- [ ] macOS Monterey x64 + VS Code latest
- [ ] macOS Ventura ARM64 + VS Code latest
- [ ] macOS Sonoma ARM64 + VS Code latest
- [ ] Ubuntu 20.04 LTS x64 + VS Code latest
- [ ] Ubuntu 22.04 LTS x64 + VS Code latest
- [ ] Ubuntu 22.04 LTS ARM64 + VS Code latest
- [ ] CentOS 8 x64 + VS Code latest
- [ ] Debian 11 x64 + VS Code latest
- [ ] Fedora latest x64 + VS Code latest

### Automated Testing
- [ ] Cross-platform unit tests
- [ ] Platform-specific integration tests
- [ ] Container deployment tests
- [ ] Installation package tests
- [ ] Performance comparison tests

### Manual Testing
- [ ] User experience testing on each platform
- [ ] Platform-specific feature testing
- [ ] Installation and uninstallation testing
- [ ] File association testing
- [ ] Notification system testing

## Success Criteria

- [ ] Extension works identically on Windows, macOS, and Linux
- [ ] All platform-specific features function correctly
- [ ] Installation packages work on all target platforms
- [ ] Performance is consistent across platforms (±10%)
- [ ] No platform-specific bugs in core functionality
- [ ] Container images run on all supported architectures
- [ ] File system operations work correctly on all platforms
- [ ] Notifications display properly on all platforms

## Performance Targets

- **Cross-platform performance variance**: < 10%
- **Installation time**: < 2 minutes on all platforms
- **Container startup time**: < 30 seconds
- **File system operations**: < 100ms on all platforms
- **Memory usage variance**: < 5% across platforms
- **CPU usage variance**: < 10% across platforms

## Dependencies

### External Dependencies
```json
{
  "node-notifier": "^10.0.1",
  "chokidar": "^3.5.3",
  "which": "^4.0.0",
  "open": "^9.1.0",
  "electron-builder": "^24.6.4"
}
```

### Platform-Specific Dependencies
```json
{
  "win32": {
    "node-windows": "^1.0.0-beta.8"
  },
  "darwin": {
    "node-mac": "^1.0.1"
  },
  "linux": {
    "node-linux": "^0.1.12"
  }
}
```

## Risk Mitigation

- **Platform-Specific Bugs**: Comprehensive testing matrix and automated CI/CD
- **Performance Variations**: Platform-specific optimizations and monitoring
- **Installation Issues**: Multiple installation methods and fallbacks
- **File System Differences**: Abstraction layer and thorough testing
- **Notification Failures**: Graceful fallbacks and error handling

## Platform-Specific Considerations

### Windows
- [ ] Handle Windows file path length limitations
- [ ] Support Windows file locking behavior
- [ ] Integrate with Windows Security features
- [ ] Handle Windows registry operations safely
- [ ] Support Windows service installation

### macOS
- [ ] Handle macOS app sandboxing requirements
- [ ] Support macOS Gatekeeper and notarization
- [ ] Integrate with macOS accessibility features
- [ ] Handle macOS file quarantine attributes
- [ ] Support macOS universal binaries

### Linux
- [ ] Support multiple desktop environments
- [ ] Handle different package management systems
- [ ] Support various init systems (systemd, SysV)
- [ ] Handle different file system permissions
- [ ] Support Linux distribution variations

## Deployment Automation

### CI/CD Pipeline
- [ ] Automated builds for all platforms
- [ ] Cross-platform testing automation
- [ ] Package generation automation
- [ ] Container image building
- [ ] Release artifact publishing

### Release Process
- [ ] Platform-specific release notes
- [ ] Coordinated multi-platform releases
- [ ] Platform-specific rollback procedures
- [ ] Update notification system
- [ ] Platform-specific support channels

## Notes

- Prioritize consistency across platforms while leveraging platform strengths
- Implement comprehensive testing to catch platform-specific issues early
- Consider platform-specific user expectations and conventions
- Plan for platform-specific support and troubleshooting
- Monitor platform-specific performance and usage metrics

---

**Task Dependencies**: Phase 5 - Task 1 (Production Server Integration)  
**Next Task**: Phase 5 - Task 7: Release Management  
**Estimated Completion**: 2-3 days with 1 developer
