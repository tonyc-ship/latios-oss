import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { checkSubscription, getUserIdFromRequest } from '@/lib/user-check';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const episodeId = searchParams.get('episodeId');
  const language = searchParams.get('language');
  
  if (!episodeId || !language) {
    return NextResponse.json(
      { error: 'episodeId and language are required parameters' },
      { status: 200 }
    );
  }

  try {
    const { data, error } = await supabase
      .from('tbl_transcript')
      .select('*')
      .eq('episode_id', episodeId)
      .eq('language', language === 'en' ? 1 : Number(language))
      .order('create_time', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (error) {
      console.error("Transcript search error", error);
      return NextResponse.json(
        { error: 'Error fetching transcript data' },
        { status: 200 }
      );
    }
    
    if (!data) {
      return NextResponse.json(
        { error: 'Transcript not found' },
        { status: 200 }
      );
    }
    
    // Update view count
    supabase
      .from('tbl_transcript')
      .update({ count: (data.count || 0) + 1 })
      .eq('id', data.id)
      .then(({ error }) => {
        if (error) console.error('Update count error:', error);
      });

    return NextResponse.json(await getData(data, request));
  } catch (error) {
    console.error('Error fetching transcript data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transcript data' },
      { status: 200 }
    );
  }
}


// YouTube transcript is fetched directly from the client and saved to database, bypassing server Python
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      episode_id, 
      type, 
      podcast_name, 
      episode_title, 
      episode_pub_date, 
      user_id, 
      transcript, 
      status = 2 
    } = body;


    if (!episode_id || !transcript) {
      return NextResponse.json(
        { error: 'episode_id and transcript are required' },
        { status: 400 }
      );
    }

    // Allow guests: if no auth token, treat as guest
    const userId = (await getUserIdFromRequest(request)) || 'guest';

    // Save transcript to database (upsert to avoid duplicate key errors)
    const nowIso = new Date().toISOString();

    // Normalize publish date to ISO to satisfy timestamp with time zone column
    const normalizePublishDate = (raw?: string): string => {
      if (!raw || typeof raw !== 'string') return nowIso;
      try {
        // Strip common YT prefixes like "Streamed live on" or "Premiered on"
        const cleaned = raw
          .replace(/^(Streamed live on|Streamed live|Premiered on|Premiered)\s*/i, '')
          .trim();
        const parsed = new Date(cleaned);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString();
        }
      } catch {}
      return nowIso;
    };
    const publishDateIso = normalizePublishDate(episode_pub_date);
    const { data, error } = await supabase
      .from('tbl_transcript')
      .upsert([
        {
          episode_id: episode_id,
          show_title: podcast_name || '',
          episode_title: episode_title || '',
          publish_date: publishDateIso,
          create_user_id: user_id || userId,
          update_user_id: user_id || userId,
          content: transcript,
          language: 1,
          status: status,
          count: 0,
          create_time: nowIso,
          update_time: nowIso
        }
      ], { onConflict: 'episode_id,language' })
      .select()
      .single();

    if (error) {
      console.error('Error saving transcript:', error);
      return NextResponse.json(
        { error: 'Failed to save transcript to database', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Error in POST /api/episode/transcript:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 

const getData = async (data:any, request:Request) => {
  // Always return full content (no subscription checks)
  return data;
}