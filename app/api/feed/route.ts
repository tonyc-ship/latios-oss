import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const sourceType = parseInt(searchParams.get('sourceType') || '0'); // 0: all
    const contentType = parseInt(searchParams.get('contentType') || '0'); // 0: all
    
    // No login required, return empty feed
    return NextResponse.json({
      feeds: [],
      pagination: {
        page,
        limit,
        total: 0,
        totalPages: 0,
        hasMore: false
      },
      message: 'Feed feature requires login'
    });
  } catch (error) {
    console.error('Error in feed API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 