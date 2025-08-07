---
"$profile_raw":
  kinds: [0]
  authors: [user.pubkey]
  limit: 1

"$profile":
  kinds: [0]
  authors: [user.pubkey]
  limit: 1
  pipe:
    - operation: parse_json
      field: content
---

# Profile Test

## Raw profile event (unparsed):

Pubkey: {$profile_raw.pubkey}

Content (raw JSON string): {$profile_raw.content}

Created: {$profile_raw.created_at}

## Parsed profile (content field parsed as JSON):

Name: {$profile.name}

About: {$profile.about}

Picture: {$profile.picture}

## Profile Picture:

[div class="bg-gray-100 p-4 rounded-lg flex flex-col items-center"]
{class="w-32 h-32 rounded-full"}
![{$profile.name}]({$profile.picture})

### {$profile.name}

{$profile.about}
[/div]

## Loop access (with parsed content):

[each $profile as $p]
[div class="bg-white p-4 rounded-lg shadow mb-4 flex items-center gap-4"]
{class="w-24 h-24 rounded-full"}
![profile pic]({$p.picture})

[div]
**Name:** {$p.name}

**About:** {$p.about}

**Website:** {$p.website}
[/div]
[/div]
[/each]

## Debug: View full parsed profile data:

[json $profile]