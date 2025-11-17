import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    // No login required, feed updates not available
    return NextResponse.json(
      { error: 'Feed updates require login' },
      { status: 401 }
    );
  } catch (error) {
    console.error('Error in feed update API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
