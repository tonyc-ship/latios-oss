import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    // No login required, feed actions not available
    return NextResponse.json(
      { error: 'Feed actions require login' },
      { status: 401 }
    );
  } catch (error) {
    console.error('Error in feed action API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
