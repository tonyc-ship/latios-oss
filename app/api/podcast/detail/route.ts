import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Podcast ID is required' }, { status: 400 });
    }

    // Query only basic podcast information
    const { data: podcast, error: podcastError } = await supabase
      .from('tbl_podcast')
      .select(`
        id,
        title,
        description,
        image,
        itunes_image,
        itunes_author,
        itunes_id,
        pub_date,
        items,
        update_time
      `)
      .eq('itunes_id', id)
      .eq('delete_status', 1)
      .maybeSingle();

    if (podcastError) {
      console.error('Error fetching podcast:', podcastError);
      return NextResponse.json({ error: podcastError.message }, { status: 500 });
    }

    if (!podcast) {
      return NextResponse.json({ error: 'Podcast not found' }, { status: 404 });
    }
    return NextResponse.json(podcast);

  } catch (error) {
    console.error('Error in podcast detail API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 