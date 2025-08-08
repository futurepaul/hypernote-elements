import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { useNostrStore } from '@/stores/nostrStore';
import { RenderHypernoteContent } from '@/renderer';
import { safeValidateHypernote, type Hypernote } from '@/lib/schema';

type DecodedKind = 'naddr' | 'nevent';

export default function HnPage() {
  const { tktkt } = useParams<{ tktkt: string }>();
  const { snstrClient } = useNostrStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<Hypernote | null>(null);

  const decoded = useMemo(() => {
    if (!tktkt) return null;
    try {
      return nip19.decode(tktkt);
    } catch (e) {
      return null;
    }
  }, [tktkt]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      setContent(null);

      // Wait for client to be available
      const waitForClient = async () => {
        const start = Date.now();
        while (!useNostrStore.getState().snstrClient) {
          if (Date.now() - start > 5000) break;
          await new Promise(r => setTimeout(r, 50));
        }
      };
      await waitForClient();

      const client = useNostrStore.getState().snstrClient;
      if (!client) {
        setError('Failed to initialize relay client');
        setLoading(false);
        return;
      }

      if (!decoded) {
        setError('Invalid NIP-19 identifier');
        setLoading(false);
        return;
      }

      try {
        let eventContent: string | null = null;
        if (decoded.type === 'nevent') {
          const { id } = decoded.data as any;
          const events = await client.fetchEvents([{ ids: [id], limit: 1 }]);
          if (events.length > 0) {
            eventContent = events[0].content;
          }
        } else if (decoded.type === 'naddr') {
          const { identifier, pubkey, kind } = decoded.data as any;
          const targetKind = typeof kind === 'number' ? kind : 30078;
          const events = await client.fetchEvents([
            { kinds: [targetKind], authors: [pubkey], '#d': [identifier], limit: 10 }
          ]);
          if (events.length > 0) {
            // Pick latest by created_at
            const latest = events.reduce((a, b) => (a.created_at > b.created_at ? a : b));
            eventContent = latest.content;
          }
        } else {
          setError(`Unsupported nip19 type: ${(decoded as any).type}`);
        }

        if (!eventContent) {
          setError('No event found');
          setLoading(false);
          return;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(eventContent);
        } catch (e) {
          setError('Event content is not valid JSON');
          setLoading(false);
          return;
        }

        const safe = safeValidateHypernote(parsed);
        if (!safe.success) {
          setError('Hypernote JSON failed validation');
          setLoading(false);
          return;
        }

        if (!cancelled) {
          setContent(safe.data);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [decoded]);

  if (loading) {
    return (
      <div style={{ padding: '1rem', fontFamily: 'sans-serif' }}>Loading…</div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '1rem', color: '#b91c1c', fontFamily: 'sans-serif' }}>
        {error}
      </div>
    );
  }

  if (!content) return null;

  return (
    <div className="prose prose-slate max-w-none dark:prose-invert">
      <RenderHypernoteContent content={content} />
    </div>
  );
}


