---
"$my_hypernotes":
  kinds: [30078]
  authors: [user.pubkey]
  limit: 10
---

# My Published Hypernotes

Connected as: {user.pubkey}

This page shows all hypernotes (kind 30078) published by your account.

## All Published Hypernotes

[each $my_hypernotes as $note]
[div class="bg-white p-4 rounded-lg shadow mb-4"]

**Event ID:** {$note.id}

**Created:** {$note.created_at}

**Content Preview:**
[div class="bg-gray-50 p-2 rounded font-mono text-xs max-h-32 overflow-auto"]
{$note.content}
[/div]

**Tags:**
[json $note.tags]

[/div]
[/each]