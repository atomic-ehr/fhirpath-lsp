export interface ThrottleStatus {
  isThrottling: boolean;
  requestCounts: Map<string, number>;
  throttleReasons: string[];
}

export interface ThrottleConfig {
  requestType: string;
  limit: number;
  windowMs: number;
}

export interface RequestThrottler {
  shouldThrottle(requestType: string): boolean;
  recordRequest(requestType: string): void;
  getThrottleStatus(): ThrottleStatus;
  updateLimits(configs: ThrottleConfig[]): void;
}

export class AdaptiveRequestThrottler implements RequestThrottler {
  private requestCounts = new Map<string, number[]>();
  private requestLimits = new Map<string, number>();
  private windowSize = 1000; // 1 second default
  private adaptiveEnabled = true;
  private loadFactor = 1.0;

  constructor(configs?: ThrottleConfig[]) {
    // Set default limits
    this.requestLimits.set('completion', 10);
    this.requestLimits.set('diagnostic', 5);
    this.requestLimits.set('hover', 20);
    this.requestLimits.set('definition', 10);
    this.requestLimits.set('references', 5);
    this.requestLimits.set('semanticTokens', 3);
    this.requestLimits.set('documentSymbol', 5);
    this.requestLimits.set('codeAction', 10);

    // Apply custom configs if provided
    if (configs) {
      this.updateLimits(configs);
    }

    // Start adaptive adjustment
    if (this.adaptiveEnabled) {
      this.startAdaptiveAdjustment();
    }
  }

  shouldThrottle(requestType: string): boolean {
    const count = this.getCurrentCount(requestType);
    const limit = this.getAdjustedLimit(requestType);
    
    return count >= limit;
  }

  recordRequest(requestType: string): void {
    const now = Date.now();
    const requests = this.requestCounts.get(requestType) || [];
    
    // Add new request timestamp
    requests.push(now);
    
    // Remove old requests outside the window
    const cutoff = now - this.windowSize;
    const filtered = requests.filter(timestamp => timestamp > cutoff);
    
    this.requestCounts.set(requestType, filtered);
  }

  getThrottleStatus(): ThrottleStatus {
    const throttleReasons: string[] = [];
    let isThrottling = false;

    for (const [type] of this.requestCounts) {
      const count = this.getCurrentCount(type);
      const limit = this.getAdjustedLimit(type);
      
      if (count >= limit) {
        isThrottling = true;
        throttleReasons.push(`${type}: ${count}/${limit}`);
      }
    }

    const requestCounts = new Map<string, number>();
    for (const [type] of this.requestCounts) {
      requestCounts.set(type, this.getCurrentCount(type));
    }

    return {
      isThrottling,
      requestCounts,
      throttleReasons
    };
  }

  updateLimits(configs: ThrottleConfig[]): void {
    for (const config of configs) {
      this.requestLimits.set(config.requestType, config.limit);
      if (config.windowMs) {
        this.windowSize = config.windowMs;
      }
    }
  }

  private getCurrentCount(requestType: string): number {
    const requests = this.requestCounts.get(requestType) || [];
    const now = Date.now();
    const cutoff = now - this.windowSize;
    
    return requests.filter(timestamp => timestamp > cutoff).length;
  }

  private getAdjustedLimit(requestType: string): number {
    const baseLimit = this.requestLimits.get(requestType) || 100;
    return Math.floor(baseLimit * this.loadFactor);
  }

  private startAdaptiveAdjustment(): void {
    setInterval(() => {
      this.adjustLoadFactor();
    }, 5000); // Adjust every 5 seconds
  }

  private adjustLoadFactor(): void {
    // Calculate current system load
    const memoryUsage = process.memoryUsage();
    const memoryPressure = memoryUsage.heapUsed / memoryUsage.heapTotal;
    
    // Count total requests across all types
    let totalRequests = 0;
    for (const [type] of this.requestCounts) {
      totalRequests += this.getCurrentCount(type);
    }

    // Adjust load factor based on system state
    if (memoryPressure > 0.8) {
      // High memory pressure - reduce limits
      this.loadFactor = Math.max(0.5, this.loadFactor - 0.1);
    } else if (memoryPressure < 0.5 && totalRequests < 10) {
      // Low load - increase limits
      this.loadFactor = Math.min(1.5, this.loadFactor + 0.1);
    } else {
      // Normal load - gradually return to baseline
      if (this.loadFactor < 1.0) {
        this.loadFactor = Math.min(1.0, this.loadFactor + 0.05);
      } else if (this.loadFactor > 1.0) {
        this.loadFactor = Math.max(1.0, this.loadFactor - 0.05);
      }
    }
  }
}

export class RequestDebouncer<T extends (...args: any[]) => any> {
  private timeout: NodeJS.Timeout | null = null;
  private lastArgs: Parameters<T> | null = null;
  private pendingPromise: Promise<ReturnType<T>> | null = null;
  private resolvePromise: ((value: ReturnType<T>) => void) | null = null;
  private rejectPromise: ((reason: any) => void) | null = null;

  constructor(
    private func: T,
    private wait: number,
    private options: {
      leading?: boolean;
      trailing?: boolean;
      maxWait?: number;
    } = {}
  ) {
    this.options = {
      leading: false,
      trailing: true,
      ...options
    };
  }

  debounced(...args: Parameters<T>): Promise<ReturnType<T>> {
    this.lastArgs = args;

    if (!this.pendingPromise) {
      this.pendingPromise = new Promise((resolve, reject) => {
        this.resolvePromise = resolve;
        this.rejectPromise = reject;
      });
    }

    const callNow = this.options.leading && !this.timeout;

    if (this.timeout) {
      clearTimeout(this.timeout);
    }

    this.timeout = setTimeout(() => {
      this.timeout = null;
      if (this.options.trailing && this.lastArgs) {
        this.execute();
      } else {
        this.clearPending();
      }
    }, this.wait);

    if (callNow) {
      this.execute();
    }

    return this.pendingPromise;
  }

  cancel(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.clearPending();
  }

  flush(): Promise<ReturnType<T>> | undefined {
    if (this.timeout && this.lastArgs) {
      clearTimeout(this.timeout);
      this.timeout = null;
      this.execute();
      return this.pendingPromise || undefined;
    }
    return undefined;
  }

  private async execute(): Promise<void> {
    if (!this.lastArgs || !this.resolvePromise || !this.rejectPromise) {
      return;
    }

    const args = this.lastArgs;
    const resolve = this.resolvePromise;
    const reject = this.rejectPromise;
    
    // Clear state before execution
    this.clearPending();

    try {
      const result = await this.func(...args);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  }

  private clearPending(): void {
    this.pendingPromise = null;
    this.resolvePromise = null;
    this.rejectPromise = null;
    this.lastArgs = null;
  }
}

// Factory function for creating debounced methods
export function createDebouncedMethod<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  options?: {
    leading?: boolean;
    trailing?: boolean;
    maxWait?: number;
  }
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  const debouncer = new RequestDebouncer(func, wait, options);
  return (...args: Parameters<T>) => debouncer.debounced(...args);
}

// Request queue with priority support
export class PriorityRequestQueue<T> {
  private queue: Array<{
    request: () => Promise<T>;
    priority: number;
    resolve: (value: T) => void;
    reject: (reason: any) => void;
  }> = [];
  private processing = false;
  private concurrency: number;
  private activeRequests = 0;

  constructor(concurrency: number = 1) {
    this.concurrency = concurrency;
  }

  async add(request: () => Promise<T>, priority: number = 0): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ request, priority, resolve, reject });
      this.queue.sort((a, b) => b.priority - a.priority);
      
      if (!this.processing) {
        this.process();
      }
    });
  }

  private async process(): Promise<void> {
    this.processing = true;

    while (this.queue.length > 0 && this.activeRequests < this.concurrency) {
      const item = this.queue.shift();
      if (!item) continue;

      this.activeRequests++;
      
      try {
        const result = await item.request();
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      } finally {
        this.activeRequests--;
      }
    }

    this.processing = this.queue.length > 0;
    if (this.processing) {
      // Continue processing if there are more items
      setImmediate(() => this.process());
    }
  }

  clear(): void {
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (item) {
        item.reject(new Error('Queue cleared'));
      }
    }
  }

  size(): number {
    return this.queue.length;
  }

  activeCount(): number {
    return this.activeRequests;
  }
}