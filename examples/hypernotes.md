---
type: "hypernote"
title: "My Hypernotes Browser"
description: "Browse all your published Hypernotes and Elements"

"$my_documents":
  kinds: [30023]  # Hypernote applications
  authors: [user.pubkey]
  limit: 10

"$my_elements":
  kinds: [32616]  # Hypernote components/elements  
  authors: [user.pubkey]
  limit: 10

"$my_state":
  kinds: [30078]  # Application state (for reference)
  authors: [user.pubkey]
  limit: 10
---

# My Published Hypernotes

Connected as: {user.pubkey}

This page shows all your published Hypernotes (applications and reusable elements).

## Hypernote Applications (Kind 30023)

These are full applications like clients, counters, and games.

[each $my_documents as $doc]
[div class="bg-white p-4 rounded-lg shadow mb-4 border-l-4 border-blue-500"]

**Event ID:** {$doc.id}

**Created:** {$doc.created_at}

**Content Preview:**
[div class="bg-gray-50 p-2 rounded font-mono text-xs max-h-32 overflow-auto"]
{$doc.content}
[/div]

**Tags:**
[json $doc.tags]

[/div]
[/each]

## Hypernote Elements (Kind 32616)

These are reusable components that can be imported by other Hypernotes.

[each $my_elements as $elem]
[div class="bg-white p-4 rounded-lg shadow mb-4 border-l-4 border-green-500"]

**Event ID:** {$elem.id}

**Created:** {$elem.created_at}

**Content Preview:**
[div class="bg-gray-50 p-2 rounded font-mono text-xs max-h-32 overflow-auto"]
{$elem.content}
[/div]

**Tags:**
[json $elem.tags]

[/div]
[/each]

## Application State (Kind 30078)

These are state events used by your applications (not Hypernotes themselves).

[each $my_state as $state]
[div class="bg-gray-100 p-2 rounded mb-2 text-sm"]
**Content:** {$state.content}
**Created:** {$state.created_at}
[/div]
[/each]