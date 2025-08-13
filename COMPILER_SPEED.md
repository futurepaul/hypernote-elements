# Compiler Speed Investigation

## Problem
The Hypernote MD -> JSON compiler is extremely slow, especially for complex examples like chess.md.

## Initial Observations
- Simple examples compile quickly
- Chess example with nested loops and many conditionals is very slow
- The slowdown seems exponential with complexity

## Benchmarking Setup

### Test Script
```typescript
// benchmark-compiler.ts
import { compileHypernoteToContent } from "./src/lib/compiler";
import chessMd from "./examples/chess.md";

console.time("Total compilation");
const result = compileHypernoteToContent(chessMd);
console.timeEnd("Total compilation");

console.log("Result size:", JSON.stringify(result).length, "chars");
```

### Initial Results
- Chess example: [TO BE MEASURED]
- Counter example: [TO BE MEASURED]
- Basic hello: [TO BE MEASURED]

## Suspected Bottlenecks

### 1. Tailwind Processing
- Every class string goes through Tailwind compilation
- Chess has many repeated class strings (16+ squares with similar styles)
- Possible fix: Cache Tailwind results

### 2. Repeated Tokenization
- Complex nested structures may be re-tokenizing content
- Each conditional and loop creates new parsing contexts

### 3. Schema Validation
- Zod validation on large structures
- Multiple validation passes?

### 4. Style Processing
- Converting Tailwind classes to CSS-in-JS
- Validation of style properties
- Chess has 64+ elements with styles

## Profiling Points to Add

1. **Tokenization Phase**
   - Time to tokenize the markdown
   - Number of tokens created
   
2. **Parsing Phase**
   - Time to parse tokens into AST
   - Depth of nesting
   
3. **Compilation Phase**
   - Time to compile each element type
   - Time spent in style processing
   
4. **Validation Phase**
   - Time spent in Zod validation
   - Number of validation errors/retries

## Specific Chess Example Analysis

The chess example has:
- 2 top-level conditionals (`[if $board_state.rows]`)
- 1 outer loop for rows (8 iterations)
- 1 inner loop for squares (8 iterations per row = 64 total)
- 2 conditionals per square (dark/light)
- 13 piece conditionals per square (13 * 64 = 832 conditionals!)
- Total conditionals: ~900+

This creates a massive tree structure that needs to be:
1. Tokenized
2. Parsed  
3. Compiled with style processing
4. Validated

## Next Steps

1. Add performance.now() timing to key functions
2. Run benchmarks on all examples
3. Create a flame graph or timing breakdown
4. Identify the slowest function calls
5. Implement caching where appropriate

## Optimization Ideas

### Quick Wins
- [ ] Cache Tailwind compilation results (same classes repeated many times)
- [ ] Skip validation during development (add a flag)
- [ ] Memoize style processing for identical class strings

### Medium Effort
- [ ] Optimize tokenizer regex patterns
- [ ] Batch process similar elements
- [ ] Use a faster CSS parser

### Major Refactoring
- [ ] Stream-based compilation instead of full AST
- [ ] Worker threads for parallel processing
- [ ] Pre-compile common patterns

## Benchmark Results

### Run 1: Baseline
```
basic-hello: 3.32ms (1.0x)
counter: 116.42ms (35.1x)
client: 123.56ms (37.2x)  
chess: 2512.46ms (756.8x) ⚠️
```

### Run 2: After Tailwind Caching
```
basic-hello: 4.06ms (1.0x)
counter: 117.71ms (29.0x)
client: 90.33ms (22.3x)
chess: 2566.28ms (632.6x) - Still very slow!
```

Minor improvement for chess (756x -> 632x) but still unacceptably slow.

## Root Cause Analysis

The problem is NOT just Tailwind processing. Looking at the chess example structure:
- 8 rows × 8 squares = 64 squares
- Each square has 2 color conditionals
- Each square has 13 piece conditionals
- Total: 64 × (2 + 13) = 960 conditional elements!

The compiler is creating 960+ element objects, each being:
1. Tokenized
2. Parsed
3. Style-processed
4. Validated with Zod

The exponential slowdown suggests the problem is in how we handle nested structures.

## Profiling Results

### Phase Breakdown (Chess Example)
```
Frontmatter extraction: 0.01ms (0.0%)
Tokenization: 0.17ms (0.0%)
Parse tokens: 0.75ms (0.1%)
Style processing: 217ms (16.1%)
  - 95 elements processed
  - 217ms spent in Tailwind conversion
Pipe processing: 0.01ms (0.0%)
Schema validation: 1130ms (83.8%) ⚠️ BOTTLENECK
```

### Key Finding: Zod Validation is the Bottleneck

The schema validation with Zod takes **83.8% of compilation time** for the chess example:
- 161 total elements to validate
- 1130ms spent in validation
- ~7ms per element validation

This is because:
1. Complex nested schema with many unions
2. Recursive validation of deeply nested structures
3. Discriminated unions require checking multiple branches

## Solution Implemented

### 1. Custom Tailwind Parser (✅ Completed)
- Removed `tw-to-css` dependency
- Created minimal `tailwind-parser.ts` that directly maps Tailwind classes to supported properties
- No Zod validation overhead for style properties

### 2. Skip Validation Flag (✅ Completed)  
Added `SKIP_VALIDATION` environment variable:
```typescript
if (process.env.SKIP_VALIDATION === 'true') {
  return processedResult as Hypernote;
}
```

### Results
Chess example compilation times:
- **Before optimization**: 2512ms
- **After Tailwind parser**: 1341ms (1.9x faster)
- **After schema optimization**: 1005ms (2.5x faster than original)
- **With validation skipped**: 0.25ms (10,000x faster!)

### 3. Schema Optimization (✅ Attempted)
Fixed dynamic schema recreation by:
- Pre-defining reusable schemas (`ElementIdSchema`, `MinStringSchema`, etc.)
- Removing getter functions that recreated schemas
- Using `z.lazy()` for recursive references

**Result**: Modest improvement (~25% faster) but Zod validation still dominates at ~1 second for complex documents.

The remaining bottleneck is Zod's recursive validation of deeply nested structures. For development:
- Use `SKIP_VALIDATION=true` for hot reload
- Run validation only in production/tests

### Future Options
1. Replace Zod with a faster validator (e.g., TypeBox, Ajv)
2. Implement streaming validation
3. Cache validation results for unchanged sections