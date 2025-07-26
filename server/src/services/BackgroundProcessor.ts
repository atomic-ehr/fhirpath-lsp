import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';

export interface BackgroundTask<T = any> {
  id: string;
  type: string;
  priority: number;
  data: any;
  callback?: (result: T) => void;
  errorCallback?: (error: Error) => void;
  timeout?: number;
}

export interface BackgroundWorkerMessage {
  type: 'task' | 'result' | 'error' | 'ready';
  taskId?: string;
  data?: any;
  error?: string;
}

export interface BackgroundProcessorOptions {
  maxWorkers?: number;
  taskTimeout?: number;
  idleTimeout?: number;
}

export class BackgroundProcessor extends EventEmitter {
  private workers: Worker[] = [];
  private idleWorkers: Worker[] = [];
  private taskQueue: BackgroundTask[] = [];
  private activeTasks = new Map<string, { task: BackgroundTask; worker: Worker; timer?: NodeJS.Timeout }>();
  private options: Required<BackgroundProcessorOptions>;
  private isShuttingDown = false;

  constructor(options: BackgroundProcessorOptions = {}) {
    super();
    this.options = {
      maxWorkers: options.maxWorkers || 2,
      taskTimeout: options.taskTimeout || 30000, // 30 seconds
      idleTimeout: options.idleTimeout || 60000  // 1 minute
    };
  }

  async start(): Promise<void> {
    // Create initial worker
    await this.createWorker();
  }

  async stop(): Promise<void> {
    this.isShuttingDown = true;

    // Cancel pending tasks
    while (this.taskQueue.length > 0) {
      const task = this.taskQueue.shift();
      if (task?.errorCallback) {
        task.errorCallback(new Error('Background processor shutting down'));
      }
    }

    // Terminate all workers
    const terminationPromises = this.workers.map(worker => {
      return new Promise<void>((resolve) => {
        worker.once('exit', () => resolve());
        worker.terminate();
      });
    });

    await Promise.all(terminationPromises);
    this.workers = [];
    this.idleWorkers = [];
  }

  async addTask<T>(task: Omit<BackgroundTask<T>, 'id'>): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = this.generateTaskId();
      const fullTask: BackgroundTask<T> = {
        ...task,
        id,
        callback: (result: T) => resolve(result),
        errorCallback: (error: Error) => reject(error)
      };

      this.taskQueue.push(fullTask);
      this.taskQueue.sort((a, b) => b.priority - a.priority);
      
      this.processNextTask();
    });
  }

  getQueueSize(): number {
    return this.taskQueue.length;
  }

  getActiveTaskCount(): number {
    return this.activeTasks.size;
  }

  getWorkerCount(): number {
    return this.workers.length;
  }

  private async createWorker(): Promise<Worker> {
    const workerPath = require.resolve('./BackgroundWorker');
    const worker = new Worker(workerPath);

    worker.on('message', (message: BackgroundWorkerMessage) => {
      this.handleWorkerMessage(worker, message);
    });

    worker.on('error', (error) => {
      console.error('Background worker error:', error);
      this.handleWorkerError(worker, error);
    });

    worker.on('exit', (code) => {
      this.handleWorkerExit(worker, code);
    });

    // Wait for worker to be ready
    await new Promise<void>((resolve) => {
      const readyHandler = (message: BackgroundWorkerMessage) => {
        if (message.type === 'ready') {
          worker.off('message', readyHandler);
          resolve();
        }
      };
      worker.on('message', readyHandler);
    });

    this.workers.push(worker);
    this.idleWorkers.push(worker);
    
    return worker;
  }

  private async processNextTask(): Promise<void> {
    if (this.isShuttingDown || this.taskQueue.length === 0) {
      return;
    }

    // Get an idle worker or create one if needed
    let worker = this.idleWorkers.pop();
    
    if (!worker && this.workers.length < this.options.maxWorkers) {
      try {
        worker = await this.createWorker();
        this.idleWorkers.pop(); // Remove from idle since we just created it
      } catch (error) {
        console.error('Failed to create worker:', error);
        return;
      }
    }

    if (!worker) {
      // No available workers, task will be processed when one becomes available
      return;
    }

    const task = this.taskQueue.shift();
    if (!task) {
      this.idleWorkers.push(worker);
      return;
    }

    // Set up timeout if specified
    let timeoutTimer: NodeJS.Timeout | undefined;
    if (task.timeout || this.options.taskTimeout) {
      const timeout = task.timeout || this.options.taskTimeout;
      timeoutTimer = setTimeout(() => {
        this.handleTaskTimeout(task.id);
      }, timeout);
    }

    // Track active task
    this.activeTasks.set(task.id, { task, worker, timer: timeoutTimer });

    // Send task to worker
    worker.postMessage({
      type: 'task',
      taskId: task.id,
      data: {
        type: task.type,
        data: task.data
      }
    });
  }

  private handleWorkerMessage(worker: Worker, message: BackgroundWorkerMessage): void {
    switch (message.type) {
      case 'result':
        this.handleTaskResult(message.taskId!, message.data);
        break;
      case 'error':
        this.handleTaskError(message.taskId!, new Error(message.error || 'Unknown error'));
        break;
    }
  }

  private handleTaskResult(taskId: string, result: any): void {
    const activeTask = this.activeTasks.get(taskId);
    if (!activeTask) {
      return;
    }

    // Clear timeout
    if (activeTask.timer) {
      clearTimeout(activeTask.timer);
    }

    // Remove from active tasks
    this.activeTasks.delete(taskId);

    // Return worker to idle pool
    this.idleWorkers.push(activeTask.worker);

    // Call callback
    if (activeTask.task.callback) {
      activeTask.task.callback(result);
    }

    // Emit completion event
    this.emit('taskCompleted', { taskId, result });

    // Process next task
    this.processNextTask();
  }

  private handleTaskError(taskId: string, error: Error): void {
    const activeTask = this.activeTasks.get(taskId);
    if (!activeTask) {
      return;
    }

    // Clear timeout
    if (activeTask.timer) {
      clearTimeout(activeTask.timer);
    }

    // Remove from active tasks
    this.activeTasks.delete(taskId);

    // Return worker to idle pool
    this.idleWorkers.push(activeTask.worker);

    // Call error callback
    if (activeTask.task.errorCallback) {
      activeTask.task.errorCallback(error);
    }

    // Emit error event
    this.emit('taskError', { taskId, error });

    // Process next task
    this.processNextTask();
  }

  private handleTaskTimeout(taskId: string): void {
    const activeTask = this.activeTasks.get(taskId);
    if (!activeTask) {
      return;
    }

    // Terminate the worker
    const workerIndex = this.workers.indexOf(activeTask.worker);
    if (workerIndex !== -1) {
      this.workers.splice(workerIndex, 1);
    }
    activeTask.worker.terminate();

    // Handle as error
    this.handleTaskError(taskId, new Error('Task timeout'));
  }

  private handleWorkerError(worker: Worker, error: Error): void {
    // Find any active tasks for this worker
    for (const [taskId, activeTask] of this.activeTasks) {
      if (activeTask.worker === worker) {
        this.handleTaskError(taskId, error);
      }
    }

    // Remove worker from pools
    this.removeWorker(worker);
  }

  private handleWorkerExit(worker: Worker, code: number): void {
    if (code !== 0) {
      console.error(`Worker exited with code ${code}`);
    }

    // Find any active tasks for this worker
    for (const [taskId, activeTask] of this.activeTasks) {
      if (activeTask.worker === worker) {
        this.handleTaskError(taskId, new Error(`Worker exited with code ${code}`));
      }
    }

    // Remove worker from pools
    this.removeWorker(worker);

    // Create replacement worker if needed and not shutting down
    if (!this.isShuttingDown && this.workers.length < this.options.maxWorkers) {
      this.createWorker().catch(error => {
        console.error('Failed to create replacement worker:', error);
      });
    }
  }

  private removeWorker(worker: Worker): void {
    const workerIndex = this.workers.indexOf(worker);
    if (workerIndex !== -1) {
      this.workers.splice(workerIndex, 1);
    }

    const idleIndex = this.idleWorkers.indexOf(worker);
    if (idleIndex !== -1) {
      this.idleWorkers.splice(idleIndex, 1);
    }
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

// Singleton instance
let backgroundProcessor: BackgroundProcessor | null = null;

export function getBackgroundProcessor(): BackgroundProcessor {
  if (!backgroundProcessor) {
    backgroundProcessor = new BackgroundProcessor();
  }
  return backgroundProcessor;
}

// Task types for type safety
export enum BackgroundTaskType {
  ParseDocument = 'parseDocument',
  IndexWorkspace = 'indexWorkspace',
  ValidateDocument = 'validateDocument',
  GenerateCompletions = 'generateCompletions',
  AnalyzePerformance = 'analyzePerformance'
}

export interface TaskHandlers {
  [BackgroundTaskType.ParseDocument]: (data: { content: string; uri: string }) => any;
  [BackgroundTaskType.IndexWorkspace]: (data: { rootPath: string }) => any;
  [BackgroundTaskType.ValidateDocument]: (data: { content: string; uri: string }) => any;
  [BackgroundTaskType.GenerateCompletions]: (data: { position: any; context: any }) => any;
  [BackgroundTaskType.AnalyzePerformance]: (data: { metrics: any }) => any;
}