import * as yaml from 'js-yaml';
import { tokenize, parseTokens } from './tokenizer';
import { safeValidateHypernote, type Hypernote } from './schema';
import { twj } from 'tw-to-css';
import { safeValidateStyleProperties } from './style-schema';

// Debug mode can be enabled via environment variable (check if process exists for browser compatibility)
const DEBUG_MODE = typeof process !== 'undefined' && process.env?.HYPERNOTE_DEBUG === 'true';

function debugLog(message: string, data?: any) {
  if (DEBUG_MODE) {
    console.log(`[HYPERNOTE DEBUG] ${message}`);
    if (data !== undefined) {
      console.log('[HYPERNOTE DEBUG] Data:', JSON.stringify(data, null, 2));
    }
  }
}

/**
 * Converts Tailwind classes to validated CSS-in-JS object
 */
function convertTailwindToStyle(tailwindClasses: string): Record<string, any> | null {
  if (!tailwindClasses.trim()) return null;
  
  debugLog(`Converting Tailwind classes: "${tailwindClasses}"`);
  
  try {
    // Convert Tailwind to CSS-in-JS object
    const styleObject = twj(tailwindClasses);
    debugLog('Tailwind conversion result:', styleObject);
    
    // Validate against our schema for security
    const validation = safeValidateStyleProperties(styleObject);
    if (!validation.success) {
      console.warn(`Invalid style properties from Tailwind: "${tailwindClasses}"`);
      console.warn('Tailwind output:', JSON.stringify(styleObject, null, 2));
      console.warn('Validation errors:', validation.error.issues);
      return null;
    }
    
    debugLog('Style validation passed');
    return validation.data;
  } catch (error) {
    console.warn(`Failed to convert Tailwind classes: "${tailwindClasses}"`, error);
    return null;
  }
}

/**
 * Processes an element to convert class attributes to inline styles
 */
function processElementStyles(element: any): any {
  debugLog(`Processing element styles for: ${element.type}`, {
    elementId: element.elementId,
    hasAttributes: !!element.attributes,
    classAttribute: element.attributes?.class
  });
  
  // Handle class attribute conversion to inline styles
  if (element.attributes?.class) {
    debugLog(`Found class attribute: "${element.attributes.class}"`);
    const styleObject = convertTailwindToStyle(element.attributes.class);
    if (styleObject) {
      element.style = styleObject;
      debugLog('Applied inline styles:', styleObject);
    }
    
    // Remove class from attributes since it's now converted to style
    const { class: _, ...otherAttributes } = element.attributes;
    if (Object.keys(otherAttributes).length > 0) {
      element.attributes = otherAttributes;
    } else {
      delete element.attributes;
    }
  }
  
  // Recursively process child elements
  if (element.content && Array.isArray(element.content)) {
    element.content = element.content.map((item: any) => {
      if (typeof item === 'object' && item !== null) {
        return processElementStyles(item);
      }
      return item;
    });
  }
  
  // Process elements array for form, loop, if elements
  if (element.elements && Array.isArray(element.elements)) {
    element.elements = element.elements.map(processElementStyles);
  }
  
  return element;
}

/**
 * Compiles Hypernote Markdown to content object
 * @param hnmd Hypernote Markdown string
 * @returns Content object or fallback structure if validation fails
 */
export function compileHypernoteToContent(hnmd: string): Hypernote {
  debugLog('Starting compilation');
  debugLog('Input HNMD length:', hnmd.length);
  
  // Default structure with only required fields
  const result: Record<string, any> = {
    version: "1.1.0",
    component_kind: null,
    elements: [],
  };

  // Split document into frontmatter and content
  const frontmatterMatch = hnmd.match(/^---\n([\s\S]*?)\n---/);
  let content = hnmd;
  
  if (frontmatterMatch && frontmatterMatch[1]) {
    const frontmatterString = frontmatterMatch[1];
    debugLog('Found frontmatter:', frontmatterString);
    
    try {
      // Parse YAML frontmatter using js-yaml
      const frontmatter = yaml.load(frontmatterString) as Record<string, any>;
      debugLog('Parsed frontmatter:', frontmatter);
      
      // Process the frontmatter
      for (const key in frontmatter) {
        debugLog(`Processing frontmatter key: "${key}"`);
        
        if (key.startsWith('@')) {
          // Handle events - create events object if it doesn't exist
          if (!result.events) {
            result.events = {};
          }
          result.events[key] = frontmatter[key];
          debugLog(`Added event: ${key}`, frontmatter[key]);
        } else if (key === 'style') {
          // Handle root-level Tailwind style string - convert to style object
          if (typeof frontmatter.style === 'string') {
            const styleObject = convertTailwindToStyle(frontmatter.style);
            if (styleObject) {
              result.style = styleObject;
              debugLog(`Converted root style from Tailwind: "${frontmatter.style}" to object:`, styleObject);
            } else {
              console.warn(`Failed to convert root Tailwind style: "${frontmatter.style}"`);
            }
          } else {
            console.warn(`Root style must be a string (Tailwind classes), got: ${typeof frontmatter.style}`, frontmatter.style);
          }
        } else if (key.startsWith('$')) {
          // Handle queries - create queries object if it doesn't exist
          if (!result.queries) {
            result.queries = {};
          }
          result.queries[key] = frontmatter[key];
          debugLog(`Added query: ${key}`, frontmatter[key]);
        } else if (key === 'component_kind') {
          // Handle component kind
          result.component_kind = frontmatter[key];
          debugLog(`Set component_kind: ${frontmatter[key]}`);
        } else if (key.startsWith('#')) {
          // Handle imports - create imports object if it doesn't exist
          if (!result.imports) {
            result.imports = {};
          }
          result.imports[key] = frontmatter[key];
          debugLog(`Added import: ${key}`, frontmatter[key]);
        }
        // We can add more frontmatter sections here as needed
      }
      
      // Remove frontmatter from content
      content = hnmd.slice(frontmatterMatch[0].length).trim();
      debugLog('Content after frontmatter removal length:', content.length);
    } catch (error) {
      console.error('Error parsing YAML frontmatter:', error);
      console.error('Frontmatter content:', frontmatterString);
    }
  }
  
  debugLog('Tokenizing content...');
  // Tokenize and parse the markdown content
  const tokens = tokenize(content);
  debugLog(`Generated ${tokens.length} tokens`);
  
  debugLog('Parsing tokens...');
  let elements = parseTokens(tokens);
  debugLog(`Generated ${elements.length} elements before style processing`);
  
  // Process all elements to convert class attributes to inline styles
  debugLog('Processing element styles...');
  elements = elements.map(processElementStyles);
  
  result.elements = elements;
  debugLog('Final result before validation:', {
    version: result.version,
    component_kind: result.component_kind,
    hasEvents: !!result.events,
    hasQueries: !!result.queries,
    hasImports: !!result.imports,
    hasStyle: !!result.style,
    elementCount: result.elements.length
  });

  // Safely validate the result against the schema
  debugLog('Validating against schema...');
  const validation = safeValidateHypernote(result);
  
  if (validation.success) {
    debugLog('Validation successful');
    return validation.data;
  } else {
    // Enhanced error logging
    console.error('Hypernote validation failed:');
    console.error('Input HNMD:', hnmd);
    console.error('Parsed result before validation:', JSON.stringify(result, null, 2));
    console.error('Validation errors:', JSON.stringify(validation.error.issues, null, 2));
    
    // Log specific element validation failures with more context
    validation.error.issues.forEach((issue, index) => {
      // Safely navigate the path to get the actual value
      let actualValue: any = result;
      try {
        for (const key of issue.path) {
          if (typeof key === 'string' || typeof key === 'number') {
            actualValue = actualValue?.[key];
          } else {
            actualValue = `[${typeof key}]`;
            break;
          }
        }
      } catch {
        actualValue = '[unable to access]';
      }
      
      console.error(`Validation issue ${index + 1}:`, {
        path: issue.path,
        message: issue.message,
        code: issue.code,
        actualValue: actualValue,
      });
    });
    
    // Return a fallback structure that's guaranteed to be valid
    return {
      version: "1.1.0",
      component_kind: null,
      elements: [
        {
          type: "div" as const,
          content: [
            "Validation Error:",
            {
              type: "pre" as const,
              content: [JSON.stringify(validation.error.issues, null, 2)]
            }
          ]
        }
      ]
    };
  }
} 