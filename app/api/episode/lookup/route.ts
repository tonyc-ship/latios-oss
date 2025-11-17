import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const episodeId = searchParams.get('episode_id');
    const showTitle = searchParams.get('show_title'); // Optional parameter for fallback

    if (!episodeId) {
      return NextResponse.json({ error: 'episode_id is required' }, { status: 400 });
    }

    // Check if this is a YouTube video (11 characters)
    if (episodeId.length === 11) {
      return NextResponse.json({
        podcast_id: 'youtube',
        type: 'youtube',
        is_youtube: true
      });
    }

    // Primary lookup: Look up the episode in the database
    const { data, error } = await supabase
      .from('tbl_episode')
      .select('podcast_id, type')
      .eq('guid', episodeId)
      .single();

    if (data && !error) {
      return NextResponse.json({
        podcast_id: data.podcast_id,
        type: data.type
      });
    }

    // Fallback 1: If show_title is provided, look up in tbl_user_history
    if (showTitle) {
      console.log(`Primary lookup failed for episode ${episodeId}, trying fallback with show_title: ${showTitle}`);

      // Exact match on podcast_name; multiple rows may exist, take the first
      const { data: historyRows, error: historyError } = await supabase
        .from('tbl_user_history')
        .select('podcast_id')
        .eq('podcast_name', showTitle)
        .limit(1);

      if (historyRows && historyRows.length > 0 && !historyError) {
        console.log(`Fallback 1 successful: found podcast_id ${historyRows[0].podcast_id} for show_title ${showTitle}`);
        return NextResponse.json({
          podcast_id: historyRows[0].podcast_id,
          type: 0, // Default type for fallback
          fallback_used: 'user_history'
        });
      }
    }

    console.error('All lookup methods failed for episode:', episodeId, 'show_title:', showTitle);
    return NextResponse.json({ error: 'Episode not found' }, { status: 404 });

  } catch (error) {
    console.error('Error in episode lookup:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
