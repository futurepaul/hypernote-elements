/**
 * ActionResolver - Clean variable resolution for actions
 * 
 * Key principle: Single variable = single value (no JSON wrapping)
 */

export class ActionResolver {
  /**
   * Resolve a template string with variables
   * @param template - The template string (e.g., "{$update_increment}" or "Count: {$count}")
   * @param context - The context containing variable values
   * @returns The resolved string
   */
  resolve(template: string, context: Record<string, any>): string {
    // Check if it's a single variable reference
    const singleVarMatch = template.match(/^\{([^}]+)\}$/);
    if (singleVarMatch) {
      const varPath = singleVarMatch[1].trim();
      const value = this.resolveVariable(varPath, context);
      
      // Return the raw value for single variables
      // This prevents double-escaping issues
      if (value === undefined || value === null) {
        return '';
      }
      
      // If it's already a string, return it directly
      if (typeof value === 'string') {
        return value;
      }
      
      // If it's a number or boolean, convert to string
      if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }
      
      // For objects/arrays, stringify them
      return JSON.stringify(value);
    }
    
    // For templates with multiple variables or text, do string replacement
    return template.replace(/\{([^}]+)\}/g, (match, varPath) => {
      const value = this.resolveVariable(varPath.trim(), context);
      
      if (value === undefined || value === null) {
        return '';
      }
      
      // Convert to string representation
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      
      return String(value);
    });
  }
  
  /**
   * Resolve a single variable path
   * @param path - The variable path (e.g., "$update_increment" or "form.message")
   * @param context - The context containing variable values
   * @returns The resolved value
   */
  private resolveVariable(path: string, context: Record<string, any>): any {
    // Handle special variables
    if (path === 'time.now') {
      return Date.now();
    }
    
    // Handle "or" fallback syntax (e.g., "$count or 0")
    if (path.includes(' or ')) {
      const [primary, fallback] = path.split(' or ').map(s => s.trim());
      const value = this.resolveVariable(primary, context);
      
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
      
      // Remove quotes from fallback if it's a literal
      return fallback.replace(/^["']|["']$/g, '');
    }
    
    // Direct lookup for $ variables
    if (path.startsWith('$')) {
      return context[path];
    }
    
    // Handle nested paths (e.g., "user.pubkey", "form.message")
    return this.resolvePath(context, path);
  }
  
  /**
   * Resolve a nested path in an object
   * @param obj - The object to traverse
   * @param path - The path to resolve (e.g., "user.pubkey")
   * @returns The value at the path
   */
  private resolvePath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      if (current === undefined || current === null) return undefined;
      
      // Handle array indexing (e.g., "items[0]")
      const match = key.match(/^(.+?)\[(\d+)\]$/);
      if (match) {
        const [, prop, index] = match;
        return current[prop]?.[parseInt(index)];
      }
      
      return current[key];
    }, obj);
  }
  
  /**
   * Resolve variables in a JSON object (for event.json field)
   * @param jsonObj - The JSON object with variable placeholders
   * @param context - The context containing variable values
   * @returns The resolved JSON object
   */
  resolveJson(jsonObj: any, context: Record<string, any>): any {
    if (typeof jsonObj === 'string') {
      // Check if it's a variable reference
      if (jsonObj.startsWith('{') && jsonObj.endsWith('}')) {
        const varPath = jsonObj.slice(1, -1).trim();
        return this.resolveVariable(varPath, context);
      }
      return jsonObj;
    }
    
    if (Array.isArray(jsonObj)) {
      return jsonObj.map(item => this.resolveJson(item, context));
    }
    
    if (jsonObj && typeof jsonObj === 'object') {
      const resolved: any = {};
      for (const [key, value] of Object.entries(jsonObj)) {
        resolved[key] = this.resolveJson(value, context);
      }
      return resolved;
    }
    
    return jsonObj;
  }
}