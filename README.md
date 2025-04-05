# Hypernote Elements

The plan: given a note id, render the note using a "pauls-note-viewer" hypernote element which is composed of a "note" view element and a "profile" view element.

Element (`#`)
Query (`$`)
Event (`@`)

## Component Kind and Arguments

Each Hypernote element has a `kind` value in its frontmatter that determines what type of NIP-19 encoded entity it expects as its primary argument:

- **Kind 0**: Expects an `npub` (NIP-19 encoded public key)
- **Kind 1**: Expects an `nevent` (NIP-19 encoded event ID)

The kind serves as a type signature that makes component usage predictable and consistent.

### feed
```md
---
kind: 0  # Expects an npub
$feed:
  pubkey: npub123abc...
  pipe:
    - kind: 1
      authors: $pubkey
      limit: 20
      since: $last_day
---

[each $feed as $note]
  # {$note.content}
  by {$note.pubkey} at {$note.created_at}
```

### pauls-note-viewer

```md
---
kind: 1  # Expects an nevent
#profile: nhne1abc123...
#note: nhne1defg456...
---

[#profile { self.pubkey }]

[#note { self.content }]
```

### profile
```md
---
kind: 0  # Expects an npub
---

![profile image]({ self.picture || self.image })

{ self.name || self.username }

{ self.nip05 }
```

### note
```md
---
kind: 1  # Expects an nevent
---
{ self.content }

{ self.created_at }
```

## Hypernote Query Language

Hypernote Query Language (HQL) allows you to define complex nostr queries and data transformations in a clean, declarative syntax. HQL uses a minimal subset of jq for data extraction, making it powerful yet constrained.

### Syntax

In Hypernote frontmatter, queries are defined with a `$` prefix:

```md
---
$queryname:
  parameter: value
  pipe:
    - operation1
    - operation2
---
```

The query results can then be accessed in the content section using the same variable name: `{$queryname}`.

### Example: Following Feed Query

This example shows how to fetch a "following feed" - getting all recent notes from accounts that a user follows:

```md
---
$following_feed:
  pubkey: npub1...  # Starting user
  
  pipe:
    # Step 1: Get the user's follow list (kind 3 event)
    - kind: 3
      authors: $pubkey
      limit: 1
    
    # Step 2: Extract followed pubkeys from p tags
    - extract: ".tags[] | select(.[0] == \"p\") | .[1]" as $follows
    
    # Step 3: Query recent notes from those pubkeys
    - kind: 1
      authors: $follows
      limit: 50
      since: $last_day
---

# My Following Feed

[each $following_feed as $note]
  ## {$note.pubkey}
  {$note.content}
  Posted at {$note.created_at}
```

### Key Features

- **Pipeline Processing**: Each query stage feeds into the next
- **Named Variables**: Define custom variables with `as $name` syntax
- **jq Extraction**: Use a subset of jq for powerful data transformations
- **Time Variables**: Built-in variables like `$last_day`, `$last_week`
- **Nostr Filter Integration**: Direct mapping to nostr filter parameters
- **Templating**: Query results can be used in content templates with `{$queryname}`

### Minimal jq Subset

HQL supports these jq operations:

- `.property` - Object property access
- `.[index]` - Array element access
- `.[]` - Array iteration
- `|` - Pipe operator
- `select(condition)` - Filter elements based on a condition

## Hypernote Markdown

Hypernote Markdown (HNMD) extends regular markdown with template directives and component syntax, allowing for dynamic content generation based on nostr data.

### Variables

Variables from queries are accessed using curly braces:

```md
{$note.content}
{$profile.name}
```

### Control Structures

HNMD uses indentation-based blocks for control structures:

#### Iteration

```md
[each $notes as $note]
  # {$note.content}
  by {$note.pubkey}
```

#### Conditionals

Simple boolean evaluation (truthy/falsy):

```md
[if $note]
  # Note content: {$note.content}

[if $profile.website]
  Website: {$profile.website}
```

### Components

Components are referenced with a `#` prefix and expect NIP-19 encoded entities based on their kind:

```md
# For a kind 0 component (expects npub)
[#profile $note.pubkey]

# For a kind 1 component (expects nevent) 
[#note $note.id]
```

With nested components:

```md
[each $follows as $pubkey]
  [#profile $pubkey]  # Kind 0: expects npub
  [#latest-note $pubkey]  # Kind 0: uses pubkey to find latest note
```

### Complete Example

```md
---
$profile:
  pubkey: npub1...
  pipe:
    - kind: 0
      authors: $pubkey
      limit: 1

$posts:
  pubkey: npub1...
  pipe:
    - kind: 1
      authors: $pubkey
      limit: 10
---

# {$profile.name}'s Profile

[if $profile.website]
  Website: {$profile.website}

## Recent Posts
[each $posts as $post]
  ### {$post.created_at}
  {$post.content}
```

HNMD's design ensures that the templating syntax feels consistent with both the query language and markdown, creating a unified experience across the entire Hypernote ecosystem.

## Hypernote Events

Hypernote Events (`@`) allow users to publish Nostr events in response to user actions. Events are templates that define how to construct Nostr events from form inputs and existing data.

### Syntax

In Hypernote frontmatter, events are defined with an `@` prefix:

```md
---
@eventname:
  kind: 1  # The Nostr event kind
  content: "{$formdata.message}"  # Content from form input
  tags:  # Event tags
    - ["e", "{$reference.id}"]
    - ["p", "{$reference.pubkey}"]
---
```

Events can reference:
- Form inputs using `$formdata`
- Query results using any query variable
- Component data using `self`

### Forms and User Interaction

Forms are used to trigger events with user input:

```md
[form @eventname]
  [input name="message" placeholder="Type your message"]
  [button "Submit"]
```

When the user submits the form, the event template is used to construct and publish a Nostr event.

### Example: Comment Form (NIP-22)

This example shows a component that renders a comment form for replying to a note, following the NIP-22 standard:

```md
---
kind: 1  # Expects an nevent as input
@comment:
  kind: 1111  # Comment event kind (NIP-22)
  content: "{$formdata.comment_text}"
  tags:
    # Root reference
    - ["E", "{self.id}", "", "{self.pubkey}"]
    - ["K", "{self.kind}"]
    - ["P", "{self.pubkey}"]
    
    # Parent reference (same as root for top-level comments)
    - ["e", "{self.id}", "", "{self.pubkey}"]
    - ["k", "{self.kind}"]
    - ["p", "{self.pubkey}"]
---

## Add a comment

[form @comment]
  [textarea name="comment_text" placeholder="Write your comment here..."]
  [button "Post Comment"]
```

### Comment Thread Example

This example shows a feed with comment forms:

```md
---
kind: 0  # Expects an npub
$feed:
  pubkey: npub123abc...
  pipe:
    - kind: 1
      authors: $pubkey
      limit: 20
      since: $last_day
---

[each $feed as $note]
  [#note-viewer $note]
  
  ## Comments
  
  # Query for comments that reference this note
  $comments:
    pipe:
      - kind: 1111  # Comment kind (NIP-22)
        "#e": [$note.id]  # Filter for comments that reference this note
        limit: 10
  
  [each $comments as $comment]
    [#comment-view $comment]
  
  [#comment-form $note]
```

### Complex Event Processing

For more complex scenarios, event templates can reference results from previous pipeline steps:

```md
---
$post:
  id: nevent123...
  pipe:
    - kind: 1
      ids: $id
      limit: 1
    - extract: ".pubkey" as $author

@reply:
  kind: 1
  content: "{$formdata.reply}"
  tags:
    - ["e", "{$post.id}", "", "{$post.pubkey}"]
    - ["p", "{$author}"]
---

[#post-viewer $post]

[form @reply]
  [textarea name="reply" placeholder="Reply to this post"]
  [button "Send Reply"]
```

Hypernote Events provide a powerful way to interact with the Nostr network without requiring complex JavaScript handlers, maintaining the declarative style of the entire Hypernote ecosystem.

## Hypernote Styling

Hypernote Styling provides a minimal subset of CSS capabilities through a YAML-based syntax, allowing for direct element styling without complex cascading rules. Styles are applied directly to elements using element IDs.

### Syntax

In Hypernote frontmatter, styles are defined with a `style` key:

```md
---
style:
  # Target element by ID
  header-title:
    text-size: lg
    text-color: primary
    font-weight: bold
    
  # Target root element (global styles)
  ":root":
    text-color: neutral-800
    bg-color: neutral-100
---
```

### Element Targeting

Styles can target elements in several ways:

#### By ID

Markdown headers automatically generate IDs. For example:

```md
# This is a header
```

The above header automatically gets the ID `this-is-a-header` and can be styled using the `#` prefix:

```md
---
style:
  "#this-is-a-header":
    text-size: xl
    text-color: secondary
---
```

#### By HTML Tag

You can target all instances of a specific HTML tag:

```md
---
style:
  h1:
    text-size: 3xl
    font-weight: bold
    
  p:
    text-color: neutral-700
---
```

#### Targeting Form Elements

Form elements like buttons, inputs, and textareas can be styled directly:

```md
---
style:
  button:
    bg-color: primary
    text-color: white
    rounded: md
    
  input:
    border-color: neutral-300
    rounded: sm
    
  textarea:
    height: 100px
    width: 300px
---
```

This allows you to create consistent styles for all elements of a certain type throughout your Hypernote.

### Available Properties

Hypernote uses a minimal subset of styling properties inspired by Tailwind:

```md
# Text styling
text-size:    [xs, sm, base, lg, xl, 2xl, 3xl]
text-color:   [primary, secondary, color-scale (e.g. blue-500)]
font-weight:  [normal, medium, bold]

# Layout
x:            [px values]
y:            [px values]
width:        [px values]
height:       [px values]
padding:      [0, 1, 2, 4, 6, 8]
margin:       [0, 1, 2, 4, 6, 8]

# Appearance
bg-color:     [primary, secondary, color-scale]
rounded:      [none, sm, md, lg, full]
```

### Style Overrides for Components

When using components, you can pass style overrides that will apply only to that instance:

```md
[#profile $note.pubkey style="bg-color: primary; rounded: lg"]
```

### Non-cascading Design

Unlike traditional CSS, Hypernote styles do not cascade to child elements. Each element must be explicitly styled:

```md
---
style:
  parent-element:
    bg-color: blue-100
    
  child-element:
    text-color: blue-900
    # Must be explicitly styled, won't inherit from parent
---

[#parent-element]
  [#child-element]
    This text needs its own styling rules
```

### Parent Value References

While Hypernote doesn't use cascading styles, child elements can reference parent values using the `parent()` function:

```md
---
style:
  parent-card:
    bg-color: primary
    rounded: lg
    
  child-header:
    text-color: parent(bg-color)  # Uses the parent's bg-color value
    font-weight: bold
---

[#parent-card]
  [#child-header]
    This header's text color matches the parent's background
```

This approach provides flexibility without cascading, allowing children to adapt to parent styles without creating complex inheritance chains or requiring prop drilling.