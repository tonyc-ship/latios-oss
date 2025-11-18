import { supabase } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/user-check';

export const maxDuration = 300;

async function WriteToDB(
  content: string, 
  episodeId: string, 
  podcastName: string,
  episodeTitle: string,
  episodeDuration: string,
  episodePubDate: string,
  language: number, 
  userId: string) {
    if (!content) {
        console.log('No content to write to database');
        return;
    }
    try {
        console.log('Writing to database:');
        const { data, error } = await supabase
            .from('tbl_summarize')
            .upsert([
                {
                    episode_id: episodeId,
                    show_title: podcastName,
                    episode_title: episodeTitle,
                    episode_duration: episodeDuration,
                    publish_date: episodePubDate,
                    language: language,
                    content: content,
                    count: 1,
                    create_user_id: userId,
                    update_user_id: userId,
                    create_time: new Date().toISOString(),
                    update_time: new Date().toISOString(),
                    status: 2, // 1 for processing, 2 for finished, 3 for failed
                }
            ], {
                onConflict: 'episode_id,language',
                ignoreDuplicates: false
            });

        if (error) {
            console.error('Error inserting into database:', error);
        } else {
            console.log('Save summarize to database success');
        }
    } catch (err) {
        console.error('Unexpected error while writing to database:', err);
    }
}

function GetPrompt(transcript: string, podcast_metadata: any, language: number) {
    const system_prompt = `You are a great writing expert. You help the user to achieve their writing goal. First think deeply about your task and then output the written content. Answer with markdown and bullet points to be well organized.`;

    const languageMap: { [key: number]: string } = {
        1: 'English',
        2: 'Chinese',
        3: 'Japanese',
        4: 'Korean',
        5: 'French',
        6: 'German',
        7: 'Spanish',
        8: 'Italian'
    };

    const languageName = languageMap[language] || '';

    // Construct the prompt for the podcast summarization
    const podcast_prompt = `
### Podcast Title: ${podcast_metadata?.title || 'Unknown'}

### Description: ${podcast_metadata?.description?.replace(/https?:\/\/\S+|www\.\S+/g, '').slice(0, 1000) || 'No description available'}...

### Transcript:
${transcript}
`;

    const task_prompt = `
### Your task:
Given the podcast info and transcript, first introduce the speakers in detail based on the content, then list all the viewpoints/key insights. 
For each viewpoint, first state the viewpoint clearly, and then append corresponding stories and quotes to support it (no need to explicitly say "story" or "quote" though). The stories and quotes should be thorough and complete, so that the reader doesn't lack context.
`;

    const settings_prompt = `
Output in authentic **${languageName}**.
`;

    const user_prompt = podcast_prompt + task_prompt + settings_prompt;

    return { system_prompt, user_prompt };
}

// Call Python API
async function handleDomesticRequest(params: {
    episodeId: string;
    podcastName: string;
    episodeTitle: string;
    episodeDuration: string;
    episodePubDate: string;
    userId: string;
    transcript: string;
    language: number;
    podcast_metadata: any;
}) {
    const pythonAiUrl = process.env.SUMMARY_URL || 'http://localhost:8001';
    
    try {
        console.log('Calling Python AI service:', pythonAiUrl);
        
        // Generate prompts using the same logic as Node.js
        const { system_prompt, user_prompt } = GetPrompt(params.transcript, params.podcast_metadata, params.language);
        
        console.log('summarize port: ', `${pythonAiUrl}/summarize`);
        const response = await fetch(`${pythonAiUrl}/summarize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                episodeId: params.episodeId,
                podcastName: params.podcastName,
                episodeTitle: params.episodeTitle,
                episodeDuration: params.episodeDuration,
                episodePubDate: params.episodePubDate,
                userId: params.userId,
                transcript: params.transcript,
                language: params.language,
                podcast_metadata: params.podcast_metadata,
                system_prompt: system_prompt,
                user_prompt: user_prompt,
                noPersist: false
            }),
        });

        if (!response.ok) {
            throw new Error(`Python AI service error: ${response.status} ${response.statusText}`);
        }

        // Check if response is streaming
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/plain')) {
            // Streaming response, forward directly to client
            console.log('Python service returned streaming response, forwarding to client');
            return new Response(response.body, {
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                },
            });
        } else {
            // Non-streaming response (fallback case)
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Python AI service failed');
            }

            // Create streaming response
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode(result.content));
                    controller.close();
                },
            });

            return new Response(stream, {
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                },
            });
        }

    } catch (error) {
        console.error('Python AI service error:', error);
        throw error; // Re-throw error for upper layer to handle
  }
}

export async function POST(req: Request) {
  const { episodeId, podcastName, episodeTitle, episodeDuration, episodePubDate, userId, language, podcast_metadata, type } = await req.json();

  // Create a streaming response immediately to satisfy the 25s TTFB limit
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        // Send a placeholder byte right away
        controller.enqueue(encoder.encode(' '));

        const requestUserId = await getUserIdFromRequest(req);
        const effectiveUserId = requestUserId ?? userId;
        const transcript = await getTranscript(episodeId, type==='xyz'? 2:1);
        
        // Check if transcript exists
        if (!transcript) {
            throw new Error(`No transcript found for episode ${episodeId}`);
        }

        // Try Python service first and pipe through
        try {
          const upstream = await handleDomesticRequest({
            episodeId,
            podcastName,
            episodeTitle,
            episodeDuration,
            episodePubDate,
            userId: effectiveUserId,
            transcript,
            language,
            podcast_metadata,
          });

          if (upstream.body) {
            const reader = upstream.body.getReader();
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) controller.enqueue(value);
            }
          } else {
            const text = await upstream.text();
            if (text) controller.enqueue(encoder.encode(text));
          }
          try { controller.close(); } catch (_) {}
          return;
        } catch (err) {
          console.error('Python service failed, no fallback available:', err);
          controller.error(err);
        }
      } catch (e) {
        try { controller.error(e as any); } catch (_) {}
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}

const getTranscript = async (episodeId: string, language: number) => {
  const { data, error } = await supabase
    .from('tbl_transcript')
    .select('content')
    .eq('episode_id', episodeId)
    .eq('language', language)
    .eq('status', 2)
    .eq('delete_status', 1)
    .limit(1)
    .maybeSingle();

  if (!data?.content) {
    return null;
  }

  try {
    let content = data.content;
    
    // Check if it's an ASCII-encoded string, decode if so
    if (typeof content === 'string' && content.includes('\\u')) {
      // Handle Unicode escape sequences
      content = content.replace(/\\u[\dA-Fa-f]{4}/g, (match) => {
        return String.fromCharCode(parseInt(match.replace('\\u', ''), 16));
      });
    }
    
    // Try to parse JSON
    let transcriptData;
    if (typeof content === 'string') {
      transcriptData = JSON.parse(content);
    } else {
      transcriptData = content;
    }
    
    // Extract all FinalSentence and concatenate
    const finalSentences: string[] = [];
    
    if (Array.isArray(transcriptData)) {
      transcriptData.forEach((item: any) => {
        // New format: directly segment object (flat format)
        if (item.StartMs && item.EndMs && item.FinalSentence) {
          finalSentences.push(item.FinalSentence);
        }
        // Old format: nested structure grouped by minute (compatible with historical data)
        else if (item.segments && Array.isArray(item.segments)) {
          item.segments.forEach((segment: any) => {
            if (segment.FinalSentence) {
              finalSentences.push(segment.FinalSentence);
            }
          });
        }
      });
    }
    
    const plainText = finalSentences.join(' ');
    console.log('Extracted plain text length:', plainText);
    
    return plainText;
    
  } catch (error) {
    console.error('Error processing transcript:', error);
    // If parsing fails, return original content
    return data.content;
  }
}
