import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const type = searchParams.get('type') || 'discover';
    const offset = (page - 1) * limit;

    let data;
    let error;

    if (type === 'discover') {
      const { data: episodes, error: episodeError } = await supabase
        .from('tbl_episode')
        .select(`
          guid,
          podcast_id,
          podcast_name,
          title,
          line_title,
          description,
          pub_date,
          author,
          itunes_image,
          itunes_duration,
          itunes_summary,
          itunes_subtitle,
          type
        `)
        .eq('delete_status', 1)
        .eq('type', 1)
        .order('pub_date', { ascending: false })
        .range(offset, offset + limit - 1);

      if (episodeError) {
        console.error('Error fetching episodes:', episodeError);
        return NextResponse.json({ error: episodeError.message }, { status: 500 });
      }

      // Get related podcast information
      if (episodes && episodes.length > 0) {
        const podcastIds = episodes.map(ep => ep.podcast_id).filter(podcast_id => podcast_id);
        const { data: podcasts, error: podcastError } = await supabase
          .from('tbl_podcast')
          .select('itunes_id, title, short_title, image, itunes_image')
          .in('itunes_id', podcastIds);
        if (!podcastError && podcasts) {
          const podcastMap = new Map(podcasts.map(p => [p.itunes_id, p]));
          episodes.forEach(episode => {
            const podcast = podcastMap.get(episode.podcast_id.toString());
            if (podcast) {
              (episode as any).tbl_podcast = podcast;
            }
          });
        }
      }
      data = episodes;
      error = episodeError;
    }
    

    if (type === 'following') {
      // No login required, return empty array for following
      return NextResponse.json({ 
        data: [], 
        pagination: {
          page,
          limit,
          offset
        },
        message: 'Following feature requires login' 
      });
    }

    const responseData = { 
      data,
      pagination: {
        page,
        limit,
        offset
      }
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Error in dashboard API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}