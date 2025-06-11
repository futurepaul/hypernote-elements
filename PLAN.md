# Hypernote Development Plan

## Project Architecture Overview

The Hypernote project operates on three distinct layers:

1. **HNMD (Hypernote Markdown)** - Human-readable authoring format with extended syntax
2. **Hypernote JSON Events** - Machine-optimized protocol format published to Nostr (the core protocol)
3. **Reference Implementation** - Web-based renderer and tooling (this codebase)

The protocol-first approach means HNMD is an optional authoring convenience, while Hypernote JSON events represent the true protocol specification.

## Current Implementation Status ✅

### Phase 1: Core Language Processing (COMPLETE)
- **✅ Tokenizer** (`src/lib/tokenizer.ts`) - Full HNMD syntax parsing including:
  - Frontmatter parsing (YAML)
  - Variable substitution `{$variable}`
  - Control structures `[if condition]`, `[each collection as item]`
  - Component references `[#alias argument]`
  - Form directives `[form @event]`
  - Manual element IDs `{#id}`
  - Inline styling with Tailwind classes
- **✅ Compiler** (`src/lib/compiler.ts`) - HNMD to Hypernote JSON conversion
- **✅ Schema Validation** (`src/lib/schema.ts`) - Complete Zod schema for Hypernote JSON
- **✅ Style Schema** (`src/lib/style-schema.ts`) - CSS-in-JS validation with Tailwind class compilation

### Phase 2: Frontend Rendering (COMPLETE)
- **✅ Core Renderer** (`src/renderer.tsx`) - Hypernote JSON to React components
- **✅ Split-Pane Editor** (`src/App.tsx`) - Live HNMD editing with real-time preview
- **✅ Nostr Store** (`src/stores/nostrStore.ts`) - Zustand-based state management
- **✅ Relay Handler** (`src/lib/relayHandler.ts`) - Nostr relay connection management
- **✅ Nostr Fetch Utilities** (`src/lib/nostrFetch.ts`) - Basic event fetching

### Phase 3: Build System & Development Tools (COMPLETE)
- **✅ Bun Integration** - Complete Bun-based development workflow
- **✅ MD Loader** (`scripts/md-loader.ts`) - Import `.md` files directly in TypeScript
- **✅ Example Management** - Automated HNMD→JSON compilation for examples
- **✅ Debug Mode** - `HYPERNOTE_DEBUG=true` for verbose logging
- **✅ Test Suite** - Comprehensive testing for all core components

### Phase 4: Example Coverage (COMPLETE)
- **✅ Basic Examples** - Hello world, forms, queries, loops
- **✅ Styling Examples** - Tailwind integration, dark themes, complex layouts
- **✅ Component Examples** - Div containers, image handling
- **✅ JSON Output Examples** - All examples have corresponding JSON output

### Phase 4.5: Developer Tools (NEXT)
- **🚧 JSON Element Type** - New `json` element for rendering JSON data with syntax highlighting
  - Useful for debugging Nostr events and exploring new event types
  - Pretty-printed JSON display with optional collapsible sections
  - Integration with query results for data inspection

## Next Major Features 🚧

### 1. Hypernote Publishing & Component System
**Status: Not Started**
**Priority: High**

#### Hypernote Publishing to Nostr
- [ ] Hypernote event publishing (kind 30078 or TBD)
- [ ] Event metadata and tagging system
- [ ] Component definition publishing (separate kind, e.g., 31990)
- [ ] Version tagging and spec compliance
- [ ] Replacement/updating mechanism (NIP-23 style)

#### Component Import & Resolution System
- [ ] Component discovery from Nostr identifiers (`naddr`, `nevent`)
- [ ] Component caching and dependency resolution
- [ ] Component argument validation (`kind: 0` vs `kind: 1`)
- [ ] Target context injection (`target.pubkey`, `target.id`, `target.*`)
- [ ] Nested component rendering with proper scope isolation

#### Component Marketplace/Discovery
- [ ] Component browsing and search
- [ ] Component ratings/reviews
- [ ] Component versioning and compatibility

### 2. Query Language Implementation
**Status: Partially Implemented**
**Priority: High**

#### Current Query Support
- ✅ Basic Nostr filter syntax in frontmatter
- ✅ Variable substitution (`{user.pubkey}`, `{time.now}`)
- ✅ Query result access in HNMD (`{$query_name}`)

#### Pipeline & Transform System
- [ ] Multi-stage query pipelines (`pipe:` array)
- [ ] jq-like extraction operations (`extract: ".path" as $variable`)
- [ ] List operations (reverse, sort, filter, limit)
- [ ] Data aggregation and grouping
- [ ] Cross-query data joins and references

#### Query Optimizations
- [ ] Query result caching
- [ ] Incremental updates and live queries
- [ ] Query dependency tracking
- [ ] Batch query execution

### 3. Zap Integration
**Status: Not Started**
**Priority: Medium**

#### Payment Flow Integration
- [ ] Zap button element type (`[zap @target amount]`)
- [ ] Host app payment interface integration
- [ ] Lightning wallet integration hooks
- [ ] Payment amount and recipient specification

#### Payment Receipts & Verification
- [ ] Payment receipt queries and validation
- [ ] Zap receipt display components
- [ ] Payment status tracking
- [ ] Payment history and analytics

#### Payment UX
- [ ] Payment confirmation dialogs
- [ ] Payment amount selection UI
- [ ] Payment success/failure feedback
- [ ] Invoice generation and QR codes

### 4. Native UI Stickers (Host App Overrides)
**Status: Not Started**
**Priority: Low**

#### Default Component System
- [ ] Host app override mechanism for common elements
- [ ] Standard component interface definitions
- [ ] Fallback behavior when overrides unavailable

#### Standard Sticker Library
- [ ] User avatar component (`[avatar @npub]`)
- [ ] User profile card (`[profile @npub]`)
- [ ] Note display (`[note @nevent]`)
- [ ] Note composer (`[compose]`)
- [ ] Follow/unfollow buttons
- [ ] Reaction buttons (like, repost, zap)

#### Platform-Specific Implementations
- [ ] Web/React sticker implementations
- [ ] React Native sticker guidelines
- [ ] SwiftUI sticker guidelines
- [ ] Jetpack Compose sticker guidelines
- [ ] Flutter sticker guidelines

## Implementation Phases

### Phase 5: Publishing Infrastructure (Next Sprint)
1. **Hypernote Event Publishing**
   - Implement Nostr event creation for Hypernotes
   - Add event metadata and tagging
   - Update schemas for published event format

2. **Basic Component System**
   - Component loading from Nostr identifiers
   - Target context injection
   - Component argument validation

### Phase 6: Query Language Enhancement
1. **Pipeline Implementation**
   - Multi-stage query processing
   - Basic jq-like extraction syntax
   - Variable passing between pipeline stages

2. **List Operations**
   - Reverse, sort, filter operations
   - Data transformation utilities

### Phase 7: Native Integration
1. **Zap Integration**
   - Host app payment interface
   - Payment flow components

2. **Sticker System**
   - Override mechanism design
   - Default component implementations

## Cross-Platform Considerations

### Target Platforms
- **Web Browsers** - Current reference implementation
- **React Native** - Mobile cross-platform
- **SwiftUI** - Native iOS
- **Jetpack Compose** - Native Android
- **Flutter** - Cross-platform alternative

### Shared Protocol Elements
- Hypernote JSON schema (platform-agnostic)
- CSS-in-JS style system (cross-platform compatible)
- Query language specification
- Component interface definitions

### Platform-Specific Elements
- Native UI sticker implementations
- Platform-specific styling adaptations
- Payment integration methods
- File system and cache management

## Success Metrics

### Technical Milestones
- [ ] First published Hypernote component consumed by another Hypernote
- [ ] Complex query pipeline with data transformation
- [ ] Successful zap transaction initiated from Hypernote
- [ ] Native UI override working across multiple platforms

### Ecosystem Milestones
- [ ] Third-party Hypernote implementation (non-web)
- [ ] Hypernote component marketplace emergence
- [ ] Integration with major Nostr clients
- [ ] Community-created Hypernote libraries

## Development Principles

1. **Protocol First** - Specs drive implementation, not vice versa
2. **Cross-Platform** - Every feature must work on all target platforms
3. **Security First** - All user content goes through validated schemas
4. **Explicit Error Handling** - Fail fast with detailed error messages
5. **Backwards Compatibility** - Version tagging and migration paths
6. **Community Driven** - Open source, community feedback integration 