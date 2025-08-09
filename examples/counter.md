---
type: "hypernote"
title: "ContextVM Counter"
description: "Interactive counter demonstrating reactive events and state management"
name: "contextvm-counter"  # Optional: custom slug for 'd' tag (auto-generated from title if omitted)

"$count":
  kinds: [30078]  # Application state
  authors: [user.pubkey]
  "#d": ["counter"]
  limit: 1
  pipe:
    - first
    - get: content
    - default: "0"

"@increment":
  kind: 25910  # Tool call event
  content: |
    {
      "jsonrpc": "2.0",
      "id": "{time.now}",
      "method": "tools/call",
      "params": {
        "name": "addone",
        "arguments": {
          "a": "{$count}"
        }
      }
    }
  tags:
    - ["p", "1cf0bdaf1a7a719be79fb16e32eea0fccd029e3b49f02e960e61f4e079ab96dd"]

"@decrement":
  kind: 25910  # Tool call event
  content: |
    {
      "jsonrpc": "2.0",
      "id": "{time.now}",
      "method": "tools/call",
      "params": {
        "name": "minusone",
        "arguments": {
          "a": "{$count}"
        }
      }
    }
  tags:
    - ["p", "1cf0bdaf1a7a719be79fb16e32eea0fccd029e3b49f02e960e61f4e079ab96dd"]

# Reactive event that listens for tool responses and updates the counter
"@on_increment":
  match:
    kinds: [25910]
    "#e": "{@increment.id}"
    authors: ["1cf0bdaf1a7a719be79fb16e32eea0fccd029e3b49f02e960e61f4e079ab96dd"]
  pipe:
    - first
    - get: content
    - json
    - get: result
  then:
    kind: 30078
    content: "{result}"
    tags:
      - ["d", "counter"]

"@on_decrement":
  match:
    kinds: [25910]
    "#e": "{@decrement.id}"
    authors: ["1cf0bdaf1a7a719be79fb16e32eea0fccd029e3b49f02e960e61f4e079ab96dd"]
  pipe:
    - first
    - get: content
    - json
    - get: result
  then:
    kind: 30078
    content: "{result}"
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
## {$count or 0}
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