import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const episodeId = searchParams.get('episodeId');
  
  if (!userId || !episodeId) {
    return NextResponse.json(
      { error: 'userId and episodeId are required parameters' },
      { status: 400 }
    );
  }
  
  try {
    const { data, error } = await supabase
      .from('tbl_user_favorite')
      .select('*')
      .eq('user_id', userId)
      .eq('type', '2') // 2表示单集
      .eq('data_id', episodeId)
      .eq('delete_status', 1)
      .maybeSingle();
    
    if (error) {
      console.error('Error checking follow status:', error);
      return NextResponse.json(
        { error: 'Failed to check follow status' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ isFollowed: !!data });
  } catch (error) {
    console.error('Exception checking follow status:', error);
    return NextResponse.json(
      { error: 'Failed to check follow status' },
      { status: 500 }
    );
  }
} 

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, episodeId, isFollowed } = body;
    
    if (!userId || !episodeId) {
      return NextResponse.json(
        { error: 'userId and episodeId are required' },
        { status: 400 }
      );
    }
    
    if (isFollowed) {
      // User is already following - unfollow (soft delete)
      const { data, error } = await supabase
        .from('tbl_user_favorite')
        .update({ 
          delete_status: 0,
          update_time: new Date().toISOString(),
          update_user_id: userId
        })
        .eq('user_id', userId)
        .eq('type', '2') // 2表示单集
        .eq('data_id', episodeId);
      
      if (error) {
        console.error('Error unfollowing episode:', error);
        return NextResponse.json(
          { error: 'Failed to unfollow episode' },
          { status: 500 }
        );
      }
      
      return NextResponse.json({
        success: true,
        isFollowed: false,
        message: 'You have unfollowed this episode'
      });
    } else {
      // User is not following - add follow
      const { data, error } = await supabase
        .from('tbl_user_favorite')
        .insert({ 
          user_id: userId,
          type: '2', // 2表示单集
          data_id: episodeId,
          create_user_id: userId,
          update_user_id: userId,
          create_time: new Date().toISOString(),
          update_time: new Date().toISOString(),
          delete_status: 1
        });
      
      if (error) {
        console.error('Error following episode:', error);
        return NextResponse.json(
          { error: 'Failed to follow episode' },
          { status: 500 }
        );
      }
      
      return NextResponse.json({
        success: true,
        isFollowed: true,
        message: 'You are now following this episode'
      });
    }
  } catch (error) {
    console.error('Error toggling follow status:', error);
    return NextResponse.json(
      { error: 'Failed to update follow status' },
      { status: 500 }
    );
  }
} 