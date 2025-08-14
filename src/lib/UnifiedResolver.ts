/**
 * Unified variable resolution system for Hypernote
 * Handles all variable substitutions consistently
 */

export interface ResolutionContext {
  // Core data sources
  queryResults: Map<string, any>;      // Results from executed queries
  actionResults: Map<string, string>;  // Event IDs from published actions
  formData: Record<string, any>;       // Form input values
  loopVariables: Record<string, any>;  // Variables from loops (e.g., $item in each)
  
  // User/system context
  user: { pubkey: string | null };
  target?: any;                        // Component target context
  time: { now: number };
}

export class UnifiedResolver {
  private context: ResolutionContext;
  
  constructor(context: ResolutionContext) {
    this.context = context;
  }
  
  /**
   * Resolve any value - the main entry point
   */
  resolve(value: any): any {
    if (value === null || value === undefined) {
      return value;
    }
    
    if (typeof value === 'string') {
      return this.resolveString(value);
    }
    
    if (Array.isArray(value)) {
      return value.map(item => this.resolve(item));
    }
    
    if (typeof value === 'object') {
      const resolved: any = {};
      for (const [key, val] of Object.entries(value)) {
        resolved[key] = this.resolve(val);
      }
      return resolved;
    }
    
    return value;
  }
  
  /**
   * Resolve a string with variable substitutions
   */
  private resolveString(str: string): string {
    // Handle template expressions {variable}
    return str.replace(/\{([^}]+)\}/g, (match, expr) => {
      const resolved = this.resolveExpression(expr.trim());
      return resolved !== undefined ? String(resolved) : match;
    });
  }
  
  /**
   * Resolve a single expression (e.g., "$count", "user.pubkey", "$count or 0")
   */
  private resolveExpression(expr: string): any {
    // Handle "or" operator for default values
    if (expr.includes(' or ')) {
      const parts = expr.split(' or ').map(s => s.trim());
      for (let i = 0; i < parts.length; i++) {
        const result = this.resolveExpression(parts[i]);
        if (result !== undefined && result !== null && result !== '') {
          return result;
        }
      }
      // Return last part as default
      return parts[parts.length - 1];
    }
    
    // Query result reference ($queryName)
    if (expr.startsWith('$')) {
      const queryName = expr;
      
      // Check loop variables first (they shadow query results)
      if (this.context.loopVariables[queryName] !== undefined) {
        return this.context.loopVariables[queryName];
      }
      
      // Then check query results
      return this.context.queryResults.get(queryName);
    }
    
    // Action result reference (@actionName)
    if (expr.startsWith('@')) {
      const actionName = expr;
      return this.context.actionResults.get(actionName);
    }
    
    // Form field reference (form.fieldName)
    if (expr.startsWith('form.')) {
      const fieldName = expr.substring(5);
      return this.context.formData[fieldName];
    }
    
    // User context (user.pubkey)
    if (expr === 'user.pubkey') {
      return this.context.user.pubkey;
    }
    
    // Target context (target.field)
    if (expr.startsWith('target.')) {
      const field = expr.substring(7);
      return this.context.target?.[field];
    }
    
    // Time expressions (time.now)
    if (expr === 'time.now') {
      return this.context.time.now;
    }
    
    // Plain string or number (not a variable)
    return undefined;
  }
  
  /**
   * Check if a value has unresolved references
   */
  hasUnresolvedReferences(value: any): boolean {
    if (typeof value === 'string') {
      // Check for unresolved variables
      if (value.startsWith('@') || value.startsWith('$')) {
        const resolved = this.resolveExpression(value);
        return resolved === undefined;
      }
      
      // Check for unresolved template expressions
      const hasTemplate = /\{([^}]+)\}/.test(value);
      if (hasTemplate) {
        const resolved = this.resolveString(value);
        return resolved.includes('{') && resolved.includes('}');
      }
      
      // Check for unresolved built-in variables
      if (value === 'user.pubkey' && !this.context.user.pubkey) return true;
      if (value === 'target.pubkey' && !this.context.target?.pubkey) return true;
      if (value === 'target.id' && !this.context.target?.id) return true;
      
      return false;
    }
    
    if (Array.isArray(value)) {
      return value.some(item => this.hasUnresolvedReferences(item));
    }
    
    if (value && typeof value === 'object') {
      return Object.values(value).some(val => this.hasUnresolvedReferences(val));
    }
    
    return false;
  }
  
  /**
   * Update context with new data
   */
  updateContext(updates: Partial<ResolutionContext>): void {
    if (updates.queryResults) {
      updates.queryResults.forEach((value, key) => {
        this.context.queryResults.set(key, value);
      });
    }
    
    if (updates.actionResults) {
      updates.actionResults.forEach((value, key) => {
        this.context.actionResults.set(key, value);
      });
    }
    
    if (updates.formData) {
      Object.assign(this.context.formData, updates.formData);
    }
    
    if (updates.loopVariables) {
      Object.assign(this.context.loopVariables, updates.loopVariables);
    }
    
    if (updates.user) {
      this.context.user = updates.user;
    }
    
    if (updates.target !== undefined) {
      this.context.target = updates.target;
    }
    
    if (updates.time) {
      this.context.time = updates.time;
    }
  }
  
  /**
   * Get a snapshot of the current context
   */
  getContext(): ResolutionContext {
    return {
      ...this.context,
      queryResults: new Map(this.context.queryResults),
      actionResults: new Map(this.context.actionResults)
    };
  }
}