# Nested Hypernotes Implementation Plan

## Overview
Enable hypernotes to be published as replaceable Nostr events (kind 30078) and embedded as reusable components. Focus on making `profile.md` a reusable component that can replace raw pubkeys in `client.md`.

## Current Status (2024-01)

### ✅ Completed Phases
- **Phase 1**: Publishing infrastructure - can publish components as kind 30078
- **Phase 2**: Profile example updated with `kind: 0` and `target.pubkey`
- **Phase 3**: Component resolver architecture (mock implementation)
- **Phase 4**: Client example with imports
- **Phase 5**: Compiler fully supports `[#alias argument]` syntax
- **Phase 6**: Renderer architecture with depth checking and target context

### 🚧 Current State
The system can:
1. Compile components with `kind` field and `target.*` variables
2. Parse `[#profile user.pubkey]` syntax correctly
3. Publish components to Nostr as kind 30078 events
4. Generate proper naddr references
5. Prefetch components on render
6. Show error when component cannot be fetched: `Component not found: naddr1...`

### 🔴 Remaining Work
**The critical missing piece**: Actually fetching component definitions from Nostr relays!

When we try to render `client.md` with a real naddr reference, we get:
```
error: Component not found: naddr1qvzqqqr40cpzq...
```

This is expected because `ComponentResolver.fetchComponent()` currently returns mock data instead of fetching from relays.

## Key Learnings

### 1. Component Resolution Must Happen Before Rendering
- Components referenced in imports need to be fetched BEFORE the main render cycle
- This prevents loading states in the middle of content
- We implemented prefetching in `HypernoteRenderer` using `useEffect`

### 2. Depth Limitation is Critical
- Max depth = 1 prevents infinite recursion
- Components check `ctx.depth > 0` and show error if nested
- This simplifies the mental model significantly

### 3. Target Context vs User Context
- `user.*` is global (the viewing user)
- `target.*` is component-specific (the passed argument)
- Components with `kind: 0` get npub → profile data as target
- Components with `kind: 1` get nevent → event data as target

### 4. Import Storage Strategy
- Imports are stored without `#` prefix in JSON
- `"#profile": "naddr1..."` becomes `imports: { "profile": "naddr1..." }`
- This simplifies lookup and avoids JSON key issues

## Next Steps

### Immediate Priority: Connect Component Fetching to Relays

Update `src/lib/componentResolver.ts`:

```typescript
private async fetchComponent(reference: string): Promise<Hypernote> {
  // 1. Decode the naddr
  const decoded = nip19.decode(reference);
  if (decoded.type !== 'naddr') {
    throw new Error(`Expected naddr, got ${decoded.type}`);
  }
  
  const { identifier, pubkey, kind, relays } = decoded.data;
  
  // 2. Create filter for the replaceable event
  const filter = {
    kinds: [kind],
    authors: [pubkey],
    '#d': [identifier],
    limit: 1
  };
  
  // 3. Fetch from relays (using SNSTRClient)
  const events = await this.client.fetchEvents(filter);
  if (events.length === 0) {
    throw new Error(`Component not found: ${reference}`);
  }
  
  // 4. Parse the content as JSON
  const content = JSON.parse(events[0].content);
  
  // 5. Validate it's a valid component
  if (content.kind === undefined) {
    throw new Error(`Not a valid component (missing kind field)`);
  }
  
  return content as Hypernote;
}
```

### Secondary: Complete Component Rendering

Once fetching works, update `renderComponent()` to actually render the component's elements:

```typescript
function renderComponent(element, ctx) {
  // ... existing validation ...
  
  // Parse target from argument
  const target = await parseTarget(resolvedArgument, componentDef.kind);
  
  // Create component context with target
  const componentCtx = {
    ...ctx,
    target,
    depth: ctx.depth + 1,
    // Reset loop variables for component scope
    loopVariables: {}
  };
  
  // Recursively render component's elements
  return (
    <div id={element.elementId} style={element.style}>
      {componentDef.elements.map((el, i) => (
        <React.Fragment key={i}>
          {renderElement(el, componentCtx)}
        </React.Fragment>
      ))}
    </div>
  );
}
```

### Testing Flow

1. **Publish profile component**:
   - Use the Publish button with profile.md
   - Copy the naddr

2. **Update client.md**:
   - Replace the import with real naddr
   - `"#profile": "naddr1actual..."`

3. **Test rendering**:
   - Should fetch the component from relay
   - Should show profile cards in feed

## Architecture Summary

```
Hypernote with imports
    ↓
HypernoteRenderer
    ↓
ComponentResolver.prefetchComponents()
    ↓ (parallel fetch)
Fetch all naddr references from relays
    ↓
Cache component definitions
    ↓
Render main hypernote
    ↓
When hitting [#profile ...]:
    → renderComponent()
    → Get cached definition
    → Parse target (npub → profile data)
    → Create component context
    → Render component elements with target
```

## Success Criteria Checklist

- [x] Profile.md compiles with kind: 0
- [x] Client.md compiles with component imports
- [x] Components can be published as kind 30078
- [x] Compiler handles [#alias argument] syntax
- [x] Renderer has component architecture
- [ ] **Components fetch from actual relays**
- [ ] **Components render with target context**
- [ ] Profile cards show instead of raw pubkeys
- [x] Depth checking prevents nesting
- [ ] Full integration test works

## Implementation Priority

1. **Fix fetchComponent()** - Connect to actual relay fetching
2. **Test with real naddr** - Publish profile, use in client
3. **Complete renderComponent()** - Recursive rendering with target
4. **Add error boundaries** - Graceful handling of fetch failures
5. **Optimize caching** - Cache across sessions

The architecture is solid and follows the plan. We just need to connect the final relay integration piece!