---
type: "hypernote"
title: "My Feed"
description: "A simple feed viewer with posting capability"

"$my_feed":
  authors: [user.pubkey]
  kinds: [1]
  limit: 20
  pipe:
    - operation: reverse
"@post_message":
  kind: 1
  content: "{form.message}"
  tags: [["client", "hypernote-test"]] 
---

# My Feed (Oldest First)

[form @post_message]
  [input name="message" placeholder="Enter message..."]
  [button]Post[/button]
[/form]

[each $my_feed as $note]
{$note.content}

[json $note]
[json $note.content]
[json $note.pubkey]
[/each] 