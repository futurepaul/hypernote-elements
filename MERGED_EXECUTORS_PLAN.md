# Merged Executors Plan

## Current Situation: The Two-Executor Problem

### Overview
The Hypernote system currently has **two overlapping query executors** that have evolved separately, creating significant code duplication and maintenance challenges:

1. **SimpleQueryExecutor**: The original executor that handles basic query execution
2. **HypernoteExecutor**: A higher-level wrapper that adds live subscriptions and delegates to SimpleQueryExecutor

### The Architecture Today

```
┌─────────────────────────────────────────────────────┐
│                  useHypernoteExecutor                │
│                         Hook                         │
└──────────────────┬──────────────────────────────────┘
                   │ Creates
                   ▼
┌─────────────────────────────────────────────────────┐
│                  HypernoteExecutor                   │
│  - Live subscriptions                                │
│  - Action execution                                  │
│  - Naddr expansion                                   │
│  - DUPLICATES: Replaceable event handling            │
│  - Uses UnifiedResolver for variables                │
└──────────────────┬──────────────────────────────────┘
                   │ Delegates to
                   ▼
┌─────────────────────────────────────────────────────┐
│                SimpleQueryExecutor                   │
│  - Query execution                                   │
│  - Dependency resolution                             │
│  - DUPLICATES: Variable resolution                   │
│  - DUPLICATES: Replaceable event handling            │
│  - Pipe processing                                   │
└──────────────────────────────────────────────────────┘
```

### Critical Duplication Points

#### 1. Replaceable Event Deduplication
**Duplicated in:**
- `SimpleQueryExecutor` lines 89-115
- `HypernoteExecutor` lines 277-294

**The exact same logic:** Group by d-tag, keep newest by created_at

#### 2. Variable Resolution
**Three implementations:**
- `SimpleQueryExecutor.resolveFilterVariables()` - Basic variables
- `UnifiedResolver.resolveExpression()` - Advanced resolution
- `HypernoteExecutor` uses UnifiedResolver but SimpleQueryExecutor doesn't

#### 3. Reference Resolution
**Two parallel systems:**
- `SimpleQueryExecutor.resolveReferences()` - Handles $query, #component, @action
- `UnifiedResolver.resolveExpression()` - Same references, different implementation

#### 4. Safety Checks
**Duplicate unresolved reference detection:**
- `SimpleQueryExecutor.hasUnresolvedReferences()`
- `UnifiedResolver.hasUnresolvedReferences()`

### Why This Happened
The architecture evolved organically:
1. SimpleQueryExecutor was built first for basic queries
2. HypernoteExecutor was added as a wrapper for live subscriptions
3. UnifiedResolver was created for complex variable resolution
4. Features were added to both executors independently
5. Bug fixes (like replaceable event handling) had to be duplicated

## The Unified Architecture Vision

### Design Principles
1. **Single Source of Truth**: One executor, one place for each piece of logic
2. **Modular Components**: Separate concerns into focused, testable units
3. **Clear Data Flow**: Predictable path from query to result
4. **Extensible**: Easy to add new features without touching core logic
5. **Testable**: Each component independently testable

### Proposed Architecture

```
┌─────────────────────────────────────────────────────┐
│                  useHypernoteExecutor                │
│                         Hook                         │
└──────────────────┬──────────────────────────────────┘
                   │ Creates
                   ▼
┌─────────────────────────────────────────────────────┐
│                  UnifiedExecutor                     │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │           Core Query Engine                  │    │
│  │  - Query orchestration                       │    │
│  │  - Dependency graph building                 │    │
│  │  - Result caching                           │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │  Resolver    │  │   Fetcher    │  │  Actions  │  │
│  │  - Variables │  │  - Network   │  │  - Sign   │  │
│  │  - Refs     │  │  - Cache     │  │  - Publish│  │
│  │  - Safety   │  │  - Dedup     │  │           │  │
│  └──────────────┘  └──────────────┘  └──────────┘  │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │ Transformer  │  │ Subscription │  │  Hooks    │  │
│  │  - Pipes     │  │  - Live      │  │  - React  │  │
│  │  - JQ        │  │  - Updates   │  │  - Updates│  │
│  └──────────────┘  └──────────────┘  └──────────┘  │
└─────────────────────────────────────────────────────┘
```

### Component Responsibilities

#### Core Query Engine
- **Orchestration**: Manages the overall query execution flow
- **Dependency Analysis**: Builds and executes dependency graph
- **State Management**: Maintains query results and context
- **Coordination**: Delegates to specialized components

#### Resolver Module
- **Variable Resolution**: All variable replacement logic (user.pubkey, time, etc.)
- **Reference Resolution**: Handles $query, #component, @action references
- **Safety Validation**: Ensures no unresolved references before execution
- **Context Management**: Maintains resolution context

#### Fetcher Module
- **Network Operations**: All SNSTR client interactions
- **Cache Management**: Query result caching and invalidation
- **Event Deduplication**: Replaceable event handling (ONE implementation)
- **Batch Optimization**: Combines similar queries when possible

#### Transformer Module
- **Pipe Processing**: All pipe operations in one place
- **JQ Transformations**: Complex data transformations
- **Type Coercion**: Ensures correct data types

#### Subscription Module
- **Live Subscriptions**: WebSocket subscription management
- **Update Handling**: Processes incoming live events
- **Cleanup**: Manages subscription lifecycle

#### Actions Module
- **Event Construction**: Builds Nostr events from templates
- **Signing**: Integrates with NIP-07 or provided signers
- **Publishing**: Sends events to relays
- **Result Tracking**: Stores event IDs for reference

#### Hooks Module
- **React Integration**: useHypernoteExecutor hook
- **Update Callbacks**: Notifies UI of changes
- **Error Boundaries**: Handles executor errors gracefully

## Migration Strategy

### Phase 1: Extract Shared Logic (Week 1)
1. **Create shared utilities**:
   - `deduplicateReplaceableEvents()` function
   - `resolveVariables()` unified function
   - `validateReferences()` safety checker

2. **Update both executors** to use shared utilities:
   - Remove duplicate deduplication code
   - Point to shared functions
   - Add tests for shared utilities

### Phase 2: Unify Resolution (Week 2)
1. **Merge SimpleQueryExecutor resolution into UnifiedResolver**:
   - Move `resolveFilterVariables()` logic
   - Move `resolveReferences()` logic
   - Consolidate `hasUnresolvedReferences()`

2. **Update SimpleQueryExecutor** to use UnifiedResolver:
   - Inject UnifiedResolver
   - Remove duplicate resolution code
   - Ensure backward compatibility

### Phase 3: Create Unified Executor (Week 3)
1. **Build new UnifiedExecutor class**:
   - Start with HypernoteExecutor as base
   - Absorb SimpleQueryExecutor logic directly
   - Organize into modules

2. **Implement modular architecture**:
   - Create Fetcher module with deduplication
   - Create Transformer module for pipes
   - Create Subscription module for live updates

### Phase 4: Integration & Testing (Week 4)
1. **Update integration points**:
   - Modify useHypernoteExecutor to use UnifiedExecutor
   - Update all imports
   - Ensure backward compatibility

2. **Comprehensive testing**:
   - Unit tests for each module
   - Integration tests for full flow
   - Performance benchmarks

### Phase 5: Cleanup (Week 5)
1. **Remove old code**:
   - Delete SimpleQueryExecutor
   - Delete old HypernoteExecutor
   - Remove duplicate utilities

2. **Documentation**:
   - Update architecture docs
   - Add module documentation
   - Create migration guide

## Implementation Details

### File Structure
```
src/lib/executor/
├── UnifiedExecutor.ts         # Main orchestrator
├── modules/
│   ├── Resolver.ts            # Variable & reference resolution
│   ├── Fetcher.ts             # Network & cache operations
│   ├── Transformer.ts         # Pipes & data transformation
│   ├── Subscription.ts        # Live update handling
│   ├── Actions.ts             # Event publishing
│   └── Hooks.ts               # React integration
├── utils/
│   ├── deduplication.ts       # Replaceable event handling
│   ├── dependency-graph.ts    # Query dependency analysis
│   └── validation.ts          # Safety checks
└── types.ts                   # Shared types and interfaces
```

### Key Interfaces
```typescript
interface ExecutorModule {
  initialize(context: ExecutorContext): void;
  cleanup(): void;
}

interface ExecutorContext {
  queries: Map<string, QueryConfig>;
  results: Map<string, any>;
  user: { pubkey: string } | null;
  target: { pubkey: string } | null;
  form: Record<string, any>;
  client: SNSTRClient;
  cache: QueryCache;
}

interface QueryResult {
  data: any;
  timestamp: number;
  source: 'cache' | 'network' | 'live';
}
```

### Testing Strategy
1. **Unit Tests**: Each module tested independently
2. **Integration Tests**: Full query execution flows
3. **Performance Tests**: Ensure no regression
4. **Compatibility Tests**: Verify backward compatibility

## Benefits of Unification

### Immediate Benefits
1. **Bug fixes apply everywhere**: No more fixing in multiple places
2. **Easier debugging**: Single execution path to trace
3. **Reduced bundle size**: No duplicate code
4. **Consistent behavior**: One implementation = predictable results

### Long-term Benefits
1. **Easier to extend**: Add features in one place
2. **Better testability**: Modular components easier to test
3. **Clearer mental model**: Developers understand one system
4. **Performance optimization**: Optimize one path, not two
5. **Maintainability**: Less code = fewer bugs

## Success Metrics
- [ ] Zero code duplication for core logic
- [ ] All tests passing with unified executor
- [ ] No performance regression (benchmarks within 5%)
- [ ] Bundle size reduced by at least 15%
- [ ] Development velocity increased (measured by feature delivery time)

## Risk Mitigation
1. **Feature flag**: Ship unified executor behind flag initially
2. **Gradual rollout**: Test with subset of users first
3. **Rollback plan**: Keep old executors available for quick revert
4. **Extensive testing**: Comprehensive test suite before migration
5. **Documentation**: Clear migration guide for any API changes

## Timeline
- **Week 1**: Extract shared logic, create utilities
- **Week 2**: Unify resolution logic
- **Week 3**: Build UnifiedExecutor with modules
- **Week 4**: Integration and testing
- **Week 5**: Cleanup and documentation
- **Week 6**: Buffer for issues and refinement

## Next Steps
1. Review and approve this plan
2. Create feature branch `unified-executor`
3. Begin Phase 1: Extract shared logic
4. Set up testing infrastructure
5. Create tracking issue with subtasks

---

*This plan addresses the critical technical debt of having two parallel query execution systems. By unifying them, we'll have a more maintainable, performant, and reliable codebase.*