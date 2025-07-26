import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { ProductionServerManager, ServerState } from '../ServerManager';
import { ProductionErrorBoundary, ConsoleErrorReporter } from '../ErrorBoundary';
import { ProductionResourceMonitor } from '../ResourceMonitor';
import { ProductionHealthChecker } from '../HealthChecker';

// Mock connection
const mockConnection = {
  console: {
    log: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {})
  }
} as any;

describe('ProductionServerManager', () => {
  let serverManager: ProductionServerManager;
  let errorBoundary: ProductionErrorBoundary;
  let resourceMonitor: ProductionResourceMonitor;
  let healthChecker: ProductionHealthChecker;

  beforeEach(async () => {
    // Reset mocks
    mockConnection.console.log.mockClear();
    mockConnection.console.warn.mockClear();
    mockConnection.console.error.mockClear();

    // Create dependencies
    const errorReporter = new ConsoleErrorReporter(mockConnection);
    errorBoundary = new ProductionErrorBoundary(mockConnection, errorReporter);
    resourceMonitor = new ProductionResourceMonitor(mockConnection);
    healthChecker = new ProductionHealthChecker(mockConnection);

    // Create server manager
    serverManager = new ProductionServerManager(
      mockConnection,
      errorBoundary,
      resourceMonitor,
      healthChecker
    );
  });

  afterEach(async () => {
    // Clean up
    try {
      if (serverManager.getState() !== ServerState.STOPPED) {
        await serverManager.stop();
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('should start successfully', async () => {
    expect(serverManager.getState()).toBe(ServerState.STOPPED);
    
    await serverManager.start();
    
    expect(serverManager.getState()).toBe(ServerState.RUNNING);
    expect(mockConnection.console.log).toHaveBeenCalledWith('Starting FHIRPath Language Server...');
    expect(mockConnection.console.log).toHaveBeenCalledWith('FHIRPath Language Server started successfully');
  });

  test('should provide health information', async () => {
    await serverManager.start();
    
    const health = serverManager.getHealth();
    
    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('uptime');
    expect(health).toHaveProperty('memoryUsage');
    expect(health).toHaveProperty('cpuUsage');
    expect(health).toHaveProperty('activeConnections');
    expect(health).toHaveProperty('services');
    expect(health.status).toMatch(/healthy|degraded|unhealthy/);
  });
});