---
type: "hypernote"
title: "Bitchat Geohash Activity"
description: "Live global heatmap showing bitchat geohash activity"
name: "bitchat-geohash"

# Raw bitchat events
"$bitchat_events":
  kinds: [20000]
  limit: 5

# Structured bitchat data with geohash, nickname, and message
"$bitchat_structured":
  kinds: [20000]
  limit: 10
  pipe:
    - construct:
        fields:
          geohash:
            - get: tags
            - whereIndex:
                index: 0
                eq: "g"
            - first
            - pluckIndex: 1
            - default: ""
          nickname:
            - get: tags
            - whereIndex:
                index: 0
                eq: "n"
            - first
            - pluckIndex: 1
            - default: "anon"
          msg:
            - get: content
            - default: ""

# Top 3 geohashes by message count
"$top_geohashes":
  kinds: [20000]
  limit: 100
  pipe:
    - construct:
        fields:
          geohash:
            - get: tags
            - whereIndex:
                index: 0
                eq: "g"
            - first
            - pluckIndex: 1
            - default: "unknown"
    - groupBy: geohash
    - map:
        - construct:
            fields:
              geohash:
                - first
                - get: geohash
              count:
                - length
    - sort:
        by: count
        order: desc
    - take: 5
---

# Bitchat Geohash Activity

## Top Locations (last 100 messages)
[each $top_geohashes as $location]
**{$location.geohash}**: {$location.count} messages
[/each]

## Recent Messages
[each $bitchat_structured as $bs]
`#`{$bs.geohash} **{$bs.nickname}**: {$bs.msg}
[/each]

## Raw Events
[json $bitchat_events]

## Structured Data
[json $bitchat_structured]
