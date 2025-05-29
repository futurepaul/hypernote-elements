---
kind: 1
"#profile_card": naddr1abc...
"#note_display": nevent1def...

"$user_profile":
  kinds: [0]
  authors: [target.pubkey]
  limit: 1

style:
  ":root":
    background-color: "#f9fafb"
    font-family: "system-ui, sans-serif"
---

# Event Details

[if target.content]
  [#note_display target.id]

[if target.pubkey]
  ## Author Profile
  [#profile_card target.pubkey]