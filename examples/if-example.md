---
"$profile":
  kinds: [0]
  authors: [user.pubkey]
  limit: 1

style: bg-gray-100 p-4
---

# Conditional Rendering Example

This example demonstrates the `[if]` statement for conditional rendering.

## Profile Display

[each $profile as $p]
  [if $p.picture]
    [div class="mb-4"]
      {class="w-32 h-32 rounded-full"}
      ![Profile Picture]({$p.picture})
    [/div]
  [/if]
  
  [if $p.name]
    ## Hello, {$p.name}!
  [/if]
  
  [if !$p.name]
    ## Hello, Anonymous!
  [/if]
  
  [if $p.about]
    [div class="bg-white p-4 rounded shadow"]
      ### About
      {$p.about}
    [/div]
  [/if]
[/each]