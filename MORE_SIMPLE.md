# MORE_SIMPLE.md — Simpler Hypernote Output Plan

This document proposes a stricter, simpler output JSON that keeps the renderer nearly mechanical: wire queries, wire dependent queries, wire events and dependent events, then perform trivial variable replacement. It builds on the existing OUTPUT.md, but removes special-casing (notably `tool_call`) and constrains transformation power into queries only.

## Design Goals

1. Minimize renderer logic (no branching on event types, no bespoke tool-call handling)
2. Keep transformations in queries via a tiny, explicit pipe DSL
3. Inline markup only performs simple variable lookup with a single fallback
4. Make dependent event creation HTMX-inspired: events declare targets; an effects layer wires watchers
5. Output should feel “pre-parsed” and foolproof to render

## Output Structure (unchanged high-level shape)

We keep the same top-level keys as in OUTPUT.md to stay compatible:

- `version`
- `component_kind`
- `imports`
- `style`
- `queries` (with a constrained pipe DSL; live by default)
- `events` (no `tool_call` flag; plain templates only; optional `watch` and `refresh`)
- `elements` (markup with only simple variable interpolation + fallback)

## Inline Variable Syntax (strict and simple)

Inline substitutions in element `content` and `attributes` use a single, uniform grammar:

- Basic: `{scope.path}`
- With fallback: `{scope.path or <fallback_literal>}`

Rules:
- `scope` can be one of: `user`, `time`, `target`, `form`, `$<queryName>`, `event` (only inside effects-triggered contexts), `last.<eventName>` (most recent sent in this session)
- `path` uses dot-notation only (no pipes, no JSONPath, no filters)
- `fallback_literal` is a string/number/boolean literal (no expressions). Quotes optional for strings without spaces; otherwise use quotes
- No inline pipes, no operators other than `or`

Examples:
- `{user.pubkey}`
- `{$profile.picture or "/avatar.png"}`
- `{last.@increment.id}`

Renderer responsibility: resolve the dot path in the current context or use the fallback; if unresolved and no fallback, use empty string.

## Live-by-Default Queries

- All queries are live by default (subscribe mode), matching Nostr’s primary usage
- Opt-out with `live: false` for one-shot snapshots if needed

## Query Pipes (the only place with transformations)

Queries keep the familiar nostr filter shape and add a tiny, declarative pipe DSL that covers 80% of needs without inline complexity. Pipes are arrays of steps; each step is an object with one key.

Supported steps (initial set):
- `{ "first": true }` — take first item of an array
- `{ "get": "path.to.field" }` — pick a field via dot path from an object
- `{ "pluck": "path.to.field" }` — map array of objects to array of values at path
- `{ "mapGet": "path.to.field" }` — alias of `pluck` (pick one; `pluck` preferred)
- `{ "json": true }` — parse a JSON string into an object
- `{ "default": <literal> }` — fallback value if current value is null/undefined/empty array
- `{ "reverse": true }`
- `{ "sortBy": { "path": "path.to.field", "order": "asc"|"desc" } }`
- `{ "where": { "path": "path.to.field", "eq": <literal> } }` — simple equality filter
- `{ "unique": true }`
- `{ "take": <number> }` — take first N

Nostr tuple/array helpers (for tag tuples like `["p", "npub..."]`):
- `{ "whereIndex": { "index": <number>, "eq": <literal> } }` — filter arrays by a tuple index value
- `{ "pluckIndex": <number> }` — map arrays of tuples to a specific index

Notes:
- Keep everything JSON, no expression strings
- Dot-path only (no JSONPath)
- To produce scalar values for inline substitution, use `first` + `get` + `default`

Example query using pipes:

```json
"$count": {
  "kinds": [30078],
  "authors": ["{user.pubkey}"],
  "#d": ["counter-state"],
  "limit": 1,
  "pipe": [
    { "first": true },
    { "get": "content" },
    { "json": true },
    { "get": "value" },
    { "default": 0 }
  ]
}
```

## Events (no special cases)

Event templates are plain Nostr events with variable substitution. There is no `tool_call` flag. If you need to call a ContextVM or JSON-RPC service, structure the `content` as a JSON string yourself and tag the provider with `p`.

Example tool-call event (JSON-RPC) without special handling:

```json
"@increment": {
  "kind": 25910,
  "content": "{\n  \"jsonrpc\": \"2.0\",\n  \"method\": \"tools/call\",\n  \"params\": { \"name\": \"addone\", \"arguments\": { \"a\": { $count } } },\n  \"id\": \"inc-1\"\n}",
  "tags": [
    ["p", "{provider.pubkey}"]
  ]
}
```

Example follow-up state event:

```json
"@update_count": {
  "kind": 30078,
  "content": "{ \"value\": { $increment_response or 0 } }",
  "tags": [
    ["d", "counter-state"]
  ]
}
```

Renderer responsibility: perform variable replacement and publish. Nothing more.

## Event watchers (HTMX-inspired, no effects array)

Instead of a separate effects array, dependent event creation is declared where it is used: on the event that should auto-publish. Because queries are live by default, this becomes a simple “watch → publish” link.

Schema additions on events:

```json
"@eventName": {
  "kind": 1,
  "content": "...",
  "watch": "$queryName",
  "refresh": ["$queryToRefresh"]
}
```

Semantics:
- `watch`: name of a query to subscribe to; when its value updates, publish this event using current substitution context
- The watched query can reference dynamic variables like `{last.@otherEvent.id}` to parameterize with the most recent publish
- `refresh`: optional list of queries to invalidate/refetch after publishing (often unnecessary because live queries will update automatically when new events arrive)

Counter example using watchers:

```json
"queries": {
  "$count": {
    "kinds": [30078],
    "authors": ["{user.pubkey}"],
    "#d": ["counter"],
    "limit": 1,
    "pipe": [
      { "first": true },
      { "get": "content" },
      { "json": true },
      { "get": "value" },
      { "default": 0 }
    ]
  },
  "$increment_response": {
    "kinds": [25910],
    "authors": ["{provider.pubkey}"],
    "#e": ["{last.@increment.id}"],
    "limit": 1,
    "pipe": [
      { "first": true },
      { "get": "content" },
      { "json": true },
      { "get": "result" },
      { "default": 0 }
    ]
  }
},
"events": {
  "@increment": {
    "kind": 25910,
    "content": "{\n  \"jsonrpc\": \"2.0\",\n  \"method\": \"tools/call\",\n  \"params\": { \"name\": \"addone\", \"arguments\": { \"a\": { $count } } },\n  \"id\": \"inc-1\"\n}",
    "tags": [["p", "{provider.pubkey}"]]
  },
  "@update_count": {
    "kind": 30078,
    "watch": "$increment_response",
    "content": "{ \"value\": { $increment_response } }",
    "tags": [["d", "counter"]]
  }
}
```

Renderer responsibility: subscribe to `$increment_response`; when it emits, publish `@update_count`. No bespoke logic.

## Elements (unchanged, but simpler inline)

Elements continue to be a flat array structure. Inline values use only the simple substitution grammar (no pipes). Examples:

```json
{
  "type": "img",
  "attributes": {
    "src": "{ $profile.picture or \"/avatar.png\" }",
    "alt": "Profile"
  },
  "style": { "width": "8rem", "height": "8rem" }
}
```

```json
{
  "type": "form",
  "event": "@increment",
  "elements": [
    { "type": "button", "content": ["+1"] }
  ]
}
```

## Why this removes `tool_call` special-casing

- The `@increment` event is just a normal event
- Waiting for tool responses is modeled as a normal, live query (`$increment_response`) parameterized by `{last.@increment.id}` and the provider
- Chaining is declared via an event-level `watch` on `@update_count`
- `@update_count` is another normal event that reads from `$increment_response`

Net effect: delete `if (eventTemplate.tool_call)` branches and replace with a generic “publish → run queries → publish → refresh” loop.

## Comparison with OUTPUT.md

- Keeps the same top-level structure and document semantics
- Pipes remain exactly where OUTPUT.md already allows them (in queries), but standardized and named
- Inline variable usage is reduced to a single pattern with `or` fallback
- The former `events.@increment.tool_call/provider/target` example becomes:
  - plain event template
  - a response query
  - an event with `watch: "$responseQuery"`

## Minimal Pipe Reference

- `first` — array → item
- `get: "a.b.c"` — object → field
- `json` — string(JSON) → object
- `default: <literal>` — null/undefined/[] → literal
- `reverse` — array → reversed array
- `pluck: "a.b"` — array<object> → array<value>
- `where: { path, eq }` — array<object> → filtered array
- `sortBy: { path, order }` — array<object> → sorted array
- `unique` — array → de-duped array
- `take: n` — array → first n
- `whereIndex: { index, eq }` — filter tuples by index value
- `pluckIndex: n` — array<tuple> → array<tuple[n]>

Everything else can be composed from these.

## Implementation Notes

1. Schema
   - Restrict inline placeholders to `{scope.path}` and `{scope.path or literal}`
   - Queries are `live: true` by default; allow `live: false` to opt out
   - Add `watch` (string or array) and optional `refresh` to event schema
   - Enumerate allowed pipe steps for validation, including `whereIndex` and `pluckIndex`

2. Compiler/Tokenizer
   - Enforce the new inline grammar (no pipe parsing inline)
   - Maintain existing element parsing, no changes needed

3. Renderer
   - Remove special-case `tool_call` handling
   - Implement event watchers:
     1) for each event with `watch`, subscribe to the query (already live)
     2) on update, publish the event with current substitution context
     3) optionally refresh listed queries (often unnecessary)
   - Variable substitution: dot-path lookup + fallback only

4. Examples
   - Update `examples/counter.md` headmatter to:
     - add `$increment_response` live query parameterized by `{last.@increment.id}`
     - make `@increment` a plain event
     - make `@update_count` an event with `watch: "$increment_response"`
   - Update `examples/client.md` to replace `extract` with pipe DSL and rely on live-by-default

## Input .md syntax changes (client.md and counter.md)

Minimal authoring changes needed to support this model:

- Inline variables: only `{scope.path}` and `{scope.path or <literal>}` (no inline pipes)
- Queries: live by default; remove `live: true` unless opting out with `live: false`
- Pipes: use the JSON DSL (`first`, `get`, `json`, `pluck`, `where`, `whereIndex`, `pluckIndex`, `default`, etc.) — no `operation: extract` strings
- Dependent events: define a live query that references `{last.@eventName.*}` and add `watch: "$that_query"` to the dependent event

### Counter (headmatter changes)

Before (key parts):

```yaml
"$count": { kinds: [30078], authors: [user.pubkey], limit: 1, live: true }
"@increment": { kind: 25910, tool_call: true, provider: "npub...", tool_name: "addone", arguments: { a: "{$count.content}" }, target: "@update_count" }
"@update_count": { kind: 30078, content: "{response.result}", tags: [["d", "counter"]] }
```

After:

```yaml
"$count": {
  kinds: [30078],
  authors: [user.pubkey],
  "#d": ["counter"],
  limit: 1,
  pipe: [ { first: true }, { get: "content" }, { json: true }, { get: "value" }, { default: 0 } ]
}

"$increment_response": {
  kinds: [25910],
  authors: [provider.pubkey],
  "#e": ["{last.@increment.id}"],
  limit: 1,
  pipe: [ { first: true }, { get: "content" }, { json: true }, { get: "result" }, { default: 0 } ]
}

"@increment": {
  kind: 25910,
  content: "{\n  \"jsonrpc\": \"2.0\",\n  \"method\": \"tools/call\",\n  \"params\": { \"name\": \"addone\", \"arguments\": { \"a\": { $count } } },\n  \"id\": \"inc-1\"\n}",
  tags: [["p", "{provider.pubkey}"]]
}

"@update_count": {
  kind: 30078,
  watch: "$increment_response",
  content: "{ \"value\": { $increment_response } }",
  tags: [["d", "counter"]]
}
```

Markup changes:
- Replace `{$count.content | first}` with `{$count or 0}`
- Remove any inline pipes

### Client (headmatter changes)

Before (key parts):

```yaml
"$contact_list": {
  kinds: [3], authors: [user.pubkey], limit: 1,
  pipe: [ { operation: extract, expression: '.tags[] | select(.[0] == "p") | .[1]', as: followed_pubkeys } ]
}

"$following_feed": { kinds: [1], authors: $followed_pubkeys, limit: 20, live: true, since: 0 }
```

After:

```yaml
"$contact_list": { kinds: [3], authors: [user.pubkey], limit: 1 }

"$followed_pubkeys": {
  source: "$contact_list",
  pipe: [
    { first: true },
    { get: "tags" },
    { whereIndex: { index: 0, eq: "p" } },
    { pluckIndex: 1 },
    { unique: true }
  ]
}

"$following_feed": { kinds: [1], authors: "{$followed_pubkeys}", limit: 20, since: 0 }
```

Markup changes:
- No changes needed except removing any inline pipes (none in the provided snippet)

## Open Options (for discussion)

- Event watch form
  - Allow `watch` to be a string or array of query names; when multiple, publish on any update or all-update (flag?)

- Additional pipe ops
  - Add `flatten`, `groupBy` later if needed; keep v1 minimal

- JSON-RPC helper (nice-to-have, not required)
  - Optional sugar: `contentTemplate: { type: "json-rpc", method, params }` → compiled to `content` string
  - Keep renderer ignorant of this; compilation-only convenience

---

This plan keeps all “thinking” in queries and event watchers, so the renderer only:
1) wires queries (live by default); 2) wires watchers; 3) performs trivial substitutions; 4) publishes. No bespoke branches, no hidden magic.


