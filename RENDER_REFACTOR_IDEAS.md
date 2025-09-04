Here’s a pragmatic refactor plan that keeps behavior the same, trims circular deps, and pushes far more logic into pure, testable code. I’ll show the new boundaries, what moves where, and a few drop-in code snippets for the biggest wins (form init, “time.now”, hashing, component target parsing, etc.).

---

# 1) Split into three layers (dependency inversion)

**A. `@hypernote/core` (pure, no React / no stores)**

* Types: `Hypernote`, `HypernoteElement`, `RenderContext` (but context is a plain data bag).
* Pure utilities:

  * `resolveExpression`, `processString`, `resolveObjectVariables`, `applyPipes` (no imports from React, stores, or network clients).
  * `deriveInitialFormData(content: Hypernote): Record<string,string>` (scans elements for `input[type=hidden]` and returns defaults).
  * `stableHash(obj): string` (fast, sync hash of queries to avoid `crypto.subtle` and async effects in UI).
  * Tiny “expression” support for `time.now` via an **injected** clock rather than `new Function`.

**B. `@hypernote/runtime` (framework-agnostic orchestration)**

* Contracts (interfaces) that the app/adapters provide:

  ```ts
  export interface QueryEngine {
    runAll(h: Hypernote, opts: { actionResults: Record<string,string>, onTriggerAction?: (name: string) => void, target?: TargetContext, parentExtracted?: Record<string,unknown> }): Promise<{ queryResults: Record<string,unknown[]>, extractedVariables: Record<string,unknown> }>;
    stream?: (/* optional streaming */) => () => void;
  }

  export interface ActionExecutor {
    execute(actionName: string, form: Record<string,string>): Promise<string|void>;
  }

  export interface TargetParser {
    parse(arg: string, kind: 0|1): Promise<TargetContext>;
  }

  export interface Clock { now(): number }
  ```
* A pure planner that builds the query dependency order (DAG) from `content.queries`.
* A small “state reducer” that merges `actionResults`, `queryResults`, `extractedVariables`. All pure.

**C. `@hypernote/react` (thin adapter)**

* `useHypernote(content, services)` hook that:

  * uses the **runtime** (not the renderer) to kick off queries.
  * returns `{ queryResults, extractedVariables, loading, error, executeAction }`.
* `HypernoteView` that renders elements by calling **pure render fns** from core (no store, no network).
* `ComponentWrapper` gets **only** adapter functions via props: `targetParser`, `queryEngine`, `clock`.

**Adapters** (your app):

* `snstrQueryEngine(snstrClient) implements QueryEngine`
* `nostrActionExecutor(relayHandler) implements ActionExecutor`
* `nostrTargetParser(snstrClient) implements TargetParser`
* Provide `clock: { now: () => Date.now() }`
* Provide `pubkey` from `useAuthStore` **outside** the renderer.

This inversion eliminates the current cycles:

* Core → nothing.
* Runtime → Core.
* React → Core & Runtime.
* Adapters → external libs (nostr, stores), but **not** React.

---

# 2) Push all side effects to the edges

**What moves out of the renderer:**

* `useNostrStore`, `useAuthStore` usage → **parent** collects `snstrClient` + `pubkey` and passes them via `services`/props.
* `ComponentResolver` creation → a **service** you inject (or remove entirely if its only job is argument parsing; use `TargetParser`).
* `crypto.subtle.digest` (async) → replace with a **sync** `stableHash` in core.
* `setTimeout` inside `<input>` path → replace with derived initial form state (pure), then re-init when content changes.

---

# 3) Minimal drop-in code: new public surface

```tsx
// @hypernote/react

export type Services = {
  queryEngine: QueryEngine;
  actionExecutor: ActionExecutor;
  targetParser: TargetParser;
  clock: Clock;                  // e.g. { now: () => Date.now() }
  userPubkey: string | null;     // injected, not read from a store here
};

export function HypernoteRenderer({
  markdown,
  services,
}: {
  markdown: string;
  services: Services;
}) {
  const [debounced] = useDebounce(markdown || "", 300);
  const compileResult = useMemo(() => safeCompileHypernote(debounced || ""), [debounced]);
  return <RenderHypernoteContent content={compileResult.data} services={services} />;
}
```

```tsx
export function RenderHypernoteContent({
  content,
  services,
}: {
  content: Hypernote;
  services: Services;
}) {
  // form init (pure → effect), no setTimeout
  const initialForm = useMemo(() => deriveInitialFormData(content), [content]);
  const [formData, setFormData] = useState<Record<string, string>>(initialForm);
  useEffect(() => setFormData(initialForm), [initialForm]);

  // queries hash (sync)
  const queriesKey = useMemo(() => stableHash(content.queries || {}), [content.queries]);

  // action results (ref)
  const [publishedEventIds, setPublishedEventIds] = useState<Record<string, string>>({});

  const { queryResults, extractedVariables, loading, error, executeAction: runAction } =
    useHypernote(content, {
      ...services,
      actionResults: publishedEventIds,
      onTriggerAction: (name) => void runAction(name, formData),
      queriesKey,
    });

  const ctx: RenderContext = {
    queryResults,
    extractedVariables,
    formData,
    events: content.events || {},
    userPubkey: services.userPubkey,
    loopVariables: {},
    depth: 0,
    loadingQueries: loading ? new Set(Object.keys(content.queries || {})) : new Set(),
    onFormSubmit: (eventName) => void runAction(eventName, formData).then((id) => {
      if (id) setPublishedEventIds((p) => ({ ...p, [eventName]: id }));
    }),
    onInputChange: (name, value) => setFormData((p) => ({ ...p, [name]: value })),
  };

  return (
    <>
      {error && (
        <div style={{ background: "#fee", color: "#c00", padding: 10, borderRadius: 4 }}>
          ⚠️ Some data failed to load: {error}
        </div>
      )}
      <div className="hypernote-content" style={content.style as React.CSSProperties}>
        {content.elements?.map((el) => renderElement(el as any, ctx))}
      </div>
    </>
  );
}
```

---

# 4) Pure core fixes (remove hidden side effects & dangerous eval)

## a) Hidden inputs (no `setTimeout` during render)

```ts
// @hypernote/core/forms.ts
export function deriveInitialFormData(h: Hypernote): Record<string, string> {
  const acc: Record<string,string> = {};
  const walk = (els?: HypernoteElement[]) => {
    els?.forEach((el) => {
      if (el.type === "input") {
        const name = el.attributes?.name;
        const type = el.attributes?.type || "text";
        const val  = el.attributes?.value || "";
        if (name && type === "hidden" && acc[name] === undefined) acc[name] = val;
      }
      if (el.elements) walk(el.elements);
    });
  };
  walk(h.elements);
  return acc;
}
```

Then the `<input>` renderer is a plain controlled input:

```tsx
case 'input': {
  const name = element.attributes?.name || '';
  const type = element.attributes?.type || 'text';
  const value = ctx.formData[name] ?? element.attributes?.value ?? '';
  return (
    <input
      id={element.elementId}
      style={element.style}
      type={type}
      name={name}
      placeholder={element.attributes?.placeholder || ''}
      value={value}
      onChange={(e) => ctx.onInputChange(name, e.target.value)}
    />
  );
}
```

## b) Time expressions (ditch `new Function`)

Inject a clock and support only simple tokens (`time.now`) + arithmetic:

```ts
// @hypernote/core/clock.ts
export type Clock = { now(): number }

// @hypernote/core/expr.ts
export function resolveExpression(expr: string, ctx: RenderContext, clock: Clock): unknown {
  const clean = expr.startsWith('$') ? expr.slice(1) : expr;

  // (1) Try variables/paths first (unchanged logic)...
  const v = resolvePath(clean, ctx); // pure path resolver
  if (v !== undefined) return v;

  // (2) If expression contains time.now and arithmetic, allow limited eval
  if (/\btime\.now\b/.test(expr)) {
    const replaced = expr.replace(/\btime\.now\b/g, String(clock.now()));
    if (!/[^0-9+\-*/().\s]/.test(replaced)) {
      try {
        // eslint-disable-next-line no-new-func
        return Function(`"use strict";return (${replaced})`)();
      } catch { /* fall through */ }
    }
  }
  return undefined;
}
```

Pass `services.clock` down to any resolver calls.

## c) Stable hash (sync, no `crypto.subtle`)

```ts
// @hypernote/core/hash.ts
export function stableHash(obj: unknown): string {
  const s = JSON.stringify(obj ?? {});
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
```

---

# 5) ComponentWrapper: remove store imports & cycles

* **Before:** `ComponentWrapper` imports `useNostrStore`, `parseTarget` directly.
* **After:** it receives `targetParser` (injected) and `clock` via props or from an upper `services` prop.

Sketch:

```tsx
function ComponentWrapper({
  element,
  ctx,
  services,
  componentDef,
}: {
  element: HypernoteElement & { alias?: string; argument?: string };
  ctx: RenderContext;
  services: Services;               // includes targetParser, clock
  componentDef: Hypernote;          // already parsed once
}) {
  const argResolved = useMemo(
    () => (element.argument?.startsWith('{') ? processString(element.argument, ctx) 
                                              : String(resolveExpression(element.argument ?? '', ctx, services.clock))),
    [element.argument, ctx, services.clock]
  );

  const [target, setTarget] = useState<TargetContext | null>(null);
  const [loading, setLoading] = useState(componentDef.kind !== undefined);
  const [err, setErr] = useState<string|null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (componentDef.kind === undefined) { setLoading(false); return; }
      if (!argResolved) { setErr('Waiting for data...'); setLoading(false); return; }
      try {
        setLoading(true);
        const t = await services.targetParser.parse(argResolved, componentDef.kind as 0|1);
        if (!cancelled) { setTarget(t); setErr(null); }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? 'Failed to parse target');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [argResolved, componentDef.kind, services.targetParser]);

  // ... rest unchanged; do not read any global stores
}
```

> Note: The **component event → JSON parse** should happen **once** (outside the component), not repeatedly inside render. Do that when you build `componentDef` from the `#alias` query result.

---

# 6) Element dispatch table (pure renderer registry)

Replace the big switch with a simple registry so files don’t import each other in cycles:

```ts
// @hypernote/core/registry.ts
export type ElementRenderer = (el: HypernoteElement, ctx: RenderContext, deps: { clock: Clock }) => React.ReactNode;

export const registry: Record<string, ElementRenderer> = {
  h1: renderText, h2: renderText, p: renderText, code: renderText,
  div: renderContainer, span: renderContainer,
  form: renderForm, button: renderButton, input: renderInput,
  img: renderImg, loop: renderLoop, if: renderIf, json: renderJson,
  component: renderComponentShell,  // very thin shim that renders <ComponentWrapper/>
};

export function renderElement(el: HypernoteElement, ctx: RenderContext, deps: { clock: Clock }) {
  const r = registry[el.type] ?? renderUnknown;
  return r(el, ctx, deps);
}
```

Now `renderElement` is a single import point; each renderer fn is pure and tiny. No renderer imports the hook or stores.

---

# 7) Kill unused imports & tighten boundaries

* Remove `nip19` import if unused.
* `ComponentResolver` becomes an adapter you inject (or replace entirely with `targetParser`).
* Renderer never imports `useNostrStore`, `useAuthStore`, `useHypernoteExecutor`. Only the **React hook** (`useHypernote`) imports the runtime (which imports core).

---

# 8) Measurable wins

* **Cycles**: Renderer no longer imports anything that imports the renderer (stores/hooks/adapters sit “above” it).
* **Purity**: `resolveExpression`, `processString`, `deriveInitialFormData`, `stableHash`, loop/if/json renderers are 100% pure and unit-testable.
* **Safety**: No `setTimeout` during render; no `new Function` on user strings (only limited arithmetic on `time.now` via injected clock).
* **Performance**: JSON parsing of kind-0 profiles no longer repeated on every property access; initial form defaults are calculated once.
* **Flexibility**: You can render the same `HypernoteView` in non-React environments by swapping the adapter (e.g., SSR, tests).

---

## Migration steps (quick order)

1. Create `@hypernote/core` and move: types, `resolveExpression`, `processString`, pipes, `deriveInitialFormData`, `stableHash`.
2. Create `@hypernote/runtime` with `QueryEngine`, `ActionExecutor`, `TargetParser`, `Clock` contracts and a pure planner (`runAll` is injected from adapters).
3. Move `useHypernoteExecutor` logic into `@hypernote/react/useHypernote` and depend on runtime contracts (not on renderer).
4. Update `HypernoteRenderer` / `RenderHypernoteContent` to accept `services` (pubkey, clock, adapters).
5. Replace the input hidden `setTimeout` with `deriveInitialFormData`.
6. Replace `crypto.subtle.digest` with `stableHash`.
7. Pass `services.clock` into any resolver that needs time.
8. Replace direct store imports with data injection from the parent.

If you want, I can sketch a tiny PR diff for your repository structure next.

