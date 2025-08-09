# YAML Syntax Examples for Pipes

## Option A: Compact Object Notation

### Simple Operations (no parameters)
```yaml
pipe:
  - first      # Takes first item from array
  - last       # Takes last item from array
  - json       # Parses string as JSON
  - reverse    # Reverses array
  - unique     # Removes duplicates
```

### Operations with Single Parameter
```yaml
pipe:
  - get: content          # Gets field "content"
  - save: value           # Saves to "value" 
  - default: "0"          # Fallback to "0"
  - limit: 10             # Take first 10 items
  - pluck: pubkey         # Map array to field values
  - pluckIndex: 1         # Get index 1 from each array
```

### Operations with Multiple Parameters
```yaml
pipe:
  - sort: {by: created_at, order: desc}     # Sort by field
  - filter: {field: kind, eq: 1}            # Filter by equality
  - filterTag: {tag: p, value: "*"}         # Filter Nostr tags
  - pluckTag: {tag: p, index: 1}            # Extract from tags
  - whereIndex: {index: 0, eq: "p"}         # Filter tuples
```

### Real-World Examples

#### Profile Query
```yaml
"$profile":
  kinds: [0]
  authors: [user.pubkey]
  pipe:
    - first
    - get: content
    - json
    - defaults: {picture: "/avatar.png", name: "Anon", about: ""}
    - save: profile
```

#### Contact List Processing
```yaml
"$contacts":
  kinds: [3]
  authors: [user.pubkey]
  pipe:
    - first
    - get: tags
    - filterTag: {tag: p, value: "*"}    # Keep all p-tags
    - pluckTag: {tag: p, index: 1}       # Extract pubkeys
    - unique
    - save: following
```

#### Feed with Filtering
```yaml
"$feed":
  kinds: [1]
  authors: "{$contacts.following}"
  since: "{time.now - 86400}"
  pipe:
    - filter: {field: content, contains: "nostr"}  # Only posts mentioning nostr
    - sort: {by: created_at, order: desc}
    - limit: 20
    - save: posts
```

#### Complex ContextVM Response
```yaml
"@on_tool_response":
  match:
    kinds: [25910]
    "#e": "{@request.id}"
  pipe:
    - first
    - get: content
    - json
    - get: result
    - get: data
    - map: {get: value}      # Map each item to its value field
    - sum                    # Add them up
    - save: total
```

---

## Option C: Smart Detection (Mixed Style)

The compiler detects the format and normalizes to JSON:
- Plain string → simple operation
- Key-value pair → operation with parameter
- Explicit `{op: ...}` → fallback format

### Same Examples in Option C

#### Profile Query
```yaml
"$profile":
  kinds: [0]
  authors: [user.pubkey]
  pipe:
    - first
    - get: content
    - json
    # When value is complex, you might need explicit format
    - op: defaults
      value:
        picture: "/avatar.png"
        name: "Anon"
        about: ""
    - save: profile
```

#### Contact List Processing
```yaml
"$contacts":
  kinds: [3]
  authors: [user.pubkey]
  pipe:
    - first
    - get: tags
    # Inline object when it's simple enough
    - filterTag: {tag: p, value: "*"}
    - pluckTag: {tag: p, index: 1}
    - unique
    - save: following
```

#### Feed with Filtering
```yaml
"$feed":
  kinds: [1]
  authors: "{$contacts.following}"
  since: "{time.now - 86400}"
  pipe:
    - filter: {field: content, contains: "nostr"}
    - sort: {by: created_at, order: desc}
    - limit: 20
    - save: posts
```

#### Complex ContextVM Response
```yaml
"@on_tool_response":
  match:
    kinds: [25910]
    "#e": "{@request.id}"
  pipe:
    - first
    - get: content
    - json
    - get: result
    - get: data
    - map: {get: value}
    - sum
    - save: total
```

#### When You Need Explicit Format
```yaml
pipe:
  # Sometimes you need to be explicit
  - {op: first}
  - {op: get, field: "weird.field.name"}
  - {op: regex, pattern: "^nostr:", flags: "i"}
  # Can mix with compact format
  - json
  - save: result
```

---

## Compilation Examples

All of these compile to the same JSON structure:

### YAML Input (Option A):
```yaml
pipe:
  - first
  - get: content
  - json
  - filter: {field: kind, eq: 1}
  - save: notes
```

### YAML Input (Option C):
```yaml
pipe:
  - first
  - get: content
  - json
  - {op: filter, field: kind, eq: 1}
  - save: notes
```

### JSON Output (same for both):
```json
"pipe": [
  {"op": "first"},
  {"op": "get", "field": "content"},
  {"op": "json"},
  {"op": "filter", "field": "kind", "eq": 1},
  {"op": "save", "as": "notes"}
]
```

---

## Additional Operations We Might Want

```yaml
# String operations
- trim
- lowercase
- uppercase  
- split: ","
- join: ", "
- replace: {from: "old", to: "new"}

# Math operations (for numbers)
- sum
- min
- max
- average
- add: 10
- multiply: 2

# Array operations
- flatten
- compact              # Remove null/undefined
- chunk: 10            # Split into groups
- take: 5              # First N
- drop: 5              # Skip first N
- sample: 3            # Random N items

# Object operations  
- keys                 # Get object keys
- values               # Get object values
- entries              # Get [key, value] pairs
- merge: {foo: "bar"}  # Merge objects
- pick: [id, content]  # Pick specific fields
- omit: [secret]       # Remove fields

# Conditional operations
- when: {if: {gt: 0}, then: "positive", else: "negative"}
- switch: {cases: [{eq: 1, value: "one"}, {eq: 2, value: "two"}], default: "many"}
```

---

## Key Rules for Compiler

1. **String alone** = Operation with no parameters
   - `first`, `json`, `unique`, `reverse`

2. **Single key-value** = Operation with that parameter
   - `get: field` → `{op: "get", field: "field"}`
   - `save: name` → `{op: "save", as: "name"}`
   - `limit: 10` → `{op: "limit", count: 10}`

3. **Special parameter mappings**:
   - `save: X` → `{op: "save", as: X}`
   - `limit: X` → `{op: "limit", count: X}`
   - `default: X` → `{op: "default", value: X}`
   - `sort: X` → `{op: "sort", ...X}` (spread object)

4. **Explicit format** = When it starts with `op:`
   - `{op: filter, field: kind, eq: 1}`

5. **Nested objects** = Auto-detect based on value type
   - If value is object/array, keep as is
   - If value is string/number, use appropriate field name