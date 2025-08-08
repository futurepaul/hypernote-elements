---
type: "hypernote"
title: "Text Formatting Demo"
description: "Examples of bold, italic, and inline code formatting"
name: "text-formatting"

style: bg-white p-8
---

# Text Formatting Demo

## Basic Formatting

This is **bold text** and this is *italic text*.

You can combine them: **bold with *italic* inside** or *italic with **bold** inside*.

## In Variables

Let's say we have a user named **{user.pubkey}**.

The current time is *{time.now}*.

## In Lists

- **Bold item**
- *Italic item*
- Normal item with **bold** and *italic* words

## In Complex Elements

[div class="bg-gray-100 p-4 rounded"]
**Important Notice:** This is a *styled* div with **bold** and *italic* text.

You can use formatting with variables too: **User:** {user.pubkey}
[/div]

## Edge Cases

**Bold at start** of paragraph.

Paragraph ending with **bold at end**.

*Italic at start* of paragraph.

Paragraph ending with *italic at end*.

Multiple **bold** words **scattered** throughout **the** text.

Multiple *italic* words *scattered* throughout *the* text.