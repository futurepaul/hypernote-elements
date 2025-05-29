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
  id?: string;
  event?: string;
  elements?: HypernoteElement[];
  attributes?: Record<string, string>;
  name?: string;
  source?: string;
  variable?: string;
}

interface RendererProps {
  element: HypernoteElement;
  relayHandler: RelayHandler;
  formData?: Record<string, string>;
  setFormData?: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  events?: Record<string, any>;
  styles?: Hypernote['styles'];
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
  styles = {}, 
  queries = {},
  userContext,
  loopVariables = {}
}: RendererProps) {
  // If this is a loop element, fetch the data for its source using React Query
  const querySourceName = element.type === 'loop' ? element.source : undefined;
  const queryConfig = querySourceName ? queries[querySourceName] : undefined;

  // Use the new React Query hook for fetching events
  const { data: loopData, isLoading, isError } =
    querySourceName && queryConfig
      ? useNostrEventsQuery(relayHandler, queryConfig)
      : { data: undefined, isLoading: false, isError: false };

  // Helper to apply styles based on element type or ID
  const getStyles = (element: HypernoteElement) => {
    const elementStyles: Record<string, string> = {};
    
    // Apply styles by type
    if (styles[element.type]) {
      Object.assign(elementStyles, styles[element.type]);
    }
    
    // Apply styles by ID if available
    if (element.id && styles[`#${element.id}`]) {
      Object.assign(elementStyles, styles[`#${element.id}`]);
    }
    
    return elementStyles;
  };

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

  // Apply styles for this element
  const elementStyles = getStyles(element);

  // Debugging log
  console.log("Rendering element:", element);

  // Render element based on its type
  switch (element.type) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'p':
      return React.createElement(
        element.type,
        { id: element.id, style: elementStyles as React.CSSProperties },
        element.content?.map((item, idx) => 
          typeof item === 'string' 
            ? processContent(item)
            : <ElementRenderer 
                key={idx}
                element={item as HypernoteElement}
                relayHandler={relayHandler}
                formData={formData}
                setFormData={setFormData}
                events={events}
                styles={styles}
                queries={queries}
                userContext={userContext}
                loopVariables={loopVariables}
              />
        )
      );
      
    case 'form':
      return (
        <form 
          id={element.id} 
          onSubmit={(e) => handleFormSubmit(e, element.event)}
          style={elementStyles as React.CSSProperties}
        >
          {element.elements && element.elements.map((child, index) => (
            <ElementRenderer 
              key={index} 
              element={child} 
              relayHandler={relayHandler}
              formData={formData}
              setFormData={setFormData}
              events={events}
              styles={styles}
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
          id={element.id} 
          type="submit"
          style={elementStyles as React.CSSProperties}
        >
          {element.content?.map(item => typeof item === 'string' ? processContent(item) : item).join(' ') || 'Submit'}
        </button>
      );
      
    case 'input':
      const name = element.attributes?.name || '';
      return (
        <input
          id={element.id}
          name={name}
          placeholder={element.attributes?.placeholder || ''}
          value={formData[name] || ''}
          onChange={(e) => handleInputChange(e, name)}
          style={elementStyles as React.CSSProperties}
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
        <div id={element.id} style={elementStyles as React.CSSProperties}>
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
                      styles={styles}
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
        <div id={element.id} style={elementStyles as React.CSSProperties}>
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
                  styles={styles}
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
              styles={styles}
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
  
  return (
    <QueryClientProvider client={queryClient}>
      <div className="hypernote-content">
        {content.elements.map((element, index) => (
          <ElementRenderer
            key={index}
            element={element}
            relayHandler={relayHandler}
            formData={formData}
            setFormData={setFormData}
            events={content.events}
            styles={content.styles}
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