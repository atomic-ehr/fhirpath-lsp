import { Connection } from 'vscode-languageserver';
import { FHIRPathService } from '../../parser/FHIRPathService';
import { FHIRPathFunctionRegistry } from '../../services/FHIRPathFunctionRegistry';
import { CoreProvidersPlugin } from './CoreProvidersPlugin';
import { PerformanceAnalyzerPlugin } from './PerformanceAnalyzerPlugin';
import { IPlugin } from '../interfaces/IPlugin';

/**
 * Factory function to create built-in plugins
 */
export function createBuiltinPlugins(
  connection: Connection,
  fhirPathService: FHIRPathService,
  functionRegistry: FHIRPathFunctionRegistry
): IPlugin[] {
  const plugins: IPlugin[] = [];

  // Create core providers plugin with dependencies
  const coreProviders = new CoreProvidersPlugin();
  // Inject dependencies manually for now
  (coreProviders as any).functionRegistry = functionRegistry;
  (coreProviders as any).fhirPathService = fhirPathService;
  (coreProviders as any).connection = connection;
  plugins.push(coreProviders);

  // Create performance analyzer plugin
  plugins.push(new PerformanceAnalyzerPlugin());

  return plugins;
}