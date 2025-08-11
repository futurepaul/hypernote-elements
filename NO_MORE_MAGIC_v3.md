# NO_MORE_MAGIC v3 - Components with Single ID Input

## Core Principle: Components Take One ID

Components (elements) receive ONLY:
- A **pubkey** (for profile/user components)
- An **event ID** (for post/event components)

They fetch everything else they need themselves.

## Two Types of Hypernotes

### 1. Applications (Root Level)
Receive `user.pubkey` from the host environment:
```yaml
---
type: "hypernote"
name: "my-app"

"$my_posts":
  kinds: [1]
  authors: [user.pubkey]  # Has access to user
  limit: 20
---
```

### 2. Elements (Components)
Receive a single ID from their parent:
```yaml
---
type: "element"
name: "post-card"
kind: 1  # Expects an event ID for kind 1 events

"$post":
  ids: [target.id]  # The event ID passed in

"$author":
  kinds: [0]
  authors: [$post.pubkey]  # Get author from the post

"$reactions":
  kinds: [7]
  "#e": [target.id]  # Use the same event ID
---

[div]
  [img src={$author.picture}]
  [h3]{$author.name}[/h3]
  [p]{$post.content}[/p]
  [span]❤️ {$reactions | count}[/span]
[/div]
```

Usage:
```yaml
[each $posts as $post]
  [#post-card $post.id]  # Just pass the event ID
[/each]
```

## Component Types by Input

### Profile Component (takes pubkey)
```yaml
---
type: "element"
name: "profile-badge"
kind: 0  # Expects a pubkey

"$profile":
  kinds: [0]
  authors: [target.pubkey]  # The pubkey passed in
---

[div class="flex items-center gap-2"]
  [img src={$profile.picture} class="w-10 h-10 rounded-full"]
  [span class="font-bold"]{$profile.name}[/span]
  [span class="text-gray-500"]{$profile.nip05}[/span]
[/div]
```

Usage:
```yaml
[#profile-badge $note.pubkey]  # Pass pubkey
[#profile-badge fb1366abd5420ce2...]  # Or hardcoded
```

### Post Component (takes event ID)
```yaml
---
type: "element"
name: "post-with-replies"
kind: 1  # Expects event ID

"$post":
  ids: [target.id]

"$replies":
  kinds: [1]
  "#e": [target.id]

"$author":
  kinds: [0]
  authors: [$post.pubkey]
---

[article]
  [#profile-badge $post.pubkey]
  [div]{$post.content}[/div]
  [div class="mt-4"]
    [h4]Replies ({$replies | count})[/h4]
    [each $replies as $reply]
      [#post-with-replies $reply.id]  # Recursive!
    [/each]
  [/div]
[/article]
```

## System Variables

### In Applications:
```yaml
"$my_feed":
  kinds: [1]
  authors: [user.pubkey]    # Current user
  since: time.yesterday     # Time helpers
  until: time.now
```

### In Elements:
```yaml
"$post":
  ids: [target.id]          # The passed ID
  
"$recent_from_author":
  kinds: [1]
  authors: [$post.pubkey]   # Derived from fetched post
  since: time.last_week
```

## Query References (Implicit Dependencies)

When you reference another query, you automatically wait for it:

```yaml
"$contact_list":
  kinds: [3]
  authors: [user.pubkey]
  pipe:
    - first
    - get: tags
    - pluckTag: p  # Outputs array of pubkeys

"$following_feed":
  kinds: [1]
  authors: $contact_list  # Waits for contact_list to complete
  limit: 20
```

## Actions and Triggers

Actions output their event ID and can trigger queries:

```yaml
"@post":
  kind: 1
  content: {form.message}
  triggers: $my_posts  # Refresh query after posting

"@react":
  kind: 7
  content: "+"
  tags: [["e", $selected_post.id]]
  triggers: $reactions  # Refresh reactions
```

## Complete Examples

### Example 1: Twitter-like Client
```yaml
---
type: "hypernote"
name: "nostr-client"

"$contact_list":
  kinds: [3]
  authors: [user.pubkey]
  pipe:
    - first
    - get: tags
    - pluckTag: p

"$following_feed":
  kinds: [1]
  authors: $contact_list
  limit: 50

"@post":
  kind: 1
  content: {form.message}
  triggers: $following_feed
---

[div class="max-w-2xl mx-auto"]
  [form @post class="mb-4 p-4 border rounded"]
    [textarea name="message" placeholder="What's happening?"]
    [button]Post[/button]
  [/form]
  
  [each $following_feed as $note]
    [#post-card $note.id]
  [/each]
[/div]
```

### Example 2: Profile Page Component
```yaml
---
type: "element"
name: "profile-page"
kind: 0  # Takes a pubkey

"$profile":
  kinds: [0]
  authors: [target.pubkey]
  pipe:
    - first
    - get: content
    - json

"$posts":
  kinds: [1]
  authors: [target.pubkey]
  limit: 20

"$followers":
  kinds: [3]
  "#p": [target.pubkey]
  pipe:
    - pluck: pubkey
    - unique
---

[div]
  [header class="bg-gray-100 p-4"]
    [img src={$profile.banner} class="w-full h-32 object-cover"]
    [div class="flex items-center gap-4 -mt-8"]
      [img src={$profile.picture} class="w-24 h-24 rounded-full border-4 border-white"]
      [div]
        [h1 class="text-2xl font-bold"]{$profile.name}[/h1]
        [p class="text-gray-600"]{$profile.about}[/p]
        [p class="text-sm"]{$followers | count} followers[/p]
      [/div]
    [/div]
  [/header]
  
  [div class="p-4"]
    [h2]Posts[/h2]
    [each $posts as $post]
      [#post-card $post.id]
    [/each]
  [/div]
[/div]
```

Usage:
```yaml
[#profile-page user.pubkey]  # Your profile
[#profile-page $selected_user]  # Someone else's profile
```

### Example 3: Thread View
```yaml
---
type: "element"
name: "thread-view"
kind: 1  # Takes an event ID

"$root":
  ids: [target.id]

"$ancestors":
  kinds: [1]
  ids: [$root.tags | filterTag: e | first]  # Get parent
  
"$replies":
  kinds: [1]
  "#e": [target.id]
  pipe:
    - sort: created_at
---

[div class="thread"]
  [if $ancestors]
    [each $ancestors as $ancestor]
      [#post-card $ancestor.id class="opacity-75"]
    [/each]
  [/if]
  
  [#post-card target.id class="border-2 border-blue-500"]
  
  [div class="ml-4 border-l-2">
    [each $replies as $reply]
      [#thread-view $reply.id]  # Recursive threads!
    [/each]
  [/div]
[/div]
```

## Why This Works Better

1. **Components are self-contained** - Give them an ID, they fetch what they need
2. **Clear contracts** - `kind: 0` = expects pubkey, `kind: 1` = expects event ID
3. **No prop drilling** - Component fetches author, reactions, etc. itself
4. **Reusable everywhere** - Same component works in any context
5. **Single source of truth** - The ID determines everything

## Implementation Benefits

### Simple Component Loading
```typescript
function loadComponent(componentDef, targetId) {
  const target = componentDef.kind === 0 
    ? { pubkey: targetId }
    : { id: targetId };
    
  return executeQueries(componentDef.queries, { target });
}
```

### Clear Data Flow
```
Application (has user.pubkey)
  ↓
Query: $posts (fetches events)
  ↓
Loop: [each $posts as $post]
  ↓
Component: [#post-card $post.id]
  ↓
Element queries its own data using target.id
```

### No Props to Manage
```yaml
# OLD - Props everywhere
[#post-card 
  event_id=$post.id 
  content=$post.content 
  author=$post.pubkey
  created_at=$post.created_at]

# NEW - Just the ID
[#post-card $post.id]
```

## Summary

By limiting components to a single ID input:
- **Applications** get `user.pubkey` from the host
- **Elements** get `target.pubkey` or `target.id` from their parent
- Everything else is fetched by the component itself
- No prop passing, no prop drilling, no confusion
- Components are truly self-contained and reusable

The profile loading problem is solved because:
1. Parent passes event ID to post-card
2. Post-card fetches the post (gets author pubkey)
3. Post-card passes author pubkey to profile-badge
4. Profile-badge fetches its own profile data
5. Everything waits for its dependencies automatically