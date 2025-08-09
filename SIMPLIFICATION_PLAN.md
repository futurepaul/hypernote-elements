# SIMPLIFICATION_PLAN.md - Implementation of BEST_SIMPLE Design

## Goal
Implement the simplified Hypernote design from BEST_SIMPLE.md, dramatically reducing renderer complexity by moving all logic to compile time.

## Key Changes Summary

### 🎯 Renderer Simplifications
- **REMOVE**: 220+ lines of tool_call handling (renderer.tsx:180-398)
- **REMOVE**: Complex variable resolution with inline pipes
- **REMOVE**: Special case logic for Kind 0 profile parsing
- **SIMPLIFY**: Variable resolution to simple dot access + fallback
- **UNIFY**: All transformations through single `applyPipes` function

### 📦 Compiler Enhancements
- **ADD**: Compact YAML syntax parser for pipes
- **ADD**: Dependency graph builder for reactive events
- **ADD**: Cycle detection at compile time
- **COMPILE**: All pipes to named operations

### 🔄 Schema Updates
- **REMOVE**: `tool_call`, `provider`, `tool_name`, `arguments`, `target` fields
- **ADD**: `match` field for reactive events
- **ADD**: `pipe` field for transformations (queries AND events)
- **ADD**: `then` field for event creation
- **REMOVE**: `live` field (everything is live by default)

## Implementation Phases

### Phase 1: Schema Updates ✅
**Files**: `src/lib/schema.ts`, `src/lib/style-schema.ts`

1. Update event schema:
   ```typescript
   // Remove
   tool_call?: boolean;
   provider?: string;
   tool_name?: string;
   arguments?: Record<string, any>;
   target?: string;
   
   // Add
   match?: z.object({
     kinds?: number[];
     authors?: string | string[];
     "#e"?: string | string[];
     // ... other filter fields
   });
   pipe?: PipeOperation[];
   then?: z.object({
     kind: number;
     content: string;
     tags?: string[][];
   });
   ```

2. Define pipe operations:
   ```typescript
   const PipeOperation = z.union([
     z.object({ op: z.literal("first") }),
     z.object({ op: z.literal("last") }),
     z.object({ op: z.literal("get"), field: z.string() }),
     z.object({ op: z.literal("json") }),
     z.object({ op: z.literal("default"), value: z.any() }),
     z.object({ op: z.literal("save"), as: z.string() }),
     // ... etc
   ]);
   ```

3. Update query schema:
   ```typescript
   // Remove
   live?: boolean;
   
   // Ensure pipe field
   pipe?: PipeOperation[];
   ```

### Phase 2: Compiler Updates 🔧
**Files**: `src/lib/compiler.ts`, `src/lib/tokenizer.ts`

1. Parse compact YAML syntax:
   ```typescript
   function parseCompactPipe(yaml: any[]): PipeOperation[] {
     return yaml.map(item => {
       // String -> simple op
       if (typeof item === 'string') {
         return { op: item };
       }
       
       // Object with single key -> op with param
       const keys = Object.keys(item);
       if (keys.length === 1 && keys[0] !== 'op') {
         const op = keys[0];
         const value = item[op];
         
         // Special mappings
         switch(op) {
           case 'save': return { op: 'save', as: value };
           case 'limit': return { op: 'limit', count: value };
           case 'default': return { op: 'default', value: value };
           // ... etc
         }
       }
       
       // Already in explicit format
       return item;
     });
   }
   ```

2. Build dependency graph:
   ```typescript
   function buildDependencyGraph(events: Record<string, Event>) {
     const graph = new Map<string, Set<string>>();
     
     for (const [name, event] of Object.entries(events)) {
       const deps = extractDependencies(event);
       graph.set(name, deps);
     }
     
     // Check for cycles
     if (hasCycle(graph)) {
       throw new Error("Circular dependency detected!");
     }
     
     return graph;
   }
   ```

### Phase 3: Renderer Simplification 🎉
**File**: `src/renderer.tsx`

1. Remove tool_call handling (lines 180-398):
   ```typescript
   // DELETE THIS ENTIRE BLOCK
   if (eventTemplate.tool_call) {
     // 200+ lines of special logic
   }
   ```

2. Simplify variable resolution:
   ```typescript
   function resolveExpression(expr: string, ctx: RenderContext): any {
     // Handle "or" fallback
     if (expr.includes(' or ')) {
       const [path, fallback] = expr.split(' or ');
       return resolvePath(ctx, path) ?? fallback;
     }
     
     // Simple dot access
     return resolvePath(ctx, expr) ?? '';
   }
   ```

3. Add reactive event subscriptions:
   ```typescript
   // Events with "match" are reactive subscriptions
   for (const [name, event] of Object.entries(json.events)) {
     if (!event.match) continue;
     
     subscriptions.push({
       filter: resolveVars(event.match, context),
       onEvent: (matched) => {
         const piped = applyPipes(matched, event.pipe);
         const newEvent = buildEvent(event.then, piped);
         publishEvent(newEvent);
       }
     });
   }
   ```

### Phase 4: Pipe Implementation 🔧
**File**: `src/lib/pipes.ts` (new file)

Create unified pipe processor:
```typescript
export function applyPipes(data: any, pipes: PipeOperation[]): any {
  let current = data;
  
  for (const pipe of pipes) {
    switch (pipe.op) {
      case 'first':
        current = Array.isArray(current) ? current[0] : current;
        break;
        
      case 'get':
        current = current?.[pipe.field];
        break;
        
      case 'json':
        current = typeof current === 'string' ? JSON.parse(current) : current;
        break;
        
      case 'default':
        current = current ?? pipe.value;
        break;
        
      case 'save':
        // Return object with named field
        return { [pipe.as]: current };
        
      // ... implement all operations
    }
  }
  
  return current;
}
```

### Phase 5: Update Examples 📝
**Files**: All files in `examples/`

1. **counter.md**:
   - Remove `tool_call: true`
   - Add reactive event with `match` and `pipe`
   - Use compact pipe syntax

2. **client.md**:
   - Replace `extract` with proper pipes
   - Remove `live: true` (default now)
   - Use compact syntax

3. **All other examples**:
   - Update to new syntax
   - Test compilation to JSON
   - Verify expected output

### Phase 6: Testing 🧪
**Files**: `tests/`, new test files

1. Test pipe operations:
   ```typescript
   test('pipe operations', () => {
     const data = [{ content: '{"value": 42}' }];
     const pipes = [
       { op: 'first' },
       { op: 'get', field: 'content' },
       { op: 'json' },
       { op: 'get', field: 'value' },
       { op: 'default', value: 0 }
     ];
     
     expect(applyPipes(data, pipes)).toBe(42);
   });
   ```

2. Test reactive events:
   - Verify subscriptions set up correctly
   - Test dependency resolution
   - Verify cycle detection

3. Test YAML compilation:
   - Compact syntax → JSON
   - All examples compile correctly

### Phase 7: Documentation 📚
**Files**: `README.md`, `OUTPUT.md`, docs

1. Update OUTPUT.md with new JSON structure
2. Document pipe operations
3. Add migration guide from old syntax
4. Update examples in README

## Success Metrics

### Renderer Complexity Reduction
- **Before**: ~1180 lines in renderer.tsx
- **After**: ~600 lines (50% reduction)
- **Removed**: All tool_call logic, complex variable resolution
- **Simplified**: One `applyPipes` function for all transformations

### Performance Improvements
- No runtime pipe parsing (pre-compiled)
- No EOSE waiting (immediate live subscriptions)
- Dependency graph prevents unnecessary re-renders

### Developer Experience
- Cleaner YAML syntax (less verbose)
- Consistent pipe operations everywhere
- Clear error messages from compile-time checks

## Migration Strategy

### No Backward Compatibility Needed!
Since we haven't shipped v1.0 yet, we can make breaking changes freely:
- **Direct replacement**: Old syntax completely removed
- **Clean slate**: No migration code or deprecation warnings
- **Simpler codebase**: No legacy support burden

### Rollout
1. **Immediate**: Merge to main when ready
2. **Update all examples**: In same PR
3. **Clean cut**: Old syntax gone, new syntax only

## File Change Summary

### Files to Modify
- `src/lib/schema.ts` - Update schemas
- `src/lib/compiler.ts` - Add compact syntax parser
- `src/renderer.tsx` - Remove 400+ lines, simplify
- `src/lib/tokenizer.ts` - Minor updates for new syntax
- All files in `examples/` - Update to new syntax

### Files to Add
- `src/lib/pipes.ts` - Unified pipe processor
- `src/lib/dependency-graph.ts` - Cycle detection
- `tests/pipes.test.ts` - Pipe operation tests
- `tests/reactive-events.test.ts` - Event subscription tests

### Files to Remove
- None directly, but remove large code blocks

## Timeline Estimate

- **Phase 1-2**: 2 days (Schema + Compiler)
- **Phase 3-4**: 2 days (Renderer simplification)
- **Phase 5**: 1 day (Update examples)
- **Phase 6-7**: 2 days (Testing + Docs)

**Total**: ~1 week for full implementation

## Risk Mitigation

1. **Risk**: Missing edge cases in pipes
   - **Mitigation**: Comprehensive test suite
   - **Mitigation**: Test all examples thoroughly

2. **Risk**: Performance regression
   - **Mitigation**: Benchmark before/after
   - **Mitigation**: Profile subscription setup

3. **Risk**: Dependency cycles
   - **Mitigation**: Compile-time detection
   - **Mitigation**: Clear error messages

## Next Steps

1. Review and approve this plan
2. Create feature branch `simplification-v2`
3. Start with Phase 1 (Schema updates)
4. Implement incrementally with tests
5. Beta test with community
6. Release v2.0

---

This simplification will make Hypernote significantly easier to understand, implement, and extend. The renderer becomes almost trivial - just setting up subscriptions and replacing variables!