/**
 * Unified pipe processor for transforming data
 * Implements all pipe operations defined in pipe-schema.ts
 */

import type { PipeOperation } from './pipe-schema';

/**
 * Apply a series of pipe operations to transform data
 */
export function applyPipes(data: any, pipes?: PipeOperation[]): any {
  if (!pipes || pipes.length === 0) {
    return data;
  }

  let current = data;
  const savedValues: Record<string, any> = {};

  for (const pipe of pipes) {
    switch (pipe.op) {
      // Array operations
      case 'first':
        current = Array.isArray(current) ? current[0] : current;
        break;
        
      case 'last':
        current = Array.isArray(current) ? current[current.length - 1] : current;
        break;
        
      case 'reverse':
        current = Array.isArray(current) ? [...current].reverse() : current;
        break;
        
      case 'unique':
        current = Array.isArray(current) 
          ? [...new Set(current)]
          : current;
        break;
        
      case 'flatten':
        current = Array.isArray(current) 
          ? current.flat()
          : current;
        break;
        
      case 'compact':
        current = Array.isArray(current)
          ? current.filter(x => x != null)
          : current;
        break;

      // Object operations
      case 'get':
        current = current?.[pipe.field];
        break;
        
      case 'pluck':
        current = Array.isArray(current)
          ? current.map(item => item?.[pipe.field])
          : current?.[pipe.field];
        break;
        
      case 'keys':
        current = typeof current === 'object' && current !== null
          ? Object.keys(current)
          : [];
        break;
        
      case 'values':
        current = typeof current === 'object' && current !== null
          ? Object.values(current)
          : [];
        break;

      // JSON operations
      case 'json':
        try {
          current = typeof current === 'string' ? JSON.parse(current) : current;
        } catch (e) {
          console.warn('Failed to parse JSON:', e);
          current = null;
        }
        break;

      // Value operations
      case 'default':
        current = current ?? pipe.value;
        break;
        
      case 'defaults':
        // Apply defaults to object properties
        if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
          current = { ...pipe.value, ...current };
        } else if (current == null) {
          current = pipe.value;
        }
        break;
        
      case 'limit':
      case 'take':
        current = Array.isArray(current) 
          ? current.slice(0, pipe.count)
          : current;
        break;
        
      case 'drop':
        current = Array.isArray(current)
          ? current.slice(pipe.count)
          : current;
        break;

      // Math operations
      case 'sum':
        current = Array.isArray(current)
          ? current.reduce((a, b) => Number(a) + Number(b), 0)
          : Number(current);
        break;
        
      case 'min':
        current = Array.isArray(current)
          ? Math.min(...current.map(Number))
          : Number(current);
        break;
        
      case 'max':
        current = Array.isArray(current)
          ? Math.max(...current.map(Number))
          : Number(current);
        break;
        
      case 'average':
        if (Array.isArray(current) && current.length > 0) {
          const sum = current.reduce((a, b) => Number(a) + Number(b), 0);
          current = sum / current.length;
        } else {
          current = Number(current);
        }
        break;
        
      case 'add':
        current = Number(current) + pipe.value;
        break;
        
      case 'multiply':
        current = Number(current) * pipe.value;
        break;

      // Filter operations
      case 'filter':
        if (Array.isArray(current)) {
          current = current.filter(item => {
            const value = item?.[pipe.field];
            if ('eq' in pipe && pipe.eq !== undefined) return value === pipe.eq;
            if ('neq' in pipe && pipe.neq !== undefined) return value !== pipe.neq;
            if ('gt' in pipe && pipe.gt !== undefined) return value > pipe.gt;
            if ('lt' in pipe && pipe.lt !== undefined) return value < pipe.lt;
            if ('gte' in pipe && pipe.gte !== undefined) return value >= pipe.gte;
            if ('lte' in pipe && pipe.lte !== undefined) return value <= pipe.lte;
            if ('contains' in pipe && pipe.contains !== undefined) {
              return String(value).includes(pipe.contains);
            }
            return true;
          });
        }
        break;
        
      case 'where':
        if (Array.isArray(current)) {
          // Simple expression evaluator
          current = current.filter(item => {
            try {
              // Parse simple expressions like "kind == 1"
              const [field, op, value] = pipe.expression.split(/\s+/);
              const itemValue = item?.[field];
              const compareValue = isNaN(Number(value)) ? value : Number(value);
              
              switch (op) {
                case '==':
                case '===':
                  return itemValue === compareValue;
                case '!=':
                case '!==':
                  return itemValue !== compareValue;
                case '>':
                  return itemValue > compareValue;
                case '<':
                  return itemValue < compareValue;
                case '>=':
                  return itemValue >= compareValue;
                case '<=':
                  return itemValue <= compareValue;
                default:
                  return false;
              }
            } catch (e) {
              console.warn('Failed to evaluate where expression:', pipe.expression);
              return false;
            }
          });
        }
        break;

      // Sort operation
      case 'sort':
        if (Array.isArray(current)) {
          const sorted = [...current];
          sorted.sort((a, b) => {
            const aVal = pipe.by ? a?.[pipe.by] : a;
            const bVal = pipe.by ? b?.[pipe.by] : b;
            
            if (aVal < bVal) return pipe.order === 'desc' ? 1 : -1;
            if (aVal > bVal) return pipe.order === 'desc' ? -1 : 1;
            return 0;
          });
          current = sorted;
        }
        break;

      // Nostr-specific operations
      case 'filterTag':
        if (Array.isArray(current)) {
          current = current.filter(event => {
            if (!event.tags || !Array.isArray(event.tags)) return false;
            
            return event.tags.some(tag => {
              if (!Array.isArray(tag) || tag[0] !== pipe.tag) return false;
              
              // If no value specified or "*", match any tag with this name
              if (!pipe.value || pipe.value === '*') return true;
              
              // Otherwise match specific value
              return tag[1] === pipe.value;
            });
          });
        }
        break;
        
      case 'pluckTag':
        if (current?.tags && Array.isArray(current.tags)) {
          const tag = current.tags.find(t => Array.isArray(t) && t[0] === pipe.tag);
          current = tag ? tag[pipe.index + 1] : null; // +1 to skip tag name
        } else {
          current = null;
        }
        break;
        
      case 'whereIndex':
        if (Array.isArray(current)) {
          current = current.filter(item => {
            if (Array.isArray(item)) {
              return item[pipe.index] === pipe.eq;
            }
            return false;
          });
        }
        break;
        
      case 'pluckIndex':
        if (Array.isArray(current)) {
          current = current.map(item => 
            Array.isArray(item) ? item[pipe.index] : null
          );
        } else if (Array.isArray(current)) {
          current = current[pipe.index];
        }
        break;

      // String operations
      case 'trim':
        current = typeof current === 'string' ? current.trim() : String(current).trim();
        break;
        
      case 'lowercase':
        current = typeof current === 'string' ? current.toLowerCase() : String(current).toLowerCase();
        break;
        
      case 'uppercase':
        current = typeof current === 'string' ? current.toUpperCase() : String(current).toUpperCase();
        break;
        
      case 'split':
        current = typeof current === 'string' ? current.split(pipe.separator) : [current];
        break;
        
      case 'join':
        current = Array.isArray(current) ? current.join(pipe.separator) : String(current);
        break;
        
      case 'replace':
        current = typeof current === 'string' 
          ? current.replace(new RegExp(pipe.from, 'g'), pipe.to)
          : String(current).replace(new RegExp(pipe.from, 'g'), pipe.to);
        break;

      // Advanced object operations
      case 'merge':
        if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
          current = { ...current, ...pipe.with };
        }
        break;
        
      case 'pick':
        if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
          const picked: Record<string, any> = {};
          for (const field of pipe.fields) {
            if (field in current) {
              picked[field] = current[field];
            }
          }
          current = picked;
        }
        break;
        
      case 'omit':
        if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
          const { ...omitted } = current;
          for (const field of pipe.fields) {
            delete omitted[field];
          }
          current = omitted;
        }
        break;

      // Map operation (recursive)
      case 'map':
        if (Array.isArray(current)) {
          current = current.map(item => applyPipes(item, pipe.pipe));
        }
        break;

      // Save operation
      case 'save':
        savedValues[pipe.as] = current;
        // Continue with current value
        break;

      default:
        console.warn(`Unknown pipe operation: ${(pipe as any).op}`);
    }
  }

  // If we have saved values, merge them with the final result
  if (Object.keys(savedValues).length > 0) {
    // If current is an object, merge saved values
    if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
      return { ...current, ...savedValues };
    }
    // Otherwise return object with saved values and _result
    return { ...savedValues, _result: current };
  }

  return current;
}

/**
 * Helper to extract variables used in a template string
 */
export function extractVariables(template: string): string[] {
  const variables: string[] = [];
  const regex = /\{([^}]+)\}/g;
  let match;
  
  while ((match = regex.exec(template)) !== null) {
    const varPath = match[1].trim();
    // Handle "or" syntax
    const [primary] = varPath.split(' or ');
    variables.push(primary.trim());
  }
  
  return [...new Set(variables)]; // Remove duplicates
}

/**
 * Resolve a variable path in the context
 */
export function resolvePath(context: Record<string, any>, path: string): any {
  const parts = path.split('.');
  let current = context;
  
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  
  return current;
}

/**
 * Resolve variables in a template string
 */
export function resolveVariables(
  template: string, 
  context: Record<string, any>
): string {
  if (typeof template !== 'string') {
    return String(template);
  }
  
  return template.replace(/\{([^}]+)\}/g, (match, varPath) => {
    const trimmed = varPath.trim();
    
    // Handle "or" syntax for fallback values
    if (trimmed.includes(' or ')) {
      const [primary, fallback] = trimmed.split(' or ').map(s => s.trim());
      const value = resolvePath(context, primary);
      
      if (value !== undefined && value !== null && value !== '') {
        return String(value);
      }
      
      // Use fallback (remove quotes if present)
      return fallback.replace(/^["']|["']$/g, '');
    }
    
    // Simple variable resolution
    const value = resolvePath(context, trimmed);
    return value !== undefined && value !== null ? String(value) : '';
  });
}

/**
 * Resolve variables in an object (recursive)
 */
export function resolveObjectVariables(
  obj: any,
  context: Record<string, any>
): any {
  if (typeof obj === 'string') {
    return resolveVariables(obj, context);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => resolveObjectVariables(item, context));
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const resolved: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      resolved[key] = resolveObjectVariables(value, context);
    }
    return resolved;
  }
  
  return obj;
}