---
type: "hypernote"
title: "ContextVM Counter"
description: "Interactive counter demonstrating triggers and state management"
name: "contextvm-counter"

"$count":
  kinds: [30078]  # Application state
  authors: [user.pubkey]
  "#d": ["counter"]
  limit: 1
  pipe:
    - first
    - get: content
    - default: "0"
  # Automatically updates when new 30078 events are published (live by default)

# Tool call events using structured data
"@increment":
  kind: 25910  
  json:
    jsonrpc: "2.0"
    id: "{time.now}"
    method: "tools/call"
    params:
      name: "addone"
      arguments:
        a: "{$count or 0}"
  tags:
    - ["p", "19f5b5cd2fce663a3b4916b42c378c0280cce2bffd0af384380e91356fcff1d6"]
  # No trigger needed - $update_increment will auto-update when event is published

"@decrement":
  kind: 25910
  json:
    jsonrpc: "2.0"
    id: "{time.now}"
    method: "tools/call"
    params:
      name: "minusone"
      arguments:
        a: "{$count or 0}"
  tags:
    - ["p", "19f5b5cd2fce663a3b4916b42c378c0280cce2bffd0af384380e91356fcff1d6"]
  # No trigger needed - $update_decrement will auto-update when event is published

# Queries that wait for tool responses and trigger saves
"$update_increment":
  kinds: [25910]
  "#e": ["@increment"]  # Implicit wait for @increment to complete (gets event ID)
  authors: ["19f5b5cd2fce663a3b4916b42c378c0280cce2bffd0af384380e91356fcff1d6"]
  pipe:
    - first
    - get: content
    - json
    - get: result
    - get: content
    - first
    - get: text
  triggers: "@save_increment"  # Trigger the save action

"$update_decrement":
  kinds: [25910]
  "#e": ["@decrement"]  # Implicit wait for @decrement to complete (gets event ID)
  authors: ["19f5b5cd2fce663a3b4916b42c378c0280cce2bffd0af384380e91356fcff1d6"]
  pipe:
    - first
    - get: content
    - json
    - get: result
    - get: content
    - first
    - get: text
  triggers: "@save_decrement"  # Trigger the save action

# Actions to save the new count
"@save_increment":
  kind: 30078
  content: "{$update_increment}"  # Use the result from the query
  tags:
    - ["d", "counter"]
  # No triggers needed - $count will auto-update since it's live!

"@save_decrement":
  kind: 30078
  content: "{$update_decrement}"  # Use the result from the query
  tags:
    - ["d", "counter"]
  # No triggers needed - $count will auto-update since it's live!

"@initialize":
  kind: 30078
  content: "0"
  tags:
    - ["d", "counter"]
  # No triggers needed - $count will auto-update since it's live!
---

# Counter Example

[div class="text-center"]
## Current count: {$count or 0}
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