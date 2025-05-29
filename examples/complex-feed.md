---
"$following_feed":
  pipe:
    - kinds: [3]
      authors: [user.pubkey]
      limit: 1
    - extract: ".tags[] | select(.[0] == \"p\") | .[1]"
      as: "$follows"
    - kinds: [1]
      authors: "$follows"
      limit: 20
      since: time.now - 86400000

"@post_comment":
  kind: 1
  content: "{form.message}"
  tags:
    - ["e", "{target.id}"]
    - ["p", "{target.pubkey}"]

style:
  h1:
    font-weight: "bold"
    font-size: 24
    color: "#1f2937"
  button:
    background-color: "#3b82f6"
    color: "#ffffff"
    border:
      radius: 8
      width: 1
      style: "solid"
      color: "#2563eb"
    padding-top: 12
    padding-bottom: 12
    padding-left: 12
    padding-right: 12
  ".card":
    background-color: "#ffffff"
    border:
      radius: 12
      width: 1
      style: "solid"
      color: "#e5e7eb"
    elevation: 2
    padding-top: 16
    padding-bottom: 16
    padding-left: 16
    padding-right: 16
  "#header-title":
    color: "#3b82f6"
    text-align: "center"
---

{#header-title}
# Following Feed

[each $following_feed as $note]
  {#note-card}
  [div]
    ## {$note.pubkey}
    {$note.content}
    
    [form @post_comment target="#note-card"]
      [textarea name="message" placeholder="Type your reply..."]
      [button "Reply"]