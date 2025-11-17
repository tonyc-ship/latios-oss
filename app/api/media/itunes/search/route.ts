import { toast } from '@/components/ui/use-toast';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  const body = await request.json();
  const { query, userId, email, userName } = body;
  
  if (!query) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 });
  }

  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=podcast`;

  const res = await fetch(url);
  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to fetch data from iTunes' }, { status: 500 });
  }

  const data = await res.json();
  const results = data.results.map((podcast: any) => ({
    id: podcast.collectionId,
    title: podcast.collectionName,
    feedUrl: podcast.feedUrl,
    artwork: podcast.artworkUrl600,
    author: podcast.artistName,
    link: podcast.collectionViewUrl,
  }));

  try {
    // Insert search data into tbl_user_search
    const { error } = await supabase
      .from('tbl_user_search')
      .insert([
        {
          keyword: query,
          user_email: email,
          create_user_id: userId,
          create_time: new Date().toISOString(),
          delete_status: 1
        }
      ]);
    if (error) {
      console.error('Error inserting search data:', error);
    }
  } catch (err) {
    console.error('Unexpected error while inserting search data:', err);
  }

  return NextResponse.json(results);
}