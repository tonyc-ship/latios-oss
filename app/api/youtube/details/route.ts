import { NextResponse } from 'next/server';
import { getYouTubeVideoDetails } from '@/lib/youtube';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('id');

  if (!videoId) {
    return NextResponse.json(
      { error: 'Video ID is required' },
      { status: 400 }
    );
  }

  try {
    const result = await getYouTubeVideoDetails(videoId);
    
    if (!result.success) {
      return NextResponse.json(
        { 
          error: result.error?.message || 'Failed to fetch video details',
          type: result.error?.type || 'unknown_error'
        },
        { status: result.error?.type === 'not_found_error' ? 404 : 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching YouTube video details:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: {
          message: (error as Error).message,
          type: 'youtube_api_error'
        }
      },
      { status: 500 }
    );
  }
}
