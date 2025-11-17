import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
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

    // Check if user has a Notion token
    const { data: notionToken, error } = await supabase
      .from('tbl_user_notion_tokens')
      .select('workspace_name, created_at')
      .eq('user_id', userId)
      .single();

    if (error || !notionToken) {
      return NextResponse.json({
        connected: false,
        workspaceName: null
      });
    }

    return NextResponse.json({
      connected: true,
      workspaceName: notionToken.workspace_name,
      connectedAt: notionToken.created_at
    });

  } catch (error: any) {
    console.error('Notion status check error:', error);
    return NextResponse.json(
      { error: 'Failed to check Notion status' },
      { status: 500 }
    );
  }
}
