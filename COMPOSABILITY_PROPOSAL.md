# Hypernote Composability Proposal

## Goal
Make queries, actions, pipes, and component embeds compose seamlessly to enable complex reactive applications.

## Current Limitations

1. **Live queries don't work with pipes** - Line 237-239 in useQueryExecution.ts skips live updates for piped queries
2. **Components can't declare live queries** - Components execute queries once, no subscription option
3. **Actions can't trigger selective query refresh** - All queries refresh on any action
4. **Pipes are data-only** - Can't compose with queries or actions

## Proposed Solutions

### 1. Live Queries with Pipes

**Problem**: When a new event arrives, we can't just append it - pipes may filter/transform it.

**Solution**: Re-execute pipe chain on live updates
```typescript
// In useQueryExecution.ts, replace lines 237-252
if (pipe && pipe.length > 0) {
  // Re-fetch all events and re-apply pipes
  const allEvents = await fetchEvents(resolvedFilter);
  const processed = applyPipes([...allEvents, event], pipe);
  
  setQueryResults(prev => ({
    ...prev,
    [queryName]: processed
  }));
} else {
  // Simple append for non-piped queries
  setQueryResults(prev => ({
    ...prev,
    [queryName]: [event, ...prev[queryName]]
  }));
}
```

### 2. Component Live Queries

**Enable live subscriptions in component queries:**

```markdown
#profile(kind: 0):
  queries:
    "$posts":
      kinds: [1]
      authors: [target.pubkey]
      live: true  # New flag
      pipe:
        - reverse
        - first: 10
```

**Implementation in ComponentWrapper:**
```typescript
// Check for live queries
const hasLiveQueries = componentDef.queries && 
  Object.values(componentDef.queries).some(q => q.live);

if (hasLiveQueries) {
  // Use a special hook that maintains subscriptions
  const { queryResults, extractedVariables } = useLiveQueryExecution(
    componentDef.queries,
    queryOptions
  );
} else {
  // One-shot execution as before
  const { queryResults, extractedVariables } = useQueryExecution(
    componentDef.queries,
    queryOptions
  );
}
```

### 3. Query Composition in Components

**Allow components to inherit and compose parent queries:**

```markdown
#feed_item(kind: 1):
  queries:
    # Inherit parent's query result
    "$parent_feed": { inherit: true }
    
    # Compose new query based on parent
    "$replies":
      kinds: [1]
      "#e": [target.id]  # Replies to this note
      live: true
    
    # Derive data from multiple queries
    "$stats":
      pipe:
        - from: [$parent_feed, $replies]
        - reduce: |
            { 
              total: $parent_feed.length + $replies.length,
              reply_count: $replies.length 
            }
```

### 4. Unified Operation System

**Treat queries, actions, and pipes as composable operations:**

```typescript
interface Operation<T = any> {
  type: 'query' | 'action' | 'pipe' | 'composite'
  execute(context: OperationContext): Promise<T>
  subscribe?(callback: (data: T) => void): () => void
  dependencies?: string[]
}

// Example: Composite operation
const followingFeed: Operation = {
  type: 'composite',
  dependencies: ['$contact_list'],
  async execute(context) {
    // Get contact list
    const contacts = await context.execute('$contact_list');
    
    // Extract pubkeys via pipe
    const pubkeys = applyPipes(contacts, [
      'first',
      'get: tags',
      'pluckIndex: 1'
    ]);
    
    // Execute feed query with resolved pubkeys
    return context.execute('$feed', {
      kinds: [1],
      authors: pubkeys,
      limit: 20
    });
  },
  subscribe(callback) {
    // Subscribe to both contact changes AND new posts
    return combineSubscriptions([
      '$contact_list',
      '$feed'
    ], callback);
  }
}
```

### 5. Reactive Pipe Operations

**Allow pipes to trigger actions or queries:**

```markdown
"$notifications":
  kinds: [1]
  "#p": [user.pubkey]
  limit: 10
  pipe:
    - filter: "!seen"
    - each: |
        @mark_as_seen(id: $.id)  # Trigger action for each
    - count
    - if: "> 0"
      then: |
        toast("You have new notifications!")
```

### 6. Smart Cache Invalidation

**Selective invalidation based on relationships:**

```typescript
class QueryCache {
  private dependencies = new Map<string, Set<string>>();
  
  registerDependency(query: string, dependsOn: string) {
    if (!this.dependencies.has(dependsOn)) {
      this.dependencies.set(dependsOn, new Set());
    }
    this.dependencies.get(dependsOn)!.add(query);
  }
  
  invalidate(queryName: string, cascade = true) {
    // Invalidate this query
    this.cache.delete(queryName);
    
    if (cascade) {
      // Invalidate all dependent queries
      const dependents = this.dependencies.get(queryName) || new Set();
      for (const dependent of dependents) {
        this.invalidate(dependent, true);
      }
    }
  }
  
  // Smart invalidation on new events
  onNewEvent(event: NostrEvent) {
    // Find queries that would include this event
    const affected = this.findAffectedQueries(event);
    
    // Only invalidate affected queries
    for (const query of affected) {
      this.invalidate(query, true);
    }
  }
}
```

### 7. Component Query Batching

**Batch similar queries across multiple component instances:**

```typescript
class ComponentQueryBatcher {
  private pending = new Map<string, Set<ComponentInstance>>();
  private timer: NodeJS.Timeout | null = null;
  
  addQuery(component: ComponentInstance, query: Query) {
    const key = this.getQueryKey(query);
    
    if (!this.pending.has(key)) {
      this.pending.set(key, new Set());
    }
    this.pending.get(key)!.add(component);
    
    // Batch execution
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), 0);
    }
  }
  
  async flush() {
    const batches = new Map<string, Query>();
    
    // Merge similar queries
    for (const [key, components] of this.pending) {
      const merged = this.mergeQueries(components);
      batches.set(key, merged);
    }
    
    // Execute batched queries
    const results = await Promise.all(
      Array.from(batches.entries()).map(([key, query]) =>
        this.executeQuery(query)
      )
    );
    
    // Distribute results to components
    // ...
    
    this.pending.clear();
    this.timer = null;
  }
}
```

## Implementation Roadmap

### Phase 1: Core Improvements (Week 1)
- [ ] Fix live queries with pipes
- [ ] Add `live` flag to component queries
- [ ] Implement smart cache invalidation

### Phase 2: Composition (Week 2)
- [ ] Query inheritance in components
- [ ] Reactive pipe operations
- [ ] Component query batching

### Phase 3: Unification (Week 3)
- [ ] Unified Operation interface
- [ ] Composite operations
- [ ] Cross-operation subscriptions

## Benefits

1. **Better Performance**: Smart caching and batching reduce unnecessary network calls
2. **Improved DX**: Declarative composition instead of imperative coordination
3. **Real-time Apps**: Live queries work everywhere, including components
4. **Complex UIs**: Components can compose queries and maintain their own state
5. **Predictable Behavior**: Clear dependency graph and invalidation rules

## Example: Full Twitter-like Client

With these improvements, we could build:

```markdown
---
queries:
  "$contacts":
    kinds: [3]
    authors: [user.pubkey]
    live: true
    pipe:
      - first
      - get: tags
      - pluckIndex: 1
  
  "$feed":
    kinds: [1]
    authors: $contacts
    limit: 50
    live: true
    pipe:
      - sort: created_at desc
---

# Following Feed

[each:$feed]
  #tweet(target: "naddr:...")
    queries:
      "$replies":
        kinds: [1]
        "#e": [target.id]
        live: true
      
      "$likes":
        kinds: [7]
        "#e": [target.id]
        live: true
        pipe:
          - count
    
    elements:
      [div]
        {target.content}
        
        [div]
          💬 {$replies | count} replies
          ❤️ {$likes} likes
          
          [button:@like]Like[/button]
          [button:@reply]Reply[/button]
[/each]
```

This would create a fully reactive, real-time Twitter-like feed with minimal code!