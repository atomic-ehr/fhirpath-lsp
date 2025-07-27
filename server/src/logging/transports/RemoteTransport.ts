/**
 * Remote transport for sending logs to external services
 */

import { ILogTransport, LogEntry, LogLevel, ILogFormatter } from '../types';
import { JSONFormatter } from '../formatters/JSONFormatter';

export class RemoteTransport implements ILogTransport {
  readonly name: string;
  level: LogLevel;
  enabled: boolean;
  private formatter: ILogFormatter;
  private endpoint: string;
  private apiKey?: string;
  private batchSize: number;
  private flushInterval: number;
  private timeout: number;
  private retries: number;
  private batch: LogEntry[] = [];
  private flushTimer?: NodeJS.Timeout;
  private isFlushing: boolean = false;

  constructor(options: RemoteTransportOptions) {
    this.name = options.name || 'remote';
    this.level = options.level ?? LogLevel.INFO;
    this.enabled = options.enabled ?? true;
    this.formatter = options.formatter || new JSONFormatter();
    this.endpoint = options.endpoint;
    this.apiKey = options.apiKey;
    this.batchSize = options.batchSize || 100;
    this.flushInterval = options.flushInterval || 5000; // 5 seconds
    this.timeout = options.timeout || 10000; // 10 seconds
    this.retries = options.retries || 3;

    this.startFlushTimer();
  }

  log(entry: LogEntry): void {
    if (!this.enabled || entry.level > this.level) {
      return;
    }

    this.batch.push(entry);

    if (this.batch.length >= this.batchSize) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.isFlushing || this.batch.length === 0) {
      return;
    }

    this.isFlushing = true;
    const entriesToSend = this.batch.splice(0);

    try {
      await this.sendBatch(entriesToSend);
    } catch (error) {
      console.error('RemoteTransport flush error:', error);
      // Re-add entries to the front of the batch for retry
      this.batch.unshift(...entriesToSend);
    } finally {
      this.isFlushing = false;
    }
  }

  private async sendBatch(entries: LogEntry[]): Promise<void> {
    const payload = entries.map(entry => {
      try {
        return JSON.parse(this.formatter.format(entry));
      } catch {
        // Fallback to basic format if formatter doesn't produce JSON
        return {
          timestamp: entry.timestamp.toISOString(),
          level: entry.level,
          message: entry.message,
          correlationId: entry.correlationId,
          context: entry.context,
          metadata: entry.metadata,
          error: entry.error ? {
            name: entry.error.name,
            message: entry.error.message,
            stack: entry.error.stack
          } : undefined,
          performance: entry.performance
        };
      }
    });

    const requestBody = JSON.stringify({
      logs: payload,
      metadata: {
        source: 'fhirpath-lsp',
        timestamp: new Date().toISOString(),
        count: payload.length
      }
    });

    await this.sendWithRetry(requestBody);
  }

  private async sendWithRetry(body: string, attempt: number = 1): Promise<void> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'fhirpath-lsp-logger'
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

    } catch (error) {
      if (attempt < this.retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.sendWithRetry(body, attempt + 1);
      }
      
      throw error;
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.batch.length > 0) {
        this.flush();
      }
    }, this.flushInterval);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  async close(): Promise<void> {
    this.stopFlushTimer();
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

  setEndpoint(endpoint: string): void {
    this.endpoint = endpoint;
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  setBatchSize(size: number): void {
    this.batchSize = size;
  }

  setFlushInterval(interval: number): void {
    this.flushInterval = interval;
    this.stopFlushTimer();
    this.startFlushTimer();
  }

  getStats() {
    return {
      endpoint: this.endpoint,
      batchSize: this.batchSize,
      flushInterval: this.flushInterval,
      currentBatchSize: this.batch.length,
      isFlushing: this.isFlushing,
      timeout: this.timeout,
      retries: this.retries
    };
  }
}

export interface RemoteTransportOptions {
  name?: string;
  level?: LogLevel;
  enabled?: boolean;
  formatter?: ILogFormatter;
  endpoint: string;
  apiKey?: string;
  batchSize?: number;
  flushInterval?: number;
  timeout?: number;
  retries?: number;
}