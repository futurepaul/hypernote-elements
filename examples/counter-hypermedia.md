---
type: "hypernote"
title: "Hypermedia Counter"
description: "Simple counter using MCP hypermedia elements - no callbacks!"
name: "hypermedia-counter"

# Query the raw counter value (kind 30078 - simple data)
"$counter_value":
  kinds: [30078]  # APP_STATE_KIND
  authors: ["19f5b5cd2fce663a3b4916b42c378c0280cce2bffd0af384380e91356fcff1d6"]
  "#d": ["counter-value"]
  limit: 1
  pipe:
    - first
    - get: content  # Just the raw count value
    - default: "0"

# Component query - using naddr directly (will be expanded automatically)
"#counter_ui": "naddr1qvzqqqrldqpzqx04khxjlnnx8ga5j9459smccq5qen3tllg27wzrsr53x4huluwkqy28wumn8ghj7un9d3shjtnyv9kh2uewd9hszrthwden5te0dehhxtnvdakqz9nhwden5te0wfjkccte9ec8y6tdv9kzumn9wsqq5cm0w4h8getj946kjghtjhh"

# Simple increment action - no callbacks or triggers!
"@increment":
  kind: 25910
  json:
    jsonrpc: "2.0"
    id: "{time.now}"
    method: "tools/call"
    params:
      name: "addone"
      arguments:
        a: "{$counter_value or 0}"
  tags:
    - ["p", "19f5b5cd2fce663a3b4916b42c378c0280cce2bffd0af384380e91356fcff1d6"]

# Simple decrement action
"@decrement":
  kind: 25910
  json:
    jsonrpc: "2.0"
    id: "{time.now}"
    method: "tools/call"
    params:
      name: "minusone"
      arguments:
        a: "{$counter_value or 0}"
  tags:
    - ["p", "19f5b5cd2fce663a3b4916b42c378c0280cce2bffd0af384380e91356fcff1d6"]

# Initialize counter
"@initialize":
  kind: 25910
  json:
    jsonrpc: "2.0"
    id: "{time.now}"
    method: "tools/call"
    params:
      name: "initialize_counter"
      arguments:
        value: 0
  tags:
    - ["p", "19f5b5cd2fce663a3b4916b42c378c0280cce2bffd0af384380e91356fcff1d6"]
---

# Hypermedia Counter

This counter demonstrates the power of hypermedia - the MCP server publishes complete UI elements as Nostr events!

## Two Views of the Same Data:

### View 1: Data-Based (kind 30078)
[div class="p-4 bg-green-50 rounded-lg mb-4 text-center"]
## Count: {$counter_value or "--"}
*Simple data query from kind 30078*
[/div]

### View 2: Hypermedia Element (kind 32616)
[div class="p-4 bg-blue-50 rounded-lg mb-4"]
  *Rendered Hypernote element from MCP:*
  [#counter_ui]
[/div]

## Controls

[div class="flex gap-4 justify-center"]
  [form @increment]
    [button class="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg text-xl font-bold"]+1[/button]
  [/form]

  [form @decrement]
    [button class="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-lg text-xl font-bold"]-1[/button]
  [/form]

  [form @initialize]
    [button class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"]Reset to 0[/button]
  [/form]
[/div]

## How it Works

Unlike the old counter with complex query→trigger→action chains:

1. **User clicks button** → Sends increment/decrement action to MCP
2. **MCP calculates new value** → Publishes Hypernote UI element 
3. **Live subscription updates** → UI refreshes automatically

No triggers, no callbacks, just hypermedia! 🚀