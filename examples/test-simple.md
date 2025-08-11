---
type: "hypernote"
title: "Simple Test"
description: "Testing basic rendering"
name: "test-simple"

"$test_query":
  kinds: [1]
  limit: 3
---

# Simple Test

This is a paragraph with **bold** and *italic* text.

## Query Results

[json $test_query]

## Loop Test

[each $test_query as $item]
  - Event ID: {$item.id}
  - Content: {$item.content}
[/each]

## User Info

Your pubkey: {user.pubkey or "Not logged in"}