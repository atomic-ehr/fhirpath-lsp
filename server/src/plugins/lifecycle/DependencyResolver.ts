import { PluginManifest, PluginDependency } from '../interfaces/IPlugin';

/**
 * Dependency resolution result
 */
export interface DependencyResolution {
  success: boolean;
  order: string[]; // Plugin IDs in load order
  errors: string[];
  missingDependencies: Map<string, string[]>; // pluginId -> missing deps
  circularDependencies: string[][]; // cycles found
}

/**
 * Plugin dependency resolver using topological sort
 */
export class DependencyResolver {
  /**
   * Resolve dependencies for a set of plugins
   */
  async resolve(manifests: PluginManifest[]): Promise<DependencyResolution> {
    const resolution: DependencyResolution = {
      success: true,
      order: [],
      errors: [],
      missingDependencies: new Map(),
      circularDependencies: []
    };

    // Build plugin map
    const pluginMap = new Map<string, PluginManifest>();
    for (const manifest of manifests) {
      pluginMap.set(manifest.id, manifest);
    }

    // Check for missing dependencies
    for (const manifest of manifests) {
      const missing = this.findMissingDependencies(manifest, pluginMap);
      if (missing.length > 0) {
        resolution.missingDependencies.set(manifest.id, missing);
        resolution.errors.push(`Plugin ${manifest.id} has missing dependencies: ${missing.join(', ')}`);
        resolution.success = false;
      }
    }

    // If there are missing required dependencies, fail early
    if (!resolution.success && this.hasMissingRequiredDependencies(resolution.missingDependencies, manifests)) {
      return resolution;
    }

    // Build dependency graph
    const graph = this.buildDependencyGraph(manifests, pluginMap);

    // Check for circular dependencies
    const cycles = this.findCycles(graph);
    if (cycles.length > 0) {
      resolution.circularDependencies = cycles;
      resolution.errors.push(`Circular dependencies detected: ${cycles.map(c => c.join(' -> ')).join(', ')}`);
      resolution.success = false;
      return resolution;
    }

    // Perform topological sort
    try {
      resolution.order = this.topologicalSort(graph);
    } catch (error) {
      resolution.errors.push(`Failed to resolve dependencies: ${error}`);
      resolution.success = false;
    }

    return resolution;
  }

  /**
   * Find missing dependencies for a plugin
   */
  private findMissingDependencies(
    manifest: PluginManifest,
    pluginMap: Map<string, PluginManifest>
  ): string[] {
    const missing: string[] = [];

    if (!manifest.dependencies) {
      return missing;
    }

    for (const dep of manifest.dependencies) {
      if (!pluginMap.has(dep.id)) {
        missing.push(dep.id);
      }
    }

    return missing;
  }

  /**
   * Check if there are missing required dependencies
   */
  private hasMissingRequiredDependencies(
    missingDeps: Map<string, string[]>,
    manifests: PluginManifest[]
  ): boolean {
    for (const manifest of manifests) {
      const missing = missingDeps.get(manifest.id);
      if (!missing || missing.length === 0) {
        continue;
      }

      if (!manifest.dependencies) {
        continue;
      }

      // Check if any missing dependency is required (not optional)
      for (const dep of manifest.dependencies) {
        if (missing.includes(dep.id) && !dep.optional) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Build dependency graph
   */
  private buildDependencyGraph(
    manifests: PluginManifest[],
    pluginMap: Map<string, PluginManifest>
  ): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();

    // Initialize graph nodes
    for (const manifest of manifests) {
      graph.set(manifest.id, new Set());
    }

    // Add edges for dependencies
    for (const manifest of manifests) {
      if (!manifest.dependencies) {
        continue;
      }

      const node = graph.get(manifest.id)!;
      for (const dep of manifest.dependencies) {
        // Only add edge if dependency exists and is not optional
        if (pluginMap.has(dep.id) && !dep.optional) {
          node.add(dep.id);
        }
      }
    }

    return graph;
  }

  /**
   * Find cycles in dependency graph using DFS
   */
  private findCycles(graph: Map<string, Set<string>>): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string): void => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const neighbors = graph.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (recursionStack.has(neighbor)) {
          // Found a cycle
          const cycleStart = path.indexOf(neighbor);
          const cycle = path.slice(cycleStart);
          cycle.push(neighbor); // Complete the cycle
          cycles.push(cycle);
        }
      }

      path.pop();
      recursionStack.delete(node);
    };

    // Run DFS from each unvisited node
    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return cycles;
  }

  /**
   * Perform topological sort using Kahn's algorithm
   */
  private topologicalSort(graph: Map<string, Set<string>>): string[] {
    const result: string[] = [];
    const inDegree = new Map<string, number>();

    // Calculate in-degrees
    for (const node of graph.keys()) {
      inDegree.set(node, 0);
    }

    for (const [_, neighbors] of graph) {
      for (const neighbor of neighbors) {
        inDegree.set(neighbor, (inDegree.get(neighbor) || 0) + 1);
      }
    }

    // Find nodes with no incoming edges
    const queue: string[] = [];
    for (const [node, degree] of inDegree) {
      if (degree === 0) {
        queue.push(node);
      }
    }

    // Process nodes
    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);

      // Reduce in-degree for neighbors
      const neighbors = graph.get(node) || new Set();
      for (const neighbor of neighbors) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);

        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // Check if all nodes were processed
    if (result.length !== graph.size) {
      throw new Error('Graph has cycles or disconnected components');
    }

    return result;
  }

  /**
   * Check version compatibility
   */
  checkVersionCompatibility(required: string, provided: string): boolean {
    // Simple version comparison for now
    // TODO: Implement proper semver comparison
    return true;
  }
}