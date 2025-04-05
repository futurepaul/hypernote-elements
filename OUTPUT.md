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
* **`content`**: A JSON string conforming to the specification detailed below.
* `created_at`, `pubkey`, `id`, `sig`: Standard Nostr fields.

## JSON Content Payload (`content` field)

The `content` field contains a JSON string which, when parsed, results in the following object structure:

```json
{
  "version": "1.1.0", // Corresponds to the ["hypernote", "..."] tag value
  "component_kind": null, // Or 0 (npub input), 1 (nevent input). Only present for component definitions.

  // Maps aliases used in HNMD to their Nostr identifiers (naddr, nevent, etc.)
  "imports": {
    "profile_card": "naddr1...", // Alias from HNMD frontmatter -> Nostr ID
    "note_display": "nevent1..."
  },

  // Central style definitions. Selectors are keys. Non-cascading.
  "styles": {
    "h1": { "font-weight": "bold", "text-size": "2xl" },
    "button": { "bg-color": "primary", "text-color": "white", "rounded": "md" },
    "p": { "text-color": "neutral-700" },
    "#header-title": { "text-color": "primary" },
    ":root": { "bg-color": "neutral-100" }
    // ... other style rules based on supported properties
  },

  // Central query definitions. Keys are query names from HNMD ($query_name).
  "queries": {
    "$following_feed": {
      // The full query definition, potentially using variables like {user.pubkey} or {target.*}
      // Note: Variables need context injection by the client during evaluation.
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
      "content": [ "This is a header" ]
    },
    {
      "type": "p",
      "content": [ "Just some plain text here.", "\n", "With a line break." ]
    },
    {
      "type": "p",
      // Example of mixed content with inline formatting/ID
      "content": [
          "Some paragraph with an explicitly ID'd span: ",
          {
              "type": "em", // Represents <em> or similar inline tag
              "id": "special-text", // ID applied to this span/em
              "content": [ "important" ]
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

## Implementation Notes

* **Context Injection:** Client implementations are responsible for injecting the correct context when evaluating conditions, queries, event templates, and variable substitutions (`{...}`). This includes:
    * `user.*`: Information about the viewing user (e.g., `user.pubkey`).
    * `time.*`: Time information (e.g., `time.now` as ms timestamp).
    * `target.*`: Data related to the input argument of the current component scope.
    * `form.*`: Data submitted from the current form scope.
    * Loop variables (e.g., `note.*` in the example above).
* **Variable Substitution:** The `{variable.path}` syntax requires the client to look up the variable in the current context and substitute its value. Accessing nested properties (e.g., `note.content`, `target.tags`) should be supported.
* **Query Execution:** Clients need to parse the query definitions, substitute context variables, execute the Nostr query (potentially involving multiple steps for `pipe`), and make the results available for loops or variable access.
* **Event Publishing:** When a form referencing an event template is submitted, the client must:
    1.  Collect form data into the `form.*` context.
    2.  Substitute variables (`form.*`, `target.*`, `user.*`, etc.) into the referenced event template from the `events` map.
    3.  Construct the final Nostr event.
    4.  **Crucially:** Prompt the user to review, sign, and publish the generated event.
* **Styling:** Clients need to parse the `styles` map and apply the specified (non-cascading) styles to elements based on their type (`h1`, `button`, etc.) or `id`. The exact set of supported style properties and values is implementation-defined but should be documented.
* **Component Loading:** When encountering a `component` element, the client needs to:
    1.  Resolve the `alias` using the `imports` map to get the Nostr identifier (`reference`).
    2.  Fetch the referenced Hypernote definition (if not cached).
    3.  Parse the component's JSON structure.
    4.  Render the component, providing the `argument` and establishing the correct `target` context within the component's scope.
* **Error Handling:** Follow the principles outlined in the main README: fail explicitly, be verbose, be precise.