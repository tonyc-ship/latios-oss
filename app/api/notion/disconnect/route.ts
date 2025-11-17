import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    
    // Verify the user token and get user ID
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    const userId = user.id;

    // Delete user's Notion token from database
    const { error: deleteError } = await supabase
      .from('tbl_user_notion_tokens')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      console.error('Failed to delete Notion token:', deleteError);
      return NextResponse.json(
        { error: 'Failed to disconnect Notion account' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Notion account disconnected successfully'
    });

  } catch (error: any) {
    console.error('Notion disconnect error:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect Notion account' },
      { status: 500 }
    );
  }
}
