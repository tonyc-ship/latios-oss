import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest, checkSubscription } from '@/lib/user-check';

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const subscriptionCheck = await checkSubscription(userId);
    
    return NextResponse.json(subscriptionCheck);
  } catch (error) {
    console.error('Error checking subscription:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 