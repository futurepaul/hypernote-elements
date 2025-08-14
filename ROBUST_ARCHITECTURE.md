# Robust Hypernote Architecture

## Core Principle
All queries are live. Pure TypeScript logic. Minimal React.

## Architecture Flow

```
Markdown → Compile → JSON → Pure TS Resolution → React Render
                               ↓
                          Resolve what we can
                               ↓
                          Execute queries
                               ↓
                          Live subscriptions
                               ↓
                          Re-render on updates
```

## 1. Fix Live Queries with Pipes

**Current Problem**: `useQueryExecution.ts:237-239` skips live updates for piped queries

**Solution**: When live event arrives, merge with existing and re-apply pipes
```typescript
// Instead of skipping, handle properly:
if (pipe && pipe.length > 0) {
  setQueryResults(prev => {
    const existing = prev[queryName] || [];
    const allEvents = mergeNewEvent(existing, event); // Smart merge
    const piped = applyPipes(allEvents, pipe);
    return { ...prev, [queryName]: piped };
  });
}
```

## 2. Unified Operation Executor (Pure TypeScript)

Move ALL logic out of React hooks into pure TS:

```typescript
class HypernoteExecutor {
  private queries: Map<string, Query>
  private actions: Map<string, Action>
  private components: Map<string, Component>
  private subscriptions: Map<string, Subscription>
  
  constructor(hypernote: Hypernote, context: Context) {
    // Parse and prepare everything
  }
  
  // Phase 1: Resolve what we can without network
  resolveStaticData(): ResolvedData {
    // Resolve variables, loop contexts, static pipes
    // Return what's immediately available
  }
  
  // Phase 2: Execute queries that can run
  async executeQueries(): Promise<QueryResults> {
    // Topological sort
    // Batch similar queries
    // Return results + setup live subscriptions
  }
  
  // Phase 3: Handle live updates
  onLiveUpdate(queryName: string, event: NostrEvent) {
    // Update results
    // Re-apply pipes
    // Trigger dependent queries
    // Return updated data
  }
  
  // Actions
  async executeAction(actionName: string, formData: any): Promise<void> {
    // Resolve variables
    // Publish event
    // No need to invalidate - live queries auto-update!
  }
}
```

## 3. React as Dumb Renderer

React components should ONLY:
1. Create executor instance
2. Pass data to render functions
3. Re-render on updates

```typescript
function RenderHypernoteContent({ content }: { content: Hypernote }) {
  const [data, setData] = useState<RenderData>({});
  const executorRef = useRef<HypernoteExecutor>();
  
  useEffect(() => {
    // Create executor
    const executor = new HypernoteExecutor(content, context);
    executorRef.current = executor;
    
    // Phase 1: Get static data
    setData(executor.resolveStaticData());
    
    // Phase 2: Execute queries
    executor.executeQueries().then(results => {
      setData(prev => ({ ...prev, ...results }));
    });
    
    // Phase 3: Subscribe to updates
    executor.onUpdate = (newData) => {
      setData(prev => ({ ...prev, ...newData }));
    };
    
    return () => executor.cleanup();
  }, [content]);
  
  // Pure render
  return renderElements(content.elements, data);
}
```

## 4. Component Query Execution

Components should work exactly like main queries:

```typescript
// In ComponentWrapper
const componentExecutor = useMemo(() => {
  if (!componentDef.queries) return null;
  
  // Components get their own executor instance
  return new HypernoteExecutor(
    { ...componentDef, queries: componentDef.queries },
    { ...parentContext, target: targetContext }
  );
}, [componentDef, targetContext]);

// Same three phases as main content
useEffect(() => {
  if (!componentExecutor) return;
  
  // Static resolution
  setComponentData(componentExecutor.resolveStaticData());
  
  // Query execution
  componentExecutor.executeQueries().then(results => {
    setComponentData(prev => ({ ...prev, ...results }));
  });
  
  // Live updates
  componentExecutor.onUpdate = (newData) => {
    setComponentData(prev => ({ ...prev, ...newData }));
  };
}, [componentExecutor]);
```

## 5. Strict Query/Action/Pipe Definitions

### Queries (always live)
```typescript
interface Query {
  // Nostr filter fields
  kinds?: number[]
  authors?: string[] | string  // Can reference other queries
  ids?: string[]
  "#e"?: string[] | string     // Can reference actions for chaining
  
  // Pipes for transformation
  pipe?: Pipe[]
  
  // What action to trigger when results arrive
  triggers?: string
}
```

### Actions (event publishers)
```typescript
interface Action {
  kind: number
  content: string | object  // Can use {$query} or {form.field}
  tags?: Array<string[]>
  
  // No triggers needed - queries auto-update via live subs
}
```

### Pipes (pure functions)
```typescript
type Pipe = 
  | { op: 'first' }
  | { op: 'last' }
  | { op: 'get', field: string }
  | { op: 'pluckIndex', index: number }
  | { op: 'whereIndex', index: number, eq: any }
  | { op: 'reverse' }
  | { op: 'default', value: any }
  | { op: 'json' }
  | { op: 'count' }
  // etc...
```

## 6. Concrete Examples Working Robustly

### Counter Example
- `$count` query is live, auto-updates when new 30078 events arrive
- `@increment` publishes event
- `$update_increment` waits for response (via `#e` tag)
- Triggers `@save_increment` which publishes new count
- `$count` auto-updates (it's live!)
- No manual cache invalidation needed

### Client Example  
- `$contact_list` gets your follows, pipes extract pubkeys
- `$following_feed` uses those pubkeys (dependency resolution)
- Both queries are live
- New posts appear automatically
- Profile components batch their queries via TargetBatcher

## 7. What Needs Fixing

### Must Fix
1. **Live queries with pipes** - Currently broken
2. **Component live queries** - Components should subscribe too
3. **Memory leaks** - Ensure all subscriptions cleanup properly

### Should Improve
1. **Error boundaries** - Graceful failure for bad queries
2. **Subscription deduplication** - Don't create duplicate subs
3. **Smart merging** - When live events arrive, merge intelligently

### Nice to Have
1. **Query introspection** - Debug what queries are running
2. **Performance metrics** - Track query times, cache hits
3. **Optimistic updates** - Show action results immediately

## Implementation Plan

### Step 1: Extract to Pure TS
- [ ] Create `HypernoteExecutor` class
- [ ] Move `SimpleQueryExecutor` logic into it
- [ ] Move action execution logic into it
- [ ] Move pipe application into it

### Step 2: Fix Live Queries
- [ ] Handle pipes in live updates
- [ ] Add live subscriptions to components
- [ ] Ensure proper cleanup

### Step 3: Simplify React
- [ ] Reduce hooks to just executor management
- [ ] Make render functions pure
- [ ] Remove unnecessary memoization

### Step 4: Test Robustness
- [ ] Complex query chains
- [ ] Rapid action firing
- [ ] Component nesting
- [ ] Error cases

## Success Criteria

A Hypernote should be fearlessly composable when:
1. **All queries are live** - New data appears automatically
2. **Dependencies resolve** - `$following_feed` using `$contact_list` works
3. **Actions trigger updates** - Via live queries, not cache invalidation  
4. **Components compose** - Can nest, query, and update independently
5. **Pipes transform** - Work with live updates
6. **Performance scales** - Batching prevents N+1 queries

The goal: Write Hypernotes knowing they'll behave predictably!