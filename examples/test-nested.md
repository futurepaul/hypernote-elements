---
type: "hypernote"
title: "Test Nested Profile"
description: "Minimal test for nested profile loading"
name: "test-nested"

"$test_note":
  kinds: [1]
  limit: 1
  pipe:
    - first

"#profile": naddr1qvzqqqrldqpzqrtvswydevzfhrw5ljxnmrpmhy778k5sh2pguncfezks7dry3z3nqy88wumn8ghj7mn0wvhxcmmv9uq32amnwvaz7tmjv4kxz7fwv3sk6atn9e5k7tcpzamhxue69uhhyetvv9ujuurjd9kkzmpwdejhgtcqp4c8ymmxd9kx2ttzv9jxwegsqyvt2
---

# Test Nested Profile Loading

## Test 1: Direct Profile (should work)
[#profile fb1366abd5420ce2a42aeec2bcc98cb4576b16b5aa7519a5a72e96db357b8821]

## Test 2: Profile with query result (problem case)
Query result pubkey: {$test_note.pubkey}

Profile component:
[#profile $test_note.pubkey]

## Debug info
- Test note: [json $test_note]