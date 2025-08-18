import * as yaml from 'js-yaml';
import { tokenize, parseTokens, TokenizerError } from './tokenizer';
import { safeValidateHypernote, type Hypernote } from './schema';
import { parseTailwindClasses } from './tailwind-parser';
import { processPipes } from './pipe-compiler';
import { nip19 } from 'nostr-tools';

// Debug mode can be enabled via environment variable (check if process exists for browser compatibility)
const DEBUG_MODE = typeof process !== 'undefined' && process.env?.HYPERNOTE_DEBUG === 'true';

// Skip validation for performance (you can flip this to false for development speed)
const ENABLE_VALIDATION = false; // Set to false to skip Zod validation

function debugLog(message: string, data?: any) {
  if (DEBUG_MODE) {
    console.log(`[HYPERNOTE DEBUG] ${message}`);
    if (data !== undefined) {
      console.log('[HYPERNOTE DEBUG] Data:', JSON.stringify(data, null, 2));
    }
  }
}

// Cache for Tailwind conversions to avoid reprocessing identical class strings
const tailwindCache = new Map<string, Record<string, any> | null>();

/**
 * Parses an naddr string into a query object
 */
function parseNaddrToQuery(naddrString: string, isComponent: boolean): any {
  try {
    const decoded = nip19.decode(naddrString);
    
    if (decoded.type === 'naddr') {
      const { identifier, pubkey, kind, relays } = decoded.data;
      
      // Create a query from the naddr components
      const query: any = {
        kinds: [kind],
        authors: [pubkey],
        "#d": [identifier],
        limit: 1
      };
      
      // Skip relay hints - let the app use its configured relays
      // if (relays && relays.length > 0) {
      //   query.relays = relays;
      // }
      
      // For component queries, automatically add the 'first' pipe to get single element
      if (isComponent) {
        query.pipe = ['first'];
      }
      
      debugLog(`Converted naddr to query:`, query);
      return query;
    } else {
      // Not an naddr, return as-is
      debugLog(`Invalid naddr format, keeping as-is`);
      return naddrString;
    }
  } catch (err) {
    // Failed to parse as naddr, return the original value
    debugLog(`Failed to parse naddr:`, err);
    return naddrString;
  }
}

/**
 * Converts Tailwind classes to CSS-in-JS object with caching
 */
function convertTailwindToStyle(tailwindClasses: string): Record<string, any> | null {
  if (!tailwindClasses.trim()) return null;
  
  // Check cache first
  if (tailwindCache.has(tailwindClasses)) {
    debugLog(`Using cached Tailwind conversion for: "${tailwindClasses}"`);
    return tailwindCache.get(tailwindClasses)!;
  }
  
  debugLog(`Converting Tailwind classes: "${tailwindClasses}"`);
  
  // Use our fast parser instead of tw-to-css + validation
  const styleObject = parseTailwindClasses(tailwindClasses);
  
  if (styleObject) {
    debugLog('Tailwind conversion result:', styleObject);
    tailwindCache.set(tailwindClasses, styleObject);
    return styleObject;
  } else {
    debugLog(`No styles generated for: "${tailwindClasses}"`);
    tailwindCache.set(tailwindClasses, null);
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
 * @param options Compiler options (strictValidation defaults to true)
 * @returns Content object or fallback structure if validation fails
 */
export function compileHypernoteToContent(hnmd: string, options?: { strictValidation?: boolean }): Hypernote {
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
          
          // Check if the value is a string that looks like an naddr
          const value = frontmatter[key];
          if (typeof value === 'string' && value.startsWith('naddr')) {
            // Convert naddr to query format
            result.queries[key] = parseNaddrToQuery(value, false);
          } else {
            result.queries[key] = value;
          }
          debugLog(`Added query: ${key}`, result.queries[key]);
        } else if (key === 'kind') {
          // Handle component kind (0 for npub input, 1 for nevent input)
          result.kind = frontmatter[key];
          debugLog(`Set kind: ${frontmatter[key]}`);
        } else if (key === 'type') {
          // Handle document type (hypernote or element)
          result.type = frontmatter[key];
          debugLog(`Set type: ${frontmatter[key]}`);
        } else if (key === 'title') {
          // Handle document title
          result.title = frontmatter[key];
          debugLog(`Set title: ${frontmatter[key]}`);
        } else if (key === 'description') {
          // Handle document description
          result.description = frontmatter[key];
          debugLog(`Set description: ${frontmatter[key]}`);
        } else if (key === 'name') {
          // Handle document name (slug for 'd' tag)
          result.name = frontmatter[key];
          debugLog(`Set name: ${frontmatter[key]}`);
        } else if (key.startsWith('#')) {
          // Handle component queries - treat them the same as data queries
          if (!result.queries) {
            result.queries = {};
          }
          
          // Check if the value is a string that looks like an naddr
          const value = frontmatter[key];
          if (typeof value === 'string' && value.startsWith('naddr')) {
            // Convert naddr to query format - for components, add 'first' pipe
            result.queries[key] = parseNaddrToQuery(value, true);
          } else {
            result.queries[key] = value;
          }
          debugLog(`Added component query: ${key}`, result.queries[key]);
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
  // Tokenize and parse the markdown content with strict validation
  const strictValidation = options?.strictValidation !== false; // Default to true
  let tokens;
  try {
    tokens = tokenize(content, strictValidation);
    debugLog(`Generated ${tokens.length} tokens`);
  } catch (error) {
    if (error instanceof TokenizerError) {
      // Re-throw with better formatting for development
      console.error(`[Hypernote Validation Error] ${error.message}`);
      throw error;
    }
    throw error;
  }
  
  debugLog('Parsing tokens...');
  let elements = parseTokens(tokens);
  debugLog(`Generated ${elements.length} elements before style processing`);
  
  // Process all elements to convert class attributes to inline styles
  debugLog('Processing element styles...');
  elements = elements.map(processElementStyles);
  
  result.elements = elements;
  debugLog('Final result before validation:', {
    version: result.version,
    kind: result.kind,
    hasEvents: !!result.events,
    hasQueries: !!result.queries,
    hasImports: !!result.imports,
    hasStyle: !!result.style,
    elementCount: result.elements.length
  });

  // Process pipes to convert compact syntax to full JSON format
  debugLog('Processing pipes...');
  const processedResult = processPipes(result);
  
  // Skip validation if disabled (for performance)
  if (!ENABLE_VALIDATION) {
    debugLog('Skipping validation (ENABLE_VALIDATION=false)');
    return processedResult as Hypernote;
  }
  
  // Safely validate the result against the schema
  debugLog('Validating against schema...');
  const validation = safeValidateHypernote(processedResult);
  
  if (validation.success) {
    debugLog('Validation successful');
    return validation.data;
  } else {
    // Enhanced error logging
    console.error('Hypernote validation failed:');
    console.error('Input HNMD:', hnmd);
    console.error('Parsed result before validation:', JSON.stringify(processedResult, null, 2));
    console.error('Validation errors:', JSON.stringify(validation.error.issues, null, 2));
    
    // Log specific element validation failures with more context
    validation.error.issues.forEach((issue, index) => {
      // Safely navigate the path to get the actual value
      let actualValue: any = processedResult;
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