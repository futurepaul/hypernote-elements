---
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
---

# Nostr Client

{#user-info}
[div class="bg-white p-4 rounded-lg shadow mb-4"]
## Your Following Feed

Connected as: {user.pubkey}

This shows posts from people you follow, extracted from your contact list.
[/div]

{#post-form}
[div class="bg-white p-4 rounded-lg shadow mb-4"]
[form @post_note]
  [input name="message" placeholder="What's happening?" class="w-full p-2 border rounded"]
  [button class="bg-blue-500 text-white px-4 py-2 rounded mt-2"]Post[/button]
[/form]
[/div]

{#feed}
[div]
[each $following_feed as $note]
  [div class="bg-white p-4 rounded-lg shadow mb-4"]
    {#author}
    [div class="font-bold text-gray-800"]
      {$note.pubkey}
    [/div]
    
    {#content}
    [div class="mt-2 text-gray-700"]
      {$note.content}
    [/div]
    
    {#timestamp}
    [div class="mt-2 text-sm text-gray-500"]
      Posted at: {$note.created_at}
    [/div]
  [/div]
[/each]
[/div]
