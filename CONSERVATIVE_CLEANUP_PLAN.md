# CONSERVATIVE_CLEANUP_PLAN.md - Step-by-Step Incremental Cleanup

## Lesson Learned

The aggressive refactor broke too much functionality. This time we'll go step-by-step, testing each change thoroughly before proceeding to the next.

## Core Principles

1. **Test after each change** - Never make multiple changes without validation
2. **TypeScript first** - Fix type issues before refactoring 
3. **One system at a time** - Don't touch multiple systems simultaneously
4. **Preserve working features** - Never break action publishing, query resolution, etc.
5. **Commit frequently** - Small, revertible commits

## Step 1: TypeScript Health (Current Focus)

### 1.1 Add TypeScript Check Script ✅
- Added `"check": "bunx tsc --noEmit"` to package.json
- Now we can run `bun run check` to catch issues early

### 1.2 Current TypeScript Issues (24 errors identified)

**MCP Server Issues (4 errors):**
- Missing `pubkey` property in UnsignedEvent objects
- These are working live, so fix carefully

**Type Import Issues (7 errors):**  
- Need `type` keyword for imports: `ControllerProps`, `FieldPath`, `FieldValues`, `ToasterProps`, etc.
- These are easy fixes with low risk

**Logic Issues (5 errors):**
- `src/renderer.tsx:246` - Property 'message' doesn't exist on type 'string'
- `src/hooks/useHypernoteExecutor.ts:30` - Expected 1 arguments, got 0
- etc.

**Test Issues (8+ errors):**
- Missing test type definitions for Bun test runner
- jq-parser test references (test itself may be unused)

### 1.3 Fix Strategy
1. Fix low-risk type import issues first
2. Fix logic errors one by one with testing
3. Leave MCP server issues for last (they work live)
4. Remove genuinely unused test files

## Step 2: Renderer Pure Function Extraction

### 2.1 Identify Pure Functions (No Hooks)
Functions that can safely be moved to separate file:
- ✅ `resolveExpression` - Pure variable resolution
- ✅ `processString` - Pure template processing  
- ✅ `renderContent` - Pure content array rendering
- ⚠️ `renderElement` - Calls ComponentWrapper (has hooks)
- ⚠️ `renderLoop`, `renderIf` - May have indirect hook dependencies
- ⚠️ `renderJson` - Likely pure but needs verification

### 2.2 Extraction Strategy
1. **Phase 1**: Move obvious pure functions (`resolveExpression`, `processString`)
2. **Phase 2**: Move `renderContent` if no hook dependencies found  
3. **Phase 3**: Carefully analyze `renderElement` hook dependencies
4. **Test after each phase**

### 2.3 Hook Dependencies to Watch
- `ComponentWrapper` uses hooks - can't be pure
- `useHypernoteExecutor` calls in components
- `useState` calls for target context
- Any calls to React hooks directly or indirectly

## Step 3: Query System Consolidation

### 3.1 Current Query Systems
- `HypernoteExecutor` - Complex, but currently working
- `SimpleQueryExecutor` - Simpler alternative
- `UnifiedResolver` - Used by HypernoteExecutor  
- `queryCache` - Caching layer
- `subscriptionStore` - Live updates

### 3.2 Consolidation Strategy  
1. **Phase 1**: Understand how each system is used
2. **Phase 2**: Identify which examples use which systems
3. **Phase 3**: Create migration path (one example at a time)
4. **Phase 4**: Remove unused systems ONLY after migration complete

### 3.3 Migration Order
1. Start with simplest examples (`basic-hello.md`)
2. Move to component examples (`profile.md`)  
3. Handle complex examples (`client.md`) last
4. Keep MCP examples (`counter.md`, `chess.md`) for last

## Step 4: Pipe Operations Reduction

### 4.1 Current Pipe Operations (~40+)
From `src/lib/pipes.ts`, we have many operations like:
- `first`, `last`, `reverse`, `unique`, `flatten`, `compact`
- `get`, `pluck`, `groupBy`, `keys`, `values`  
- `json`, `default`, `defaults`, `limit`, `take`, `drop`
- `sum`, `min`, `max`, `average`, `add`, `multiply`
- `filter`, `where`, `sort`, `filterTag`, `pluckTag`
- etc.

### 4.2 Reduction Strategy
1. **Audit examples** - Which operations are actually used?
2. **Mark as deprecated** - Don't delete immediately, mark unused ones
3. **Add warnings** - Log warnings for deprecated operations
4. **Remove gradually** - Only after confirming zero usage

### 4.3 Expected Minimal Set (based on examples)
- `first` - Get first item from array
- `get` - Get property from object
- `default` - Provide fallback value  
- `reverse` - Reverse array order
- `json` - Parse JSON strings
- `pluckIndex`, `whereIndex` - Array index operations (for tags)
- `defaults` - Set default object properties

## Step 5: Remove Automatic Action Triggers

### 5.1 Current Trigger System
From the logs, I can see query→action triggers:
```
triggers: $refresh_comments  # Query after publishing
triggers: @save_count        # Action when query updates
```

### 5.2 Removal Strategy
1. **Audit all examples** - Find trigger usage
2. **Replace with user actions** - Convert automatic triggers to buttons  
3. **Test each conversion** - Ensure no broken workflows
4. **Remove trigger infrastructure** last

### 5.3 User-Only Actions
- ✅ Button clicks → actions
- ✅ Form submissions → actions  
- ❌ Query updates → actions (remove this)
- ❌ Automatic triggers (remove this)

## Step 6: Continuous Validation

### 6.1 After Each Step
1. Run `bun run check` - TypeScript must pass
2. Run `bun test` - All tests must pass
3. Run `bun run dev` - Server must start without errors
4. Test examples in browser - All must work
5. Test action publishing - Forms/buttons must work

### 6.2 Rollback Strategy
If any step breaks functionality:
1. Immediately revert the last commit
2. Analyze what went wrong
3. Make smaller, safer change
4. Re-test thoroughly

## Success Criteria

After conservative cleanup:

**TypeScript Health:**
- Zero TypeScript errors (`bun run check` passes)
- Strict type compliance

**Functionality Preserved:**
- All examples work perfectly  
- Action publishing works (buttons, forms)
- Query resolution works
- Component rendering works
- MCP integration works

**Codebase Improved:**
- Reduced complexity (but not broken)
- Clear separation of concerns  
- Fewer unused operations
- User-only action triggers
- Clean, maintainable code

## Risk Mitigation

**Before touching ANY file:**
1. Run `bun run check` to establish baseline
2. Commit current working state
3. Make ONE small change
4. Test thoroughly
5. Commit if working, revert if broken

This approach prioritizes stability over speed. Better to have a working system that's 50% cleaned up than a broken system that's 90% cleaned up.