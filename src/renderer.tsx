import React, { useState, useMemo, useEffect } from 'react';
import { useDebounce } from 'use-debounce';
import { RelayHandler } from './lib/relayHandler';
import { compileHypernoteToContent } from './lib/compiler';
import { useNostrStore } from './stores/nostrStore';
import { useAuthStore } from './stores/authStore';
import { useNostrSubscription } from './lib/snstr/hooks';
import { useQueryExecution } from './hooks/useQueryExecution';
import type { Hypernote, AnyElement } from './lib/schema';
import { toast } from 'sonner';
import { applyPipeOperation } from './lib/jq-parser';
import { NostrEvent } from './lib/snstr/nip07';

// Define the structure of elements based on compiler output
interface HypernoteElement {
  type: string;
  content?: string[] | HypernoteElement[];
  elementId?: string;
  event?: string;
  elements?: HypernoteElement[];
  attributes?: Record<string, string>;
  name?: string;
  source?: string;
  variable?: string;
  style?: Record<string, any>; // CSS-in-JS style object
}

interface RendererProps {
  element: HypernoteElement;
  relayHandler: RelayHandler;
  formData?: Record<string, string>;
  setFormData?: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  events?: Record<string, any>;
  queries?: Record<string, any>;
  queryResults?: Map<string, NostrEvent[]>;
  extractedVariables?: Record<string, any>;
  userContext: {
    pubkey: string | null;
  };
  loopVariables?: Record<string, any>;
}

// Process pipe transformations on event data
function executePipeStep(data: any, step: any, context?: any): any {
  return applyPipeOperation(step, data, context);
}

// Component to render a single element based on its type
function ElementRenderer({ 
  element, 
  relayHandler, 
  formData = {}, 
  setFormData, 
  events = {}, 
  queries = {},
  queryResults = new Map(),
  extractedVariables = {},
  userContext,
  loopVariables = {}
}: RendererProps) {
  // Helper function to substitute variables in query configurations
  const substituteQueryVariables = (queryConfig: any): any => {
    if (!queryConfig) return queryConfig;
    
    // Deep clone the query config to avoid mutations
    const processedConfig = JSON.parse(JSON.stringify(queryConfig));
    
    // Recursively substitute variables in the query config
    const substituteInValue = (value: any): any => {
      if (typeof value === 'string') {
        // Handle user.pubkey substitution
        if (value === 'user.pubkey' && userContext.pubkey) {
          return userContext.pubkey;
        }
        // Handle time.now substitution
        if (value === 'time.now') {
          return Date.now();
        }
        // Handle time expressions like "time.now - 86400000"
        if (value.includes('time.now')) {
          try {
            // Simple arithmetic evaluation for time expressions
            const timeNow = Date.now();
            const result = value.replace(/time\.now/g, timeNow.toString());
            return eval(result); // Note: In production, use a safer expression evaluator
          } catch (e) {
            console.warn(`Failed to evaluate time expression: ${value}`);
            return value;
          }
        }
        // Handle extracted variable references (e.g., "followed_pubkeys")
        // These are passed through as-is and will be resolved later
        // when we have access to the extraction results
        if (value.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
          // Check if this might be a variable reference
          // For now, pass it through unchanged
          return value;
        }
        return value;
      } else if (Array.isArray(value)) {
        return value.map(substituteInValue);
      } else if (value && typeof value === 'object') {
        const result: any = {};
        for (const [key, val] of Object.entries(value)) {
          result[key] = substituteInValue(val);
        }
        return result;
      }
      return value;
    };
    
    return substituteInValue(processedConfig);
  };

  // Get loop data from pre-fetched query results if this is a loop element
  let loopData: NostrEvent[] = [];
  let isLoading = false;
  let isError = false;
  let error: Error | null = null;
  
  if (element.type === 'loop' && element.source) {
    // Get data from pre-fetched query results
    const sourceData = queryResults.get(element.source);
    if (sourceData) {
      loopData = sourceData;
    } else {
      // Query might not have been executed yet or had an error
      console.warn(`No data found for query: ${element.source}`);
    }
  }
  
  // Make extracted variables available in loop variables
  const extractedVars = { ...loopVariables, ...extractedVariables };

  // Get auth store for NIP-07 signing
  const { isAuthenticated, signEvent, login } = useAuthStore();
  const { snstrClient } = useNostrStore();
  
  // Process form submission with NIP-07 signing
  const handleFormSubmit = async (e: React.FormEvent, eventName?: string) => {
    e.preventDefault();
    
    // If no event name is provided, just prevent default
    if (!eventName) {
      console.log('Form submitted but no event is specified');
      return;
    }
    
    if (!events || !events[eventName]) {
      console.error(`Event ${eventName} not found`);
      return;
    }
    
    // Check if user is authenticated
    if (!isAuthenticated) {
      toast.error('Please connect NIP-07 to publish events');
      // Optionally trigger login
      login();
      return;
    }
    
    if (!snstrClient) {
      toast.error('Relay client not initialized');
      return;
    }
    
    const eventTemplate = events[eventName];
    
    // Process template variables
    let content = eventTemplate.content;
    if (typeof content === 'string' && content.includes('{form.')) {
      // Replace {form.fieldName} with actual form values
      Object.keys(formData).forEach(key => {
        content = content.replace(`{form.${key}}`, formData[key] || '');
      });
    }
    
    // Create event template for signing
    const unsignedEvent = {
      kind: eventTemplate.kind,
      content: content,
      tags: eventTemplate.tags || [],
      created_at: Math.floor(Date.now() / 1000)
    };
    
    // Sign and publish the event
    try {
      // Sign with NIP-07
      const signedEvent = await signEvent(unsignedEvent);
      
      // Publish to relays
      const result = await snstrClient.publishEvent(signedEvent);
      
      console.log(`Published event: ${result.eventId} to ${result.successCount} relays`);
      toast.success(`Event published to ${result.successCount} relays!`);
      
      // Reset form if successful
      if (setFormData) {
        setFormData({});
      }
      
      // No need to invalidate - subscriptions are reactive and will auto-update!
    } catch (error) {
      console.error(`Failed to publish event: ${error}`);
      toast.error(`Failed to publish: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handle input changes in forms
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, name: string) => {
    if (setFormData) {
      setFormData(prev => ({
        ...prev,
        [name]: e.target.value
      }));
    }
  };

  // Parse variable references and replace with actual values
  const resolveVariable = (variableName: string): string => {
    console.log(`Resolving variable: ${variableName}, available variables:`, loopVariables);
    
    if (variableName.startsWith('$') && variableName.includes('.')) {
      const [varName, ...path] = variableName.split('.');
      const variable = loopVariables[varName];
      
      if (variable) {
        // Access nested properties
        const result = path.reduce((obj, prop) => obj?.[prop], variable) || '';
        console.log(`Resolved ${variableName} to:`, result);
        return String(result);
      } else {
        console.log(`Variable ${varName} not found in loop variables`);
      }
    }
    
    return variableName;
  };

  // Process content and replace variable references
  const processContent = (content: string): string => {
    // Replace variable references like {$note.content} with actual values
    return content.replace(/\{(\$[^}]+)\}/g, (match, variableName) => {
      return resolveVariable(variableName);
    });
  };

  // Get the element's inline styles (direct mapping from style property)
  const elementStyles = element.style || {};


  // Render element based on its type
  switch (element.type) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'p':
      // Handle content arrays by joining with newlines for proper display
      const textContent = element.content?.map((item) => 
        typeof item === 'string' 
          ? processContent(item)
          : null // We'll handle nested elements separately
      ).filter(Boolean).join('\n');
      
      // Handle nested elements
      const nestedElements = element.content?.filter(item => typeof item !== 'string');
      
      return React.createElement(
        element.type,
        { 
          id: element.elementId, 
          style: { 
            whiteSpace: 'pre-line', // Preserve line breaks
            ...elementStyles 
          } 
        },
        [
          textContent,
          ...(nestedElements?.map((item, idx) => (
            <ElementRenderer 
              key={`nested-${idx}`}
              element={item as HypernoteElement}
              relayHandler={relayHandler}
              formData={formData}
              setFormData={setFormData}
              events={events}
              queries={queries}
              queryResults={queryResults}
              extractedVariables={extractedVariables}
              userContext={userContext}
              loopVariables={loopVariables}
            />
          )) || [])
        ].filter(Boolean)
      );
      
    case 'form':
      return (
        <form 
          id={element.elementId} 
          onSubmit={(e) => handleFormSubmit(e, element.event)}
          style={elementStyles}
        >
          {element.elements && element.elements.map((child, index) => (
            <ElementRenderer 
              key={index} 
              element={child} 
              relayHandler={relayHandler}
              formData={formData}
              setFormData={setFormData}
              events={events}
              queries={queries}
              queryResults={queryResults}
              extractedVariables={extractedVariables}
              userContext={userContext}
              loopVariables={loopVariables}
            />
          ))}
        </form>
      );
      
    case 'button':
      return (
        <button 
          id={element.elementId} 
          type="submit"
          style={elementStyles}
        >
          {element.elements && element.elements.map((child, index) => (
            <ElementRenderer 
              key={index} 
              element={child} 
              relayHandler={relayHandler}
              formData={formData}
              setFormData={setFormData}
              events={events}
              queries={queries}
              queryResults={queryResults}
              extractedVariables={extractedVariables}
              userContext={userContext}
              loopVariables={loopVariables}
            />
          ))}
        </button>
      );
      
    case 'span':
      return (
        <span 
          id={element.elementId} 
          style={elementStyles}
        >
          {element.elements && element.elements.map((child, index) => (
            <ElementRenderer 
              key={index} 
              element={child} 
              relayHandler={relayHandler}
              formData={formData}
              setFormData={setFormData}
              events={events}
              queries={queries}
              queryResults={queryResults}
              extractedVariables={extractedVariables}
              userContext={userContext}
              loopVariables={loopVariables}
            />
          ))}
        </span>
      );
      
    case 'div':
      return (
        <div 
          id={element.elementId} 
          style={elementStyles}
        >
          {element.elements && element.elements.map((child, index) => (
            <ElementRenderer 
              key={index} 
              element={child} 
              relayHandler={relayHandler}
              formData={formData}
              setFormData={setFormData}
              events={events}
              queries={queries}
              queryResults={queryResults}
              extractedVariables={extractedVariables}
              userContext={userContext}
              loopVariables={loopVariables}
            />
          ))}
        </div>
      );
      
    case 'input':
      const name = element.attributes?.name || '';
      return (
        <input
          id={element.elementId}
          name={name}
          placeholder={element.attributes?.placeholder || ''}
          value={formData[name] || ''}
          onChange={(e) => handleInputChange(e, name)}
          style={elementStyles}
        />
      );
      
    case 'img':
      return (
        <img
          id={element.elementId}
          src={element.attributes?.src || ''}
          alt={element.attributes?.alt || ''}
          style={elementStyles}
        />
      );
      
    case 'json':
      // Get the variable path from attributes (e.g., "$note" or "$note.content")
      const variablePath = element.attributes?.variable || '$data';
      
      // Parse the variable path to handle dot notation
      let actualData: any;
      let displayVariableName = variablePath;
      
      if (variablePath.includes('.')) {
        // Handle dot notation like "$note.content"
        const [varName, ...propertyPath] = variablePath.split('.');
        const baseData = loopVariables[varName];
        
        if (baseData !== undefined) {
          // Navigate the property path
          actualData = propertyPath.reduce((obj, prop) => obj?.[prop], baseData);
        }
      } else {
        // Simple variable reference like "$note"
        actualData = loopVariables[variablePath];
      }
      
      // Pretty-print the JSON
      let displayContent: string;
      
      if (actualData !== undefined) {
        try {
          // Stringify the actual data with pretty formatting
          displayContent = JSON.stringify(actualData, null, 2);
        } catch (e) {
          // If stringify fails, convert to string
          displayContent = String(actualData);
        }
      } else {
        // If no data found, show a helpful message
        displayContent = `No data found for variable: ${variablePath}`;
      }
      
      return (
        <details 
          id={element.elementId} 
          className="bg-gray-100 rounded border border-gray-300 p-1 flex flex-col"
          style={elementStyles}
          open={element.attributes?.open === 'true'}
        >
          <summary className="bg-gray-300 self-start rounded p-1 cursor-pointer">
            {displayVariableName}
          </summary>
          <pre className="whitespace-pre-wrap text-sm overflow-auto">
            {displayContent}
          </pre>
        </details>
      );
      
    case 'loop':
      if (isLoading) {
        console.log(`Loop data for ${element.source} is still loading...`);
        return <div>Loading data...</div>;
      }
      
      if (isError) {
        console.log(`Error loading data for loop with source ${element.source}:`, error);
        return (
          <div style={{ color: 'red', padding: '10px', border: '1px solid red', borderRadius: '4px' }}>
            Error loading data from {element.source}
            {error && <div style={{ fontSize: '12px', marginTop: '5px' }}>
              {error instanceof Error ? error.message : String(error)}
            </div>}
          </div>
        );
      }
      
      // Get the data from query results
      const sourceData = loopData || [];
      console.log(`Loop data for ${element.source}:`, sourceData);
      const variableName = element.variable || '$item';
      
      // Render the loop elements for each item in the data
      return (
        <div id={element.elementId} style={elementStyles}>
          {sourceData.length === 0 ? (
            <div>No data found</div>
          ) : (
            sourceData.map((item, index) => {
              // Create a new loop variables object with the current item
              const newLoopVariables = { 
                ...loopVariables,
                [variableName]: item 
              };
              console.log(`Rendering loop item ${index} with variable ${variableName}:`, item);
              
              // Render each child element with the updated loop variables
              return (
                <div key={index}>
                  {element.elements?.map((child, childIndex) => (
                    <ElementRenderer
                      key={childIndex}
                      element={child}
                      relayHandler={relayHandler}
                      formData={formData}
                      setFormData={setFormData}
                      events={events}
                      queries={queries}
                      queryResults={queryResults}
                      extractedVariables={extractedVariables}
                      userContext={userContext}
                      loopVariables={newLoopVariables}
                    />
                  ))}
                </div>
              );
            })
          )}
        </div>
      );
      
    case 'variable':
      // Render a variable reference
      return <>{resolveVariable(element.name || '')}</>;
      
    default:
      return (
        <div id={element.elementId} style={elementStyles}>
          {element.content?.map((item, idx) => 
            typeof item === 'string' 
              ? processContent(item)
              : <ElementRenderer 
                  key={idx}
                  element={item as HypernoteElement}
                  relayHandler={relayHandler}
                  formData={formData}
                  setFormData={setFormData}
                  events={events}
                  queries={queries}
                  queryResults={queryResults}
                  extractedVariables={extractedVariables}
                  userContext={userContext}
                  loopVariables={loopVariables}
                />
          )}
          {element.elements && element.elements.map((child, index) => (
            <ElementRenderer 
              key={index} 
              element={child} 
              relayHandler={relayHandler}
              formData={formData}
              setFormData={setFormData}
              events={events}
              queries={queries}
              queryResults={queryResults}
              extractedVariables={extractedVariables}
              userContext={userContext}
              loopVariables={loopVariables}
            />
          ))}
        </div>
      );
  }
}

// Main renderer function that takes markdown and returns React node
export function HypernoteRenderer({ markdown, relayHandler }: { markdown: string, relayHandler: RelayHandler }) {
  // Debounce the markdown input to prevent re-rendering on every keystroke
  const [debouncedMarkdown] = useDebounce(markdown, 300);
  
  // Guard against undefined or null markdown
  if (!debouncedMarkdown || typeof debouncedMarkdown !== 'string') {
    return (
      <div>No content to display. Please select an example or enter markdown content.</div>
    );
  }

  // Compile markdown to content object - memoize to prevent unnecessary recompilation
  const content: Hypernote = useMemo(
    () => compileHypernoteToContent(debouncedMarkdown),
    [debouncedMarkdown]
  );
  
  // Set up form data state
  const [formData, setFormData] = useState<Record<string, string>>({});
  
  // Get user pubkey from auth store (NIP-07)
  const { pubkey } = useAuthStore();
  
  const userContext = { pubkey };
  
  // Execute all queries with dependency resolution
  const { queryResults, extractedVariables, loading: queriesLoading, error: queryError } = useQueryExecution(
    content.queries || {}
  );
  
  // Show loading state while queries are executing
  if (queriesLoading) {
    return (
      <div>Loading queries...</div>
    );
  }
  
  // Show error if query execution failed
  if (queryError) {
    return (
      <div style={{ color: 'red' }}>
        Error executing queries: {queryError.message}
      </div>
    );
  }
  
  // If there are no elements, show a placeholder
  if (!content.elements || content.elements.length === 0) {
    return (
      <div>No content to display. Try adding some markdown!</div>
    );
  }

  // Get the root-level styles from the hypernote
  const rootStyles = content.style || {};
  
  // Determine theme class based on background color or explicit class
  let themeClass = '';
  if (rootStyles.backgroundColor === 'rgb(0,0,0)' || rootStyles.backgroundColor === '#000000' || rootStyles.backgroundColor === 'black') {
    themeClass = 'hypernote-dark';
  }
  
  return (
    <div 
      className={`hypernote-content ${themeClass}`.trim()} 
      style={rootStyles as React.CSSProperties}
    >
      {content.elements.map((element, index) => (
        <ElementRenderer
          key={index}
          element={element}
          relayHandler={relayHandler}
          formData={formData}
          setFormData={setFormData}
          events={content.events}
          queries={content.queries}
          queryResults={queryResults}
          extractedVariables={extractedVariables}
          userContext={userContext}
          loopVariables={{}}
        />
      ))}
    </div>
  );
}

// Component to output the compiled JSON from markdown
export function HypernoteJsonOutput({ markdown }: { markdown: string }) {
  // Debounce the markdown input to match the renderer
  const [debouncedMarkdown] = useDebounce(markdown, 300);
  
  // Guard against undefined or null markdown
  if (!debouncedMarkdown || typeof debouncedMarkdown !== 'string') {
    return (
      <pre className="bg-slate-100 text-red-900 text-xs p-4 rounded overflow-auto">
        No markdown content provided
      </pre>
    );
  }

  // Memoize the compilation to prevent unnecessary recompilation
  const content: Hypernote = useMemo(
    () => compileHypernoteToContent(debouncedMarkdown),
    [debouncedMarkdown]
  );
  
  return (
    <pre className="bg-slate-100 text-green-900 text-xs p-4 rounded overflow-auto">
      {JSON.stringify(content, null, 2)}
    </pre>
  );
} 