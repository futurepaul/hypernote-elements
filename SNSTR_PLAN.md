# SNSTR Migration Plan

## Overview
Migration from current Nostr implementation (nostr-tools + custom RelayHandler) to snstr library with NIP-07 authentication and reactive subscriptions.

## Key Goals
1. **Replace authentication**: Remove hardcoded nsec/localStorage → NIP-07 browser extension
2. **Reactive subscriptions**: Real-time updates when filters change
3. **User profile display**: Show authenticated user in top-right corner
4. **Improved architecture**: Leverage snstr's robust relay management

## Important Note on SNSTR
Based on analysis, snstr is a low-level TypeScript library without built-in React hooks. We'll use **Zustand** as our state management layer to bridge snstr's low-level functionality with our React UI, providing reactive updates and clean component integration. Alternative libraries like `nostr-react` or `use-nostr` provide React hooks out-of-the-box, but we'll proceed with snstr as requested for its comprehensive NIP support and robust relay management.

## Phase 1: Setup & Dependencies

### 1.1 Install SNSTR
```bash
# Since snstr isn't on npm yet, we need to build locally
git clone https://github.com/AustinKelsay/snstr.git ../snstr
cd ../snstr
bun install
bun run build
cd ../hypernote-elements

# Link locally or copy build artifacts
bun add file:../snstr
```

### 1.2 Remove Old Dependencies
- Remove `nostr-tools` from package.json
- Remove `@tanstack/react-query` (Zustand will handle caching)
- Keep `zustand` for state management (primary integration layer)

## Phase 2: NIP-07 Authentication Implementation

### 2.1 Create Auth Store (`src/stores/authStore.ts`)
```typescript
interface AuthStore {
  isAuthenticated: boolean
  pubkey: string | null
  hasExtension: boolean
  login: () => Promise<void>
  logout: () => void
  signEvent: (event: UnsignedEvent) => Promise<Event>
}
```

### 2.2 NIP-07 Login Flow
- Check for `window.nostr` availability
- Request public key from extension
- Store pubkey in zustand (no more localStorage privateKey)
- Handle extension not found / user rejection

### 2.3 Remove Insecure Auth
Files to modify:
- `src/stores/nostrStore.ts`: Remove privateKey, localStorage.getItem("privkey"), key conversion logic
- `src/utils/nostr-keys.ts`: Can be deleted entirely
- `src/index.tsx`: Remove prompt for nsec input

## Phase 3: SNSTR Integration Architecture

### 3.1 Architecture Overview
We'll use **Zustand stores** as the primary integration layer between snstr's low-level API and our React components. This provides:
- Clean separation of concerns
- Reactive UI updates without prop drilling
- Centralized subscription management
- Easy testing and debugging

### 3.2 Create SNSTR Service Layer (`src/lib/snstr/`)
```
src/lib/snstr/
├── client.ts          # SNSTR client initialization
├── hooks.ts           # React hooks wrapping Zustand stores
├── subscriptions.ts   # Subscription management with Zustand
└── types.ts          # TypeScript definitions
```

### 3.2 RelayPool Management (`src/lib/snstr/client.ts`)
```typescript
import { RelayPool, Relay } from 'snstr';

class SNSTRClient {
  private relayPool: RelayPool
  
  async connect(relays: string[])
  async disconnect()
  getConnectionStatus(): Map<string, boolean>
}
```

### 3.3 Zustand Store for Subscriptions (`src/stores/subscriptionStore.ts`)
```typescript
interface SubscriptionStore {
  subscriptions: Map<string, Subscription>
  events: Map<string, Event[]>
  
  // Actions
  createSubscription: (id: string, filters: Filter[]) => void
  updateSubscription: (id: string, filters: Filter[]) => void
  addEvent: (subscriptionId: string, event: Event) => void
  clearSubscription: (id: string) => void
}
```

### 3.4 Reactive Hooks (`src/lib/snstr/hooks.ts`)
```typescript
// React hooks that leverage Zustand stores for state management
export function useNostrSubscription(filters: Filter[], deps: any[]) {
  const { events, createSubscription, updateSubscription } = useSubscriptionStore()
  const subscriptionId = useRef(generateId())
  
  useEffect(() => {
    // Create/update subscription via Zustand action
    // Zustand handles the snstr integration
    // Components automatically re-render on state changes
  }, deps)
  
  return { events: events.get(subscriptionId.current) || [], loading }
}

export function useNostrPublish() {
  const { signEvent } = useAuthStore()
  const { publish } = useNostrStore()
  
  // Combines auth store (NIP-07) with nostr store (snstr client)
  return async (content: string) => {
    const signed = await signEvent(createEvent(content))
    return publish(signed)
  }
}
```

## Phase 4: Update Core Components

### 4.1 Update `src/lib/nostrFetch.ts`
- Replace RelayHandler with SNSTRClient
- Implement reactive subscription that updates on filter changes
- Use SNSTR's RelayPool for multi-relay queries

### 4.2 Update `src/renderer.tsx`
- Replace current query implementation with `useNostrSubscription` hook
- Update event publishing to use NIP-07 signing
- Remove queryClient.invalidateQueries (subscriptions are now reactive)

### 4.3 Create User Profile Component
```typescript
// src/components/UserProfile.tsx
function UserProfile() {
  const { pubkey, isAuthenticated, login, logout } = useAuthStore()
  
  if (!isAuthenticated) {
    return <button onClick={login}>Connect Wallet</button>
  }
  
  return (
    <div className="user-profile">
      <span>{formatPubkey(pubkey)}</span>
      <button onClick={logout}>Disconnect</button>
    </div>
  )
}
```

### 4.4 Update App Layout (`src/App.tsx`)
- Add UserProfile component in top-right corner
- Wrap app with authentication check
- Show connect prompt if not authenticated

## Phase 5: Migration Steps

### 5.1 File Deletion List
- [x] `src/lib/relayHandler.ts` → Replaced by SNSTR RelayPool
- [x] `src/utils/nostr-keys.ts` → No longer needed with NIP-07
- [x] `src/utils/seed.ts` → Update to use NIP-07 signing

### 5.2 File Modification List
- [x] `src/stores/nostrStore.ts` → Complete rewrite for SNSTR
- [x] `src/lib/nostrFetch.ts` → Use SNSTR subscriptions
- [x] `src/renderer.tsx` → Update to use new hooks
- [x] `src/index.tsx` → Remove nsec prompt, add NIP-07 check
- [x] `src/App.tsx` → Add user profile component

### 5.3 New Files to Create
- [x] `src/stores/authStore.ts` → NIP-07 authentication
- [x] `src/lib/snstr/client.ts` → SNSTR client wrapper
- [x] `src/lib/snstr/hooks.ts` → React hooks for SNSTR
- [x] `src/lib/snstr/subscriptions.ts` → Subscription management
- [x] `src/components/UserProfile.tsx` → User display

## Phase 6: Testing & Validation

### 6.1 Update Tests
- Update compiler tests to not rely on hardcoded keys
- Create mock for window.nostr in tests
- Test reactive subscription updates

### 6.2 Manual Testing Checklist
- [ ] NIP-07 extension detection works
- [ ] Login/logout flow works smoothly
- [ ] User pubkey displays correctly
- [ ] Subscriptions update when filters change
- [ ] Events publish with extension signing
- [ ] Real-time updates work (new events appear without refresh)
- [ ] Multi-relay publishing works
- [ ] Connection status displays correctly

## Phase 7: Benefits After Migration

### Immediate Benefits
1. **Security**: No more privateKey in localStorage or code
2. **UX**: Users use their existing Nostr identity (Alby, nos2x, etc.)
3. **Reactivity**: Real-time updates without manual cache invalidation
4. **Reliability**: SNSTR's robust relay management and reconnection

### Future Enhancements
1. Add NIP-46 remote signing support
2. Implement NIP-57 Lightning Zaps
3. Add relay management UI
4. Implement contact list (NIP-02)
5. Add direct messaging (NIP-04/44)

## Implementation Order

1. **Day 1**: Setup SNSTR, create auth store, implement NIP-07 login
2. **Day 2**: Create SNSTR service layer and React hooks
3. **Day 3**: Update nostrFetch and renderer for reactive subscriptions
4. **Day 4**: Add user profile component, update UI
5. **Day 5**: Testing, bug fixes, documentation updates

## Rollback Plan
If issues arise, the work is on a separate `snstr` branch. We can:
1. Keep the current implementation on `main`
2. Test thoroughly on `snstr` branch
3. Only merge when fully stable
4. Git history preserves the ability to revert

## Notes & Considerations

### Why SNSTR + Zustand?
- **SNSTR provides**: Comprehensive NIP support, robust relay pool management, secure subscriptions
- **Zustand provides**: Reactive UI updates, clean component integration, centralized state
- **Together**: Low-level protocol handling with high-level React ergonomics
- No need for React Query - Zustand handles caching and updates
- Simpler mental model - all state flows through Zustand stores

### Challenges
- SNSTR lacks built-in React hooks (we'll build our own)
- Not published to npm yet (need local build)
- More complex than React-specific libraries
- Documentation still evolving

### Alternative Approach
If SNSTR proves too complex, consider:
- `nostr-react`: Provides useNostr, useNostrEvents hooks
- `use-nostr`: Simpler API with NIP-07 support built-in
- `@nostr-dev-kit/ndk-react`: React wrapper for NDK

## Success Criteria
- [x] No hardcoded keys or localStorage privateKey
- [x] NIP-07 authentication working
- [x] User profile visible in UI
- [x] Subscriptions update reactively
- [x] All existing functionality preserved
- [x] Tests passing
- [x] Documentation updated