---
type: "hypernote"
title: "ContextVM Counter"
description: "Interactive counter demonstrating tool calls and state management"
name: "contextvm-counter"  # Optional: custom slug for 'd' tag (auto-generated from title if omitted)

"$count":
  kinds: [30078]  # Application state, not a hypernote
  authors: [user.pubkey]
  limit: 1
  live: true
  pipe:
    - operation: first
    - operation: field
      name: content
    - operation: default
      value: "0"

"@increment":
  kind: 25910
  tool_call: true
  provider: "npub1r86mtnf0eenr5w6fz66zcduvq2qvec4ll5908ppcp6gn2m7078tq82cuah"
  tool_name: "addone"
  arguments:
    a: "{$count}"
  target: "@update_count"

"@decrement":
  kind: 25910
  tool_call: true
  provider: "npub1r86mtnf0eenr5w6fz66zcduvq2qvec4ll5908ppcp6gn2m7078tq82cuah"
  tool_name: "minusone"
  arguments:
    a: "{$count}"
  target: "@update_count"

"@update_count":
  kind: 30078
  content: "{response.result}"
  tags:
    - ["d", "counter"]

"@initialize":
  kind: 30078
  content: "0"
  tags:
    - ["d", "counter"]
---

# Counter Example

[div class="text-center"]
## {$count}
[/div]

[form @increment]
  [button class="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg text-xl font-bold"]+1[/button]
[/form]

[form @decrement]
  [button class="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-lg text-xl font-bold"]-1[/button]
[/form]

[form @initialize]
  [button class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"]Initialize Counter[/button]
[/form]

[json $count]