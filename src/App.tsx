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
import { HypernoteJsonOutput } from "./renderer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toaster } from "sonner";
import { AVAILABLE_EXAMPLES, loadExample, type ExampleName } from "../tests/example-loader";

// Load all examples at build time
const EXAMPLES = Object.fromEntries(
  AVAILABLE_EXAMPLES.map(name => {
    const example = loadExample(name);
    // Handle case where markdown might be an object with .default property
    const markdown = typeof example.markdown === 'string' 
      ? example.markdown 
      : (example.markdown as any)?.default || String(example.markdown);
    return [name, markdown];
  })
);

// Add a blank template option
const TEMPLATES = {
  blank: "",
  ...EXAMPLES
} as const;

type TemplateKey = "blank" | ExampleName;

export function App() {
  const [markdownStates, setMarkdownStates] = useState<Record<TemplateKey, string>>(() => {
    // Initialize with all templates (blank + examples)
    const initialStates = { ...TEMPLATES } as Record<TemplateKey, string>;
    console.log("App: Initial templates:", TEMPLATES);
    console.log("App: Initial states:", initialStates);
    return initialStates;
  });
  const [template, setTemplate] = useState<TemplateKey>("basic-hello");
  
  const { relayHandler, initialize, cleanup, logs } = useNostrStore();

  // Debug logging
  console.log("App: Current template:", template);
  console.log("App: Current markdown value:", markdownStates[template]);
  console.log("App: Type of markdown value:", typeof markdownStates[template]);

  useEffect(() => {
    initialize();
    return () => {
      cleanup();
    };
  }, []);

  // Helper function to format example names for display
  const formatExampleName = (name: string) => {
    return name.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

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
            <SelectValue placeholder="Select an example" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="blank">Blank</SelectItem>
            {AVAILABLE_EXAMPLES.map(name => (
              <SelectItem key={name} value={name}>
                {formatExampleName(name)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ResizablePanelGroup direction="vertical" className="flex-1 rounded-lg border">
        <ResizablePanel defaultSize={75}>
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={33}>
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
            <ResizablePanel defaultSize={34}>
              <div className="h-full p-4 overflow-auto">
                <HypernoteJsonOutput markdown={markdownStates[template]} />
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={33}>
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
