# Architecture Simplification Opportunities

## Current Architecture Strengths
1. **SimpleQueryExecutor** handles dependency resolution cleanly with topological sorting
2. **Pipes** work well for data transformation
3. **Component embedding** with pre-population prevents infinite loops
4. **TargetBatcher** optimizes N+1 queries effectively

## Simplification Opportunities

### 1. Unified Query Context
**Current Issue**: Query execution happens in multiple places (main render, components, loops)
**Opportunity**: Create a single `QueryContext` that handles all query execution patterns

```typescript
interface QueryContext {
  // Core execution
  execute(queryName: string): Promise<any>
  executeAll(queries: Record<string, Query>): Promise<Map<string, any>>
  
  // Live subscriptions
  subscribe(queryName: string, callback: (data: any) => void): () => void
  
  // Batching
  batchRequests<T>(requests: Request[]): Promise<T[]>
}
```

### 2. Component Query Composition
**Current Issue**: Components can't easily share queries with parent or subscribe to live data
**Opportunity**: Allow components to declare query dependencies that bubble up

```markdown
# Component that composes with parent queries
#profile(kind: 0):
  queries:
    $profile: inherit  # Use parent's $profile query
    $posts:           # Add new query
      kinds: [1]
      authors: [target.pubkey]
      live: true      # Subscribe to live updates
```

### 3. Generic Action/Query Integration
**Current Issue**: Actions and queries are separate systems
**Opportunity**: Unify them as "operations" that can compose

```typescript
interface Operation {
  type: 'query' | 'action' | 'pipe'
  execute(context: Context): Promise<any>
  dependencies?: string[]  // Other operations this depends on
  live?: boolean           // Can subscribe to updates
}
```

### 4. Simplify Pipe System
**Current Issue**: Pipes are powerful but complex with JQ parser
**Opportunity**: Create composable pipe primitives

```typescript
// Instead of complex JQ expressions, use composable functions
const pipes = {
  first: (arr) => arr[0],
  pluck: (key) => (obj) => obj[key],
  filter: (pred) => (arr) => arr.filter(pred),
  map: (fn) => (arr) => arr.map(fn),
  // Compose them
  compose: (...fns) => (x) => fns.reduce((v, f) => f(v), x)
}

// Usage: pipe: [first, pluck('tags'), filter(t => t[0] === 'p')]
```

### 5. Live Query Subscriptions for Components
**Current Issue**: Components can't easily subscribe to live queries
**Opportunity**: Add `live` flag to component queries

```typescript
// In ComponentWrapper
if (componentDef.queries?.some(q => q.live)) {
  // Set up live subscription that updates component state
  useLiveQueries(componentDef.queries, (updates) => {
    setQueryResults(prev => ({ ...prev, ...updates }))
  })
}
```

### 6. Unified Variable Resolution
**Current Issue**: Multiple resolution systems (resolveVariables, resolveExpression, etc.)
**Opportunity**: Single resolver that handles all cases

```typescript
class VariableResolver {
  resolve(expression: string, context: Context): any {
    // Handle all cases:
    // - $queryName
    // - user.pubkey
    // - target.field
    // - loopVar.property
    // - action results
    // - nested paths: $query.field.subfield
  }
}
```

### 7. Component Lifecycle Hooks
**Current Issue**: Components can't react to query completion or errors
**Opportunity**: Add lifecycle hooks

```markdown
#profile(kind: 0):
  onQueryComplete: |
    console.log('Profile loaded:', $profile)
  onError: |
    toast.error('Failed to load profile')
```

### 8. Query Caching Strategy
**Current Issue**: Cache invalidation is manual
**Opportunity**: Smart cache with auto-invalidation

```typescript
class SmartCache {
  // Auto-invalidate based on:
  // - Time (TTL)
  // - New events published
  // - Related query updates
  // - Manual invalidation
  
  invalidateRelated(queryName: string) {
    // Find queries that depend on this one
    const dependents = this.findDependents(queryName)
    dependents.forEach(q => this.invalidate(q))
  }
}
```

## Implementation Priority

1. **High Priority** (Core functionality):
   - Unified variable resolution
   - Component live queries
   - Smart cache invalidation

2. **Medium Priority** (Developer experience):
   - Simplified pipe system
   - Component lifecycle hooks
   - Query composition

3. **Low Priority** (Future enhancements):
   - Full operation unification
   - Advanced batching strategies

## Key Principles
- **Composability**: Every feature should compose well with others
- **Predictability**: Behavior should be obvious from syntax
- **Performance**: Batch by default, cache aggressively
- **Reactivity**: Live updates should "just work"