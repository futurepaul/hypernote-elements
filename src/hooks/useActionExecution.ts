/**
 * useActionExecution - Clean hook for executing actions
 * 
 * Handles action execution, variable resolution, and event publishing
 * Similar to useQueryExecution but for actions
 */

import { useState, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useNostrStore } from '../stores/nostrStore';
import { ActionResolver } from '../lib/action-resolver';
import { toast } from 'sonner';
import type { EventTemplate } from '../lib/schema';

interface UseActionExecutionOptions {
  events?: Record<string, EventTemplate>;
  queryResults: Record<string, any>;
  formData: Record<string, string>;
  onActionPublished?: (actionName: string, eventId: string) => void;
}

interface UseActionExecutionResult {
  executeAction: (actionName: string) => Promise<void>;
  isExecuting: boolean;
  lastError: Error | null;
}

export function useActionExecution(options: UseActionExecutionOptions): UseActionExecutionResult {
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastError, setLastError] = useState<Error | null>(null);
  
  const { isAuthenticated, signEvent, login, pubkey } = useAuthStore();
  const { snstrClient } = useNostrStore();
  
  const resolver = new ActionResolver();
  
  const executeAction = useCallback(async (actionName: string) => {
    console.log(`[ActionExecution] Executing action: ${actionName}`);
    
    // Ensure action name has @ prefix
    const fullActionName = actionName.startsWith('@') ? actionName : `@${actionName}`;
    
    if (!options.events || !options.events[fullActionName]) {
      console.error(`[ActionExecution] Event ${fullActionName} not found`);
      setLastError(new Error(`Event ${fullActionName} not found`));
      return;
    }
    
    // Check authentication
    if (!isAuthenticated) {
      toast.error('Please connect NIP-07 to publish events');
      login();
      return;
    }
    
    if (!snstrClient) {
      toast.error('Relay client not initialized');
      setLastError(new Error('Relay client not initialized'));
      return;
    }
    
    setIsExecuting(true);
    setLastError(null);
    
    try {
      const eventTemplate = options.events[fullActionName];
      
      // Build context for variable resolution
      const context = {
        ...options.queryResults,
        form: options.formData,
        user: { pubkey },
        time: { now: Date.now() }
      };
      
      // Resolve content
      let eventContent = '';
      
      if (eventTemplate.json) {
        // Resolve JSON template
        console.log('[ActionExecution] Resolving JSON template');
        const resolvedJson = resolver.resolveJson(eventTemplate.json, context);
        eventContent = JSON.stringify(resolvedJson);
        console.log('[ActionExecution] Resolved JSON:', eventContent);
      } else if (eventTemplate.content) {
        // Resolve string template
        console.log('[ActionExecution] Resolving string template:', eventTemplate.content);
        eventContent = resolver.resolve(eventTemplate.content, context);
        console.log('[ActionExecution] Resolved content:', eventContent);
      }
      
      // Build tags
      const tags = eventTemplate.tags ? [...eventTemplate.tags] : [];
      
      // Add 'd' tag for replaceable events if specified
      if ('d' in eventTemplate && eventTemplate.d) {
        tags.push(['d', eventTemplate.d]);
      }
      
      // Create unsigned event
      const unsignedEvent = {
        kind: eventTemplate.kind,
        content: eventContent,
        tags: tags,
        created_at: Math.floor(Date.now() / 1000)
      };
      
      console.log('[ActionExecution] Publishing event:', unsignedEvent);
      
      // Sign with NIP-07
      const signedEvent = await signEvent(unsignedEvent);
      
      // Publish to relays
      const result = await snstrClient.publishEvent(signedEvent);
      
      console.log(`[ActionExecution] Published event: ${result.eventId} to ${result.successCount} relays`);
      toast.success(`Event published to ${result.successCount} relays!`);
      
      // Notify parent of published event
      if (options.onActionPublished) {
        options.onActionPublished(fullActionName, result.eventId);
      }
      
      // Handle triggers if present
      if (eventTemplate.triggers) {
        console.log(`[ActionExecution] Action ${fullActionName} has trigger: ${eventTemplate.triggers}`);
        
        // Only trigger other actions (queries are live and auto-update)
        if (eventTemplate.triggers.startsWith('@')) {
          const triggeredAction = eventTemplate.triggers.substring(1);
          console.log(`[ActionExecution] Triggering chained action: @${triggeredAction}`);
          
          // Use setTimeout to avoid stack overflow
          setTimeout(() => {
            executeAction(triggeredAction);
          }, 100);
        }
      }
      
    } catch (error) {
      console.error('[ActionExecution] Failed to execute action:', error);
      setLastError(error instanceof Error ? error : new Error('Failed to execute action'));
      toast.error(`Failed to publish: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExecuting(false);
    }
  }, [
    options.events, 
    options.queryResults, 
    options.formData,
    options.onActionPublished,
    isAuthenticated, 
    signEvent, 
    login, 
    pubkey, 
    snstrClient
  ]);
  
  return {
    executeAction,
    isExecuting,
    lastError
  };
}