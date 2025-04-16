import "./index.css";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { 
  ResizableHandle, 
  ResizablePanel, 
  ResizablePanelGroup 
} from "@/components/ui/resizable";
import { useNostrStore } from "./stores/nostrStore";
import { HypernoteRenderer } from "./renderer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toaster } from "sonner";

const TEMPLATES = {
  blank: "",
  feed: `---
"$my_feed":
  kinds: [1]
  limit: 20
---
[each $my_feed as $note]
  {$note.content}
`,
  form: `---
"@post_message":
  kind: 1
  content: "{form.message}"
  tags: [["client", "hypernote-test"]]
style:
  "#title":
    text-color: primary
  button:
    bg-color: blue-500
---

{#title}
# Post a Message

[form @post_message]
  [input name="message" placeholder="Enter message..."]
  [button "Post"]
`
} as const;

type TemplateKey = keyof typeof TEMPLATES;

export function App() {
  const [markdownStates, setMarkdownStates] = useState<Record<TemplateKey, string>>(() => ({
    feed: TEMPLATES.feed,
    blank: TEMPLATES.blank,
    form: TEMPLATES.form
  }));
  const [template, setTemplate] = useState<TemplateKey>("feed");
  
  const { relayHandler, initialize, cleanup, logs } = useNostrStore();

  useEffect(() => {
    initialize();
    return () => {
      cleanup();
    };
  }, []);

  return (
    <div className="h-screen p-4 flex flex-col">
      <div className="mb-4">
        <Select
          value={template}
          onValueChange={(value: TemplateKey) => {
            setTemplate(value);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select a template" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="feed">Feed</SelectItem>
            <SelectItem value="blank">Blank</SelectItem>
            <SelectItem value="form">Form</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ResizablePanelGroup direction="vertical" className="flex-1 rounded-lg border">
        <ResizablePanel defaultSize={75}>
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={50}>
              <div className="h-full">
                <textarea
                  className="w-full h-full p-4 resize-none bg-transparent border-none focus:outline-none font-mono"
                  placeholder="Enter your markdown here..."
                  value={markdownStates[template]}
                  onChange={(e) => setMarkdownStates(prev => ({
                    ...prev,
                    [template]: e.target.value
                  }))}
                />
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={50}>
              <div className="h-full p-4 overflow-auto">
                <div className="prose prose-slate max-w-none dark:prose-invert">
                  {relayHandler && (
                    <HypernoteRenderer 
                      markdown={markdownStates[template]} 
                      relayHandler={relayHandler} 
                    />
                  )}
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={25}>
          <div className="h-full bg-black text-white font-mono text-sm p-4 overflow-auto">
            {logs.map((log, index) => (
              <div key={index} className="py-1">
                {log}
              </div>
            ))}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      <Toaster />
    </div>
  );
}

export default App;
