---
"$my_feed":
  authors: [user.pubkey]
  limit: 20
---

[each $my_feed as $note]
  {$note.content}