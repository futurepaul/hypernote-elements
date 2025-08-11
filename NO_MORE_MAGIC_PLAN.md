# NO_MORE_MAGIC Implementation Plan

## Core Principles (from NO_MORE_MAGIC_FINAL)

1. **Explicit dependencies** - When a query uses another query's output, it's explicit via direct reference
2. **Components take one ID** - Either a pubkey (kind: 0) or event ID (kind: 1)  
3. **Simple data flow** - Queries output specific types based on their pipe operations
4. **All queries are live by default** - Remove the `live` field entirely
5. **No more reactive events** - Replace `match`/`then` pattern with `triggers` and implicit dependencies

## What to Delete (False Starts)

### Files to Remove
- `src/hooks/useDependencyResolution.ts` - Complex dependency graph building
- `src/hooks/usePreResolvedQueries.ts` - Premature optimization
- `src/lib/dependency-resolver.ts` - Over-engineered dependency resolution
- `src/lib/query-executor.ts` - Complex topological sorting

### Code to Remove from Existing Files
- `src/hooks/useQueryExecution.ts` - Simplify to basic query execution
- `src/renderer.tsx` - Remove reactive event subscriptions, simplify context
- `src/lib/pipes.ts` - Remove `save` operation and extracted variables

## Schema Changes (`src/lib/schema.ts`)

### 1. Remove from QuerySchema
```typescript
// REMOVE:
// - live field (everything is live by default)
// - Legacy pipe operations
```

### 2. Update EventTemplateSchema
```typescript
// REMOVE:
// - match field
// - then field  
// - pipe field (for events)
// - tool_call, provider, tool_name, arguments (deprecated)

// ADD:
// - triggers: z.string().optional() // Query to refresh after publishing
```

### 3. Remove Reactive Event Support
No more complex reactive subscriptions - just triggers that refresh queries.

## Renderer Simplification (`src/renderer.tsx`)

### 1. Simplify RenderContext
```typescript
interface RenderContext {
  queryResults: Record<string, any>; // Direct query outputs
  formData: Record<string, string>;
  userPubkey: string | null;
  loopVariables: Record<string, any>;
  target?: TargetContext; // For components only
  
  // Callbacks
  onFormSubmit: (eventName: string) => void;
  onInputChange: (name: string, value: string) => void;
}
```

### 2. Remove Complex Features
- Remove reactive event subscriptions (lines 177-288)
- Remove extracted variables everywhere
- Remove dependency graph building
- Remove pre-resolved queries logic

### 3. Simplify Query Execution
```typescript
// New simple approach:
// 1. Detect references to other queries ($otherQuery)
// 2. Execute them first (implicit wait)
// 3. Use their output directly
// 4. No save operations, no extracted variables
```

## Query Execution Changes (`src/hooks/useQueryExecution.ts`)

### Simplified Logic
1. Parse query for references to other queries (`$otherQuery`)
2. Execute referenced queries first
3. Replace references with their outputs
4. Execute the query
5. Apply pipes to get final output
6. Return output directly (no extraction)

## Pipe Changes (`src/lib/pipes.ts`)

### Remove
- `save` operation completely
- Extracted variables concept
- Complex variable resolution

### Query Output Types (Inferred)
| Final Pipe Op | Output Type | Example |
|--------------|-------------|---------|
| (no pipe) | Event[] | Raw events |
| `first` | Event | Single event |
| `pluckIndex: 1` | string[] | Array of values |
| `pluckTag: p` | string[] | Array of pubkeys |
| `get: field` | any | Field value |
| `count` | number | Count of items |

## Event Publishing Changes

### Add Triggers
When an event is published:
1. Get the event ID from the result
2. If `triggers` field exists, invalidate that query
3. This causes automatic re-fetch (since all queries are live)

## Component Changes

### Single ID Input
Components declare their expected input via `kind`:
- `kind: 0` → expects pubkey
- `kind: 1` → expects event ID

Components fetch everything else they need themselves.

## Migration Examples

### Client.md
```yaml
# OLD
"$contact_list":
  pipe:
    - save: followed_pubkeys
"$following_feed":
  authors: $followed_pubkeys

# NEW
"$contact_list":
  pipe:
    - first
    - get: tags
    - pluckTag: p
"$following_feed":
  authors: $contact_list  # Direct reference
```

### Counter.md
```yaml
# OLD (reactive events)
"@on_increment":
  match:
    kinds: [25910]
    "#e": "{@increment.id}"
    authors: ["19f5b5cd2fce663a3b4916b42c378c0280cce2bffd0af384380e91356fcff1d6"]
  pipe:
    - first
    - get: content
    - json
    - get: result
    - get: content
    - first
    - get: text
  then:
    kind: 30078
    content: "{result}"
    tags:
      - ["d", "counter"]

# NEW (triggers and implicit dependencies)
"@increment":
  kind: 25910
  json:
    jsonrpc: "2.0"
    id: "{time.now}"
    method: "tools/call"
    params:
      name: "addone"
      arguments:
        a: "{$count or 0}"
  tags:
    - ["p", "19f5b5cd2fce663a3b4916b42c378c0280cce2bffd0af384380e91356fcff1d6"]
  triggers: $update_count  # Trigger query after publishing

"$update_count":
  kinds: [25910]
  "#e": @increment  # Implicit wait for @increment to complete (gets event ID)
  authors: ["19f5b5cd2fce663a3b4916b42c378c0280cce2bffd0af384380e91356fcff1d6"]
  pipe:
    - first
    - get: content
    - json
    - get: result
    - get: content
    - first
    - get: text
  triggers: @save_count  # Trigger the save action

"@save_count":
  kind: 30078
  content: "{$update_count}"  # Use the result from the query
  tags:
    - ["d", "counter"]
  # No triggers needed - $count will auto-update since it's live!

"$count":
  kinds: [30078]
  authors: [user.pubkey]
  "#d": ["counter"]
  pipe:
    - first
    - get: content
    - default: "0"
  # Automatically updates when new 30078 events are published (live by default)
```

## Progress Update

### ✅ Completed
- **Phase 1: Clean Up False Starts**
  - Deleted unused files (dependency-resolver, pre-resolved queries, query-executor)
  - Created SimpleQueryExecutor for implicit waits
  - Removed reactive event subscriptions from renderer.tsx
  
- **Phase 2: Schema Updates**
  - Removed `match`/`then` from EventTemplateSchema
  - Added `triggers` field to both events AND queries
  - Removed `save` operation from pipes.ts and pipe-schema.ts
  - No `live` field - everything is live by default

- **Phase 3: Query Execution**
  - Created SimpleQueryExecutor with implicit waits
  - Queries can reference other queries/actions directly
  - Output type inferred from final pipe operation

- **Phase 5: Examples**
  - Updated counter.md to use triggers pattern
  - Counter now compiles successfully!

### 🚧 Remaining Issues

1. **Event IDs not propagating** 
   - When action publishes, need to store event ID as `@action.id`
   - Queries referencing `@action` should get that event ID

2. **Query invalidation broken**
   - Hash-based query change detection not working
   - Queries don't re-execute when edited

3. **Trigger execution not implemented**
   - Actions with `triggers` field don't actually trigger queries
   - Queries with `triggers` field don't actually trigger actions

### 📝 Refined Rules

**Trigger Rules:**
- Actions can have `triggers` → trigger queries (e.g., `@increment` triggers `$update_increment`)
- Queries can have `triggers` → trigger actions (e.g., `$update_increment` triggers `@save_increment`)

**Implicit Wait Rules:**
- Queries reference other queries directly for data (e.g., `authors: $contact_list`)
- Queries reference actions for event IDs (e.g., `"#e": ["@increment"]`)
- Both cause implicit waits

## Implementation Steps (Updated)

### Phase 4: Fix Core Issues
1. ✅ Simplify RenderContext (partially done)
2. ❌ Store published event IDs as `@action.id` in context
3. ❌ Implement trigger execution after actions/queries complete
4. ❌ Fix query hash invalidation

### Phase 5: Complete Migration
1. ✅ Update counter.md to use triggers
2. ❌ Update client.md to use direct references
3. ❌ Test all examples work correctly

## Benefits

1. **~500 lines deleted** - Remove dependency graphs, reactive subscriptions, extracted variables
2. **Clearer data flow** - Can trace dependencies by reading YAML
3. **No race conditions** - Implicit waits prevent timing issues  
4. **Simpler mental model** - Just queries, actions, and triggers
5. **Better performance** - No complex graph analysis at runtime

## Testing Strategy

1. Start with simplest example (counter.md)
2. Verify triggers work for refreshing data
3. Test client.md with implicit query dependencies
4. Ensure components still work with single ID input
5. Verify all examples compile and render correctly