/**
 * Token types in Hypernote Markdown
 */
export enum TokenType {
  TEXT,
  HEADING,
  FORM_START,
  FORM_END,
  ELEMENT_START,
  ELEMENT_END,
  ATTRIBUTE,
  ID_MARKER,
  NEWLINE,
  EACH_START,
  EACH_END,
  VARIABLE_REFERENCE,
  EOF
}

/**
 * Token representing a piece of the Hypernote Markdown
 */
export interface Token {
  type: TokenType;
  value: string;
  level?: number; // For headings
  attributes?: Record<string, string>; // For elements with attributes
  id?: string; // For elements with IDs
}

/**
 * Tokenizes Hypernote Markdown content
 * @param content The markdown content to tokenize
 * @returns Array of tokens
 */
export function tokenize(content: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  
  while (pos < content.length) {
    const char = content[pos];
    
    // Handle newline
    if (char === '\n') {
      tokens.push({ type: TokenType.NEWLINE, value: '\n' });
      pos++;
      continue;
    }
    
    // Handle heading (e.g., # Heading)
    if (char === '#') {
      let level = 1;
      while (content[pos + level] === '#') {
        level++;
      }
      
      // Skip the # and any space after it
      pos += level;
      if (content[pos] === ' ') pos++;
      
      let headingText = '';
      while (pos < content.length && content[pos] !== '\n') {
        headingText += content[pos];
        pos++;
      }
      
      tokens.push({ 
        type: TokenType.HEADING, 
        value: headingText.trim(), 
        level 
      });
      continue;
    }
    
    // Handle ID marker (e.g., {#id})
    if (char === '{' && content[pos + 1] === '#') {
      pos += 2; // Skip '{#'
      let id = '';
      while (pos < content.length && content[pos] !== '}') {
        id += content[pos];
        pos++;
      }
      pos++; // Skip '}'
      
      tokens.push({ 
        type: TokenType.ID_MARKER, 
        value: id,
        id
      });
      continue;
    }
    
    // Handle variable reference (e.g., {$variable})
    if (char === '{' && content[pos + 1] === '$') {
      pos += 2; // Skip '{'
      let variableName = '$';
      while (pos < content.length && content[pos] !== '}') {
        variableName += content[pos];
        pos++;
      }
      pos++; // Skip '}'
      
      tokens.push({ 
        type: TokenType.VARIABLE_REFERENCE, 
        value: variableName
      });
      continue;
    }
    
    // Handle form or element start (e.g., [form @event])
    if (char === '[') {
      pos++; // Skip '['
      let elementType = '';
      
      // Collect element type
      while (pos < content.length && content[pos] !== ' ' && content[pos] !== ']' && content[pos] !== '@') {
        elementType += content[pos];
        pos++;
      }
      
      if (elementType === 'form') {
        // Handle form with event
        if (content[pos] === ' ') pos++; // Skip space
        
        let event = '';
        if (content[pos] === '@') {
          // Include the @ in the event name
          event = '@';
          pos++; // Skip '@'
          while (pos < content.length && content[pos] !== ']' && content[pos] !== ' ') {
            event += content[pos];
            pos++;
          }
        }
        
        if (content[pos] === ']') pos++; // Skip ']'
        
        tokens.push({ 
          type: TokenType.FORM_START, 
          value: elementType,
          attributes: { event }
        });
        continue;
      } else if (elementType === 'each') {
        // Handle [each $source as $variable]
        if (content[pos] === ' ') pos++; // Skip space
        
        // Get source variable
        let source = '';
        while (pos < content.length && content[pos] !== ' ') {
          source += content[pos];
          pos++;
        }
        
        // Skip past " as "
        if (content.slice(pos, pos + 4) === ' as ') {
          pos += 4;
        }
        
        // Get iteration variable
        let variable = '';
        while (pos < content.length && content[pos] !== ']') {
          variable += content[pos];
          pos++;
        }
        
        if (content[pos] === ']') pos++; // Skip ']'
        
        tokens.push({ 
          type: TokenType.EACH_START, 
          value: elementType,
          attributes: { source, variable }
        });
        continue;
      } else {
        // Handle other elements (e.g., [button "Text"])
        let attributes: Record<string, string> = {};
        
        // Process attributes until we hit closing bracket
        while (pos < content.length && content[pos] !== ']') {
          // Skip whitespace
          if (content[pos] === ' ') {
            pos++;
            continue;
          }
          
          // Handle quoted attribute (e.g., [input "value"])
          if (content[pos] === '"') {
            pos++; // Skip opening quote
            let attributeValue = '';
            
            while (pos < content.length && content[pos] !== '"') {
              attributeValue += content[pos];
              pos++;
            }
            
            pos++; // Skip closing quote
            attributes['content'] = attributeValue;
            continue;
          } 
          
          // Handle named attribute (e.g., [input name="value"])
          let attributeName = '';
          while (pos < content.length && content[pos] !== '=' && content[pos] !== ' ' && content[pos] !== ']') {
            attributeName += content[pos];
            pos++;
          }
          
          if (attributeName && content[pos] === '=') {
            pos++; // Skip '='
            
            // Handle quoted attribute value
            if (content[pos] === '"') {
              pos++; // Skip opening quote
              let attributeValue = '';
              
              while (pos < content.length && content[pos] !== '"') {
                attributeValue += content[pos];
                pos++;
              }
              
              pos++; // Skip closing quote
              attributes[attributeName] = attributeValue;
            }
          }
        }
        
        if (content[pos] === ']') pos++; // Skip ']'
        
        tokens.push({ 
          type: TokenType.ELEMENT_START, 
          value: elementType,
          attributes
        });
        continue;
      }
    }
    
    // Handle plain text
    let text = '';
    while (pos < content.length && 
           content[pos] !== '\n' && 
           content[pos] !== '#' && 
           content[pos] !== '[' && 
           content[pos] !== '{') {
      text += content[pos];
      pos++;
    }
    
    if (text.trim()) {
      tokens.push({ type: TokenType.TEXT, value: text.trim() });
    }
    
    // If we didn't make progress, move to the next character
    if (pos < content.length && char === content[pos]) {
      pos++;
    }
  }
  
  tokens.push({ type: TokenType.EOF, value: '' });
  return tokens;
}

/**
 * Parses tokens into an elements array
 * @param tokens Array of tokens to parse
 * @returns Array of element objects
 */
export function parseTokens(tokens: Token[]): any[] {
  const elements: any[] = [];
  let currentIndex = 0;
  let currentId: string | null = null;
  
  while (currentIndex < tokens.length && tokens[currentIndex].type !== TokenType.EOF) {
    const token = tokens[currentIndex];
    
    // Handle ID marker - applies to the next element
    if (token.type === TokenType.ID_MARKER) {
      currentId = token.id;
      currentIndex++;
      continue;
    }
    
    // Handle heading
    if (token.type === TokenType.HEADING) {
      const heading = {
        type: `h${token.level}`,
        content: [token.value]
      };
      
      // Apply ID if present
      if (currentId) {
        heading['id'] = currentId;
        currentId = null;
      }
      
      elements.push(heading);
      currentIndex++;
      continue;
    }
    
    // Handle form
    if (token.type === TokenType.FORM_START) {
      const formElements: any[] = [];
      currentIndex++;
      
      // Process all elements until we're done with the form's children
      // Forms don't have an explicit end token in our simplified syntax
      // so we'll process until the next token at the same level
      while (currentIndex < tokens.length && 
             tokens[currentIndex].type !== TokenType.EOF &&
             tokens[currentIndex].type !== TokenType.FORM_END) {
        // Skip newlines
        if (tokens[currentIndex].type === TokenType.NEWLINE) {
          currentIndex++;
          continue;
        }
        
        // Process form child elements (indented)
        if (tokens[currentIndex].type === TokenType.ELEMENT_START) {
          const childElement = {
            type: tokens[currentIndex].value,
            content: tokens[currentIndex].attributes?.content ? [tokens[currentIndex].attributes.content] : [],
            attributes: { ...tokens[currentIndex].attributes }
          };
          
          // Remove content from attributes since we've moved it to the content array
          if (childElement.attributes && 'content' in childElement.attributes) {
            delete childElement.attributes.content;
          }
          
          formElements.push(childElement);
          currentIndex++;
          continue;
        }
        
        // If we encounter another major element (not indented), break out
        if (tokens[currentIndex].type === TokenType.HEADING ||
            tokens[currentIndex].type === TokenType.FORM_START) {
          break;
        }
        
        currentIndex++;
      }
      
      const formElement = {
        type: 'form',
        event: token.attributes?.event,
        elements: formElements
      };
      
      // Apply ID if present
      if (currentId) {
        formElement['id'] = currentId;
        currentId = null;
      }
      
      elements.push(formElement);
      continue;
    }
    
    // Handle each loop
    if (token.type === TokenType.EACH_START) {
      const loopElements: any[] = [];
      currentIndex++;
      
      // Process all elements until we're done with the loop's children
      while (currentIndex < tokens.length && 
             tokens[currentIndex].type !== TokenType.EOF &&
             tokens[currentIndex].type !== TokenType.EACH_END) {
        // Skip newlines
        if (tokens[currentIndex].type === TokenType.NEWLINE) {
          currentIndex++;
          continue;
        }
        
        // Handle variable references
        if (tokens[currentIndex].type === TokenType.VARIABLE_REFERENCE) {
          loopElements.push({
            type: 'variable',
            name: tokens[currentIndex].value
          });
          currentIndex++;
          continue;
        }
        
        // Process text inside loop
        if (tokens[currentIndex].type === TokenType.TEXT) {
          loopElements.push({
            type: 'p',
            content: [tokens[currentIndex].value]
          });
          currentIndex++;
          continue;
        }
        
        // If we encounter another major element, break out
        if (tokens[currentIndex].type === TokenType.HEADING ||
            tokens[currentIndex].type === TokenType.FORM_START ||
            tokens[currentIndex].type === TokenType.EACH_START) {
          break;
        }
        
        currentIndex++;
      }
      
      const loopElement = {
        type: 'loop',
        source: token.attributes?.source,
        variable: token.attributes?.variable,
        elements: loopElements
      };
      
      // Apply ID if present
      if (currentId) {
        loopElement['id'] = currentId;
        currentId = null;
      }
      
      elements.push(loopElement);
      continue;
    }
    
    // Handle text
    if (token.type === TokenType.TEXT) {
      const paragraph = {
        type: 'p',
        content: [token.value]
      };
      
      // Apply ID if present
      if (currentId) {
        paragraph['id'] = currentId;
        currentId = null;
      }
      
      elements.push(paragraph);
      currentIndex++;
      continue;
    }
    
    // Handle variable references outside loops
    if (token.type === TokenType.VARIABLE_REFERENCE) {
      const paragraph = {
        type: 'p',
        content: [
          {
            type: 'variable',
            name: token.value
          }
        ]
      };
      
      // Apply ID if present
      if (currentId) {
        paragraph['id'] = currentId;
        currentId = null;
      }
      
      elements.push(paragraph);
      currentIndex++;
      continue;
    }
    
    // Skip newlines and other tokens we don't handle
    currentIndex++;
  }
  
  return elements;
} 