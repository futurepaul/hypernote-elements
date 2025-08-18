# Unified Executor Plan - Simplified

## Current Situation

We have two executors that evolved in the wrong direction:
1. **HypernoteExecutor** - The older, more complex one with deprecated features
2. **SimpleQueryExecutor** - A newer attempt to simplify, but still has duplication

Plus we have **UnifiedResolver** which is the newest and cleanest variable resolution system.

## Goals

1. **One executor** - Merge everything into a single, simple executor
2. **Remove deprecated features**:
   - No JQ transformations (old and bad)
   - No query→trigger→action chains (actions are user-triggered only)
   - No separate fetch vs subscription (everything is a live subscription)
3. **Keep what works**:
   - UnifiedResolver for all variable resolution
   - Essential pipes (first, get, default, whereIndex, pluckIndex)
   - Clean React update boundary
4. **Feature parity** with examples/ folder functionality

## Required Features (Based on Examples Analysis)

### Core Query Features
- **Filters**: authors, kinds, limit, since, tag filters (#d, #t)
- **Query chaining**: Using one query's result in another (`authors: $contact_list`)
- **Pipes**: first, get, json, default/defaults, whereIndex, pluckIndex
- **Live subscriptions**: All queries are live by default

### Variable Resolution (via UnifiedResolver)
- `user.pubkey` - Current user
- `target.*` - Component parameters
- `form.*` - Form field values
- `$query.field` - Query result fields
- `time.now` - Current timestamp
- `value or fallback` - Fallback syntax
- Loop variables in `[each]` blocks

### Actions (User-Triggered Only)
- Form submissions and button clicks
- Kind 1 (text notes) with content/tags
- Kind 25910 (JSON-RPC) for MCP integration
- NO automatic triggers from queries

### Components
- Named component sections
- Component parameters (npub/nevent/naddr)
- External component references via naddr

## What to Remove

### From HypernoteExecutor
```typescript
// DELETE: Query triggers
if (queryConfig.triggers) {
  await this.executeAction(queryConfig.triggers, {});
}

// DELETE: JQ processing
import { processJQTransform } from './jq-parser';

// DELETE: Separate fetch logic
// Everything becomes a live subscription
```

### From SimpleQueryExecutor
```typescript
// DELETE: Duplicate variable resolution
resolveFilterVariables() // Use UnifiedResolver instead

// DELETE: Duplicate reference resolution  
resolveReferences() // Use UnifiedResolver instead
```

### From Schema
```typescript
// DELETE: Trigger fields
triggers: z.string().optional(), // Remove from QueryConfig
triggers: z.string().optional(), // Remove from EventConfig
```

## New Architecture

```
┌─────────────────────────────────────────────────────┐
│                  UnifiedExecutor                     │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │            Query Execution Core              │    │
│  │  - Dependency graph resolution               │    │
│  │  - Live subscriptions for ALL queries        │    │
│  │  - Replaceable event deduplication           │    │
│  │  - Pipe processing (limited set)             │    │
│  └──────────────┬──────────────────────────────┘    │
│                 │                                    │
│  ┌──────────────▼──────────────────────────────┐    │
│  │           UnifiedResolver                    │    │
│  │  - All variable resolution in one place      │    │
│  │  - Simple, predictable rules                 │    │
│  │  - Safety checks for unresolved refs         │    │
│  └──────────────┬──────────────────────────────┘    │
│                 │                                    │
│  ┌──────────────▼──────────────────────────────┐    │
│  │         SNSTR Client Integration             │    │
│  │  - subscribeLive() for everything            │    │
│  │  - publishEvent() for actions                │    │
│  │  - Automatic cleanup on unmount              │    │
│  └──────────────┬──────────────────────────────┘    │
│                 │                                    │
│  ┌──────────────▼──────────────────────────────┐    │
│  │          React Update Boundary               │    │
│  │  - Single, explicit update point             │    │
│  │  - Batched updates for performance           │    │
│  │  - Error boundaries for safety               │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

## Implementation Plan

### Step 1: Create UnifiedExecutor Class
```typescript
class UnifiedExecutor {
  private resolver: UnifiedResolver;
  private client: SNSTRClient;
  private subscriptions: Map<string, () => void>;
  private queryResults: Map<string, any>;
  private onUpdate: (data: ResolvedData) => void;
  
  constructor(config: ExecutorConfig) {
    this.resolver = new UnifiedResolver(config.context);
    this.client = config.client;
    this.subscriptions = new Map();
    this.queryResults = new Map();
    this.onUpdate = config.onUpdate;
  }
  
  async execute(hypernote: HypernoteSchema): Promise<void> {
    // 1. Build dependency graph
    const graph = this.buildDependencyGraph(hypernote.queries);
    
    // 2. Execute queries in dependency order
    for (const queryName of graph.executionOrder) {
      await this.executeQuery(queryName, hypernote.queries[queryName]);
    }
    
    // 3. Send initial update to React
    this.sendUpdate();
  }
  
  private async executeQuery(name: string, config: QueryConfig): Promise<void> {
    // Resolve all variables using UnifiedResolver
    const resolved = this.resolver.resolve(config);
    
    // Check for unresolved references
    if (this.resolver.hasUnresolvedReferences(resolved)) {
      return; // Skip queries with unresolved refs
    }
    
    // Create live subscription (no separate fetch!)
    const cleanup = this.client.subscribeLive(
      [resolved],
      (event) => this.handleLiveEvent(name, event, config.pipe),
      () => {} // EOSE callback
    );
    
    this.subscriptions.set(name, cleanup);
  }
  
  private handleLiveEvent(queryName: string, event: NostrEvent, pipe?: Pipe[]): void {
    // Get all events for this query
    let events = this.getEventsForQuery(queryName);
    events.push(event);
    
    // Deduplicate replaceable events
    if (this.isReplaceableKind(event.kind)) {
      events = this.deduplicateByDTag(events);
    }
    
    // Apply pipes
    const result = pipe ? applyPipes(events, pipe) : events;
    
    // Update results
    this.queryResults.set(queryName, result);
    
    // Send update to React
    this.sendUpdate();
  }
  
  private sendUpdate(): void {
    // Single, explicit update point
    const data = Object.fromEntries(this.queryResults);
    this.onUpdate(data);
  }
  
  async executeAction(name: string, formData: Record<string, any>): Promise<string> {
    // Update resolver context with form data
    this.resolver.updateContext({ formData });
    
    // Get action config
    const action = this.hypernote.events[name];
    if (!action) throw new Error(`Unknown action: ${name}`);
    
    // Resolve all variables
    const resolved = this.resolver.resolve(action);
    
    // Publish event
    const eventId = await this.client.publishEvent(resolved);
    
    // Store result for reference
    this.resolver.updateContext({ 
      actionResults: new Map([[name, eventId]]) 
    });
    
    return eventId;
  }
  
  cleanup(): void {
    // Clean up all subscriptions
    this.subscriptions.forEach(cleanup => cleanup());
    this.subscriptions.clear();
  }
}
```

### Step 2: Simplify Pipe Processing
```typescript
// Keep only essential pipes from examples
function applyPipes(data: any, pipes: Pipe[]): any {
  let result = data;
  
  for (const pipe of pipes) {
    switch (pipe.op) {
      case 'first':
        result = Array.isArray(result) ? result[0] : result;
        break;
        
      case 'get':
        result = result?.[pipe.field];
        break;
        
      case 'default':
        result = result ?? pipe.value;
        break;
        
      case 'defaults':
        result = { ...pipe.value, ...result };
        break;
        
      case 'whereIndex':
        result = result?.filter((item: any[]) => 
          item[pipe.index] === pipe.eq
        );
        break;
        
      case 'pluckIndex':
        result = result?.map((item: any[]) => item[pipe.index]);
        break;
        
      case 'json':
        try {
          result = JSON.parse(result);
        } catch {}
        break;
        
      // DELETE: No more JQ or complex transformations
    }
  }
  
  return result;
}
```

### Step 3: Remove Deprecated Features

1. **Delete trigger-related code**:
   - Remove `triggers` field from QueryConfig and EventConfig schemas
   - Remove all `if (queryConfig.triggers)` blocks
   - Remove trigger execution logic

2. **Delete JQ processing**:
   - Remove `jq-parser.ts` file entirely
   - Remove `processJQTransform` imports
   - Remove JQ pipe operations

3. **Delete separate fetch logic**:
   - Remove `fetchEvents` as a separate operation
   - Everything uses `subscribeLive`
   - Initial data comes from the first batch of live events

### Step 4: Clean React Integration
```typescript
// In useHypernoteExecutor hook
export function useHypernoteExecutor(hypernote: HypernoteSchema) {
  const [data, setData] = useState<ResolvedData>({});
  const [loading, setLoading] = useState(true);
  const executorRef = useRef<UnifiedExecutor | null>(null);
  
  useEffect(() => {
    const executor = new UnifiedExecutor({
      hypernote,
      client: snstrClient,
      context: { user, target, formData: {}, ... },
      onUpdate: (newData) => {
        // Single, safe update point
        setData(newData);
        setLoading(false);
      }
    });
    
    executorRef.current = executor;
    executor.execute();
    
    return () => executor.cleanup();
  }, [hypernote]);
  
  const executeAction = useCallback(async (name: string, formData: any) => {
    return executorRef.current?.executeAction(name, formData);
  }, []);
  
  return { data, loading, executeAction };
}
```

## Benefits of This Approach

1. **Simpler**: One executor, one resolver, one subscription model
2. **No duplication**: Each piece of logic exists in exactly one place
3. **Predictable**: All queries are live, all actions are user-triggered
4. **Maintainable**: Clear separation between execution, resolution, and React
5. **Smaller**: Remove JQ, triggers, and duplicate code (~30% reduction)

## Testing Strategy

### Feature Parity Tests
Run all examples to ensure they still work:
- [ ] counter.md - Basic counter with MCP
- [ ] chess.md - Chess game with MCP
- [ ] client.md - Following feed
- [ ] profile.md - Profile display
- [ ] publisher.md - Note publishing
- [ ] state.md - Application state

### Removed Feature Tests
Ensure deprecated features are gone:
- [ ] No automatic query→trigger→action chains
- [ ] No JQ transformations
- [ ] No separate fetch vs subscription behavior

## Success Criteria

1. All examples work identically to before
2. Code size reduced by ~30%
3. Single executor implementation
4. All variable resolution through UnifiedResolver
5. Clean, explicit React update boundary
6. No deprecated features remaining

## Next Steps

1. Create feature branch `unified-executor`
2. Implement UnifiedExecutor class
3. Remove deprecated features
4. Update useHypernoteExecutor hook
5. Test all examples
6. Delete old executors
7. Update documentation

---

*This simplified plan focuses on removing complexity while maintaining feature parity with actual usage in the examples folder.*