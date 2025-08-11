---
type: "hypernote"
title: "Simple Notes"
description: "A simple note posting and viewing app"
name: "simple-notes"  

"$my_notes":
  kinds: [1]  # Text notes
  authors: [user.pubkey]
  limit: 10
  pipe:
    - reverse  # Show oldest first

"@post_note":
  kind: 1
  content: "{form.message}"
  tags: []
---

# My Notes

[div class="bg-white p-4 rounded-lg shadow mb-4"]
## Post a Note

[form @post_note]
  [input name="message" placeholder="What's on your mind?" class="w-full border rounded p-2"]
  [button class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded mt-2"]Post[/button]
[/form]
[/div]

## Your Recent Notes

[loop $my_notes]
  [div class="bg-gray-50 p-3 rounded mb-2"]
    {item.content}
    
    [div class="text-xs text-gray-500 mt-1"]
      Posted at: {item.created_at}
    [/div]
  [/div]
[/loop]

[if !$my_notes]
  [div class="text-gray-500 italic"]
    No notes yet. Post your first note above!
  [/div]
[/if]