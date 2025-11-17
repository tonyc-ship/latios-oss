import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/user-check';

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
      .from('tbl_summarize')
      .select('*')
      .eq('episode_id', episodeId)
      .eq('language', language)
      .eq('delete_status', 1)
      .order('create_time', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (error) {
      console.error("Summary search error", error);
      return NextResponse.json(
        { error: 'Error fetching summary data' },
        { status: 200 }
      );
    }
    
    if (!data) {
      return NextResponse.json(
        { error: 'Summary not found' },
        { status: 200 }
      );
    }
    
    // Update view count
    supabase
      .from('tbl_summarize')
      .update({ count: data.count + 1 })
      .eq('id', data.id)
      .then(({ error }) => {
        if (error) console.error('Update count error:', error);
      });

    return NextResponse.json(await getData(data, request));
  } catch (error) {
    console.error('Error fetching summary data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch summary data' },
      { status: 200 }
    );
  }
} 

const getData = async (data:any, request:Request) => {
  // Always return full content (no subscription checks)
  return data;
}

