# MCP Hypermedia Architecture

## Vision
Transform MCP servers from data providers into **hypermedia servers** that publish interactive UI elements as Nostr events. This eliminates complex action→query→trigger chains in favor of simple, reactive hypermedia.

## Current Problem: Callback Hell
The counter example demonstrates the current complexity:
```
User clicks increment → @increment published → MCP responds with JSON
→ $update_increment watches for response → triggers @save_increment  
→ @save_increment publishes new count → $count updates
```

This is 6 steps for a simple increment!

## Proposed Solution: Hypermedia Resources

### New Flow (Simple & Clean)
```
User clicks increment → @increment published  
→ MCP calculates AND publishes Hypernote UI element
→ Client subscribes to live component → UI updates automatically
```

Just 3 steps, no callbacks!

## Architecture Changes

### 1. MCP Server Enhancements

The MCP server needs to:
- Create valid Hypernote JSON structures
- Publish them as Nostr events (kind 32616)
- Return event IDs/naddrs as "resources"

```typescript
// In mcp-counter-server.ts
async function publishCounterUI(count: number, userPubkey: string) {
  const hypernoteJson = {
    version: "1.1.0",
    type: "element",
    elements: [
      {
        type: "div",
        elements: [
          {
            type: "h2",
            content: [`Count: ${count}`]
          }
        ],
        style: {
          textAlign: "center",
          fontSize: "2rem",
          fontWeight: "bold"
        }
      }
    ]
  };
  
  // Publish as replaceable event with user-specific d-tag
  const event = {
    kind: 32616,
    content: JSON.stringify(hypernoteJson),
    tags: [
      ["d", `counter-ui-${userPubkey}`],  // User-specific UI
      ["hypernote", "1.1.0"],             // Mark as Hypernote content
      ["client", "p", userPubkey]         // Who this UI is for
    ],
    created_at: Math.floor(Date.now() / 1000)
  };
  
  const signedEvent = await signer.sign(event);
  await relayPool.publish(signedEvent);
  
  // Return naddr as resource
  return nip19.naddrEncode({
    kind: 32616,
    pubkey: serverPubkey,
    identifier: `counter-ui-${userPubkey}`
  });
}
```

### 2. MCP Tool Response Changes

Tools would return hypermedia resources:

```typescript
mcpServer.registerTool(
  "addone",
  {
    title: "Add One Tool",
    description: "Adds one to a number",
    inputSchema: { a: z.number(), userPubkey: z.string() },
  },
  async ({ a, userPubkey }) => {
    const result = a + 1;
    
    // Publish the UI element
    const resourceId = await publishCounterUI(result, userPubkey);
    
    // Return both data AND hypermedia resource
    return {
      content: [
        { type: "text", text: `${result}` },
        { type: "resource", uri: resourceId }  // New resource type!
      ],
    };
  },
);
```

### 3. Simplified Counter Example

The new counter.md would be dramatically simpler:

```markdown
---
type: "element"
name: "hypermedia-counter"

# Live component subscription to MCP's UI
"$counter_ui":
  kinds: [32616]
  authors: ["mcp-server-pubkey"]
  "#d": ["counter-ui-{user.pubkey}"]
  limit: 1

# Simple increment action - no callbacks!
"@increment":
  kind: 25910
  json:
    method: "tools/call"
    params:
      name: "addone"
      arguments:
        a: "{$count or 0}"
        userPubkey: "{user.pubkey}"
  tags:
    - ["p", "mcp-server-pubkey"]
---

# Hypermedia Counter

[component $counter_ui]
  <!-- Renders the MCP's published UI directly -->
[/component]

[form @increment]
  [button]Increment[/button]
[/form]
```

### 4. Component Live Queries (Already Working!)

Good news: Components already use `useHypernoteExecutor` which supports live queries! We just need to ensure:
- Components can reference query results as resources
- Live updates flow through properly

### 5. Chess Example with Per-User State

The chess MCP would publish personalized board states:

```typescript
async function publishChessBoard(boardState: ChessState, userPubkey: string) {
  const hypernoteJson = {
    version: "1.1.0",
    type: "element",
    elements: boardState.rows.map(row => ({
      type: "div",
      elements: row.map(square => ({
        type: "div",
        content: [getPieceSymbol(square.piece)],
        style: {
          backgroundColor: square.color === 'light' ? '#f0d9b5' : '#b58863',
          // ... chess square styles
        }
      }))
    }))
  };
  
  // User-specific chess board
  const event = {
    kind: 32616,
    content: JSON.stringify(hypernoteJson),
    tags: [
      ["d", `chess-${userPubkey}`],  // Per-user board!
      ["hypernote", "1.1.0"],
      ["client", "p", userPubkey]
    ]
  };
  
  // Publish and return resource
  // ...
}
```

## Migration Path

### Phase 1: Add Hypermedia Support (Keep Old System)
1. ✅ Components already have live queries via HypernoteExecutor
2. [ ] Add Hypernote JSON creation to MCP server
3. [ ] Add resource publishing to MCP tools
4. [ ] Test with counter example

### Phase 2: Simplify Examples
1. [ ] Rewrite counter.md to use hypermedia approach
2. [ ] Update chess.md to use per-user board states
3. [ ] Document the new pattern

### Phase 3: Deprecate Complex Dependencies
1. [ ] Mark query→trigger→action chains as deprecated
2. [ ] Provide migration guide
3. [ ] Update all examples to hypermedia pattern

### Phase 4: Clean Architecture (Future)
1. [ ] Remove trigger support from queries
2. [ ] Actions only respond to user input
3. [ ] All server state comes via hypermedia resources

## Benefits

### For Developers
- **Simpler**: No callback chains or dependency tracking
- **Cleaner**: Actions are just user input handlers
- **Intuitive**: Server sends UI, not just data

### For Users  
- **Faster**: Fewer round trips
- **Reactive**: Live updates built-in
- **Flexible**: Shared or game-specific state via `d` tags and `p` tags

### For MCP Servers
- **UI Control**: Servers define their own interfaces
- **Resource Lists**: Can advertise available UIs
- **Stateful**: Maintain per-user UI state
- **Hypermedia Native**: True REST/HATEOAS principles

## Implementation TODOs

### Immediate (Phase 1)
- [ ] Add `compileHypernoteToJson` export to compiler
- [ ] Create `HypernotePublisher` class for MCP servers
- [ ] Add "resource" content type to MCP responses
- [ ] Test component live subscriptions thoroughly

### Short Term (Phase 2)
- [ ] Rewrite counter example
- [ ] Update chess example  
- [ ] Create hypermedia example gallery
- [ ] Document MCP hypermedia pattern

### Long Term (Phase 3-4)
- [ ] Deprecation warnings for triggers
- [ ] Migration tooling
- [ ] Remove trigger code
- [ ] Pure hypermedia architecture

## Example: Complete Hypermedia Counter

### MCP Server (Simplified)
```typescript
// Publishes UI directly, no JSON gymnastics
mcpServer.registerTool("increment", {}, async ({ value, user }) => {
  const newCount = value + 1;
  const ui = createCounterUI(newCount);
  const resource = await publishHypernote(ui, user);
  return { resource };
});
```

### Client (Simplified)
```markdown
---
"$ui": { kinds: [32616], "#d": ["counter-{user.pubkey}"] }
"@inc": { kind: 25910, json: { method: "increment", value: "{$count}" }}
---

[component $ui][/component]
[form @inc][button]++[/button][/form]
```

That's it! No triggers, no callbacks, just hypermedia.

## Conclusion

This architecture transforms Hypernote from a "smart client" model (complex query/action chains) to a true hypermedia system where:
- Servers send UI, not just data
- Actions are simple user inputs
- State lives in replaceable Nostr events
- Everything is reactive and live by default

This is the way hypermedia should work!