# Live Nostr Feed

This shows live updates from Nostr relays!

$timeline: query(
  kinds: [1],
  limit: 20,
  live: true
)

## Latest Posts (Live!)

@loop($timeline as $post)
  ### Post from {$post.pubkey | slice(0, 8)}...
  
  {$post.content}
  
  ---
@end