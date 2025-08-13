# Unforgiving Tokenizer Plan

## Goal
Make the tokenizer fail fast on invalid syntax so live editing gives immediate feedback instead of producing weird/broken output.

## Current Problem
The tokenizer is too forgiving and accepts almost anything:
- `[div` without closing → parsed as element type "div\n#"  
- `[/div]` without opening → silently ignored
- `[if ]` with empty condition → accepted
- Mismatched tags → no error

This causes the browser to crash or render garbage during live editing.

## Proposed Validation Rules

### 1. Element Tags
- **Opening tags** `[element]` must have matching closing tags `[/element]`
- **Self-closing elements** like `img`, `br`, `hr` don't need closing tags
- **Valid element names** must match: `/^[a-zA-Z][a-zA-Z0-9_-]*$/`
- **No nested tags** in element names (e.g., `[div\n#` is invalid)

### 2. Special Elements
- **Conditionals** `[if condition]` must have:
  - Non-empty condition
  - Matching `[/if]`
  - Valid expression syntax
  
- **Loops** `[each source as variable]` must have:
  - Valid source reference (starts with `$`)
  - Valid variable name
  - Matching `[/each]`
  
- **Forms** `[form @event]` must have:
  - Valid event reference (starts with `@`)
  - Matching `[/form]`

### 3. Attributes
- **Class attribute** must be properly quoted: `class="..."`
- **Other attributes** must follow pattern: `name="value"`
- **Unclosed quotes** should error immediately

### 4. Content
- **Text content** is always valid
- **Variable interpolation** `{expression}` should validate:
  - Balanced braces
  - Valid expression inside

### 5. Frontmatter
- **YAML syntax** must be valid
- **Required fields** for certain types (e.g., `version` for hypernotes)
- **Special keys** must follow patterns:
  - Queries: `$query_name`
  - Events: `@event_name`
  - Imports: `#component_name`

## Implementation Strategy

### Phase 1: Tag Matching
- Track open tags in a stack
- Validate closing tags match the most recent open tag
- Error on mismatched or extra closing tags
- Error on unclosed tags at end of document

### Phase 2: Attribute Validation
- Require quotes around attribute values
- Validate attribute names are valid identifiers
- Check for unclosed quotes

### Phase 3: Expression Validation
- Validate `if` conditions are non-empty
- Validate `each` sources and variables
- Validate form event references exist

### Phase 4: Context-Aware Validation
- Check that referenced queries/events exist
- Validate variable references are in scope
- Ensure component imports are defined

## Error Messages

Instead of silently accepting invalid input, provide clear errors:

```
Error: Unclosed element [div] at line 5
Error: Mismatched closing tag [/span] - expected [/div] at line 8  
Error: Empty condition in [if] at line 12
Error: Invalid element name [div\n#] at line 3
Error: Unclosed quote in attribute at line 7
Error: Invalid YAML in frontmatter: unexpected token '{{{' at line 2
```

## Benefits

1. **Fail fast** - Errors appear immediately while typing
2. **Clear feedback** - User knows exactly what's wrong
3. **No crashes** - Invalid states are caught before rendering
4. **Better UX** - Live preview stays stable with last valid state

## Testing

Create test cases for each validation rule:
- Valid documents that should pass
- Invalid documents with specific errors
- Edge cases (empty documents, only frontmatter, etc.)
- Mid-edit states (user actively typing)

## Migration Path

1. Add validation behind a flag initially
2. Test with existing examples to ensure they still work
3. Gradually make validation stricter
4. Eventually make strict mode the default