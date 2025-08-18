# Real Component Queries

## The Problem
Currently, components are imported with hardcoded naddr references:
```yaml
imports:
  "#profile": naddr1qvzqqqrldqpzqrtvswydevzfhrw5ljxnmrpmhy778k5sh2pguncfezks7dry3z3nqy88wumn8ghj7mn0wvhxcmmv9uq32amnwvaz7tmjv4kxz7fwv3sk6atn9e5k7tcpzamhxue69uhhyetvv9ujuurjd9kkzmpwdejhgtcqp4c8ymmxd9kx2ttzv9jxwegsqyvt2
```

This is static and inflexible. We can't dynamically load components based on data!

## The Solution: Components ARE Queries!

Components should use the EXACT same query syntax as regular queries. The only difference is they're referenced with `[#component_name]` in the renderer.

### New Syntax

```yaml
---
# Components defined just like queries! All use kind 32616
"#counter_display":
  kinds: [32616]  # HYPERNOTE_ELEMENT_KIND - all components use this
  authors: ["19f5b5cd2fce663a3b4916b42c378c0280cce2bffd0af384380e91356fcff1d6"]
  "#d": ["counter-ui"]
  limit: 1
  pipe:
    - first

"#profile":
  kinds: [32616]  # HYPERNOTE_ELEMENT_KIND
  authors: ["some-author-pubkey"]
  "#d": ["profile-component"]
  limit: 1
  pipe:
    - first

# Can even have conditional/dynamic component loading!
"#user_profile":
  kinds: [32616]  # HYPERNOTE_ELEMENT_KIND
  authors: [user.pubkey]  # Dynamic based on logged-in user!
  "#d": ["my-profile-template"]
  limit: 1
---

# Using Components

## Basic usage (no argument)
[#counter_display]

## With argument (like current profile usage)
[#profile user.pubkey]
[#profile $note.pubkey]
```

## CRITICAL: Dependency Ordering

### The Challenge
When a component is used with an argument from another query like `[#profile $note.pubkey]`, we MUST ensure:
1. The `$note` query executes FIRST
2. The `$note.pubkey` value is extracted
3. ONLY THEN can the `#profile` component query execute

### Current Working Solution
The existing dependency resolution in HypernoteExecutor already handles this for data queries. We must preserve this logic when adding component queries:
- SimpleQueryExecutor builds a dependency graph
- Queries execute in topological order
- Variables from completed queries become available to dependent queries

### Component Query Dependencies
Component queries can have dependencies in TWO places:
1. **In the query definition itself**: `"#dynamic_profile": { authors: $trusted_authors }`
2. **In the component usage**: `[#profile $note.pubkey]`

Both must be resolved before the component can render!

## Implementation Plan

### Phase 1: Update Schema
1. Components are just queries with `#` prefix
2. Remove `imports` field from schema completely (Option 2: clean break)
3. Component queries execute just like regular queries

### Phase 2: Update Renderer
1. When renderer sees `[#component_name]`, it:
   - Looks up the query result for `#component_name`
   - That result should be a Hypernote element (kind 32616 or similar)
   - Renders that element's content
2. If component takes an argument:
   - Pass it as `target` context to the component
   - Component can use `target.field` in its own queries/content

### Phase 3: Update HypernoteExecutor
1. Treat `#component` queries the same as `$queries`
2. They go through the same:
   - Dependency resolution
   - Live subscriptions
   - Caching
   - Everything!

## Benefits

### 1. Dynamic Component Loading
```yaml
# Load different components based on conditions!
"#current_view":
  kinds: [32616]
  authors: ["mcp-server"]
  "#d": ["{$view_mode or 'default'}"]  # Can use variables!
  limit: 1
```

### 2. Live Component Updates
Since components are queries, they're automatically live! When the MCP publishes a new version of the component, it updates automatically.

### 3. Consistent Mental Model
- `$query_name` = data query
- `#component_name` = component query (returns renderable Hypernote)
- Both use the exact same syntax and features!

### 4. Component Dependencies
Components can depend on other queries:
```yaml
"#dynamic_profile":
  kinds: [32616]
  authors: $trusted_component_authors  # Based on another query!
  "#d": ["profile-v2"]
```

## Example: Counter Hypermedia

```yaml
---
# Component query - just like any other query!
"#counter_ui":
  kinds: [32616]
  authors: ["19f5b5cd2fce663a3b4916b42c378c0280cce2bffd0af384380e91356fcff1d6"]
  "#d": ["counter-ui"]
  limit: 1
  pipe:
    - first

"$counter_value":
  kinds: [30078]
  authors: ["19f5b5cd2fce663a3b4916b42c378c0280cce2bffd0af384380e91356fcff1d6"]
  "#d": ["counter-value"]
  limit: 1
  pipe:
    - first
    - get: content
---

## Two Views

### View 1: Data
Count: {$counter_value}

### View 2: Hypermedia Component
[#counter_ui]  <!-- Just render the component! -->
```

## Backwards Compatibility

**Clean Break Approach (Option 2 - CHOSEN)**
- Remove `imports` field completely from schema
- All components MUST use query syntax
- No support for hardcoded naddr references
- This simplifies the codebase and mental model

### Migration Path
1. Convert existing examples that use imports
2. Update componentResolver to work with query results
3. Remove prefetchComponents logic
4. Delete imports-related code paths

## Implementation Steps

1. **Update compiler** to treat `#name` in queries as component definitions
   - Parse `#component_name` queries same as `$query_name`
   - Store in same queries object (unified approach)

2. **Update HypernoteExecutor** to:
   - Execute component queries alongside data queries
   - Maintain dependency ordering for both types
   - Handle component queries that depend on other query results

3. **Update renderer** for component resolution:
   - When encountering `[#component_name argument]`:
     a. Check if argument contains variables (e.g., `$note.pubkey`)
     b. Wait for dependent queries to complete
     c. Resolve the argument value
     d. Execute the component query if not already done
     e. Get the Hypernote element from query result
     f. Parse JSON content as Hypernote
     g. Create target context from argument
     h. Render component with target context

4. **Adapt ComponentResolver**:
   - Change from fetching by naddr to using query results
   - Keep target parsing logic for component arguments
   - Remove prefetchComponents method

5. **Test** with counter-hypermedia example:
   - Update example to use `#counter_ui` query instead of imports
   - Verify live updates still work
   - Test dependency resolution

## Examples to Update

### client.md
Currently uses:
```yaml
imports:
  "#profile": naddr1qvzqqqrldqpzq...
```

Will become:
```yaml
"#profile":
  kinds: [32616]
  authors: ["profile-component-author-pubkey"]
  "#d": ["profile-component"]
  limit: 1
  pipe:
    - first
```

### counter-hypermedia.md
Currently uses `[#counter_element $counter_ui_id]` with hardcoded component.
Will become `[#counter_ui]` with the component query.

## The Magic

This unifies everything! There's no special "component system" - components are just queries that return Hypernote elements. They get all the power of queries for free:
- Live updates
- Dependencies
- Pipes
- Variables
- Caching
- Everything!

And the mental model is dead simple:
- Query for data: `$data`
- Query for UI: `#component`
- Both work exactly the same way!