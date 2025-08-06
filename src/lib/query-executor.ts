/**
 * Query Dependency Resolution and Execution System
 * 
 * This module handles:
 * 1. Detecting dependencies between queries based on variable references
 * 2. Building a dependency graph and detecting circular dependencies
 * 3. Executing queries in the correct order (topological sort)
 * 4. Managing extracted variables and passing them between queries
 */

import { NostrEvent } from './snstr/nip07';
import { applyPipeOperation } from './jq-parser';

/**
 * Represents a parsed query with its dependencies and provided variables
 */
interface QueryNode {
  name: string;
  config: any; // The raw query configuration
  dependsOn: Set<string>; // Variable names this query depends on
  provides: Set<string>; // Variable names this query provides via extraction
  requiredBy: Set<string>; // Query names that depend on this query
}

/**
 * Context for variable substitution and storage
 */
export interface QueryContext {
  // Built-in variables
  user: { pubkey: string | null };
  time: { now: number };
  
  // Extracted variables from queries (without $ prefix in storage)
  extracted: Record<string, any>;
  
  // Query results cache
  results: Map<string, NostrEvent[]>;
}

/**
 * Manages query dependencies and execution order
 */
export class QueryDependencyGraph {
  private nodes: Map<string, QueryNode> = new Map();
  private variableProviders: Map<string, string> = new Map(); // variable -> query that provides it
  
  /**
   * Add a query to the dependency graph
   */
  addQuery(name: string, config: any) {
    const node: QueryNode = {
      name,
      config,
      dependsOn: new Set(),
      provides: new Set(),
      requiredBy: new Set()
    };
    
    // Extract provided variables from pipe operations
    if (config.pipe && Array.isArray(config.pipe)) {
      for (const step of config.pipe) {
        if (step.as) {
          // Variable name stored without $ prefix
          const varName = step.as.startsWith('$') ? step.as.slice(1) : step.as;
          node.provides.add(varName);
          this.variableProviders.set(varName, name);
        }
      }
    }
    
    // Detect dependencies from variable references
    this.detectDependencies(node, config);
    
    this.nodes.set(name, node);
  }
  
  /**
   * Detect variable dependencies in a query configuration
   */
  private detectDependencies(node: QueryNode, config: any, visited = new Set<any>()) {
    if (visited.has(config)) return;
    visited.add(config);
    
    if (typeof config === 'string') {
      // Check if this is a variable reference (starts with $)
      if (config.startsWith('$')) {
        const varName = config.slice(1); // Remove $ prefix
        // Ignore if it's a query name (starts with $$)
        if (!config.startsWith('$$') && !varName.startsWith('$')) {
          node.dependsOn.add(varName);
        }
      }
    } else if (Array.isArray(config)) {
      for (const item of config) {
        this.detectDependencies(node, item, visited);
      }
    } else if (config && typeof config === 'object') {
      for (const value of Object.values(config)) {
        this.detectDependencies(node, value, visited);
      }
    }
  }
  
  /**
   * Build the complete dependency graph
   */
  buildGraph() {
    // Link queries based on variable dependencies
    for (const [queryName, node] of this.nodes) {
      for (const varName of node.dependsOn) {
        const providerQuery = this.variableProviders.get(varName);
        if (providerQuery) {
          const provider = this.nodes.get(providerQuery);
          if (provider) {
            provider.requiredBy.add(queryName);
          }
        }
      }
    }
  }
  
  /**
   * Perform topological sort to determine execution order
   * Returns query names in the order they should be executed
   */
  topologicalSort(): string[] {
    const visited = new Set<string>();
    const stack: string[] = [];
    const recursionStack = new Set<string>();
    
    const visit = (name: string) => {
      if (recursionStack.has(name)) {
        throw new Error(`Circular dependency detected involving query: ${name}`);
      }
      
      if (visited.has(name)) return;
      
      visited.add(name);
      recursionStack.add(name);
      
      const node = this.nodes.get(name);
      if (node) {
        // Visit dependencies first
        for (const varName of node.dependsOn) {
          const provider = this.variableProviders.get(varName);
          if (provider && provider !== name) {
            visit(provider);
          }
        }
      }
      
      recursionStack.delete(name);
      stack.push(name);
    };
    
    // Visit all nodes
    for (const name of this.nodes.keys()) {
      if (!visited.has(name)) {
        visit(name);
      }
    }
    
    return stack;
  }
  
  /**
   * Get missing dependencies for validation
   */
  getMissingDependencies(): Map<string, Set<string>> {
    const missing = new Map<string, Set<string>>();
    
    for (const [queryName, node] of this.nodes) {
      const missingVars = new Set<string>();
      
      for (const varName of node.dependsOn) {
        // Check if it's a built-in variable
        if (varName === 'user' || varName.startsWith('user.') ||
            varName === 'time' || varName.startsWith('time.')) {
          continue;
        }
        
        // Check if any query provides this variable
        if (!this.variableProviders.has(varName)) {
          missingVars.add(varName);
        }
      }
      
      if (missingVars.size > 0) {
        missing.set(queryName, missingVars);
      }
    }
    
    return missing;
  }
}

/**
 * Executes queries in dependency order with variable substitution
 */
export class QueryExecutor {
  private graph: QueryDependencyGraph;
  private context: QueryContext;
  private fetchEvents: (filters: any) => Promise<NostrEvent[]>;
  
  constructor(
    queries: Record<string, any>,
    context: QueryContext,
    fetchEvents: (filters: any) => Promise<NostrEvent[]>
  ) {
    this.graph = new QueryDependencyGraph();
    this.context = context;
    this.fetchEvents = fetchEvents;
    
    // Build dependency graph
    for (const [name, config] of Object.entries(queries)) {
      this.graph.addQuery(name, config);
    }
    this.graph.buildGraph();
    
    // Validate dependencies
    const missing = this.graph.getMissingDependencies();
    if (missing.size > 0) {
      console.warn('Missing dependencies:', Array.from(missing.entries()));
    }
  }
  
  /**
   * Execute all queries in dependency order
   */
  async executeAll(): Promise<Map<string, NostrEvent[]>> {
    const order = this.graph.topologicalSort();
    console.log('Query execution order:', order);
    
    for (const queryName of order) {
      await this.executeQuery(queryName);
    }
    
    return this.context.results;
  }
  
  /**
   * Execute a specific query (and its dependencies)
   */
  async executeQuery(name: string): Promise<NostrEvent[]> {
    // Check if already cached
    if (this.context.results.has(name)) {
      return this.context.results.get(name)!;
    }
    
    const node = this.graph['nodes'].get(name);
    if (!node) {
      console.error(`Query ${name} not found`);
      return [];
    }
    
    // Execute dependencies first
    for (const varName of node.dependsOn) {
      const provider = this.graph['variableProviders'].get(varName);
      if (provider && provider !== name) {
        await this.executeQuery(provider);
      }
    }
    
    // Substitute variables in query config
    const substituted = this.substituteVariables(node.config);
    
    // Extract filters and pipe from config
    const { pipe, ...filters } = substituted;
    
    // Fetch events
    console.log(`Executing query ${name} with filters:`, filters);
    const events = await this.fetchEvents(filters);
    
    // Apply pipe transformations
    let processed = events;
    if (pipe && Array.isArray(pipe)) {
      for (const step of pipe) {
        processed = applyPipeOperation(step, processed, this.context.extracted);
      }
    }
    
    // Cache results
    this.context.results.set(name, processed);
    
    return processed;
  }
  
  /**
   * Substitute variables in a value
   */
  private substituteVariables(value: any): any {
    if (typeof value === 'string') {
      // Handle user.pubkey
      if (value === 'user.pubkey') {
        return this.context.user.pubkey;
      }
      
      // Handle time.now
      if (value === 'time.now') {
        return this.context.time.now;
      }
      
      // Handle time expressions
      if (value.includes('time.now')) {
        try {
          const timeNow = this.context.time.now;
          const result = value.replace(/time\.now/g, timeNow.toString());
          // Use Function constructor instead of eval for better security
          return new Function('return ' + result)();
        } catch (e) {
          console.warn(`Failed to evaluate time expression: ${value}`);
          return value;
        }
      }
      
      // Handle variable references (starts with $)
      if (value.startsWith('$') && !value.startsWith('$$')) {
        const varName = value.slice(1);
        
        // Check extracted variables
        if (varName in this.context.extracted) {
          return this.context.extracted[varName];
        }
        
        // Check if it's a query reference (for backward compatibility)
        if (this.context.results.has(value)) {
          return this.context.results.get(value);
        }
        
        console.warn(`Variable ${value} not found in context`);
        return value;
      }
      
      return value;
    } else if (Array.isArray(value)) {
      return value.map(v => this.substituteVariables(v));
    } else if (value && typeof value === 'object') {
      const result: any = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.substituteVariables(val);
      }
      return result;
    }
    
    return value;
  }
  
  /**
   * Get extracted variables
   */
  getExtractedVariables(): Record<string, any> {
    return this.context.extracted;
  }
  
  /**
   * Get specific query results
   */
  getQueryResults(name: string): NostrEvent[] | undefined {
    return this.context.results.get(name);
  }
}