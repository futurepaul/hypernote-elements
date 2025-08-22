# Simplify New Pipe Methods

## Current Issue
The `construct` operation has complex logic to determine whether to map over arrays or construct a single object. This is because it needs to handle two different contexts:

1. **Top-level array of events**: Should map over each event and construct objects
2. **Inside a map after groupBy**: Should construct a single object from the grouped array

## Current Implementation
```typescript
// Check if we're at the top level with an array of items
// vs being called inside a map operation on a single item/group
if (Array.isArray(current) && current.length > 0 && 
    !Array.isArray(current[0]) && // Not an array of arrays (from groupBy)
    typeof current[0] === 'object' && // Is an array of objects
    'id' in current[0]) { // Looks like Nostr events
  // Map over array
} else {
  // Construct single object
}
```

## Proposed Solutions

### Option 1: Explicit map-construct vs construct
- `construct`: Always constructs a single object from current context
- `map-construct`: Maps construct over an array
- This makes the intent explicit in the pipe definition

### Option 2: Context awareness
- Pass a context flag through the pipe system indicating whether we're inside a map
- This would allow operations to behave differently based on context

### Option 3: Different operations for different purposes
- `construct`: For single objects
- `transform`: For mapping over arrays with field extraction
- `aggregate`: Specifically for grouped data

## Example Usage
Current (complex):
```yaml
pipe:
  - construct:  # Auto-detects whether to map or not
      fields:
        geohash: [...]
```

Proposed (explicit):
```yaml
# For arrays of events
pipe:
  - map-construct:
      fields:
        geohash: [...]

# For grouped data in map
pipe:
  - groupBy: geohash
  - map:
      - aggregate:  # Or just 'construct' if we make it always single
          geohash: [first, get: geohash]
          count: [length]
```

## Benefits of Simplification
1. More predictable behavior
2. Easier to understand and document
3. Less "magic" detection logic
4. Clearer intent in the pipe definitions