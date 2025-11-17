import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const podcastId = searchParams.get('podcastId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    
    if (!podcastId) {
      return NextResponse.json({ error: 'Podcast ID is required' }, { status: 400 });
    }

    const offset = (page - 1) * limit;

    // Query episodes for this podcast with pagination support
    const { data: episodes, error: episodesError, count } = await supabase
      .from('tbl_episode')
      .select(`
        guid,
        title,
        line_title,
        description,
        pub_date,
        author,
        itunes_duration,
        itunes_summary,
        itunes_subtitle,
        enclosure_url,
        itunes_image
      `, { count: 'exact' })
      .eq('podcast_id', podcastId)
      .eq('delete_status', 1)
      .order('pub_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (episodesError) {
      console.error('Error fetching episodes:', episodesError);
      return NextResponse.json({ error: episodesError.message }, { status: 500 });
    }

    // Format episodes data to match frontend expected format
    const formattedEpisodes = episodes?.map(episode => ({
      id: episode.guid.toString(),
      title: episode.title || episode.line_title,
      description: episode.description || episode.itunes_summary || episode.itunes_subtitle,
      audio_url: episode.enclosure_url,
      duration: episode.itunes_duration,
      published_at: episode.pub_date,
      episode_image: episode.itunes_image,
      author: episode.author
    })) || [];

    const responseData = {
      episodes: formattedEpisodes,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    };
    return NextResponse.json(responseData);

  } catch (error) {
    console.error('Error in podcast episodes API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 