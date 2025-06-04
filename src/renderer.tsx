import React, { useState } from 'react';
import { useQuery, QueryClientProvider } from '@tanstack/react-query';
import { RelayHandler } from './lib/relayHandler';
import { compileHypernoteToContent } from './lib/compiler';
import { queryClient } from './stores/nostrStore';
import { fetchNostrEvents } from './lib/nostrFetch';
import type { Hypernote, AnyElement } from './lib/schema';

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
  userContext: {
    pubkey: string | null;
  };
  loopVariables?: Record<string, any>;
}

// Custom hook to fetch data for a specific query using React Query
function useNostrEventsQuery(relayHandler: RelayHandler, filter: any) {
  return useQuery({
    queryKey: ['nostrEvents', JSON.stringify(filter)],
    queryFn: () => fetchNostrEvents(relayHandler, filter),
    enabled: !!relayHandler && !!filter,
  });
}

// Component to render a single element based on its type
function ElementRenderer({ 
  element, 
  relayHandler, 
  formData = {}, 
  setFormData, 
  events = {}, 
  queries = {},
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

  // If this is a loop element, fetch the data for its source using React Query
  const querySourceName = element.type === 'loop' ? element.source : undefined;
  const queryConfig = querySourceName ? queries[querySourceName] : undefined;
  
  // Substitute variables in the query config before using it
  const processedQueryConfig = substituteQueryVariables(queryConfig);
  
  console.log(`Original query config for ${querySourceName}:`, queryConfig);
  console.log(`Processed query config for ${querySourceName}:`, processedQueryConfig);

  // Use the new React Query hook for fetching events
  const { data: loopData, isLoading, isError } =
    querySourceName && processedQueryConfig
      ? useNostrEventsQuery(relayHandler, processedQueryConfig)
      : { data: undefined, isLoading: false, isError: false };

  // Process form submission
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
    
    const eventTemplate = events[eventName];
    
    // Process template variables
    let content = eventTemplate.content;
    if (typeof content === 'string' && content.includes('{form.')) {
      // Replace {form.fieldName} with actual form values
      Object.keys(formData).forEach(key => {
        content = content.replace(`{form.${key}}`, formData[key] || '');
      });
    }
    
    // Publish the event
    try {
      const eventId = await relayHandler.publishEvent(
        eventTemplate.kind,
        content,
        eventTemplate.tags || []
      );
      
      console.log(`Published event: ${eventId}`);
      
      // Reset form if successful
      if (setFormData) {
        setFormData({});
      }
      
      // Invalidate related queries when an event is published
      queryClient.invalidateQueries({ queryKey: ['hypernote'] });
    } catch (error) {
      console.error(`Failed to publish event: ${error}`);
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

  // Debugging log
  console.log("Rendering element:", element);

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
      
    case 'loop':
      if (isLoading) {
        console.log(`Loop data for ${element.source} is still loading...`);
        return <div>Loading data...</div>;
      }
      
      if (isError) {
        console.log(`Error loading data for loop with source ${element.source}`);
        return <div>Error loading data</div>;
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
  // Guard against undefined or null markdown
  if (!markdown || typeof markdown !== 'string') {
    return (
      <QueryClientProvider client={queryClient}>
        <div>No content to display. Please select an example or enter markdown content.</div>
      </QueryClientProvider>
    );
  }

  // Compile markdown to content object
  const content: Hypernote = compileHypernoteToContent(markdown);
  
  // Set up form data state
  const [formData, setFormData] = useState<Record<string, string>>({});
  
  // Get user pubkey from local storage
  const pubkey = localStorage.getItem("pubkey");
  console.log("Current user pubkey from localStorage:", pubkey);
  
  const userContext = { pubkey };
  
  // Debugging logs
  console.log("Compiled content:", content);
  console.log("Elements:", content.elements);
  
  // If there are no elements, show a placeholder
  if (!content.elements || content.elements.length === 0) {
    return (
      <QueryClientProvider client={queryClient}>
        <div>No content to display. Try adding some markdown!</div>
      </QueryClientProvider>
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
    <QueryClientProvider client={queryClient}>
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
            userContext={userContext}
            loopVariables={{}}
          />
        ))}
      </div>
    </QueryClientProvider>
  );
}

// Component to output the compiled JSON from markdown
export function HypernoteJsonOutput({ markdown }: { markdown: string }) {
  // Guard against undefined or null markdown
  if (!markdown || typeof markdown !== 'string') {
    return (
      <pre className="bg-slate-100 text-red-900 text-xs p-4 rounded overflow-auto">
        No markdown content provided
      </pre>
    );
  }

  const content: Hypernote = compileHypernoteToContent(markdown);
  return (
    <pre className="bg-slate-100 text-green-900 text-xs p-4 rounded overflow-auto">
      {JSON.stringify(content, null, 2)}
    </pre>
  );
} 