# Output: Hypernote JSON Structure (Version 1.1.0)

This document defines the JSON structure used within the `content` field of a Nostr event to represent a Hypernote. This structure is the compiled output derived from the HNMD (Hypernote Markdown) source.

> **Important:** In the original HNMD frontmatter YAML, keys that start with special characters like `@`, `$`, or `#` must be quoted (e.g., `"@post_comment"`, `"$following_feed"`, `"#profile_card"`). This is a YAML requirement for keys that start with special characters.

## Nostr Event Fields

A Hypernote is published as a standard Nostr event with the following characteristics:

* **`kind`**: `30078` (Proposed; or another dedicated kind TBD).
    * *Component Definitions* might use a separate kind like `31990` (Proposed; TBD) to clearly distinguish them.
* **`tags`**:
    * `["d", "<hypernote-identifier>"]` (Required): A unique identifier for the Hypernote instance or definition (e.g., slug, UUID). Allows replacement via NIP-23.
    * `["t", "hypernote"]` (Recommended): General tag for discoverability.
    * `["hypernote", "<spec_version>"]` (Required): Indicates the version of the *JSON structure specification* this event conforms to (e.g., `"1.1.0"`). Clients should check this.
    * *For Component Definitions*: `["hypernote-component-kind", "<kind_0_or_1>"]` (Required): Specifies if the component expects an `npub` (`0`) or `nevent` (`1`) as input.
    * Other relevant tags (e.g., `["title", "My Hypernote Title"]`, language tags `["L", "en"]`, etc.) can be included as needed.
* **`content`**: A JSON string conforming to the specification detailed below. This contains the structured Hypernote document.
* `created_at`, `pubkey`, `id`, `sig`: Standard Nostr fields.

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

  // Cross-platform style definitions using a minimal, compatible subset of CSS
  // Designed to work across web (CSS), mobile (React Native), and native platforms (SwiftUI, Flutter, Jetpack Compose)
  "styles": {
    // Element type selectors
    "h1": { 
      "font-weight": "bold", 
      "font-size": 24,
      "color": "#1f2937"
    },
    "button": { 
      "background-color": "#3b82f6",
      "color": "#ffffff",
      "border": {
        "radius": 8,
        "width": 1,
        "style": "solid",
        "color": "#2563eb"
      },
      "padding-top": 12,
      "padding-bottom": 12,
      "padding-left": 16,
      "padding-right": 16
    },
    "p": { 
      "color": "#374151",
      "line-height": 1.5
    },
    // ID selectors (prefixed with #)
    "#header-title": { 
      "color": "#3b82f6",
      "text-align": "center"
    },
    // Class selectors (prefixed with .)
    ".card": {
      "background-color": "#ffffff",
      "border": {
        "radius": 12,
        "width": 1,
        "style": "solid",
        "color": "#e5e7eb"
      },
      "elevation": 2,
      "padding-top": 16,
      "padding-bottom": 16,
      "padding-left": 16,
      "padding-right": 16
    },
    // Root selector for global styles
    ":root": { 
      "background-color": "#f9fafb",
      "font-family": "system-ui, sans-serif"
    }
  },

  // Central query definitions. Keys are query names from HNMD ($query_name).
  "queries": {
    "$following_feed": {
      // The full query definition, potentially using variables like {user.pubkey} or {target.*}
      // Note: Variables need context injection by the client during evaluation.
      // Queries can be either a simple filter object or a pipeline with multiple steps
      "pipe": [
        {
          "kinds": [3],
          "authors": ["{user.pubkey}"], // Client substitutes viewing user's pubkey
          "limit": 1
        },
        {
          "extract": ".tags[] | select(.[0] == \"p\") | .[1]",
          "as": "$follows"
        },
        {
          "kinds": [1],
          "authors": "$follows", // Uses extracted variable
          "limit": 20,
          "since": "{time.now - 86400000}" // Client substitutes current time
        }
      ]
    },
    "$user_profile": {
        "kinds": [0],
        "authors": ["{target.pubkey}"], // Needs target context from component argument
        "limit": 1
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
      "source": "$following_feed",
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
          "content": [ "Send Reply" ]
          // Note: Button implicitly triggers form submission
        }
      ]
    }
  ]
}

```

## Cross-Platform Styling System

Hypernote uses a carefully designed subset of CSS properties that can be reliably implemented across web browsers, mobile platforms (React Native), and native UI frameworks (SwiftUI, Flutter, Jetpack Compose). This approach ensures consistent visual presentation regardless of the client implementation.

### Design Philosophy

The styling system prioritizes:

1. **Cross-platform compatibility**: Every property must have a clear mapping to all target platforms
2. **Minimal complexity**: Only essential styling capabilities are included
3. **Predictable behavior**: Properties behave consistently across platforms
4. **Non-cascading**: Styles are applied directly to elements without inheritance complexity

### Key Differences from Standard CSS

**⚠️ Breaking Changes from Standard CSS:**

- **`display`**: Only supports `"flex"` and `"none"` (removed `"block"` as it's not meaningful on native platforms)
- **`border`**: Simplified to a single object instead of individual `border-*` properties for better cross-platform support
- **`spacing`**: Replaces CSS `gap` property for flexbox spacing (maps to native spacing parameters)
- **`overlay`**: New positioning system replaces `position: absolute` for cross-platform absolute positioning
- **`elevation`**: New property for Material Design-style shadows instead of `box-shadow`
- **`font-weight`**: Enhanced to support both named values (`"normal"`, `"bold"`) and numeric values (100-900)
- **`text-decoration`**: Simplified to only `"none"` and `"underline"` (removed `"line-through"`)

### Supported Properties

#### Layout & Box Model
- `display`: `"flex"` | `"none"`
- `width`, `height`: Numbers (platform units) or percentages (`"50%"`) or `"auto"`
- `padding-top`, `padding-right`, `padding-bottom`, `padding-left`: Numbers or percentages
- `margin-top`, `margin-right`, `margin-bottom`, `margin-left`: Numbers or percentages
- `border`: Object with `width`, `style`, `color`, `radius` properties

#### Flexbox
- `flex-direction`: `"row"` | `"row-reverse"` | `"column"` | `"column-reverse"`
- `justify-content`: `"flex-start"` | `"flex-end"` | `"center"` | `"space-between"` | `"space-around"`
- `align-items`: `"stretch"` | `"flex-start"` | `"flex-end"` | `"center"` | `"baseline"`
- `spacing`: Number (replaces CSS `gap`)
- `flex-grow`, `flex-shrink`: Numbers
- `flex-basis`: Number, percentage, or `"auto"`
- `flex-wrap`: `"nowrap"` | `"wrap"`

#### Positioning
- `position`: `"relative"` only (absolute positioning uses `overlay`)
- `overlay`: Object with `anchor` and `offset` for cross-platform absolute positioning
- `top`, `right`, `bottom`, `left`: Numbers or percentages (for relative positioning only)
- `z-index`: Integer

#### Typography
- `color`: Hex colors (`#RRGGBB`, `#RRGGBBAA`), RGB/RGBA (`rgb()`, `rgba()`), or `"transparent"`
- `font-family`: String
- `font-size`: Number
- `font-weight`: `"normal"` | `"bold"` | 100-900 (multiples of 100)
- `line-height`: Number (unitless multiplier)
- `text-align`: `"left"` | `"right"` | `"center"` | `"justify"`
- `text-decoration`: `"none"` | `"underline"`
- `text-transform`: `"none"` | `"capitalize"` | `"uppercase"` | `"lowercase"`

#### Background & Effects
- `background-color`: Same color formats as `color`
- `elevation`: Number 0-24 (Material Design elevation for cross-platform shadows)
- `opacity`: Number 0.0-1.0
- `overflow`: `"visible"` | `"hidden"`

### Selectors

The styling system supports four types of selectors:

1. **Element type selectors**: `"h1"`, `"button"`, `"div"`, etc.
2. **ID selectors**: `"#header-title"`, `"#main-content"`, etc.
3. **Class selectors**: `".card"`, `".highlight"`, etc.
4. **Root selector**: `":root"` for global styles

### Platform Mapping Examples

```json
{
  "styles": {
    ".modal": {
      // Cross-platform absolute positioning
      "overlay": {
        "anchor": "center",
        "offset": { "x": 0, "y": -50 }
      },
      // CSS: position: absolute; top: 50%; left: 50%; transform: translate(-50%, calc(-50% - 50px));
      // SwiftUI: .overlay(alignment: .center).offset(x: 0, y: -50)
      // React Native: position: 'absolute', top: '50%', left: '50%', marginTop: -50, marginLeft: -200
      // Flutter: Positioned widget in Stack with center alignment and offset
      // Jetpack Compose: Box with Alignment.Center and offset modifier
      
      "elevation": 8,
      // CSS: box-shadow: 0 8px 16px rgba(0,0,0,0.15);
      // SwiftUI: .shadow(radius: 8)
      // React Native: elevation: 8 (Android), shadowRadius: 8 (iOS)
      // Flutter: elevation: 8 on Material widget
      // Jetpack Compose: elevation = 8.dp
      
      "border": {
        "radius": 12,
        "width": 1,
        "style": "solid", 
        "color": "#e5e7eb"
      }
      // CSS: border: 1px solid #e5e7eb; border-radius: 12px;
      // SwiftUI: .border(Color(hex: "e5e7eb"), width: 1).cornerRadius(12)
      // React Native: borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12
      // Flutter: Container with BoxDecoration border and borderRadius
      // Jetpack Compose: Modifier.border(1.dp, Color(0xFFe5e7eb)).clip(RoundedCornerShape(12.dp))
    }
  }
}
```

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
* **Styling:** Clients need to parse the `styles` map and apply the specified (non-cascading) styles to elements based on their type, ID, or class. The styling system uses a minimal subset of CSS designed for cross-platform compatibility. See the "Cross-Platform Styling System" section above for detailed property mappings and platform-specific implementation guidance.
* **Component Loading:** When encountering a `component` element, the client needs to:
    1.  Resolve the `alias` using the `imports` map to get the Nostr identifier (`reference`).
    2.  Fetch the referenced Hypernote definition (if not cached).
    3.  Parse the component's JSON structure.
    4.  Render the component, providing the `argument` and establishing the correct `target` context within the component's scope.
* **Error Handling:** Follow the principles outlined in the main README: fail explicitly, be verbose, be precise.