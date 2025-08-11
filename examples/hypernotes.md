---
type: "hypernote"
title: "My Hypernotes Browser"
description: "Browse all your published Hypernotes and Elements"
name: "hypernotes-browser"

"$my_applications":
  kinds: [32616]
  authors: [user.pubkey]
  "#t": ["hypernote-application"]
  limit: 10

"$my_elements":
  kinds: [32616]
  authors: [user.pubkey]
  "#t": ["hypernote-element"]
  limit: 10

"$my_state":
  kinds: [30078]
  authors: [user.pubkey]
  limit: 10
---

# My Published Hypernotes

Connected as: {user.pubkey}

This page shows all your published Hypernotes (applications and reusable elements).

## Hypernote Applications (Kind 32616 with "application" type)

These are full applications like clients, counters, and games.

[each $my_applications as $doc]
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

## Hypernote Elements (Kind 32616 with "element" type)

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