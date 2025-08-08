---
type: "hypernote"
title: "Inline Code Examples"
description: "Demonstrating backtick syntax for inline code formatting"
name: "inline-code"

style: bg-gray-100 p-4
---

# Inline Code Example

This example demonstrates inline code formatting with backticks.

## Markdown Syntax

You can use `backticks` to create inline code. This is useful for:

- Referencing code elements like `[if]` statements
- Showing variable names like `$count` or `user.pubkey`
- Displaying function names like `addone()` and `minusone()`
- Mentioning file paths like `/usr/local/bin`

## Hypernote Elements

The following Hypernote elements are available:

- `[if condition]` - Conditional rendering
- `[each $source as $item]` - Loop through arrays
- `[form @event]` - Create interactive forms
- `[div]` and `[span]` - Container elements
- `{$variable}` - Variable interpolation

## Code in Context

When discussing the counter example, you might say: "The `addone` tool increments the value stored in `$count.content` and publishes a replaceable event with kind `30078`."

## Mixed Formatting

You can combine **bold**, *italic*, and `code` formatting in the same sentence. For example: The **`[if]`** statement supports *negation* with the `!` operator.