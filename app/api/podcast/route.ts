import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || '1';
    
    // Query recommended podcast data
    let { data: podcasts, error } = await supabase
      .from('tbl_podcast')
      .select(`
        id,
        title,
        short_title,
        description,
        introduction,
        image,
        itunes_author,
        itunes_id,
        pub_date,
        items,
        update_time
      `)
      .eq('recommend', type)
      .eq('delete_status', 1)
      .order('sort', { ascending: true });
    
    if (error) {
      console.error('Error fetching recommended podcasts:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json(podcasts);

  } catch (error) {
    console.error('Error in recommend API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 