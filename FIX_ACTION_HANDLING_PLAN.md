# FIX_ACTION_HANDLING_PLAN

## Current Problems

1. **Inverted Dependencies** - We're using refs to pass handleFormSubmit down, which is a code smell
2. **Complex JSON Handling** - Too much logic in handleFormSubmit for parsing/resolving variables
3. **Double Escaping** - Values getting wrapped in extra quotes due to JSON.stringify
4. **Tight Coupling** - Action handling is mixed with rendering logic

## Proposed Architecture

### 1. Create useActionExecution Hook
Similar to `useQueryExecution`, create a dedicated hook for action handling:

```typescript
// src/hooks/useActionExecution.ts
interface UseActionExecutionOptions {
  events: Record<string, EventTemplate>;
  queryResults: Record<string, any>;
  formData: Record<string, string>;
  userPubkey: string | null;
}

interface UseActionExecutionResult {
  executeAction: (actionName: string) => Promise<void>;
  isExecuting: boolean;
  lastError: Error | null;
}

export function useActionExecution(options: UseActionExecutionOptions): UseActionExecutionResult {
  // Handle all action execution logic here
  // Simple variable resolution
  // Event signing and publishing
}
```

### 2. Simplify Variable Resolution

Create a clean variable resolver that handles the different cases:

```typescript
// src/lib/action-resolver.ts
export class ActionResolver {
  resolve(template: string, context: Record<string, any>): string {
    // If it's a single variable reference like "{$update_increment}"
    // Return the raw value without any JSON processing
    
    // If it's a template with multiple variables
    // Do simple string replacement
    
    // Only do JSON processing if template.json exists
  }
}
```

### 3. Clean Separation of Concerns

```
┌─────────────────────────────────────┐
│         RenderHypernote             │
│  - Owns the UI rendering            │
│  - No action logic                  │
└─────────────────────────────────────┘
                  │
                  ├── useQueryExecution
                  │   - Fetches data
                  │   - Manages subscriptions
                  │   - Triggers actions via callback
                  │
                  └── useActionExecution
                      - Executes actions
                      - Resolves variables
                      - Signs & publishes events
```

### 4. Implementation Steps

#### Phase 1: Create ActionResolver
1. Create `src/lib/action-resolver.ts`
2. Move all variable resolution logic from renderer
3. Handle single variable case specially (no JSON processing)
4. Test with counter example

#### Phase 2: Create useActionExecution Hook
1. Create `src/hooks/useActionExecution.ts`
2. Move handleFormSubmit logic into the hook
3. Use ActionResolver for variable resolution
4. Return clean executeAction function

#### Phase 3: Update Renderer
1. Remove handleFormSubmit from renderer
2. Use useActionExecution hook
3. Pass executeAction to:
   - Form submissions
   - Query trigger callbacks
4. Remove ref hacks

#### Phase 4: Connect Everything
1. Update useQueryExecution to accept executeAction callback
2. Pass it cleanly without refs
3. Test full flow

## Benefits

1. **Clean Separation** - Actions and queries are independent
2. **Testable** - Each piece can be tested in isolation
3. **No Refs** - Clean prop passing
4. **Simple Resolution** - Single variables stay as single values
5. **Maintainable** - Easy to understand and modify

## Key Principle

**Single Variable = Single Value**

When content is `"{$update_increment}"` and `$update_increment` is `"43"`:
- Old: JSON processes it → `"\"43\""`
- New: Direct replacement → `"43"`

## Example: Counter Flow

1. User clicks increment
2. `@increment` publishes via executeAction
3. Tool responds, `$update_increment` gets value `"43"`
4. Trigger fires, calls executeAction("@save_increment")
5. ActionResolver sees `"{$update_increment}"` is a single variable
6. Returns raw value `"43"` (no JSON processing)
7. Event publishes with `content: "43"`
8. Counter displays correctly

## Next Steps

1. Review this plan
2. Create ActionResolver with tests
3. Create useActionExecution hook
4. Refactor renderer to use new architecture
5. Test with counter example