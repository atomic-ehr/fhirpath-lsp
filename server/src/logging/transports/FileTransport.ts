/**
 * File transport for logging to files with rotation support
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { ILogTransport, LogEntry, LogLevel, ILogFormatter } from '../types';
import { JSONFormatter } from '../formatters/JSONFormatter';

export class FileTransport implements ILogTransport {
  readonly name: string;
  level: LogLevel;
  enabled: boolean;
  private formatter: ILogFormatter;
  private filePath: string;
  private maxSize: number;
  private maxFiles: number;
  private currentSize: number = 0;
  private writeQueue: string[] = [];
  private isWriting: boolean = false;
  private rotationInProgress: boolean = false;

  constructor(options: FileTransportOptions) {
    this.name = options.name || 'file';
    this.level = options.level ?? LogLevel.INFO;
    this.enabled = options.enabled ?? true;
    this.formatter = options.formatter || new JSONFormatter();
    this.filePath = options.filePath;
    this.maxSize = options.maxSize || 10 * 1024 * 1024; // 10MB default
    this.maxFiles = options.maxFiles || 5;

    this.ensureDirectoryExists();
    this.initializeFileSize();
  }

  async log(entry: LogEntry): Promise<void> {
    if (!this.enabled || entry.level > this.level) {
      return;
    }

    const formatted = this.formatter.format(entry) + '\n';
    this.writeQueue.push(formatted);
    
    if (!this.isWriting) {
      await this.processWriteQueue();
    }
  }

  private async processWriteQueue(): Promise<void> {
    if (this.isWriting || this.writeQueue.length === 0) {
      return;
    }

    this.isWriting = true;

    try {
      while (this.writeQueue.length > 0) {
        const entry = this.writeQueue.shift()!;
        
        // Check if rotation is needed
        if (this.shouldRotate(entry)) {
          await this.rotateFile();
        }

        await this.writeToFile(entry);
        this.currentSize += Buffer.byteLength(entry, 'utf8');
      }
    } catch (error) {
      console.error('FileTransport write error:', error);
    } finally {
      this.isWriting = false;
    }
  }

  private async writeToFile(content: string): Promise<void> {
    try {
      await fs.appendFile(this.filePath, content, 'utf8');
    } catch (error) {
      // Ensure directory exists and retry once
      await this.ensureDirectoryExists();
      await fs.appendFile(this.filePath, content, 'utf8');
    }
  }

  private shouldRotate(nextEntry: string): boolean {
    if (this.rotationInProgress) {
      return false;
    }
    
    const nextSize = this.currentSize + Buffer.byteLength(nextEntry, 'utf8');
    return nextSize > this.maxSize;
  }

  private async rotateFile(): Promise<void> {
    if (this.rotationInProgress) {
      return;
    }

    this.rotationInProgress = true;

    try {
      // Move existing files
      for (let i = this.maxFiles - 1; i > 0; i--) {
        const oldPath = `${this.filePath}.${i}`;
        const newPath = `${this.filePath}.${i + 1}`;
        
        try {
          await fs.access(oldPath);
          if (i === this.maxFiles - 1) {
            await fs.unlink(oldPath); // Delete oldest file
          } else {
            await fs.rename(oldPath, newPath);
          }
        } catch {
          // File doesn't exist, continue
        }
      }

      // Move current file to .1
      try {
        await fs.access(this.filePath);
        await fs.rename(this.filePath, `${this.filePath}.1`);
      } catch {
        // Current file doesn't exist, continue
      }

      this.currentSize = 0;
    } catch (error) {
      console.error('File rotation error:', error);
    } finally {
      this.rotationInProgress = false;
    }
  }

  private async ensureDirectoryExists(): Promise<void> {
    try {
      const dir = dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      console.error('Error creating log directory:', error);
    }
  }

  private async initializeFileSize(): Promise<void> {
    try {
      const stats = await fs.stat(this.filePath);
      this.currentSize = stats.size;
    } catch {
      this.currentSize = 0;
    }
  }

  async flush(): Promise<void> {
    while (this.writeQueue.length > 0 || this.isWriting) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  async close(): Promise<void> {
    await this.flush();
  }

  setFormatter(formatter: ILogFormatter): void {
    this.formatter = formatter;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  getFilePath(): string {
    return this.filePath;
  }

  getCurrentSize(): number {
    return this.currentSize;
  }

  getStats() {
    return {
      filePath: this.filePath,
      currentSize: this.currentSize,
      maxSize: this.maxSize,
      maxFiles: this.maxFiles,
      queueLength: this.writeQueue.length,
      isWriting: this.isWriting,
      rotationInProgress: this.rotationInProgress
    };
  }
}

export interface FileTransportOptions {
  name?: string;
  level?: LogLevel;
  enabled?: boolean;
  formatter?: ILogFormatter;
  filePath: string;
  maxSize?: number;
  maxFiles?: number;
}