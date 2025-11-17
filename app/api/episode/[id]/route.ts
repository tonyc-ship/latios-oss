import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const episodeId = id;

  try {
    const { data: episodeData, error: episodeError } = await supabase
      .from('tbl_episode')
      .select('*')
      .eq('guid', episodeId)
      .maybeSingle();
    
    if (episodeError) {
      console.error('Error fetching episode data:', episodeError);
      return NextResponse.json(
        { error: 'Error fetching episode data' },
        { status: 500 }
      );
    }
    
    if (!episodeData) {
      return NextResponse.json(
        { error: 'Episode not found' },
        { status: 404 }
      );
    }
    
    // 2. Get related podcast data
    let podcast = null;
    if (episodeData.podcast_id) {
      const { data: podcastData, error: podcastError } = await supabase
        .from('tbl_podcast')
        .select('itunes_id, title, itunes_image, image, itunes_author')
        .eq('itunes_id', episodeData.podcast_id.toString())
        .maybeSingle();
      
      if (!podcastError && podcastData) {
        podcast = podcastData;
      }
    }
    
    // 3. Process the data to match expected format
    const processedData = {
      id: episodeData.guid.toString(),
      type: 'apple',
      podcast_id: episodeData.podcast_id?.toString() || '',
      podcast_name: episodeData.podcast_name || podcast?.title || '',
      podcast_img: episodeData.itunes_image || podcast?.itunes_image || podcast?.image || '',
      status: episodeData.status || 1,
      title: episodeData.title || episodeData.line_title || '',
      description: episodeData.description || episodeData.itunes_summary || episodeData.itunes_subtitle || '',
      pub_date: episodeData.pub_date || '',
      author: episodeData.author || episodeData.itunes_author || podcast?.itunes_author || '',
      enclosure_length: episodeData.itunes_duration || '',
      enclosure_type: episodeData.enclosure_type || '',
      enclosure_url: episodeData.enclosure_url || '',
      itunes_image: episodeData.itunes_image || '',
      itunes_duration: episodeData.itunes_duration || '',
      // Additional fields for compatibility
      channel_id: episodeData.podcast_id?.toString() || '',
      published_at: episodeData.pub_date || '',
      duration: episodeData.itunes_duration || '',
      audio_url: episodeData.enclosure_url || '',
    };
    
    return NextResponse.json(processedData);
  } catch (error) {
    console.error('Exception fetching episode data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch episode data' },
      { status: 500 }
    );
  }
} 