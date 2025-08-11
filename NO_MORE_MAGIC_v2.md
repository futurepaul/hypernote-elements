# NO_MORE_MAGIC v2 - Unified Explicit Design

## Core Principle: Everything is Props

**ALL** data comes through props - no special variables, no magic contexts.

## The Three Data Sources

### 1. System Props (Always Available)
```yaml
"$my_query":
  kinds: [1]
  authors: [props.user.pubkey]  # User's pubkey
  since: props.time.yesterday    # Time helpers
  until: props.time.now          # Current timestamp
```

System props include:
- `props.user.pubkey` - Current user's pubkey
- `props.user.profile` - Current user's profile (if loaded)
- `props.time.now` - Current timestamp
- `props.time.yesterday` - 24 hours ago
- `props.time.last_week` - 7 days ago
- `props.relay.url` - Current relay URL

### 2. Parent Props (In Components)
```yaml
# Component receives props from parent
"$profile":
  kinds: [0]
  authors: [props.pubkey]  # Passed from parent

# Parent usage
[#profile pubkey=$note.pubkey]
```

### 3. Query/Action References (Implicit Wait)
```yaml
"$contact_list":
  kinds: [3]
  authors: [props.user.pubkey]
  pipe:
    - first
    - get: tags
    - pluckTag: p

"$following_feed":
  kinds: [1]
  authors: $contact_list  # Implicitly waits for contact_list
  limit: 20
```

**Key rule: If you reference another query/action, you implicitly wait for it.**

## Query Outputs (Determined by Pipes)

Queries automatically output based on their final pipe operation:

```yaml
"$contact_list":
  kinds: [3]
  pipe:
    - first          # Outputs single event
    - get: tags      # Outputs array of tags
    - pluckTag: p    # Outputs array of pubkeys
    # Result: outputs pubkeys

"$posts":
  kinds: [1]
  limit: 10
  # No pipe, outputs array of events

"$single_post":
  kinds: [1]
  pipe:
    - first  # Outputs single event
```

Output types are inferred:
- No pipe → array of events
- Pipe ending in `first`/`last` → single event
- Pipe ending in `pluckTag: p` → array of pubkeys
- Pipe ending in `pluckTag: e` → array of event IDs
- Pipe ending in `get: id` → single value or array depending on input

## Action Outputs (Always Event ID)

Actions always output their published event ID:

```yaml
"@post":
  kind: 1
  content: "Hello"
  # Automatically outputs: event_id

"@react":
  kind: 7
  content: "+"
  tags: [["e", $selected_post.id]]
  # Automatically outputs: event_id
```

## Triggers (Explicit Side Effects)

Only actions can have triggers (queries are pure):

```yaml
"@increment":
  kind: 1
  content: "+1"
  triggers: $check_reactions  # After publishing, trigger this query

"$check_reactions":
  kinds: [7]
  "#e": @increment  # Use the event ID from increment
  pipe:
    - count
```

## Components: Just Props

Components receive props like React:

```yaml
---
type: "component"
name: "post-card"

"$author":
  kinds: [0]
  authors: [props.author]  # Use prop

"$reactions":
  kinds: [7]
  "#e": [props.event_id]   # Use prop
---

[div]
  [img src={$author.picture}]
  [h3]{$author.name}[/h3]
  [p]{props.content}[/p]
  [span]❤️ {$reactions | count}[/span]
[/div]
```

Usage:
```yaml
[each $posts as $post]
  [#post-card author=$post.pubkey event_id=$post.id content=$post.content]
[/each]
```

## Live Subscriptions

Live queries automatically update and can trigger actions:

```yaml
"$notifications":
  kinds: [1]
  "#p": [props.user.pubkey]
  live: true
  on_new: @notify_user  # Trigger action on new events

"@notify_user":
  type: "local"  # Local action (not published to nostr)
  action: "toast"
  message: "New notification!"
```

## Complete Examples

### Example 1: Following Feed
```yaml
"$contact_list":
  kinds: [3]
  authors: [props.user.pubkey]
  pipe:
    - first
    - get: tags
    - pluckTag: p  # Outputs: array of pubkeys

"$following_feed":
  kinds: [1]
  authors: $contact_list  # Implicitly waits, uses pubkeys
  limit: 20

[each $following_feed as $note]
  [#profile pubkey=$note.pubkey]
  [p]{$note.content}[/p]
[/each]
```

### Example 2: Post with Reactions
```yaml
"@post":
  kind: 1
  content: {props.form.message}
  triggers: $my_posts  # Refresh my posts after posting

"$my_posts":
  kinds: [1]
  authors: [props.user.pubkey]
  limit: 10

[form @post]
  [input name="message"]
  [button]Post[/button]
[/form]

[each $my_posts as $post]
  [#post-card event_id=$post.id content=$post.content author=$post.pubkey]
[/each]
```

### Example 3: Counter with Live Updates
```yaml
"$current_count":
  kinds: [30000]
  "#d": ["counter"]
  authors: [props.user.pubkey]
  pipe:
    - first
    - get: content
    - json
    - get: count
    - default: 0

"@increment":
  kind: 30000
  tags: [["d", "counter"]]
  content: {JSON.stringify({count: $current_count + 1})}
  triggers: $current_count  # Refresh count after increment

[div]
  Count: {$current_count}
  [button @increment]Increment[/button]
[/div]
```

## Implementation Simplifications

### 1. No More Special Variables
```typescript
// BEFORE: Complex variable resolution
if (value === 'user.pubkey') return context.user.pubkey;
if (value === 'target.pubkey') return context.target.pubkey;
if (value.startsWith('$')) return context.extracted[value];

// AFTER: Everything through props
return props[value];
```

### 2. Simple Query Execution
```typescript
class QueryExecutor {
  async execute(query, props) {
    // Resolve dependencies (implicit waits)
    const resolved = await this.resolveDeps(query, props);
    
    // Execute query
    const events = await this.fetch(query, resolved);
    
    // Apply pipes
    const output = this.applyPipes(events, query.pipe);
    
    // Store result
    this.results[query.name] = output;
    
    return output;
  }
  
  resolveDeps(query, props) {
    // Replace $references with their values
    // Each reference implicitly waits for that query
    return this.resolveRefs(query, props);
  }
}
```

### 3. Component Props
```typescript
// Component just receives props
function Component({ props }) {
  const queries = useQueries(componentDef.queries, props);
  return render(componentDef.template, { ...props, ...queries });
}

// Parent passes props
<Component pubkey={post.pubkey} content={post.content} />
```

## Benefits

1. **Unified mental model** - Everything is props
2. **No magic variables** - No target, no extracted, just props
3. **Implicit waits are obvious** - If you reference it, you wait for it
4. **Output types are inferred** - Based on pipe operations
5. **Components are simple** - Just props in, UI out

## Migration Path

```yaml
# OLD
"$profile":
  kinds: [0]
  authors: [target.pubkey]  # Magic target

# NEW
"$profile":
  kinds: [0]
  authors: [props.pubkey]  # Explicit prop
```

```yaml
# OLD
"$my_posts":
  kinds: [1]
  authors: [user.pubkey]  # Magic user

# NEW  
"$my_posts":
  kinds: [1]
  authors: [props.user.pubkey]  # System prop
```

```yaml
# OLD
"$following_feed":
  waits_for: $contact_list
  authors: from($contact_list)  # Redundant

# NEW
"$following_feed":
  authors: $contact_list  # Reference implies wait
```

## Summary

This design unifies everything under props:
- System props (user, time, relay)
- Parent props (passed to components)
- Query/action references (implicit waits)

No more magic contexts, no more special variables, no more complex dependency graphs. Just props and implicit waits when you reference other queries.