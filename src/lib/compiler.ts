import * as yaml from 'js-yaml';
import { tokenize, parseTokens } from './tokenizer';

/**
 * Compiles Hypernote Markdown to content object
 * @param hnmd Hypernote Markdown string
 * @returns Content object
 */
export function compileHypernoteToContent(hnmd: string): any {
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
    
    try {
      // Parse YAML frontmatter using js-yaml
      const frontmatter = yaml.load(frontmatterString) as Record<string, any>;
      
      // Process the frontmatter
      for (const key in frontmatter) {
        if (key.startsWith('@')) {
          // Handle events - create events object if it doesn't exist
          if (!result.events) {
            result.events = {};
          }
          result.events[key] = frontmatter[key];
        } else if (key === 'style') {
          // Handle styles - only add if not empty
          if (frontmatter.style && Object.keys(frontmatter.style).length > 0) {
            result.styles = frontmatter.style;
          }
        }
        // We can add more frontmatter sections here as needed
      }
      
      // Remove frontmatter from content
      content = hnmd.slice(frontmatterMatch[0].length).trim();
    } catch (error) {
      console.error('Error parsing YAML frontmatter:', error);
    }
  }
  
  // Tokenize and parse the markdown content
  const tokens = tokenize(content);
  result.elements = parseTokens(tokens);

  return result;
} 