import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useNostrStore } from '../stores/nostrStore';
import { publishHypernote } from '../lib/publishHypernote';
import { compileHypernoteToContent } from '../lib/compiler';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';

interface PublishButtonProps {
  markdown: string;
}

export function PublishButton({ markdown }: PublishButtonProps) {
  const [isPublishing, setIsPublishing] = useState(false);
  const { snstrClient } = useNostrStore();

  const handlePublish = async () => {
    if (!snstrClient) {
      toast.error('Not connected to relays');
      return;
    }

    setIsPublishing(true);
    
    try {
      // Compile the markdown to JSON
      const hypernote = compileHypernoteToContent(markdown);
      
      // Extract metadata from the compiled hypernote
      const documentType = hypernote.type || (hypernote.kind !== undefined ? 'element' : 'hypernote');
      const isComponent = documentType === 'element' || hypernote.kind !== undefined;
      
      // Use title from frontmatter or prompt for it
      let title = hypernote.title;
      if (!title) {
        title = prompt('Enter a title for this ' + documentType + ':');
        if (!title || !title.trim()) {
          setIsPublishing(false);
          return;
        }
      }
      
      // Generate a slug from the title for the 'd' tag
      const name = title.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 50); // Limit length
      
      // Use description from frontmatter
      const description = hypernote.description;
      
      // Publish using the new function
      const result = await publishHypernote(
        name.trim(),
        hypernote,
        snstrClient,
        {
          title: title?.trim(),
          description: description?.trim()
        }
      );

      if (result.success) {
        // Show success with the identifiers
        const message = `${isComponent ? 'Component' : 'Hypernote'} published successfully!\n\n` +
          `Event ID: ${result.eventId}\n` +
          (result.nevent ? `\nNEVENT:\n${result.nevent}\n` : '') +
          (result.naddr ? `\nNADDR (for imports):\n${result.naddr}` : '');
        
        alert(message);
        
        // Also show in toast
        toast.success(
          `Published ${isComponent ? 'component' : 'hypernote'} successfully!`,
          {
            description: `Event ID: ${result.eventId.substring(0, 8)}...`
          }
        );

        // Copy naddr to clipboard if available
        if (result.naddr) {
          try {
            await navigator.clipboard.writeText(result.naddr);
            toast.success('NADDR copied to clipboard - use this to import the component');
          } catch (e) {
            console.error('Failed to copy to clipboard:', e);
          }
        }
      } else {
        toast.error('Failed to publish', {
          description: result.error
        });
      }
    } catch (error) {
      console.error('Error publishing:', error);
      toast.error('Failed to publish', {
        description: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <Button
      onClick={handlePublish}
      variant="default"
      size="sm"
      className="flex items-center gap-2"
      disabled={isPublishing}
    >
      <Upload className="h-4 w-4" />
      {isPublishing ? 'Publishing...' : 'Publish'}
    </Button>
  );
}