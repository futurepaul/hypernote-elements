# Output: Hypernote JSON Structure (Version 1.1.0)

This document defines the JSON structure used within the `content` field of a Nostr event to represent a Hypernote. This JSON structure can be created manually, generated programmatically, or compiled from authoring formats like HNMD (Hypernote Markdown).

> **Important:** When using YAML-based frontmatter formats, keys that start with special characters like `@`, `$`, or `#` must be quoted (e.g., `"@post_comment"`, `"$following_feed"`, `"#profile_card"`). This is a YAML requirement for keys that start with special characters.

## Nostr Event Fields

Hypernote uses different event kinds for different purposes:

### Event Kind Assignments

* **`kind: 30023`**: Hypernote documents (replaceable, parameterized)
    * Main Hypernote applications and interfaces
    * Uses `d` tag for unique identification
* **`kind: 32616`**: Hypernote element/component definitions (replaceable, parameterized)  
    * Reusable components that can be imported by other Hypernotes
    * Uses `d` tag for unique identification
* **`kind: 30078`**: Application state events (replaceable, parameterized)
    * Used by Hypernote applications for storing user state (e.g., counter values, preferences)
    * Not a Hypernote document itself, but data used by Hypernotes

### Hypernote Document Event Structure (kind: 30023)

* **`tags`**:
    * `["d", "<hypernote-identifier>"]` (Required): A unique identifier for the Hypernote instance or definition (e.g., slug, UUID). Allows replacement via NIP-33.
    * `["t", "hypernote"]` (Recommended): General tag for discoverability.
    * `["hypernote", "<spec_version>"]` (Required): Indicates the version of the *JSON structure specification* this event conforms to (e.g., `"1.1.0"`). Clients should check this.
    * Other relevant tags (e.g., `["title", "My Hypernote Title"]`, language tags `["L", "en"]`, etc.) can be included as needed.
* **`content`**: A JSON string conforming to the specification detailed below. This contains the structured Hypernote document.

### Component Definition Event Structure (kind: 32616)

* **`tags`**:
    * `["d", "<component-identifier>"]` (Required): Unique identifier for the component.
    * `["hypernote-component-kind", "<kind_0_or_1>"]` (Required): Specifies if the component expects an `npub` (`0`) or `nevent` (`1`) as input.
    * `["hypernote", "<spec_version>"]` (Required): Version of the specification.
* **`content`**: JSON structure of the component definition.

Standard Nostr fields (`created_at`, `pubkey`, `id`, `sig`) apply to all event types.

## JSON Content Payload (`content` field)

The `content` field contains a JSON string which, when parsed, results in the following object structure:

```json
{
  "version": "1.1.0", // Corresponds to the ["hypernote", "..."] tag value
  "component_kind": null, // null if not a component, 0 if component expects npub input, 1 if component expects nevent input

  // Maps aliases used in HNMD to their Nostr identifiers (naddr, nevent, etc.)
  // This defines what external components can be referenced by this Hypernote
  "imports": {
    "profile_card": "naddr1...", // Alias from HNMD frontmatter -> Nostr ID
    "note_display": "nevent1..."
  },

  // Cross-platform style definition for the root container
  // Applied to the outermost container of the Hypernote
  "style": {
    "backgroundColor": "rgb(0,0,0)",
    "borderRadius": "0.75rem", 
    "padding": "1rem"
  },

  // Central query definitions. Keys are query names from HNMD ($query_name).
  "queries": {
    "$my_feed": {
      // Base Nostr filter defines what data to fetch
      "authors": ["{user.pubkey}"], // Client substitutes viewing user's pubkey
      "kinds": [1],
      "limit": 20,
      "since": "{time.now - 86400000}", // Client substitutes current time
      
      // Optional pipe array for data transformations (applied after Nostr query)
      "pipe": [
        {
          "operation": "reverse" // Reverse the chronological order
        }
      ]
    },
    "$user_profile": {
        "kinds": [0],
        "authors": ["{target.pubkey}"], // Needs target context from component argument
        "limit": 1
        // No pipe - just a simple query
    }
    // ... other named queries
  },

  // Central event template definitions. Keys are event names from HNMD (@event_name).
  "events": {
    "@post_comment": {
      // The full event template, potentially using {form.*} or {target.*} variables.
      // Note: Variables need context injection by the client during evaluation.
      "kind": 1, // Example reply kind
      "content": "{form.message}", // Client substitutes form input value
      "tags": [
        ["e", "{target.id}"],     // Client substitutes target component's event ID
        ["p", "{target.pubkey}"]  // Client substitutes target component's pubkey
        // ... other tags
      ]
    },
    
    // ContextVM Tool Call Event Template
    "@increment": {
      "kind": 25910,           // ContextVM event kind
      "tool_call": true,       // Flag indicating this is a tool call (requires special handling)
      "provider": "npub1...",  // ContextVM provider pubkey
      "tool_name": "addone",   // Name of the tool to execute
      "arguments": {           // Tool-specific arguments
        "a": "{$count.content || '0'}"
      },
      "target": "$count"       // Query to update with tool response (creates replaceable event)
    }
    // ... other named event templates
  },

  // Main content structure as a flat array of element objects
  "elements": [
    {
      "type": "h1", // HTML element type or special Hypernote type
      "id": "header-title", // Optional: Element ID from HNMD `{#id}` syntax
      // Content represented as an array for mixed content (strings or nested elements)
      // content is always an array that can contain strings and/or element objects
      "content": [ "This is a header" ]
    },
    {
      "type": "p",
      "content": [ "Just some plain text here.", "\n", "With a line break." ]
    },
    {
      "type": "p",
      // Example of mixed content with inline formatting/ID
      // Mixed content with inline formatting/ID
      // Note that content is ALWAYS an array, even when it contains a single string or element
      "content": [
          "Some paragraph with an explicitly ID'd span: ",
          {
              "type": "em", // Represents <em> or similar inline tag
              "id": "special-text", // ID applied to this span/em
              "content": [ "important" ] // Nested elements also have content as an array
          },
          "."
      ]
    },
    {
      "type": "component", // Reference to an external component
      "alias": "profile_card", // The alias defined in the "imports" map
      "argument": "npub1...", // The event or pubkey string passed to the component
      "id": "profile-display" // Optional: Instance ID for targeting
    },
    {
      "type": "if", // Conditional rendering
      // Condition string evaluated by client (accesses context variables like 'target')
      "condition": "target.picture",
      // Elements to render if condition is truthy
      "elements": [
        {
          "type": "img",
          // Element-specific styles as CSS-in-JS properties
          // Applied directly to this specific image element
          "style": {
            "width": "8rem",
            "height": "8rem",
            "alignSelf": "center"
          },
          "attributes": {
            "src": "{target.picture}", // Variables substituted by client
            "alt": "Profile picture"
          }
          // Note: `img` might not have `content`
        }
      ]
    },
    {
      "type": "loop", // Iteration over data source
      // References a query name defined in the top-level "queries" map
      "source": "$my_feed",
      "variable": "note", // Name for the loop variable in the nested scope
      // Elements to render for each item in the source data
      "elements": [
        {
          "type": "h2",
          // Variables like 'note.*' are available here
          "content": [ "{note.pubkey}" ]
        },
        {
          "type": "p",
          "content": [ "{note.content}" ]
        },
        {
            "type": "component",
            "alias": "note_display", // Use another imported component
            // Pass the ID of the current item in the loop as argument
            "argument": "{note.id}"
        }
      ]
    },
    {
      "type": "form", // Creates an interactive form
      // References an event template defined in the top-level "events" map
      "event": "@post_comment",
      // Optional: ID of an element (often a component instance) to update upon success
      "target": "#profile-display",
      // Form control elements
      "elements": [
        {
          "type": "textarea",
          "attributes": {
            "name": "message", // Used for `form.message` variable
            "placeholder": "Type your reply..."
          }
        },
        {
          "type": "button",
          // Element-specific styles as CSS-in-JS properties
          "style": {
            "backgroundColor": "rgb(59,130,246)",
            "color": "rgb(255,255,255)",
            "paddingLeft": "1rem",
            "paddingRight": "1rem", 
            "paddingTop": "0.5rem",
            "paddingBottom": "0.5rem",
            "borderRadius": "0.25rem"
          },
          "content": [ "Send Reply" ]
          // Note: Button implicitly triggers form submission
        }
      ]
    }
  ]
}

```

## Cross-Platform Styling System

Hypernote uses an **element-specific styling system** where styles are applied as CSS-in-JS objects. This approach ensures consistent visual presentation across web browsers, mobile platforms (React Native), and native UI frameworks (SwiftUI, Flutter, Jetpack Compose).

### Design Philosophy

The styling system prioritizes:

1. **Element-Specific Application**: Styles are applied directly to individual elements via their `style` property
2. **Cross-platform compatibility**: CSS-in-JS properties that work across all target platforms  
3. **Predictable behavior**: Well-defined property mappings with consistent behavior
4. **No CSS Selectors**: Eliminates complex cascading and selector specificity issues

### Styling Architecture

**Root-Level Styling:**
- Single `style` object at the top level for the root container
- Applied to the outermost container of the Hypernote
- Example: `{"backgroundColor": "rgb(0,0,0)", "borderRadius": "0.75rem", "padding": "1rem"}`

**Element-Specific Styling:**  
- Individual elements have their own `style` property
- Applied directly to the specific element without inheritance
- Example: `{"backgroundColor": "rgb(59,130,246)", "color": "rgb(255,255,255)", "paddingLeft": "1rem", ...}`

### JSON Structure Examples

**Basic Structure:**
```json
{
  "style": {
    "backgroundColor": "rgb(243,244,246)",
    "padding": "1rem"
  },
  "elements": [
    {
      "type": "div", 
      "style": {
        "backgroundColor": "rgb(255,255,255)",
        "padding": "1.5rem",
        "borderRadius": "0.5rem",
        "boxShadow": "0 4px 6px -1px rgb(0,0,0,0.1), 0 2px 4px -2px rgb(0,0,0,0.1)",
        "borderWidth": "1px"
      },
      "elements": [
        {
          "type": "button",
          "style": {
            "backgroundColor": "rgb(59,130,246)", 
            "color": "rgb(255,255,255)",
            "paddingLeft": "1rem",
            "paddingRight": "1rem",
            "paddingTop": "0.5rem", 
            "paddingBottom": "0.5rem",
            "borderRadius": "0.25rem",
            "marginTop": "0.5rem"
          }
        }
      ]
    }
  ]
}
```

### Complete Example

See [`div-container.json`](examples/div-container.json) for a comprehensive example showcasing:
- Root-level styling for the container
- Multiple nested div elements with individual styling
- Form elements with proper style definitions
- Complex layouts with element-specific styles

### Platform Mapping Examples

CSS-in-JS properties map consistently across platforms:

```json
{
  // Example button styles
  "style": {
    "backgroundColor": "rgb(59,130,246)",
    "color": "rgb(255,255,255)",
    "paddingLeft": "1rem",
    "paddingRight": "1rem",
    "paddingTop": "0.5rem",
    "paddingBottom": "0.5rem",
    "borderRadius": "0.25rem"
  }
  // CSS: background-color: rgb(59,130,246); color: rgb(255,255,255); ...
  // SwiftUI: .background(Color(red: 59/255, green: 130/255, blue: 246/255))
  // React Native: backgroundColor: 'rgb(59,130,246)', color: 'rgb(255,255,255)', ...
  // Flutter: Container with BoxDecoration backgroundColor and TextStyle color
  // Jetpack Compose: Modifier.background(Color(0xFF3B82F6)) and color parameters
}
```

### Supported CSS-in-JS Properties

The styling system supports a validated subset of CSS-in-JS properties designed for cross-platform compatibility:

#### Layout & Box Model
- `display`, `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight`
- `padding`, `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft`
- `margin`, `marginTop`, `marginRight`, `marginBottom`, `marginLeft`
- `borderWidth`, `borderRadius`, `borderColor` (individual border properties)

#### Flexbox
- `flexDirection`, `justifyContent`, `alignItems`, `alignSelf` 
- `flex`, `flexGrow`, `flexShrink`, `flexBasis`, `flexWrap`
- `gap` (for flexbox spacing)

#### Typography  
- `color`, `fontSize`, `fontWeight`, `fontFamily`, `lineHeight`
- `textAlign`, `textDecoration`, `textTransform`, `letterSpacing`

#### Background & Effects
- `backgroundColor`, `opacity`, `overflow`
- `boxShadow` (for drop shadows and elevation effects)

#### Positioning
- `position`, `top`, `right`, `bottom`, `left`, `zIndex`

## Implementation Notes

* **Context Injection:** Client implementations are responsible for injecting the correct context when evaluating conditions, queries, event templates, and variable substitutions (`{...}`). This includes:
    * `user.*`: Information about the viewing user (e.g., `user.pubkey`).
    * `time.*`: Time information (e.g., `time.now` as ms timestamp).
    * `target.*`: Data related to the input argument of the current component scope.
    * `form.*`: Data submitted from the current form scope.
    * Loop variables (e.g., `note.*` in the example above).
* **Variable Substitution:** The `{variable.path}` syntax requires the client to look up the variable in the current context and substitute its value. Accessing nested properties (e.g., `note.content`, `target.tags`) should be supported. Variables are used in conditions, content strings, attributes, query parameters, and event templates.
* **Query Execution:** Clients need to parse the query definitions, substitute context variables, execute the Nostr query (potentially involving multiple steps for `pipe`), and make the results available for loops or variable access. Pipe steps can include standard Nostr filters or operations like `extract` which pull data from previous results.
* **Event Publishing:** When a form referencing an event template is submitted, the client must:
    1.  Collect form data into the `form.*` context.
    2.  Substitute variables (`form.*`, `target.*`, `user.*`, etc.) into the referenced event template from the `events` map.
    3.  Construct the final Nostr event.
    4.  **Crucially:** Prompt the user to review, sign, and publish the generated event.
* **ContextVM Tool Calls:** When an event template includes `tool_call: true`, the client must:
    1.  Construct a JSON-RPC request with the specified `tool_name` and `arguments`.
    2.  Wrap the request in a kind 25910 event with a `p` tag for the provider.
    3.  Subscribe to responses from the provider (kind 25910 with `e` tag matching request).
    4.  Extract the response content and use it to create/update a replaceable event.
    5.  If a `target` query is specified, invalidate that query to trigger UI updates.
* **Styling:** Clients need to parse the `style` object and apply the specified styles to elements based on their type, ID, or class. The styling system uses a minimal subset of CSS designed for cross-platform compatibility. See the "Cross-Platform Styling System" section above for detailed property mappings and platform-specific implementation guidance.
* **Component Loading:** When encountering a `component` element, the client needs to:
    1.  Resolve the `alias` using the `imports` map to get the Nostr identifier (`reference`).
    2.  Fetch the referenced Hypernote definition (if not cached).
    3.  Parse the component's JSON structure.
    4.  Render the component, providing the `argument` and establishing the correct `target` context within the component's scope.
* **Error Handling:** Follow the principles outlined in the main README: fail explicitly, be verbose, be precise.

## Future Extensions

The Hypernote JSON specification is designed to accommodate planned features while maintaining backwards compatibility:

### JSON Element Type
A new `json` element type will enable syntax-highlighted rendering of JSON data, supporting both static JSON content and dynamic query results for debugging and data exploration.

```json
{
  "type": "json",
  "content": "{$query_result}", // Variable containing JSON data
  "attributes": {
    "collapsible": true,        // Optional: Enable collapse/expand
    "maxDepth": 3              // Optional: Limit initial expansion depth
  }
}
```

### Publishing & Component Resolution
Future versions will include enhanced metadata for Nostr event publishing and standardized component resolution mechanisms via Nostr identifiers.

### Query Pipeline Extensions  
The `queries` structure will expand to support multi-stage transformation pipelines with `extract`, `sort`, `filter`, and other jq-like operations.

### Lightning Payment Integration
New element types for Lightning Network payments ("zaps") will enable direct monetization within Hypernote interfaces.

### Native UI Fallbacks
The specification will include optional mechanisms for host applications to provide native UI overrides while maintaining cross-platform compatibility.