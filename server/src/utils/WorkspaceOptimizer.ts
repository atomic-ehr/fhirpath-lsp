import * as path from 'path';
import { EventEmitter } from 'events';

export interface WorkspaceMetrics {
  fileCount: number;
  totalSize: number;
  largestFiles: FileInfo[];
  fileTypeDistribution: Map<string, number>;
  averageFileSize: number;
}

export interface FileInfo {
  path: string;
  size: number;
  lastModified: Date;
}

export interface OptimizationStrategy {
  name: string;
  description: string;
  apply(): Promise<void>;
}

export interface WorkspaceOptimizationOptions {
  maxFilesToIndex?: number;
  maxFileSize?: number;
  excludePatterns?: string[];
  includePatterns?: string[];
  priorityPatterns?: string[];
}

export class WorkspaceOptimizer extends EventEmitter {
  private options: Required<WorkspaceOptimizationOptions>;
  private fileIndex = new Map<string, FileInfo>();
  private priorityFiles = new Set<string>();
  private isOptimizing = false;

  constructor(options: WorkspaceOptimizationOptions = {}) {
    super();
    this.options = {
      maxFilesToIndex: options.maxFilesToIndex || 5000,
      maxFileSize: options.maxFileSize || 1024 * 1024, // 1MB
      excludePatterns: options.excludePatterns || [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/*.log',
        '**/*.tmp'
      ],
      includePatterns: options.includePatterns || ['**/*.fhirpath', '**/*.fhir', '**/*.json'],
      priorityPatterns: options.priorityPatterns || ['**/*.fhirpath', '**/*.fhir']
    };
  }

  async analyzeWorkspace(rootPath: string): Promise<WorkspaceMetrics> {
    this.emit('analysisStart', rootPath);
    
    // In a real implementation, this would scan the file system
    // For now, we'll simulate the analysis
    const metrics: WorkspaceMetrics = {
      fileCount: 0,
      totalSize: 0,
      largestFiles: [],
      fileTypeDistribution: new Map(),
      averageFileSize: 0
    };

    // Simulate file scanning
    const simulatedFiles = [
      { path: path.join(rootPath, 'patient.fhirpath'), size: 1024, lastModified: new Date() },
      { path: path.join(rootPath, 'observation.fhirpath'), size: 2048, lastModified: new Date() },
      { path: path.join(rootPath, 'bundle.json'), size: 4096, lastModified: new Date() }
    ];

    for (const file of simulatedFiles) {
      this.fileIndex.set(file.path, file);
      metrics.fileCount++;
      metrics.totalSize += file.size;
      
      const ext = path.extname(file.path);
      metrics.fileTypeDistribution.set(ext, (metrics.fileTypeDistribution.get(ext) || 0) + 1);
    }

    metrics.averageFileSize = metrics.fileCount > 0 ? metrics.totalSize / metrics.fileCount : 0;
    metrics.largestFiles = Array.from(this.fileIndex.values())
      .sort((a, b) => b.size - a.size)
      .slice(0, 10);

    this.emit('analysisComplete', metrics);
    return metrics;
  }

  getOptimizationStrategies(metrics: WorkspaceMetrics): OptimizationStrategy[] {
    const strategies: OptimizationStrategy[] = [];

    // Large workspace strategy
    if (metrics.fileCount > this.options.maxFilesToIndex) {
      strategies.push({
        name: 'Selective Indexing',
        description: `Index only priority files (${this.options.priorityPatterns.join(', ')})`,
        apply: async () => this.applySelectiveIndexing()
      });
    }

    // Large files strategy
    if (metrics.largestFiles.some(f => f.size > this.options.maxFileSize)) {
      strategies.push({
        name: 'Large File Handling',
        description: 'Skip indexing files larger than 1MB',
        apply: async () => this.applyLargeFileHandling()
      });
    }

    // Memory optimization strategy
    if (metrics.totalSize > 50 * 1024 * 1024) { // 50MB
      strategies.push({
        name: 'Memory Optimization',
        description: 'Enable aggressive caching and lazy loading',
        apply: async () => this.applyMemoryOptimization()
      });
    }

    return strategies;
  }

  async optimizeWorkspace(rootPath: string): Promise<void> {
    if (this.isOptimizing) {
      throw new Error('Optimization already in progress');
    }

    this.isOptimizing = true;
    this.emit('optimizationStart');

    try {
      const metrics = await this.analyzeWorkspace(rootPath);
      const strategies = this.getOptimizationStrategies(metrics);

      for (const strategy of strategies) {
        this.emit('strategyStart', strategy.name);
        await strategy.apply();
        this.emit('strategyComplete', strategy.name);
      }

      this.emit('optimizationComplete', { metrics, strategiesApplied: strategies.length });
    } finally {
      this.isOptimizing = false;
    }
  }

  shouldIndexFile(filePath: string): boolean {
    // Check exclude patterns
    for (const pattern of this.options.excludePatterns) {
      if (this.matchesPattern(filePath, pattern)) {
        return false;
      }
    }

    // Check include patterns
    let shouldInclude = false;
    for (const pattern of this.options.includePatterns) {
      if (this.matchesPattern(filePath, pattern)) {
        shouldInclude = true;
        break;
      }
    }

    if (!shouldInclude) {
      return false;
    }

    // Check file size
    const fileInfo = this.fileIndex.get(filePath);
    if (fileInfo && fileInfo.size > this.options.maxFileSize) {
      return false;
    }

    return true;
  }

  isPriorityFile(filePath: string): boolean {
    if (this.priorityFiles.has(filePath)) {
      return true;
    }

    for (const pattern of this.options.priorityPatterns) {
      if (this.matchesPattern(filePath, pattern)) {
        this.priorityFiles.add(filePath);
        return true;
      }
    }

    return false;
  }

  getIndexingOrder(files: string[]): string[] {
    return files.sort((a, b) => {
      // Priority files first
      const aPriority = this.isPriorityFile(a);
      const bPriority = this.isPriorityFile(b);
      
      if (aPriority && !bPriority) return -1;
      if (!aPriority && bPriority) return 1;

      // Then by size (smaller first)
      const aInfo = this.fileIndex.get(a);
      const bInfo = this.fileIndex.get(b);
      
      if (aInfo && bInfo) {
        return aInfo.size - bInfo.size;
      }

      return 0;
    });
  }

  private async applySelectiveIndexing(): Promise<void> {
    // Implementation would configure the indexer to only process priority files
    this.emit('log', 'Applying selective indexing strategy');
  }

  private async applyLargeFileHandling(): Promise<void> {
    // Implementation would configure the indexer to skip large files
    this.emit('log', 'Applying large file handling strategy');
  }

  private async applyMemoryOptimization(): Promise<void> {
    // Implementation would configure memory settings
    this.emit('log', 'Applying memory optimization strategy');
  }

  private matchesPattern(filePath: string, pattern: string): boolean {
    // Simple pattern matching - in real implementation would use glob
    if (pattern.includes('**')) {
      const simplePattern = pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
      const regex = new RegExp(simplePattern);
      return regex.test(filePath);
    }
    
    return filePath.includes(pattern.replace(/\*/g, ''));
  }
}

// Workspace size categories
export enum WorkspaceSizeCategory {
  Small = 'small',      // < 100 files
  Medium = 'medium',    // 100-1000 files
  Large = 'large',      // 1000-5000 files
  ExtraLarge = 'xlarge' // > 5000 files
}

export function categorizeWorkspace(fileCount: number): WorkspaceSizeCategory {
  if (fileCount < 100) return WorkspaceSizeCategory.Small;
  if (fileCount < 1000) return WorkspaceSizeCategory.Medium;
  if (fileCount < 5000) return WorkspaceSizeCategory.Large;
  return WorkspaceSizeCategory.ExtraLarge;
}

export function getOptimizationSettings(category: WorkspaceSizeCategory): WorkspaceOptimizationOptions {
  switch (category) {
    case WorkspaceSizeCategory.Small:
      return {
        maxFilesToIndex: 1000,
        maxFileSize: 5 * 1024 * 1024 // 5MB
      };
    case WorkspaceSizeCategory.Medium:
      return {
        maxFilesToIndex: 2000,
        maxFileSize: 2 * 1024 * 1024 // 2MB
      };
    case WorkspaceSizeCategory.Large:
      return {
        maxFilesToIndex: 3000,
        maxFileSize: 1024 * 1024 // 1MB
      };
    case WorkspaceSizeCategory.ExtraLarge:
      return {
        maxFilesToIndex: 1000,
        maxFileSize: 512 * 1024, // 512KB
        priorityPatterns: ['**/*.fhirpath'] // Only FHIRPath files
      };
  }
}