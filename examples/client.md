---
type: "hypernote"
title: "Nostr Client"
description: "A simple Twitter-style Nostr client showing your following feed"

"$contact_list":
  kinds: [3]
  authors: [user.pubkey]
  limit: 1
  pipe:
    - operation: extract
      expression: '.tags[] | select(.[0] == "p") | .[1]'
      as: followed_pubkeys

"$following_feed":
  kinds: [1]
  authors: $followed_pubkeys
  limit: 20 
  live: true
  since: 0

"@post_note":
  kind: 1
  content: "{form.message}"
  tags: [["client", "hypernote-client"]]

"#profile": naddr1qvzqqqr40cpzqrtvswydevzfhrw5ljxnmrpmhy778k5sh2pguncfezks7dry3z3nqy88wumn8ghj7mn0wvhxcmmv9uq32amnwvaz7tmjv4kxz7fwv3sk6atn9e5k7tcpzamhxue69uhhyetvv9ujuurjd9kkzmpwdejhgtcqpfkhjttswfhkv6tvv55gkpyc
---

# Nostr Client

[div class="bg-white p-4 rounded-lg shadow mb-4"]
## Your Following Feed

[#profile user.pubkey]

[json user.pubkey]
[/div]

[div class="bg-white p-4 rounded-lg shadow mb-4"]
[form @post_note]
  [input name="message" placeholder="What's happening?" class="w-full p-2 border rounded"]
  [button class="bg-blue-500 text-white px-4 py-2 rounded mt-2"]Post[/button]
[/form]
[/div]

[div]
[each $following_feed as $note]
  [div class="bg-white p-4 rounded-lg shadow mb-4"]
    [#profile $note.pubkey]
    
    [div class="mt-2 text-gray-700"]
      {$note.content}
    [/div]
    
    [div class="mt-2 text-sm text-gray-500"]
      Posted at: {$note.created_at}
    [/div]
  [/div]
[/each]
[/div]
