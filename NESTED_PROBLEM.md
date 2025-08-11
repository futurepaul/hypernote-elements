# NESTED_PROBLEM.md - Profile Components Not Loading on First Render

## The Problem

Profile components in the client example are not loading profile data on first page load, but work fine on subsequent renders or when the cache is warm. This is a regression - it used to work fine!

### Symptoms

1. **First load**: Profile components show as blank/loading, no profile pictures or names appear
2. **After any re-render**: Profiles suddenly load correctly
3. **With warm cache**: Everything works immediately
4. **Console errors**: "bad req: uneven size input to from_hex" - indicating we're sending invalid pubkeys to relays

### The Core Issue

This appears to be a race condition in how nested components (profiles inside a loop) resolve their arguments and execute queries:

```markdown
[each $following_feed as $note]
  [#profile $note.pubkey]  <!-- This doesn't get the pubkey value on first render -->
[/each]
```

## What We've Tried

### 1. Fixed Loop Variable Resolution
**Problem**: Loop variables weren't being resolved correctly in string templates
**Solution**: Changed `processString` to spread loop variables directly into context
```typescript
// Before: loop: ctx.loopVariables
// After: ...ctx.loopVariables
```
**Result**: ✅ Loop variables now resolve, but profiles still don't load initially

### 2. Made Resolved Arguments Reactive
**Problem**: Component arguments weren't updating when context changed
**Solution**: Wrapped `resolvedArgument` in `useMemo` with proper dependencies
```typescript
const resolvedArgument = useMemo(() => {
  return resolveExpression(argument, ctx);
}, [argument, ctx.loopVariables, ctx.queryResults, ...]);
```
**Result**: ✅ Arguments update when context changes, but initial load still broken

### 3. Added Guards for Invalid Arguments
**Problem**: Components were trying to load with "undefined" or empty pubkeys
**Solution**: Added checks to skip loading if argument is invalid
```typescript
if (resolvedArgument === 'undefined' || resolvedArgument === '') {
  return; // Don't try to load
}
```
**Result**: ⚠️ Prevents bad queries but doesn't fix the root cause

### 4. Wait for Target Context Before Rendering
**Problem**: Components were rendering before target context was ready
**Solution**: Added loading state until targetContext is available
```typescript
if (!targetContext) {
  return <div>Loading component data...</div>;
}
```
**Result**: ⚠️ Shows loading state but doesn't solve the timing issue

### 5. Skip Queries with Unresolved Variables
**Problem**: Queries with `target.pubkey` were being sent as literal strings
**Solution**: Made QueryExecutor skip queries with unresolved variables
```typescript
if (this.hasUnresolvedVariables(substituted)) {
  console.warn(`Skipping query ${name} - has unresolved variables`);
  return;
}
```
**Result**: ✅ Prevents bad queries but profiles still don't load initially

## The Real Problem

The issue seems to be a complex interaction between:

1. **Query Execution Timing**: The profile component's queries execute before the target is ready
2. **Live Subscriptions**: Live subscriptions work correctly (they get proper context)
3. **Component Lifecycle**: Components mount and try to fetch data before their arguments are resolved
4. **Cache Behavior**: When cache is warm, everything works (suggests the data IS being fetched, just not rendered)

## What's Actually Happening

### On First Load:
1. Client page loads, starts fetching `$contact_list` and `$following_feed`
2. `$following_feed` initially returns empty (waiting for `followed_pubkeys`)
3. `$contact_list` completes, extracts `followed_pubkeys`
4. `$following_feed` re-executes with real pubkeys, gets events
5. Loop renders with events, creates profile components
6. Profile components get correct `$note.pubkey` values
7. **BUT**: Profile components' internal queries (`$profile`) execute with `target.pubkey` unresolved
8. Live subscriptions set up correctly and would work, but initial fetch failed

### On Re-render or Warm Cache:
1. Everything already in place
2. Profile components get correct context immediately
3. Queries execute with proper `target.pubkey` values
4. Profiles load correctly

## The Frustrating Part

This USED TO WORK! Something in our simplification refactor broke the timing/lifecycle that was previously working. The old version might have:
- Executed queries differently
- Had different component mounting behavior  
- Handled context passing in a way that avoided this race condition

## Potential Root Causes

1. **useQueryExecution Hook Timing**: The hook might be executing too early in the component lifecycle
2. **Context Propagation**: The target context isn't being passed down quickly enough
3. **Component Mounting**: Components mount before they have valid data to work with
4. **Initial vs Live Query Execution**: Initial execution path is different from live subscription path

## What We Haven't Tried Yet

1. **Delay Query Execution**: Don't execute component queries until target is confirmed valid
2. **Synchronous Context Resolution**: Ensure target context is resolved before component mounts
3. **Query Retry**: If initial query fails due to missing context, retry when context becomes available
4. **Prefetch Profile Data**: Fetch all profile data at the parent level and pass down as props

## The Workaround That Would Work

Instead of nested components, fetch all profile data in the parent and pass it down:
```yaml
"$all_profiles":
  kinds: [0]
  authors: $followed_pubkeys  # This would work!
```

But this defeats the purpose of component composition and reusability!

## The Bigger Architecture Problem

We have two deeply challenging problems that are currently intertwined with our rendering logic:

### 1. Dependent Queries
Queries that depend on variables extracted from other queries:
```yaml
"$contact_list":
  pipe:
    - save: followed_pubkeys  # Extracts a variable

"$following_feed":
  authors: $followed_pubkeys  # Depends on that variable
```

### 2. Dependent Event Creation  
Reactive events that wait for other events to complete:
```yaml
"@increment":
  kind: 25910
  content: "{$count}"  # Publishes event

"@on_increment":
  match:
    "#e": "{@increment.id}"  # Waits for increment's event ID
  then:
    content: "{result}"  # Creates new event with result
```

## The Architectural Solution

These dependency problems should be **lifted out** of the rendering logic entirely. The renderer should be a **dumb, pure function** that takes state and renders it. No complex logic, no race conditions, just:

```typescript
function render(state: State): JSX {
  // Pure rendering, no side effects
  // No query execution
  // No dependency resolution
  // Just render what you're given
}
```

### Separate Dependency Resolution Layer

We need a clean separation:

```typescript
// 1. Dependency Graph Builder
const queryGraph = buildQueryDependencyGraph(queries);
const eventGraph = buildEventDependencyGraph(events);

// 2. Dependency Resolver (handles all the complex logic)
const resolvedQueries = await resolveQueryDependencies(queryGraph, context);
const eventHandlers = createEventHandlers(eventGraph, context);

// 3. Pure Renderer (dumb and simple)
return render({
  queryResults: resolvedQueries,
  eventHandlers: eventHandlers,
  context: context
});
```

### Benefits of This Approach

1. **Testable**: Each layer can be tested independently
2. **Debuggable**: Can visualize dependency graphs, see execution order
3. **Predictable**: No race conditions in rendering
4. **Cacheable**: Dependency resolution can be memoized
5. **Simple**: Renderer becomes trivially simple

### What This Means for Our Current Problem

The profile loading issue is a symptom of having dependency resolution mixed into rendering:

- Components try to execute queries during render
- Queries depend on context that might not be ready
- No clear way to wait for dependencies
- Race conditions everywhere

If we had proper dependency resolution:
1. Build graph: "Profile component needs target.pubkey"
2. Resolve: "Wait for loop to provide $note.pubkey"
3. Execute: "Now fetch profile with resolved pubkey"
4. Render: "Here's your data, just display it"

### Implementation Sketch

```typescript
// query-dependency-resolver.ts
export class QueryDependencyResolver {
  private graph: DependencyGraph;
  
  async resolveAll(queries: QueryMap, context: Context) {
    // 1. Build dependency graph
    this.graph = this.buildGraph(queries);
    
    // 2. Topological sort for execution order
    const order = this.graph.getExecutionOrder();
    
    // 3. Execute in order, updating context as we go
    const results = new Map();
    for (const queryName of order) {
      const query = queries[queryName];
      
      // Wait for dependencies
      await this.waitForDependencies(query, context);
      
      // Execute query
      const result = await this.executeQuery(query, context);
      results.set(queryName, result);
      
      // Extract variables for dependent queries
      this.updateContext(query, result, context);
    }
    
    return results;
  }
}

// event-dependency-resolver.ts
export class EventDependencyResolver {
  async createHandlers(events: EventMap, context: Context) {
    const handlers = new Map();
    
    for (const [name, event] of events) {
      if (event.match) {
        // Reactive event - set up subscription
        handlers.set(name, this.createReactiveHandler(event, context));
      } else {
        // Regular event - create publish handler
        handlers.set(name, this.createPublishHandler(event, context));
      }
    }
    
    return handlers;
  }
}

// renderer.tsx - Now MUCH simpler!
export function Renderer({ content }: { content: Hypernote }) {
  // Resolve all dependencies BEFORE rendering
  const { queryResults, eventHandlers } = useDependencyResolution(content);
  
  // Pure render with resolved data
  return renderElements(content.elements, {
    queryResults,
    eventHandlers,
    // No complex logic here!
  });
}
```

## Next Steps

1. **Extract dependency resolution** from rendering logic
2. **Build proper dependency graphs** with cycle detection
3. **Implement clean execution pipeline** that respects dependencies
4. **Make renderer pure** - just takes data and renders it
5. **Add retry/refresh mechanism** for failed dependencies

The most frustrating part is that the data IS there, the context IS correct (as evidenced by console logs showing correct pubkeys), but our current architecture makes it nearly impossible to coordinate the timing correctly. We need to fundamentally restructure how we handle dependencies.