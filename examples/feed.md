---
"$my_feed":
  authors: [user.pubkey]
  limit: 20
"@post_message":
  kind: 1
  content: "{form.message}"
  tags: [["client", "hypernote-test"]] 
---

# My Feed

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