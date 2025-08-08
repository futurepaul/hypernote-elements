---
type: "hypernote"
title: "Div Container Demo"
description: "Demonstrates nested div containers with styling"
name: "div-container"

style: "p-4 bg-gray-100"

"@submit_feedback":
  kind: 1
  content: "Thanks for your feedback: {form.message}"
  tags: []
---

# Div Container Example

This shows how div elements can contain nested content and be styled.

{#card-container}
[div class="bg-white p-6 rounded-lg shadow-md border"]
  ## Card Title
  
  This is some content inside a styled div container.
  
  {#highlight-box}
  [div class="bg-yellow-100 p-3 mt-4 rounded border-l-4 border-yellow-500"]
    [span]**Important note:**[/span] Div elements can contain any nested content including text, headers, forms, and other divs.
  [/div]
  
  [form @submit_feedback]
    [input name="message" placeholder="Enter your feedback"]
    [button class="bg-blue-500 text-white px-4 py-2 rounded mt-2"]Submit[/button]
  [/form]
[/div] 