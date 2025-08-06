# CLIENT_PLAN.md - Twitter-Style Nostr Client Implementation

## Overview
Build a Hypernote example (`client.md`) that functions as a full Twitter-style Nostr client. This will fetch the user's contact list (kind 3), extract all followed pubkeys, and create subscriptions to show a combined feed from all followed users.

## Key Challenges

### 1. Multi-Stage Query Pipeline
We need to:
1. Fetch the user's contact list (kind 3 event)
2. Extract the followed pubkeys from the `p` tags
3. Use those pubkeys to fetch posts from all followed users

### 2. Pipe Operations Needed
Based on nak's jq-style operations, we need to expand our pipe system to support:

```yaml
pipe:
  - extract: ".tags[] | select(.[0] == \"p\") | .[1]" as $followed_pubkeys
  - flatten: $followed_pubkeys  # Flatten array of arrays if needed
  - unique: true  # Remove duplicates
```

### 3. Complex Query Composition
We need a way to use extracted data as input to subsequent queries:

```yaml
"$contact_list":
  kinds: [3]
  authors: [user.pubkey]
  limit: 1
  pipe:
    - extract: ".tags[] | select(.[0] == \"p\") | .[1]" as $followed_pubkeys

"$following_feed":
  kinds: [1]
  authors: $followed_pubkeys  # Use extracted data from previous query
  limit: 50
  since: time.now - 86400000
  pipe:
    - operation: reverse  # Show oldest first or newest first
```

## Implementation Steps

### Step 1: Extend Pipe Operations in Compiler
Update `src/lib/compiler.ts` to support new pipe operations:

1. **extract**: jq-style data extraction with variable assignment
   - Support basic jq syntax: `.property`, `.[index]`, `.[]`, `|`, `select()`
   - Store extracted values in named variables

2. **flatten**: Flatten nested arrays
   - Convert `[[a], [b], [c]]` to `[a, b, c]`

3. **unique**: Remove duplicate values
   - Useful for deduplicating pubkeys

4. **sort**: Sort by a property
   - Support sorting by created_at, content length, etc.

### Step 2: Query Dependency Resolution
Implement query dependencies where one query can reference variables from another:

```yaml
"$query1":
  # ... produces $variable1
  
"$query2":
  authors: $variable1  # Reference variable from query1
```

### Step 3: Create client.md Example

```markdown
---
"$contact_list":
  kinds: [3]
  authors: [user.pubkey]
  limit: 1
  pipe:
    - extract: ".tags[] | select(.[0] == \"p\") | .[1]" as $followed_pubkeys

"$following_feed":
  kinds: [1]
  authors: $followed_pubkeys
  limit: 100
  since: time.now - 86400000
  pipe:
    - operation: reverse

"@post_note":
  kind: 1
  content: "{form.message}"
  tags: []

style: bg-gray-100
---

# Nostr Client

{#user-info}
[div class="bg-white p-4 rounded-lg shadow mb-4"]
  ## Following {$followed_pubkeys.length} users
  Connected as: {user.pubkey}
[/div]

{#post-form}
[div class="bg-white p-4 rounded-lg shadow mb-4"]
  [form @post_note]
    [textarea name="message" placeholder="What's happening?" class="w-full p-2 border rounded"]
    [button class="bg-blue-500 text-white px-4 py-2 rounded mt-2"]Post[/button]
  [/form]
[/div]

{#feed}
[div class="space-y-4"]
  [each $following_feed as $note]
    [div class="bg-white p-4 rounded-lg shadow"]
      {#author}
      [div class="font-bold text-gray-800"]
        {$note.pubkey}
      [/div]
      
      {#content}
      [div class="mt-2 text-gray-700"]
        {$note.content}
      [/div]
      
      {#timestamp}
      [div class="mt-2 text-sm text-gray-500"]
        {$note.created_at}
      [/div]
      
      {#debug}
      [json variable="$note" open="false"]
    [/div]
```

### Step 4: Update Schema
Update `src/lib/schema.ts` to support new pipe operations:

```typescript
const PipeStep = z.union([
  z.object({
    operation: z.literal('reverse')
  }),
  z.object({
    operation: z.literal('extract'),
    expression: z.string(),
    as: z.string()
  }),
  z.object({
    operation: z.literal('flatten'),
    source: z.string()
  }),
  z.object({
    operation: z.literal('unique')
  }),
  z.object({
    operation: z.literal('sort'),
    by: z.string(),
    order: z.enum(['asc', 'desc']).optional()
  })
]);
```

### Step 5: Update Renderer
Modify `src/renderer.tsx` to:

1. Support query dependencies and variable references
2. Execute multi-stage pipelines
3. Handle extracted variables in the rendering context

### Step 6: Implement jq Parser
Create `src/lib/jq-parser.ts` for basic jq expression evaluation:

```typescript
export function evaluateJqExpression(expression: string, data: any): any {
  // Parse and evaluate limited jq syntax:
  // - Property access: .property
  // - Array index: .[0]
  // - Array iteration: .[]
  // - Pipe: |
  // - Select: select(condition)
}
```

## Testing Strategy

1. **Unit Tests**: Test each pipe operation individually
2. **Integration Tests**: Test full query pipeline execution
3. **Example Validation**: Ensure client.json matches expected output

## Performance Considerations

1. **Query Batching**: Combine multiple author queries when possible
2. **Caching**: Cache contact lists to avoid repeated fetches
3. **Pagination**: Implement limit/offset for large follow lists
4. **Subscription Management**: Efficiently manage WebSocket subscriptions for multiple authors

## Future Enhancements

1. **Profile Resolution**: Show names/avatars instead of just pubkeys
2. **Engagement Features**: Add like, repost, reply buttons
3. **Thread View**: Show conversation threads
4. **Search**: Add search functionality
5. **Notifications**: Show mentions and replies
6. **DM Support**: Add direct messaging

## Success Criteria

1. ✅ Successfully fetches user's contact list
2. ❌ Extracts all followed pubkeys from tags (NOT WORKING - filter issue)
3. ❌ Creates subscription for all followed users' posts (blocked by #2)
4. ✅ Displays combined feed in chronological order (shows global feed)
5. ✅ Allows posting new notes
6. ✅ Updates feed in real-time with new posts
7. ✅ Compiles to valid JSON structure
8. ✅ Renders correctly in the app
9. ✅ Added to frontend dropdown
10. ✅ Variable resolution working ({user.pubkey} displays correctly)

## Current Status: PARTIAL SUCCESS ⚠️

### ✅ Working:
- Query dependency system
- Topological execution order
- Variable substitution in text content
- Frontend integration
- Basic query execution
- User pubkey display
- Form posting with NIP-07

### ❌ Not Working:
- **jq Expression Evaluation**: The `.tags[] | select(.[0] == "p") | .[1]` expression is not extracting pubkeys
- **Contact List Processing**: Even if we fetch the contact list, we're not getting the followed pubkeys
- **Following Feed**: Currently showing global feed instead of followed users' posts

### 🐛 Issues Found & Fixed:
1. **Extract applied to array instead of individual events** ✅ FIXED
   - Problem: jq expressions like `.tags[]` were being applied to arrays of events instead of individual events
   - Solution: Modified QueryExecutor to apply extract operations to each event individually and flatten results

2. **Debug logging added** ✅ ADDED
   - Added comprehensive logging to see exactly what data is being processed
   - Can now trace: input data → jq steps → extracted results → context storage

### 🧪 Testing Needed:
1. Connect NIP-07 extension with contact list
2. Check console for debug output during contact list processing  
3. Verify extracted pubkeys are used in following feed query
4. Confirm feed shows posts from followed users only

## Implementation Order

1. First, implement basic `extract` pipe operation
2. Test with simple contact list extraction
3. Add support for query variable references
4. Create minimal client.md example
5. Incrementally add features (flatten, unique, sort)
6. Polish UI with proper styling
7. Add profile component integration
8. Optimize performance

This plan provides a clear path to implementing a functional Twitter-style Nostr client using the Hypernote language while extending its capabilities in a natural, composable way.