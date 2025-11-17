import { supabase } from '@/lib/supabase';

export const maxDuration = 300;

type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

const languageMap: Record<string, number> = {
  en: 1,
  zh: 2,
  ja: 3,
  ko: 4,
  fr: 5,
  de: 6,
  es: 7,
  it: 8,
};

async function getTranscript(episodeId: string) {
  const { data } = await supabase
    .from('tbl_transcript')
    .select('content')
    .eq('episode_id', episodeId)
    .eq('language', 1)
    .eq('status', 2)
    .eq('delete_status', 1)
    .limit(1)
    .maybeSingle();

  return data?.content || '';
}

async function getSummary(episodeId: string, language: number) {
  const { data } = await supabase
    .from('tbl_summarize')
    .select('content, show_title, episode_title')
    .eq('episode_id', episodeId)
    .eq('language', language)
    .eq('delete_status', 1)
    .order('create_time', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fallback to episode table if summary missing metadata
  let showTitle = data?.show_title || '';
  let episodeTitle = data?.episode_title || '';
  if (!showTitle || !episodeTitle) {
    const { data: ep } = await supabase
      .from('tbl_episode')
      .select('podcast_name, title')
      .eq('guid', episodeId)
      .maybeSingle();
    showTitle = showTitle || ep?.podcast_name || '';
    episodeTitle = episodeTitle || ep?.title || '';
  }

  return {
    content: data?.content || '',
    showTitle,
    episodeTitle,
  };
}

function buildPrompts(params: {
  question: string;
  history: ChatMessage[];
  transcript: string;
  summary?: string;
  language: number;
}) {
  const system_prompt = `You are Latios AI, an expert assistant for a podcast episode. Given the user's question, prioritize answering with facts grounded in the episode transcript and summary when available. If the answer isn't found there, answer using your broader knowledge to maximize value for the user—be helpful and practical—but be clear what is and is not from the episode. Keep responses concise (unless required by the user's question) and well-structured in markdown. Output in the same language as user's question.`;

  const historyText = params.history
    .slice(-8)
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  const contextBlocks = [
    params.summary ? `### Summary\n${params.summary}` : '',
    `### Transcript\n${params.transcript}`,
  ].filter(Boolean);

  const user_prompt = `${contextBlocks.join('\n\n')}\n\n### Conversation (most recent last)\n${historyText || '(no prior messages)'}\n\n### Question\n${params.question}`;

  return { system_prompt, user_prompt };
}

export async function POST(req: Request) {
  const { episodeId, question, history, language: langCode, userName, userEmail } = await req.json();

  if (!episodeId || !question) {
    return new Response(JSON.stringify({ error: 'episodeId and question are required' }), { status: 400 });
  }

  const language = typeof langCode === 'number' ? langCode : languageMap[String(langCode) as keyof typeof languageMap] || 1;

  try {
    const [transcript, summaryObj] = await Promise.all([
      getTranscript(episodeId),
      getSummary(episodeId, language),
    ]);

    const { system_prompt, user_prompt } = buildPrompts({
      question,
      history: Array.isArray(history) ? history : [],
      transcript,
      summary: summaryObj.content,
      language,
    });

    const pythonAiUrl = process.env.SUMMARY_URL || 'http://3.227.166.96:7000';

    // Fire-and-forget: log user action
    try {
      const originProto = (req as any).headers?.get?.('x-forwarded-proto') || 'https';
      const host = (req as any).headers?.get?.('host');
      const baseUrl = host ? `${originProto}://${host}` : (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000');
      const logPayload = {
        userId: null,
        actionType: 'ask_ai',
        targetId: episodeId,
        targetType: 'episode',
        actionDetails: {
          channel: 'ask_ai_episode',
          question,
          showTitle: summaryObj.showTitle,
          episodeTitle: summaryObj.episodeTitle,
        },
      };
      // don't block main flow
      fetch(`${baseUrl}/api/user/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logPayload),
      }).catch(() => {});

    } catch {}

    // Use streaming endpoint and disable DB persistence
    const upstream = await fetch(`${pythonAiUrl}/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        episodeId,
        podcastName: '',
        episodeTitle: '',
        episodeDuration: '',
        episodePubDate: '',
        userId: 'guest',
        transcript: '',
        language,
        podcast_metadata: null,
        system_prompt,
        user_prompt,
        gating: { allowFullStream: true },
        noPersist: true,
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return new Response(JSON.stringify({ error: `Python service error: ${upstream.status} ${text}` }), { status: 500 });
    }

    const contentType = upstream.headers.get('content-type') || '';
    if (contentType.includes('text/plain') && upstream.body) {
      // Stream directly back to the client
      return new Response(upstream.body, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      });
    } else {
      // Fallback: non-streaming JSON (shouldn't happen for chat)
      const result = await upstream.json().catch(() => ({} as any));
      const text: string = result?.content || '';
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(text));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Unknown error' }), { status: 500 });
  }
}
