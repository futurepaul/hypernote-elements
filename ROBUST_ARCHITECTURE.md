# Robust Hypernote Architecture

## Core Principle
All queries are live. Pure TypeScript logic. Minimal React.

## ✅ COMPLETED IMPLEMENTATION

We successfully implemented the robust architecture with `HypernoteExecutor` at the core!

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

## What We Achieved

### ✅ 1. Live Queries with Pipes (FIXED)
- Live updates now re-fetch events and re-apply pipes
- Cache is bypassed and invalidated on live updates
- See `HypernoteExecutor.handleLiveUpdate()` lines 216-234

### ✅ 2. Unified Operation Executor (IMPLEMENTED)

`HypernoteExecutor` now contains ALL core logic:

- **Unified Variable Resolution**: Uses `UnifiedResolver` for consistent resolution
- **Query Execution**: Uses `SimpleQueryExecutor` for dependency resolution
- **Live Subscriptions**: All queries are live by default
- **Action Execution**: Handles signing, publishing, and re-executing dependent queries
- **Smart Triggers**: Only fires when query results actually change (hash-based)
- **Cache Management**: Clears cache when actions complete to trigger re-execution

### ✅ 3. React as Dumb Renderer (IMPLEMENTED)

`useHypernoteExecutor` hook does exactly this:
1. Creates executor instance
2. Sets up onUpdate callback
3. Cleans up on unmount

React's only job is to re-render when data changes!

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

## ✅ CLEANUP COMPLETED!

### Code DELETED:
1. ✅ **useQueryExecution.ts** - Removed, logic now in HypernoteExecutor
2. ✅ **useActionExecution.ts** - Removed, action execution is in HypernoteExecutor
3. ✅ **action-resolver.ts** - Removed, replaced by UnifiedResolver
4. ✅ **Old renderer toggle code** - Removed `USE_NEW_EXECUTOR` flag and old paths

### Code to STREAMLINE:
1. **SimpleQueryExecutor** - Could be merged into HypernoteExecutor
2. **TargetBatcher** - Still useful for component batching but could be simplified
3. **componentResolver** - Works but could use HypernoteExecutor internally

### Code NOT in HypernoteExecutor:
1. **Compilation** - Still in compiler.ts/tokenizer.ts (and should stay separate)
2. **Rendering** - Pure render functions in renderer.tsx (good separation)
3. **Component resolution** - componentResolver.ts handles component fetching
4. **Pipe operations** - pipes.ts and jq-parser.ts (used by executor)
5. **Relay management** - SNSTRClient handles relay connections

## Implementation Status

### ✅ Completed:
- [x] Create `HypernoteExecutor` class
- [x] Move `SimpleQueryExecutor` logic into it (uses it internally)
- [x] Move action execution logic into it
- [x] Handle pipes in live updates
- [x] Add live subscriptions to all queries
- [x] Ensure proper cleanup
- [x] Reduce hooks to just executor management
- [x] Complex query chains work (counter example)
- [x] Rapid action firing prevented (hash-based change detection)
- [x] Smart trigger handling (only on actual changes with valid data)

### 🎯 Still To Do:
- [x] Clean up old code paths (COMPLETED!)
- [ ] Component live queries (components now use HypernoteExecutor)
- [ ] Error boundaries for graceful failures
- [ ] Subscription deduplication
- [ ] Performance metrics

## Success Criteria

A Hypernote should be fearlessly composable when:
1. **All queries are live** - New data appears automatically
2. **Dependencies resolve** - `$following_feed` using `$contact_list` works
3. **Actions trigger updates** - Via live queries, not cache invalidation  
4. **Components compose** - Can nest, query, and update independently
5. **Pipes transform** - Work with live updates
6. **Performance scales** - Batching prevents N+1 queries

The goal: Write Hypernotes knowing they'll behave predictably!