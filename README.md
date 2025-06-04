# Hypernote Language Specification

Hypernote allows creating interactive, hypermedia experiences on Nostr using a declarative syntax built on Markdown, a focused query language, and Nostr events.

## Core Concepts

* **Hypernote:** A document defining content, logic, and style, typically published as a Nostr event itself.
* **Elements (`#`)**: Reusable components defined in separate Hypernotes and referenced via Nostr identifiers.
* **Queries (`$`)**: Declarative Nostr data fetching and minimal transformation pipelines.
* **Events (`@`)**: Templates for creating new Nostr events based on user interaction (forms).
* **HNMD**: Markdown extended with variables, control flow, and component embedding.
* **Styling**: A minimal, non-cascading styling system defined in the frontmatter.

## Hypernote Frontmatter

The frontmatter (YAML block at the start) defines the Hypernote's properties, queries, event templates, imported components, and styles.

```yaml
---
# Component Properties (if this Hypernote defines a reusable component)
kind: 1  # 0 for npub input, 1 for nevent input

# Component Imports (aliasing external Hypernote components)
"#profile": naddr1abc...  # Reference to a kind 0 component definition
"#note": nevent1def...   # Reference to a kind 1 component definition

# Queries
"$query_name":
  # ... query definition ...

# Event Templates
"@event_name":
  # ... event template definition ...

# Styling
style:
  "#main-title":
    color: "#3b82f6"
    font-weight: "bold"
  button:
    background-color: "#3b82f6"
    color: "#ffffff"
    border:
      radius: 8
      width: 1
      style: "solid"
      color: "#2563eb"
    padding: 12
  input:
    border:
      color: "#e5e7eb"
      width: 1
      style: "solid"
      radius: 4
    padding: 8

  # Target elements by class name
  ".card":
    background-color: "#ffffff"
    border:
      radius: 12
      width: 1
      style: "solid"
      color: "#e5e7eb"
    elevation: 2
    padding: 16
---

# Markdown content follows...
```

> **Important:** YAML keys that start with special characters such as `@`, `$`, or `#` **must be quoted** to avoid parsing issues. For example, use `"@event_name"` instead of `@event_name`.

## Hypernote Elements (`#`) - Components

Hypernotes can define reusable components. These component definitions are themselves published as distinct Nostr events (e.g., Kind 31990 or similar, TBD).

### Component Definition (`kind`)

A Hypernote intended as a reusable component *must* declare a `kind` in its frontmatter. This specifies the type of Nostr identifier it expects as its single argument when used:

* **`kind: 0`**: Expects an `npub` (NIP-19 encoded public key) string as its argument. The component's logic can access this via the `target.pubkey` variable. Data for the profile (`kind: 0` event) associated with this `npub` is typically fetched automatically and made available via `target`.
* **`kind: 1`**: Expects an `nevent` (NIP-19 encoded event ID) string as its argument. The component's logic can access the event ID via `target.id` and the pubkey via `target.pubkey`. The event data is fetched automatically and made available via `target` (e.g., `target.content`, `target.created_at`).

### Component Imports (`#alias: identifier`)

To use an external component within a Hypernote, you must import and alias it in the frontmatter using its Nostr identifier (`naddr`, `nevent`, potentially others TBD):

```yaml
---
# Import a profile component (kind 0) defined elsewhere
"#profile_card": naddr1...

# Import a note rendering component (kind 1) defined elsewhere
"#note_display": nevent1...
---
```

These aliases (`#profile_card`, `#note_display`) can then be used in the HNMD body.

### Component Usage (`[#alias argument]`)

In the HNMD body, components are instantiated using their alias and providing the *single required argument* (an `npub` or `nevent` string):

```md
---
kind: 0 # This component takes an npub
$user_posts:
  authors: [ target.pubkey ] # Use the input pubkey
  kinds: [1]
  limit: 5
#profile_viewer: naddr1... # Import a profile component
#note_viewer: nevent1...  # Import a note component
---

# View Profile for {target.pubkey}

[#profile_viewer target.pubkey]

## Recent Posts:

[each $user_posts as $post]
  [#note_viewer $post.id] # Pass the nevent string
```

*Target Context (`target`):* Within a component's definition (both its frontmatter queries/events and its HNMD body), the `target` variable refers to the data associated with the input argument.
    * For `kind: 0`, `target` typically holds the profile data (Kind 0 event content like `name`, `picture`, etc.) and `target.pubkey` holds the input `npub`.
    * For `kind: 1`, `target` typically holds the event data (Kind 1 event content like `content`, `created_at`, tags, etc.) and `target.id` and `target.pubkey` hold the input event's details.

### Client Component Overrides

A Hypernote client MAY provide default components for common use cases such as displaying notes, profiles, and buttons for zapping, emoji reactions, commments, etc.

TODO: come up with "default" syntax and list of default components that can be provided by a client.

All hypernotes should be defined in such a way however that there are hypernotes that can be rendered without any client component overrides.

## Hypernote Query Language (HQL - `$`)

HQL defines Nostr queries and minimal data transformations using YAML syntax in the frontmatter.

### Syntax

```yaml
---
"$query_name":
  # Nostr filter parameters (required)
  kinds: [1]
  authors: [ "npub1..." ] # Explicitly provide parameters
  limit: 10
  # ... other valid Nostr filter fields ...

  # Optional pipeline for minimal transformation
  pipe:
    # Supported operations:
    # - extract: ".jq.path.expression" as $variable_name
    # Limited jq syntax: .prop, .[index], .[], | (pipe), select()
    - extract: ".tags[] | select(.[0] == \"p\") | .[1]" as $followed_pubkeys

    # Use extracted variables in subsequent filters
    - kinds: [1]
      authors: $followed_pubkeys # Use the variable defined above
      limit: 50
---
```

### Key Features:

* **Nostr Filters:** Directly uses standard Nostr filter syntax.
* **Explicit Inputs:** Queries must explicitly define their parameters (like `authors`, `ids`, `limit`). There are no implicit global variables like `$last_day`. The rendering client *may* provide context (e.g., the viewing user's pubkey) that can be referenced if explicitly designed into the query structure, but this is implementation-dependent.
* **Pipeline (`pipe`):** Allows chaining operations. The output of one step becomes the input for the next filter or `extract`.
* **Minimal Extraction (`extract`)**: Uses a *very limited subset* of `jq` syntax for pulling specific data points out of fetched events.
    * **Supported jq:**
        * Property access: `.property`
        * Array index: `.[index]`
        * Array iteration: `.[]`
        * Pipe: `|`
        * Filter: `select(condition)` (conditions should be simple comparisons like `.[0] == "p"`)
    * **Variable Assignment:** Use `as $name` to store extracted data for use in later pipeline stages or the HNMD body.
* **Templating Access:** Query results (or extracted variables) are available in the HNMD body using `{$query_name}` or `{$variable_name}`.

### Context Variable (`user`)

The `user` variable provides access to information about the current user and environment:

* **User Information:** Access the current user's data via `user.pubkey` (the user's public key).
* **Time:** Access current time as a Unix timestamp (milliseconds since epoch) via `time.now`. Use simple arithmetic for relative times.

Example usage in queries:
```yaml
$my_feed:
  authors: [user.pubkey] # Current user's pubkey
  since: time.now - 86400000 # 24 hours ago (in milliseconds)
  limit: 20
```

### Example: Following Feed

```md
---
# Use the user variable to access the current user's pubkey
"$following_feed":
  pubkey: user.pubkey # Use the user variable
  pipe:
    # 1. Get follow list (Kind 3) for the viewing user
    - kinds: [3]
      authors: [$pubkey] # Refers to the 'pubkey' defined above
      limit: 1
    # 2. Extract followed pubkeys
    - extract: ".tags[] | select(.[0] == \"p\") | .[1]" as $follows
    # 3. Get recent notes (Kind 1) from followed pubkeys
    - kinds: [1]
      authors: $follows # Use extracted variable
      limit: 20
      # Use time directly with arithmetic
      since: time.now - 86400000 # 24 hours ago
---

# Following Feed

[each $following_feed as $note]
  ## {$note.pubkey}
  {$note.content}
  Posted at {$note.created_at}
```

## Hypernote Markdown (HNMD)

HNMD extends Markdown for dynamic content rendering based on HQL results and component interactions.

### Variables

Access query results, extracted variables, or component `target` data using curly braces:

```md
{$note.content}
{target.name}
```

### Control Structures

Use indentation-based blocks for loops and conditionals:

```md
# Iteration
[each $posts as $post]
  ## Post by {$post.pubkey}
  {$post.content}

# Conditional (Truthy/Falsy Check)
[if target.picture]
  ![Profile Picture]({target.picture})
```

### Component Usage

Embed imported components using their alias and the single required argument:

```md
[#profile_card $note.pubkey]
[#note_display $note.id]
```

### Manual Element IDs (`{#id}`)

Assign a specific ID to an HTML element generated from Markdown for styling or linking purposes:

```md
{#my-cool-header}
# This Header Gets the ID "my-cool-header"

Some paragraph with an explicitly ID'd span: {#special-text} *important*.
```
The `{ #id }` syntax must appear at the beginning of the line or immediately following the element it applies to (like the span example). The `#` differentiates it from `{$variable}`.

## Hypernote Events (`@`)

Define templates in the frontmatter to publish Nostr events triggered by user interaction with forms in the HNMD body.

### Syntax

```yaml
---
"@event_alias":
  # Nostr event fields
  kind: 1
  content: "Reply to {target.pubkey}: {form.message}" # Use form directly
  tags:
    - ["e", "{target.id}"] # Use component's input event data
    - ["p", "{target.pubkey}"]
    # ... other tags
---
```

### Forms and User Interaction

Use the `[form]` directive in HNMD to create an HTML form that triggers a defined event template.

```md
[form @event_alias]  # Trigger '@event_alias', data available via 'form'
  [input name="message" placeholder="Type your reply..."]
  [button "Send Reply"]
```

When the form is submitted:
1.  The form data is collected into the global `form` variable.
2.  The corresponding "@event_alias" template is processed, interpolating values from the form variable (e.g., `form.message`) and the component's `target` context.
3.  The user is prompted to sign and publish the resulting Nostr event.

### Example: Comment Form (NIP-22 Style)

```md
---
kind: 1 # This component expects an nevent (the post being commented on)
"@post_comment": # Define the event template
  kind: 1111 # Example comment kind
  content: "{form.comment_text}" # Use form variable directly
  tags:
    # Root ('E', 'K', 'P') and Parent ('e', 'k', 'p') tags referencing the input event ('target')
    - ["E", "{target.id}", "", "{target.pubkey}"]
    - ["K", "{target.kind}"]
    - ["P", "{target.pubkey}"]
    - ["e", "{target.id}", "", "{target.pubkey}"]
    - ["k", "{target.kind}"]
    - ["p", "{target.pubkey}"]
---

## Add a comment to event {target.id}

[form @post_comment]  # Trigger '@post_comment', data available via 'form'
  [textarea name="comment_text" placeholder="Write your comment..."]
  [button "Post Comment"]
```

### Security Note

Hypernote does not include arbitrary scripting capabilities, making it generally safe to render untrusted Hypernotes. Nostr's protocol design anticipates potentially hostile event data. The primary security consideration for users interacting with Hypernotes is **event signing**. Implementations *must* make it clear to the user exactly what Nostr event (kind, content, tags) they are being asked to sign and publish when interacting with a form/button.

## Form Response Targeting

To update a specific component with the result of a form submission (e.g., display a newly created note), you can directly target a component instance.

### Syntax & Mechanism

1.  **Assign ID to Component:** Add a unique ID directly to a component instance call, immediately after its argument:
    ```hnmd
    [#component_alias "initial_arg" {#unique-id}]
    ```

2.  **Target from Form:** Use the `target` attribute on the `[form]` directive, referencing the component's unique ID:
    ```hnmd
    [form @event_template target="#unique-id"]
      ```

3.  **Update Process:** Upon successful form submission and event publication:
    * The client obtains the new event identifier (e.g., `nevent`).
    * It locates the component instance matching the `target="#unique-id"`.
    * It re-renders *only that specific component*, passing the new event identifier as its argument.

The targeted component (e.g., `#note_viewer`) must be compatible with the result type (e.g., `kind: 1` for an `nevent`) and should handle its initial state gracefully (e.g., when `initial_arg` is `""`).

### Example

```yaml
---
#note_viewer: nevent1xyz... # Import a kind: 1 component
"@post_note":                # Event template creates a kind: 1 note
  kind: 1
  content: "{form.message}"
---

# Post a note, targeting the viewer below
[form @post_note target="#note-display"]
  [textarea name="message" placeholder="New post..."]
  [button "Post"]

# This specific instance will be updated
[#note_viewer "" {#note-display}]
```

This provides a direct, unambiguous link between a form's output and a specific UI element update, similar to `hx-target` in htmx.

## Hypernote Styling

Define styles using Tailwind CSS classes that get compiled to cross-platform CSS-in-JS objects. Styling is applied at two levels: **top-level styles** for the root container and **element-specific styles** using `class` attributes.

### Top-Level Styling

Apply styles to the root container using the `style:` field in the frontmatter with Tailwind classes:

```yaml
---
style: bg-black rounded-xl p-4  # Applied to root container
---
```

### Element-Specific Styling

Apply styles directly to individual elements using the `class` attribute with Tailwind classes:

```md
[div class="bg-white p-6 rounded-lg shadow-md border"]
  ## Card Title
  Content inside a styled container
[/div]

[button class="bg-blue-500 text-white px-4 py-2 rounded"]Submit[/button]

{class="w-32 h-32 self-center"}
![Logo](image.png)
```

### Key Features:

* **Tailwind Classes**: Use standard Tailwind CSS classes for styling (`bg-blue-500`, `p-4`, `rounded-lg`, etc.)
* **Element-Specific**: Styles are applied directly to individual elements, not through CSS selectors
* **Cross-Platform**: Tailwind classes compile to CSS-in-JS objects compatible with web, React Native, and native UI frameworks
* **No Selectors**: The system does not support CSS-style selectors (`#id`, `.class`, `element`) - all styling is element-specific
* **Manual Element IDs**: Use `{#id}` syntax for element identification, but styling is done via `class` attributes

### Complete Styling Example

See [`div-container.md`](examples/div-container.md) for a comprehensive example:

```yaml
---
style: p-4 bg-gray-100  # Root container styling
"@submit_feedback":
  kind: 1
  content: "Thanks for your feedback: {form.message}"
  tags: []
---

# Div Container Example

{#card-container}
[div class="bg-white p-6 rounded-lg shadow-md border"]
  ## Card Title
  
  This is some content inside a styled div container.
  
  [div class="bg-yellow-100 p-3 mt-4 rounded border-l-4 border-yellow-500"]
    **Important note:** Div elements can contain any nested content.
  [/div]
  
  [form @submit_feedback]
    [input name="message" placeholder="Enter your feedback"]
    [button class="bg-blue-500 text-white px-4 py-2 rounded mt-2"]Submit[/button]
  [/form]
[/div]
```

### Supported Tailwind Classes

The system supports a comprehensive subset of Tailwind classes that compile to cross-platform CSS-in-JS properties:

#### Layout & Spacing
* **Padding**: `p-*`, `px-*`, `py-*`, `pt-*`, `pr-*`, `pb-*`, `pl-*`
* **Margin**: `m-*`, `mx-*`, `my-*`, `mt-*`, `mr-*`, `mb-*`, `ml-*`
* **Width/Height**: `w-*`, `h-*`, `min-w-*`, `max-w-*`, `min-h-*`, `max-h-*`

#### Colors
* **Background**: `bg-*` (e.g., `bg-blue-500`, `bg-gray-100`, `bg-black`)
* **Text**: `text-*` (e.g., `text-white`, `text-gray-900`, `text-blue-600`)
* **Border**: `border-*` (e.g., `border-gray-300`, `border-blue-500`)

#### Borders & Radius
* **Border Width**: `border`, `border-*` (e.g., `border-2`, `border-l-4`)
* **Border Radius**: `rounded`, `rounded-*` (e.g., `rounded-lg`, `rounded-xl`)

#### Flexbox & Layout
* **Display**: `flex`, `hidden`
* **Direction**: `flex-row`, `flex-col`
* **Alignment**: `items-center`, `items-start`, `justify-center`, `self-center`
* **Gap**: `gap-*` (e.g., `gap-4`, `gap-8`)

#### Typography
* **Font Size**: `text-*` (e.g., `text-sm`, `text-lg`, `text-2xl`)
* **Font Weight**: `font-*` (e.g., `font-normal`, `font-bold`)
* **Text Alignment**: `text-left`, `text-center`, `text-right`

#### Effects
* **Shadow**: `shadow`, `shadow-*` (e.g., `shadow-md`, `shadow-lg`)
* **Opacity**: `opacity-*` (e.g., `opacity-75`, `opacity-50`)

### Dark Theme Example

See [`zap-cloud.md`](examples/zap-cloud.md) for a dark theme implementation:

```yaml
---
style: bg-black rounded-xl p-4
---

{class="w-32 h-32 self-center"}
![Logo](logo.png)

[div class="items-center"]
# App Title
## Subtitle
[/div]

[div class="rounded-xl p-2 bg-gray-800"]
Feature list content
[/div]

[div class="gap-4"]
  [button class="bg-blue-500"]Primary Action[/button]
  [button class="bg-purple-500"]Secondary Action[/button]
[/div]
```

### Compilation to CSS-in-JS

Tailwind classes are compiled to camelCase CSS-in-JS properties for cross-platform compatibility:

```yaml
# HNMD Input
style: bg-black rounded-xl p-4
[button class="bg-blue-500 text-white px-4 py-2 rounded"]Submit[/button]

# Compiled JSON Output
{
  "style": {
    "backgroundColor": "rgb(0,0,0)",
    "borderRadius": "0.75rem", 
    "padding": "1rem"
  },
  "elements": [{
    "type": "button",
    "style": {
      "backgroundColor": "rgb(59,130,246)",
      "color": "rgb(255,255,255)",
      "paddingLeft": "1rem",
      "paddingRight": "1rem",
      "paddingTop": "0.5rem",
      "paddingBottom": "0.5rem",
      "borderRadius": "0.25rem"
    }
  }]
}
```

### Cross-Platform Notes

* **CSS-in-JS Output**: All styles compile to CSS-in-JS objects with camelCase properties
* **Color Values**: Tailwind color names compile to RGB values for maximum compatibility
* **Spacing Units**: Tailwind spacing compiles to `rem` units for web and equivalent values for native platforms
* **Box Shadows**: Tailwind shadow classes compile to platform-appropriate shadow properties
* **Flexbox**: Tailwind flex utilities compile to cross-platform flexbox properties

## Error Handling

Hypernote implementations should prioritize clear and precise error reporting. When an error occurs (e.g., invalid syntax in frontmatter, HQL pipe failure, unknown component alias, incorrect argument type, missing variable in template, invalid style property), the system should:

1.  **Fail Explicitly:** Do not attempt to guess or recover. Stop processing/rendering at the point of error.
2.  **Be Verbose:** Provide a detailed error message explaining what went wrong.
3.  **Be Precise:** Indicate the exact location (file, line number, component, query, template section) where the error occurred.

This approach aids developers in debugging Hypernotes effectively.