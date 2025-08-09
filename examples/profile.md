---
type: "element"
title: "Profile Badge"
description: "A compact profile badge component"
name: "profile-badge"
kind: 0  # Expects npub as input

"$profile":
  kinds: [0]
  authors: [target.pubkey]
  limit: 1
  pipe:
    - first
    - get: content
    - json
    - defaults: {name: "Anonymous", picture: "/avatar.png", nip05: ""}
---
[div class="bg-gray-100 p-4 rounded-lg flex-row items-center gap-2"]
{class="w-10 h-10 rounded-full"}
![{$profile.name}]({$profile.picture})
**{$profile.name}**
- {$profile.nip05}
[/div]