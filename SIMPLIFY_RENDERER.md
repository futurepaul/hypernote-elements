# Renderer Simplification Plan (Revised)

## Core Principles
1. **Pure function** - No hooks, no side effects, just data in → React elements out
2. **Single file** - Everything in renderer.tsx
3. **Dumb renderer** - Just transforms data, doesn't fetch or manage state

## Current Issues
- Too much state management inside renderer (auth, form state, query execution)
- Complex variable resolution scattered across multiple functions
- Massive prop passing (10 props to every child)
- 863 lines with lots of duplication

## Revised Approach: Pure Functional Renderer

### Phase 1: Extract State Management OUT of Renderer

#### Move OUT to the caller (HypernoteRenderer wrapper):
- Query execution (useQueryExecution)
- Form state management (useState)
- Auth state (useAuthStore)
- Debouncing (useDebounce)
- Query hashing logic

#### Keep IN the renderer (as pure functions):
- Variable resolution
- Element rendering
- Content processing

**New structure:**
```typescript
// The SMART wrapper (has hooks, manages state)
export function HypernoteRenderer({ markdown, relayHandler }) {
  // All the hooks and state here
  const compiledContent = useMemo(() => compile(markdown), [markdown]);
  const queryResults = useQueryExecution(compiledContent.queries);
  const [formData, setFormData] = useState({});
  
  // Pass everything down to pure renderer
  return <PureRenderer 
    content={compiledContent}
    context={{
      queryResults,
      formData,
      userPubkey: pubkey,
      onFormSubmit: handleFormSubmit,
      onInputChange: handleInputChange
    }}
  />;
}

// The DUMB renderer (pure function, no hooks)
function PureRenderer({ content, context }) {
  // Just pure rendering logic
  return renderElement(content.elements[0], context);
}
```

### Phase 2: Simplify Variable Resolution

**Current**: Three functions with overlapping logic
**Proposed**: One pure function with clear patterns

```typescript
// Single pure function for ALL variable resolution
function resolveExpression(expr: string, context: RenderContext): any {
  // Priority order (first match wins):
  // 1. Loop variables: $item.field
  // 2. Query results: $queryName.field  
  // 3. Extracted variables: extractedVarName
  // 4. Form fields: form.fieldName
  // 5. User context: user.pubkey
  // 6. Time: time.now
  // 7. Return original if no match
  
  if (expr.startsWith('$')) {
    return resolveQueryOrLoopVar(expr, context);
  }
  if (expr.startsWith('form.')) {
    return context.formData[expr.slice(5)] || '';
  }
  if (expr === 'user.pubkey') {
    return context.userPubkey || '';
  }
  if (expr === 'time.now') {
    return Date.now();
  }
  if (context.extractedVariables[expr]) {
    return context.extractedVariables[expr];
  }
  return expr;
}
```

### Phase 3: Reduce Prop Passing

**Current**: Pass 10 props everywhere
**Proposed**: Pass single context object

```typescript
interface RenderContext {
  // Data
  queryResults: Record<string, NostrEvent[]>;
  extractedVariables: Record<string, any>;
  formData: Record<string, string>;
  events: Record<string, any>;
  userPubkey: string | null;
  
  // Current scope
  loopVariables: Record<string, any>;
  
  // Callbacks (pure functions passed from parent)
  onFormSubmit: (eventName: string, formData: Record<string, string>) => void;
  onInputChange: (name: string, value: string) => void;
}

// Now every render function just takes element + context
function renderElement(element: HypernoteElement, context: RenderContext): ReactNode {
  // ...
}
```

### Phase 4: Simplify Element Rendering

**Current**: Giant switch with duplication
**Proposed**: Group similar elements

```typescript
function renderElement(element: HypernoteElement, ctx: RenderContext): ReactNode {
  const props = {
    id: element.elementId,
    style: element.style || {}
  };

  // Text elements with content array
  if (['h1', 'h2', 'h3', 'p', 'strong', 'em'].includes(element.type)) {
    return React.createElement(
      element.type,
      props,
      renderContent(element.content, ctx)
    );
  }

  // Container elements with children
  if (['div', 'span', 'form', 'button'].includes(element.type)) {
    const extraProps = element.type === 'form' 
      ? { onSubmit: (e) => { e.preventDefault(); ctx.onFormSubmit(element.event, ctx.formData); } }
      : element.type === 'button'
      ? { type: 'submit' }
      : {};
      
    return React.createElement(
      element.type,
      { ...props, ...extraProps },
      element.elements?.map((child, i) => renderElement(child, ctx))
    );
  }

  // Special elements
  switch (element.type) {
    case 'input':
      return renderInput(element, ctx);
    case 'img':
      return renderImage(element, ctx);
    case 'loop':
      return renderLoop(element, ctx);
    case 'json':
      return renderJson(element, ctx);
    default:
      return renderDefault(element, ctx);
  }
}
```

### Phase 5: Helper Functions (all pure)

```typescript
// Pure content renderer
function renderContent(content: any[] | undefined, ctx: RenderContext): ReactNode[] {
  if (!content) return [];
  return content.map((item, i) => {
    if (typeof item === 'string') {
      // Process variables in string
      const processed = item.replace(/\{([^}]+)\}/g, (_, expr) => 
        String(resolveExpression(expr, ctx))
      );
      return processed;
    }
    return renderElement(item, ctx);
  });
}

// Pure loop renderer
function renderLoop(element: HypernoteElement, ctx: RenderContext): ReactNode {
  const data = ctx.queryResults[element.source] || [];
  const varName = element.variable || '$item';
  
  return (
    <div id={element.elementId} style={element.style}>
      {data.length === 0 ? (
        <div>No data found</div>
      ) : (
        data.map((item, i) => {
          const loopCtx = {
            ...ctx,
            loopVariables: { ...ctx.loopVariables, [varName]: item }
          };
          return (
            <div key={item.id || i}>
              {element.elements?.map((child, j) => 
                renderElement(child, loopCtx)
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// Pure image renderer
function renderImage(element: HypernoteElement, ctx: RenderContext): ReactNode {
  const src = processString(element.attributes?.src || '', ctx);
  const alt = processString(element.attributes?.alt || '', ctx);
  
  if (!src) {
    return <div style={element.style}>[Image: {alt || 'No image'}]</div>;
  }
  
  return <img id={element.elementId} src={src} alt={alt} style={element.style} />;
}

// Pure string processor
function processString(str: string, ctx: RenderContext): string {
  return str.replace(/\{([^}]+)\}/g, (_, expr) => 
    String(resolveExpression(expr, ctx))
  );
}
```

## Benefits of This Approach

1. **Pure Functions**: Entire renderer is pure - no hooks, no side effects
2. **Single File**: Everything stays in renderer.tsx
3. **Dumb Renderer**: Just transforms data, doesn't know about stores or hooks
4. **Testable**: Pure functions are trivial to test
5. **Composable**: Each function does one thing well
6. **~400 lines**: Down from 863 lines

## What We Lose

- No loading states in renderer (handled by wrapper)
- No error boundaries in renderer (handled by wrapper)
- No direct store access (all data passed in)

## Implementation Order

1. **Extract state management** - Move all hooks to wrapper component
2. **Consolidate variable resolution** - Single pure function
3. **Simplify prop passing** - Use context object
4. **Group similar elements** - Reduce switch duplication
5. **Extract pure helpers** - Small focused functions

This keeps the renderer as a pure, predictable function while still maintaining all functionality.