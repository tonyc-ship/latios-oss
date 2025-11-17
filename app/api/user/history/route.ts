import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// 用户每月的使用量（导航栏）
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!userId || !startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'User ID, startDate, and endDate are required' },
        { status: 400 }
      );
    }

    const { count, error } = await supabase
      .from('tbl_user_history')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('delete_status', 1)
      .gte('create_time', startDate)
      .lte('create_time', endDate);

    if (error) {
      console.error('Error fetching usage data:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch usage data' },
        { status: 500 }
      );
    }

    return NextResponse.json({ count: count || 0 });
  } catch (error) {
    console.error('Error in usage API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
} 