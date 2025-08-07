---
style: bg-gray-100
---

# Image Variable Resolution Test

## Static image (should work):

{class="w-32 h-32"}
![Static Test](https://via.placeholder.com/150)

## Image with time variable:

{class="w-32 h-32"}
![Dynamic timestamp](https://via.placeholder.com/150?text={time.now})

## Image with user pubkey:

{class="w-32 h-32"}
![User avatar](https://robohash.org/{user.pubkey}?size=150x150)

## Testing with a hardcoded URL in a variable-like format:

This tests if the variable resolution is working at all.

[div class="bg-white p-4 rounded"]
{class="w-24 h-24"}
![test image](https://via.placeholder.com/100)
[/div]