---
"$timeline":
  kinds: [1]
  limit: 20
  live: true
  since: "time.now - 86400000"
---

# Live Nostr Feed

This shows live updates from Nostr relays!

## Latest Posts (Live!)

[each $timeline as $post]
### Post from {$post.pubkey}...
  
{$post.content}
  
---
[/each]