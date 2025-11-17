
import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/user-check';

// 插入历史记录
export async function POST(request: Request) {
  try {
    
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }


    const data = await request.json();
    if(!data.episodeId || !data.podcastId) {
      return NextResponse.json(
        { success: false, error: 'Invalid request' },
        { status: 400 }
      );
    }
    const { data: history, error } = await supabase
      .from('tbl_user_history')
      .upsert({
        user_id: data.userId,
        platform: data.platform,
        episode_id: data.episodeId,
        podcast_id: data.podcastId,
        title: data.title,
        img: data.img,
        podcast_name: data.podcastName,
        description: data.description,
        url: data.url,
        create_user_id: data.userId,
        update_user_id: data.userId,
        create_time: new Date().toISOString(),
        update_time: new Date().toISOString(),
        delete_status: 1
      }, {
        onConflict: 'user_id,episode_id',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data: history });
  } catch (error) {
    console.error('Error inserting history:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to insert history' },
      { status: 500 }
    );
  }
}

// 获取用户历史记录（库）
export async function GET(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // 获取总数
    const { count: totalCount, error: countError } = await supabase
      .from('tbl_user_history')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('delete_status', 1);

    if (countError) {
      console.error('Error counting history:', countError);
      return NextResponse.json(
        { success: false, error: 'Failed to count history' },
        { status: 500 }
      );
    }

    // 获取分页数据
    const { data: history, error } = await supabase
      .from('tbl_user_history')
      .select('id, episode_id, podcast_id, title, img, podcast_name, description, url, create_time, platform')
      .eq('user_id', userId)
      .eq('delete_status', 1)
      .order('create_time', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching history:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch history' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      data: history,
      pagination: {
        page,
        limit,
        total: totalCount || 0,
        totalPages: Math.ceil((totalCount || 0) / limit),
        hasMore: page * limit < (totalCount || 0)
      }
    });
  } catch (error) {
    console.error('Error fetching history:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch history' },
      { status: 500 }
    );
  }
}
