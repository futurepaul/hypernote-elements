# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Development server**: `bun run dev` - Runs hot-reloading dev server
- **Production server**: `bun run start` - Runs production build
- **Build**: `bun run build` - Builds the project to dist/
- **Tests**: `bun test` - Runs all tests (Bun's built-in test runner)
- **Seed data**: `bun run seed` - Populates test data
- **Update examples**: `bun run update-examples` - Regenerates example JSON files from markdown

## Project Architecture

This is a **Hypernote language compiler and renderer** - a declarative system for creating interactive Nostr applications using extended Markdown syntax. The project has two main parts:

### Core Components

1. **Hypernote Language** (`src/lib/`):
   - `compiler.ts`: Compiles Hypernote Markdown (HNMD) to structured JSON
   - `tokenizer.ts`: Tokenizes HNMD into parseable elements
   - `schema.ts`: Zod schemas defining the Hypernote data structure
   - `style-schema.ts`: Validates Tailwind-to-CSS-in-JS conversions

2. **React Renderer** (`src/renderer.tsx`):
   - Renders compiled Hypernote JSON as interactive React components
   - Handles forms, loops, conditionals, and Nostr event publishing
   - Uses React Query for data fetching from Nostr relays

3. **Nostr Integration** (`src/lib/`):
   - `relayHandler.ts`: Manages Nostr relay connections
   - `nostrFetch.ts`: Fetches events from relays with React Query
   - `nostrStore.ts`: Zustand store for Nostr state management

### Key Language Features

Hypernote extends Markdown with:
- **Queries** (`$query_name`): Declarative Nostr data fetching
- **Events** (`@event_name`): Templates for publishing Nostr events
- **Components** (`#component`): Reusable UI components
- **Styling**: Tailwind classes compiled to CSS-in-JS for cross-platform compatibility

### Test Structure

- `tests/`: Comprehensive test suite using Bun's test runner
- `examples/`: Example Hypernote documents with expected JSON output
- Tests validate both compilation and expected JSON output matching

### Build System

- **Bun-based**: Uses Bun as runtime, package manager, and test runner
- **Tailwind Plugin**: `bun-plugin-tailwind` for CSS processing
- **Custom Loaders**: `scripts/md-loader.ts` for markdown file processing
- **TypeScript**: Full TypeScript support with strict configuration

## Development Notes

- The project uses Bun extensively - ensure you have Bun installed rather than npm/yarn
- Examples in `examples/` directory serve as both documentation and test fixtures
- The compiler produces validation errors rather than throwing, returning fallback structures
- Styling system converts Tailwind classes to CSS-in-JS objects for cross-platform compatibility
- All Nostr operations are handled through the RelayHandler abstraction layer

## Important Architecture: Event Subscription & Cache Management

### Current Subscription Model
The current implementation uses **one-shot subscriptions** via React Query:
1. RelayHandler.subscribe() waits for EOSE (End of Stored Events) then stops
2. React Query caches the results using key `['nostrEvents', JSON.stringify(filter)]`
3. New events don't automatically appear until cache is invalidated

### Cache Invalidation Pattern
When publishing new events (`src/renderer.tsx:160`):
```typescript
// After successful event publication
queryClient.invalidateQueries({ queryKey: ['nostrEvents'] });
```
This forces React Query to re-fetch all Nostr queries, ensuring new events appear in correct chronological order.

### Known Limitation: Live Updates
**Issue**: New events from other users won't appear until user triggers a re-render
**Current behavior**: Events only update when user publishes something (triggering invalidation)
**Future enhancement**: Could implement live subscriptions that maintain active connections post-EOSE

### Query Result Ordering
- **Default relay behavior**: Newest-first (reverse-chronological)
- **With `reverse` pipe**: Oldest-first (chronological)
- **Critical**: Cache invalidation ensures new events are inserted in correct position, not appended

## Nostr Relay Connection Architecture

### RelayHandler Implementation
The `RelayHandler` (`src/lib/relayHandler.ts`) implements NDK best practices for reliable Nostr relay connections:

**Key Features:**
- **Explicit connection** via `connect()` method (called automatically in app initialization)
- **Connection status tracking** with `getRelayStatuses()` and `getConnectedRelays()`
- **Detailed publish results** showing success/failure per relay
- **Better subscription management** with configurable timeouts and minimum relay requirements
- **Graceful error handling** with comprehensive logging

**Connection Flow:**
1. `nostrStore.initialize()` creates RelayHandler instance
2. Calls `relayHandler.connect()` to establish connections to all configured relays
3. Tests each relay with a simple query to verify connectivity
4. Tracks connection status for intelligent publishing/subscription routing

**Publishing Results:**
```typescript
const result = await relayHandler.publishEvent(1, "Hello world");
// Returns: { eventId: string, results: PublishResult[], successCount: number }
console.log(`Published to ${result.successCount} relays`);
```

**Relay Configuration:**
Default relays in `src/stores/nostrStore.ts` include `nos.lol`, `relay.damus.io`, and `nostr.wine`.

## Testing

Run `bun test` to execute the full test suite. Tests cover:
- HNMD compilation to JSON
- Schema validation
- Example conformance
- Error handling and fallback behavior