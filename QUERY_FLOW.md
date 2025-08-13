# Hypernote Query Execution Flow

## Overview
This document traces the complete flow of query execution in Hypernote, from initial compilation through rendering, caching, and live subscriptions.

## 1. Compilation Phase (compile-time)

### Input: Hypernote Markdown
```markdown
"$contact_list":
  kinds: [3]
  authors: [user.pubkey]
  limit: 1
  pipe:
    - first
    - get: tags
    - whereIndex: 
        index: 0
        eq: "p"
    - pluckIndex: 1

"$following_feed":
  kinds: [1]
  authors: $contact_list  # Reference to another query
  limit: 20
  since: 0
```

### Output: Compiled JSON
```json
{
  "queries": {
    "$contact_list": {
      "kinds": [3],
      "authors": ["user.pubkey"],
      "limit": 1,
      "pipe": [...]
    },
    "$following_feed": {
      "kinds": [1],
      "authors": "$contact_list",
      "limit": 20,
      "since": 0
    }
  }
}
```

## 2. Rendering Phase (runtime)

### 2.1 Initial Render (`src/renderer.tsx`)

1. **RenderHypernoteContent** receives compiled JSON
2. Creates memoized queries hash to detect changes
3. Calls `useQueryExecution` (or `useQueryExecutionWithPlanner` if planner enabled)

## 3. Query Execution Phase (`src/hooks/useQueryExecution.ts`)

### 3.1 Initial Resolution

```javascript
useEffect(() => {
  // Skip if no queries
  if (!queries || Object.keys(queries).length === 0) return;
  
  // ... setup ...
  
  const executeQueries = async () => {
    // Create SimpleQueryExecutor with context
    const executor = new SimpleQueryExecutor(
      queries,
      {
        user: { pubkey },  // From auth store
        target: options?.target,  // From component context
        queryResults: new Map(),  // Empty initially
        actionResults: actionResultsMap,
      },
      fetchEvents  // Function that uses cache
    );
    
    // Execute all queries
    const results = await executor.executeAll();
    setQueryResults(resultsObject);
    
    // Set up live subscriptions...
  };
}, [queriesHash, snstrClient, pubkey, ...]);
```

### 3.2 SimpleQueryExecutor Resolution (`src/lib/simple-query-executor.ts`)

```javascript
async executeAll() {
  // Phase 1: Sort queries by dependencies
  const sortedQueries = this.topologicalSort(this.queries);
  
  // Phase 2: Execute in order
  for (const queryName of sortedQueries) {
    // Resolve filter variables
    const resolvedFilter = this.resolveFilter(filter, this.context);
    
    // For $contact_list:
    // - authors: ["user.pubkey"] → authors: ["0d6c8388..."] (actual pubkey)
    
    // Fetch events
    const events = await this.fetcher(resolvedFilter);
    
    // Apply pipes
    const processed = applyPipes(events, pipes);
    // Result: ["pubkey1", "pubkey2", ...] (array of followed pubkeys)
    
    // Store in context for next queries
    this.context.queryResults.set(queryName, processed);
  }
  
  // For $following_feed:
  // - authors: "$contact_list" → authors: ["pubkey1", "pubkey2", ...]
  // - Fetches with resolved filter
}
```

### 3.3 Query Cache (`src/lib/queryCache.ts`)

```javascript
async getOrFetch(filter, fetcher) {
  const key = this.getCacheKey(filter);  // Deterministic hash
  
  // Check cache
  const existing = this.cache.get(key);
  if (existing && !expired) return existing.events;
  
  // Fetch from network
  const events = await fetcher(filter);
  
  // Store in cache
  this.cache.set(key, { events, timestamp: Date.now() });
  return events;
}
```

## 4. Live Subscription Setup (FIXED!)

### 4.1 The Solution: Store and Reuse Resolved Filters

We implemented **Option A** from the potential solutions. SimpleQueryExecutor now returns both results AND resolved filters:

```javascript
// SimpleQueryExecutor.ts
export class SimpleQueryExecutor {
  private resolvedFilters: Map<string, any> = new Map();
  
  async executeAll(): Promise<{ results: Map<string, any>, resolvedFilters: Map<string, any> }> {
    // ... execute queries ...
    
    // Store resolved filter for each query
    this.resolvedFilters.set(queryName, resolvedFilter);
    
    return { results, resolvedFilters: this.resolvedFilters };
  }
}
```

### 4.2 Live Subscription Setup (Working)

```javascript
// useQueryExecution.ts
const { results, resolvedFilters } = await executor.executeAll();

// Set up live subscriptions using pre-resolved filters
Object.entries(queries).forEach(([queryName, queryConfig]) => {
  const { pipe, triggers } = queryConfig;
  
  // Get the already-resolved filter from executor
  const resolvedFilter = resolvedFilters.get(queryName);
  
  if (!resolvedFilter) {
    console.log(`[LIVE] No resolved filter for ${queryName}, skipping`);
    return;
  }
  
  // The filter is already fully resolved!
  // For $following_feed: { kinds: [1], authors: ["pubkey1", "pubkey2", ...], limit: 20 }
  
  console.log(`[LIVE] Starting subscription for ${queryName}`);
  // Create live subscription with properly resolved filter...
});
```

## 5. Data Flow Diagram (Updated)

```
Markdown → Compiler → JSON
                       ↓
                  RenderHypernoteContent
                       ↓
                  useQueryExecution
                       ↓
                  SimpleQueryExecutor
                    ↓     ↓     ↓
        [Resolve]  [Execute]  [Apply Pipes]
            ↓          ↓           ↓
    resolved filter → events → processed results
            ↓          ↓           ↓
     [STORED] ←   queryCache   resultsObject
            ↓                      ↓
            ↓                  setQueryResults
            ↓                      ↓
    [REUSED] ←──────────────── Live Subscription Setup
                               (Uses stored filters!)
```

## 6. Component Rendering & Infinite Loop Prevention

### 6.1 The Problem: Re-render Cascades

When a live event arrives for `$following_feed`:
1. `setQueryResults` updates state with new event
2. All components using that data re-render
3. Each profile component creates NEW context objects
4. New context triggers useEffect/useMemo in child components
5. This could trigger new query executions
6. **INFINITE LOOP!**

### 6.2 The Solution: Skip Query Execution for Pre-populated Components

```javascript
// ComponentRenderer.tsx
function ComponentRenderer({ componentDef, context, elementStyle, elementId }) {
  const hasPrePopulatedData = context.queryResults && Object.keys(context.queryResults).length > 0;
  
  // For ANY component with pre-populated data, skip all query logic
  if (hasPrePopulatedData) {
    // Directly render without hooks or effects that could trigger re-execution
    return (
      <div id={elementId} style={elementStyle}>
        {componentDef.elements?.map((el, i) => (
          <React.Fragment key={i}>
            {renderElement(el, context)}
          </React.Fragment>
        ))}
      </div>
    );
  }
  
  // Only components without pre-populated data run query execution
  const { queryResults, extractedVariables } = useQueryExecutionWithPlanner(...);
  // ...
}
```

### 6.3 Generic Pre-population for Any Component Type

```javascript
// ComponentWrapper.tsx - Works for ANY component type, not just profiles!
const preResolvedQueries = useMemo(() => {
  const queries = {};
  
  if (targetContext && Object.keys(targetContext).length > 1) {
    // For kind:0 (profiles) - pre-populate $profile query
    if (componentDef.kind === 0 && targetContext.name) {
      queries['$profile'] = {
        name: targetContext.name,
        picture: targetContext.picture,
        nip05: targetContext.nip05
      };
    } 
    // For kind:1 (notes) - pre-populate $note query
    else if (componentDef.kind === 1 && targetContext.content) {
      queries['$note'] = targetContext;
    }
    // Add more patterns as components need them
  }
  
  return queries;
}, [componentDef.kind, targetContext]);
```

### 6.4 React Hook Order Consistency

**Critical**: Hooks must ALWAYS be called in the same order!

```javascript
// WRONG - conditional hook usage
function Component() {
  if (condition) {
    const data = useMemo(...);  // Sometimes called
  }
  // React will crash!
}

// CORRECT - hooks before conditions
function Component() {
  const data = useMemo(...);  // Always called
  
  if (condition) {
    return early;  // Conditional return is OK
  }
}
```

## 7. Performance Optimizations

### 7.1 Target Batching

The `TargetBatcher` collects all profile fetch requests that happen synchronously and batches them into a single network request:

```javascript
// Instead of 20 individual requests for 20 profile components:
// ❌ ["REQ", id1, {kinds:[0], authors:["pubkey1"], limit:1}]
// ❌ ["REQ", id2, {kinds:[0], authors:["pubkey2"], limit:1}]
// ... 18 more ...

// We send ONE batched request:
// ✅ ["REQ", id, {kinds:[0], authors:["pubkey1","pubkey2",...], limit:20}]
```

### 7.2 Query Planning (Optional)

The `QueryPlanner` system provides two-phase execution:
1. **Planning Phase**: Components register their queries
2. **Execution Phase**: Similar queries are batched and executed together

This is wrapped in `QueryPlannerProvider` and used via `useQueryExecutionWithPlanner`.

## 8. Current Architecture Summary

### ✅ Working Features

1. **Query Execution**: SimpleQueryExecutor resolves dependencies and executes in correct order
2. **Live Subscriptions**: Work for all queries including derived ones (`$following_feed`)
3. **Component Rendering**: Generic system works for any component type (profiles, notes, etc.)
4. **Performance**: Batching prevents N+1 query problems
5. **Caching**: QueryCache prevents duplicate network requests
6. **Re-render Prevention**: Pre-populated components skip query execution entirely

### 🎯 Key Insights

1. **Store Resolved Filters**: Don't try to resolve twice - store and reuse
2. **Skip Hooks for Pre-populated Data**: Prevents infinite re-render loops
3. **Hook Order Matters**: Always call hooks before conditionals
4. **Generic Over Specific**: System works for ANY event type, not just profiles

### 📊 Flow Summary

```
User Action → Queries Execute → Filters Stored → Live Subs Created
     ↓                                                    ↓
New Event Arrives ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← Live Update
     ↓
State Updates → Components Re-render (with pre-populated data)
     ↓
Skip Query Execution → No Infinite Loop! ✅
```