import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/user-check';

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
    const type = parseInt(searchParams.get('type') || '1');
    const dataId = searchParams.get('dataId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    if (dataId) {
      const { data, error } = await supabase
        .from('tbl_user_favorite')
        .select('id, p_id, type, data_id, title, img, url, description, create_time, platform')
        .eq('user_id', userId)
        .eq('data_id', dataId)
        .eq('type', type)
        .eq('delete_status', 1)
        .maybeSingle();
      
      if (error) {
        console.error('Error checking favorite status:', error);
        return NextResponse.json({ error: 'Failed to check favorite status' }, { status: 500 });
      }
      return NextResponse.json({ isFollowed: !!data });
    } else {
      // 获取总数
      const { count: totalCount, error: countError } = await supabase
        .from('tbl_user_favorite')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('delete_status', 1)
        .eq('type', type);

      if (countError) {
        console.error('Error counting favorites:', countError);
        return NextResponse.json({ error: 'Failed to count favorites' }, { status: 500 });
      }

      // 获取分页数据
      const { data: favorites, error } = await supabase
        .from('tbl_user_favorite')
        .select('id, p_id, type, data_id, title, img, url, description, create_time, platform')
        .eq('user_id', userId)
        .eq('delete_status', 1)
        .eq('type', type)
        .order('create_time', { ascending: false })
        .range(offset, offset + limit - 1);
      
      if (error) {
        console.error('Error fetching favorites:', error);
        return NextResponse.json({ error: 'Failed to fetch favorites' }, { status: 500 });
      }

      return NextResponse.json({ 
        data: favorites,
        pagination: {
          page,
          limit,
          total: totalCount || 0,
          totalPages: Math.ceil((totalCount || 0) / limit),
          hasMore: page * limit < (totalCount || 0)
        }
      });
    }
  } catch (error) {
    console.error('Unexpected error in favorites API:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    
    const body = await request.json();
    const { 
      type,
      platform,
      userId,
      dataId,
      podcastId,
      isFollowed,
      title,
      img,
      url,
      description
    } = body;
    
    // 根据isFollowed决定是添加还是删除收藏
    if (isFollowed) {
      const { error } = await supabase
        .from('tbl_user_favorite')
        .update({ delete_status: 0 })
        .eq('user_id', userId)
        .eq('data_id', dataId)
        .eq('type', type);
      
      if (error) {
        console.error('Error removing favorite:', error);
        return NextResponse.json({ error: 'Failed to remove favorite' }, { status: 500 });
      }
      
      return NextResponse.json({ 
        success: true, 
        isFollowed: false,
        message: 'Favorite removed'
      });
    } else {
      // 检查是否已存在（可能被软删除了）
      const { data: existingFavorite, error: checkError } = await supabase
        .from('tbl_user_favorite')
        .select('*')
        .eq('user_id', userId)
        .eq('data_id', dataId)
        .eq('type', type)
        .maybeSingle();
      
      if (checkError) {
        console.error('Error checking existing favorite:', checkError);
        return NextResponse.json({ error: 'Failed to check existing favorite' }, { status: 500 });
      }
      
      let result;
      
      if (existingFavorite) {
        // 恢复已有的收藏（更新delete_status）
        result = await supabase
          .from('tbl_user_favorite')
          .update({ 
            delete_status: 1,
            update_time: new Date()
          })
          .eq('id', existingFavorite.id);
      } else {
        // 根据类型构建收藏数据
        interface FavoriteData {
          user_id: string;
          type: number;
          platform: string;
          data_id: string;
          p_id: string;
          title: string;
          img: string;
          url: string;
          description: string;
          create_time: Date;
          update_time: Date;
          delete_status: number;
          channel_name?: string;
          podcast_id?: number;
          duration?: string;
        }
        
        const favoriteData: FavoriteData = {
          user_id: userId || '',
          type,
          platform,
          data_id: dataId,
          p_id: podcastId || '',
          title: title || '',
          img: img || '',
          url: url || '',
          description: description || '',
          create_time: new Date(),
          update_time: new Date(),
          delete_status: 1
        };
        
        result = await supabase
          .from('tbl_user_favorite')
          .insert(favoriteData);
      }
      
      if (result.error) {
        console.error('Error adding favorite:', result.error);
        return NextResponse.json({ error: 'Failed to add favorite' }, { status: 500 });
      }
      
      return NextResponse.json({ 
        success: true, 
        isFollowed: true,
        message: 'Favorite added'
      });
    }
  } catch (error) {
    console.error('Error in favorites API (POST):', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 