import { NextResponse } from 'next/server';
import { authenticateUser, createAuthErrorResponse } from '@/lib/auth-utils';

export async function PUT(request: Request) {
  try {
    // Authenticate user
    const authResult = await authenticateUser(request, true);
    
    if (authResult.error && authResult.status) {
      return createAuthErrorResponse(authResult.error, authResult.status);
    }

    // Role-related fields have been removed
    return NextResponse.json(
      { error: 'This endpoint is no longer available' },
      { status: 410 }
    );
  } catch (error) {
    console.error('Error updating user profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

