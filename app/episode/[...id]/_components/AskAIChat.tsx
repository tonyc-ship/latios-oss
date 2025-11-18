"use client";

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

function mapLangToCode(lang?: string) {
  const map: Record<string, number> = {
    en: 1,
    zh: 2,
    ja: 3,
    ko: 4,
    fr: 5,
    de: 6,
    es: 7,
    it: 8,
  };
  if (!lang) return 1;
  const key = lang.split('-')[0];
  return map[key] || 1;
}

export default function AskAIChat({ episodeId }: { episodeId: string }) {
  const { i18n } = useTranslation();
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stickToBottom, setStickToBottom] = useState(true);
  const storageKey = `askai:${episodeId}`;
  const [isMobile, setIsMobile] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [buttonLeft, setButtonLeft] = useState<number | undefined>(undefined);
  const [panelLeft, setPanelLeft] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (open && containerRef.current && stickToBottom) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [open, messages, stickToBottom]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Positioning: keep button/panel within viewport and near reading column.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const compute = () => {
      const vw = window.innerWidth;
      const gutter = 12; // px from edges
      const readingEdge = (vw + 1280) / 2; // approx right edge of content

      const btnW = buttonRef.current?.offsetWidth ?? 88;
      const pnlW = panelRef.current?.offsetWidth ?? 420;

      // Base desired left positions, then clamp into viewport.
      const baseBtnLeft = readingEdge + 12;
      const basePnlLeft = readingEdge + 12; // align lefts
      const clamp = (x: number, w: number) => Math.max(gutter, Math.min(x, vw - w - gutter));

      setButtonLeft(clamp(baseBtnLeft, btnW));
      setPanelLeft(clamp(basePnlLeft, pnlW));
    };
    compute();
    const obs = new ResizeObserver(compute);
    if (buttonRef.current) obs.observe(buttonRef.current);
    if (panelRef.current) obs.observe(panelRef.current);
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('resize', compute);
      obs.disconnect();
    };
  }, [open]);

  // Load and persist chat history per episode (with TTL & size cap)
  useEffect(() => {
    try {
      const now = Date.now();
      // Clean up old askai entries (>30d)
      const ttl = 30 * 24 * 60 * 60 * 1000;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || '';
        if (k.startsWith('askai:')) {
          try {
            const v = JSON.parse(localStorage.getItem(k) || '{}');
            if (v && typeof v.ts === 'number' && now - v.ts > ttl) localStorage.removeItem(k);
          } catch {}
        }
      }
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        const loaded = Array.isArray(parsed?.messages) ? (parsed.messages as ChatMessage[]) : (Array.isArray(parsed) ? parsed as ChatMessage[] : []);
        if (loaded.length) setMessages(loaded);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeId]);

  useEffect(() => {
    try {
      // Cap total messages and length to avoid unbounded growth
      const maxMsgs = 40;
      const maxLen = 4000;
      const trimmed = messages.slice(-maxMsgs).map(m => ({ ...m, content: m.content.slice(0, maxLen) }));
      localStorage.setItem(storageKey, JSON.stringify({ ts: Date.now(), messages: trimmed }));
    } catch {}
  }, [messages, storageKey]);

  async function sendMessage() {
    if (!auth?.user?.id) {
      setOpen(true);
      return;
    }
    const question = input.trim();
    if (!question || loading) return;
    setLoading(true);
    setMessages((prev) => [...prev, { role: 'user', content: question }, { role: 'assistant', content: 'Thinking…' }]);
    setInput('');

    try {
      const language = mapLangToCode(i18n.language);
      const history = messages.slice(-6); // last few messages

      const res = await fetch('/api/episode/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episodeId,
          question,
          history,
          language,
          userId: auth?.user?.id,
          userName: auth?.user?.user_metadata?.full_name || auth?.user?.user_metadata?.name || '',
          userEmail: (auth?.user as any)?.email || '',
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error('Request failed');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';
      let firstChunk = true;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const copy = [...prev];
          // Update the last assistant message
          for (let i = copy.length - 1; i >= 0; i--) {
            if (copy[i].role === 'assistant') {
              // Replace the thinking placeholder with the actual stream
              copy[i] = { role: 'assistant', content: firstChunk ? assistantText : assistantText };
              break;
            }
          }
          return copy;
        });
        if (firstChunk) firstChunk = false;
      }
    } catch (e: any) {
      setMessages((prev) => {
        const copy = [...prev];
        copy.push({ role: 'assistant', content: `Error: ${e?.message || 'Unknown error'}` });
        return copy;
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating button */}
      <div
        ref={buttonRef}
        className="fixed bottom-6 z-50"
        style={isMobile ? { right: 16 } : (buttonLeft !== undefined ? { left: buttonLeft } : undefined)}
      >
        <Button onClick={() => setOpen((v) => !v)} className="shadow-lg">
          Ask AI
        </Button>
      </div>

      {/* Side chat panel (opens above the button, right side) */}
      {open && (
        <div
          ref={panelRef}
          className="fixed bottom-24 z-50 w-[92vw] sm:w-[420px] h-[65vh] bg-background border rounded-xl shadow-xl flex flex-col overflow-hidden"
          style={isMobile ? { right: 16 } : (panelLeft !== undefined ? { left: panelLeft } : undefined)}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="font-semibold">Ask AI</div>
            <button
              className="text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>

          {/* Messages */}
          <div
            ref={containerRef}
            className="flex-1 overflow-auto px-4 py-3 space-y-3"
            onScroll={(e) => {
              const el = e.currentTarget;
              const threshold = 48; // px
              const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
              setStickToBottom(atBottom);
            }}
          >
            {messages.length === 0 && (
              <div className="text-sm text-muted-foreground">Ask anything about this episode.</div>
            )}
            {messages.map((m, idx) => (
              <div key={idx} className={m.role === 'user' ? 'text-right' : 'text-left'}>
                {m.role === 'user' ? (
                  <div className={`inline-block rounded-lg px-3 py-2 text-sm whitespace-pre-wrap bg-primary text-primary-foreground`}>
                    {m.content}
                  </div>
                ) : (
                  <div className="inline-block rounded-lg px-3 py-2 text-sm bg-muted prose prose-sm dark:prose-invert max-w-[65ch]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="border-t p-3 flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your question..."
              className="flex-1 resize-none"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              disabled={loading || !auth?.user?.id}
            />
            <Button onClick={sendMessage} disabled={loading || !input.trim() || !auth?.user?.id}>
              {loading ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
