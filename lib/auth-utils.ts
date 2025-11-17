import { NextResponse } from 'next/server';

/**
 * Authentication result interface
 */
export interface AuthResult {
  userId: string | null;
  user?: any;
  error?: string;
  status?: number;
}

/**
 * Authenticate user from request
 * Always returns success with null userId (no login required)
 * @param request - The incoming request
 * @param requireAuth - Whether authentication is required (ignored)
 * @returns AuthResult with userId as null
 */
export async function authenticateUser(
  request: Request,
  requireAuth: boolean = false
): Promise<AuthResult> {
  // No authentication required, always return success with null userId
  return {
    userId: null,
    user: null,
  };
}

/**
 * Create an authentication error response
 * @param error - Error message
 * @param status - HTTP status code
 * @returns NextResponse with error
 */
export function createAuthErrorResponse(
  error: string,
  status: number = 401
): NextResponse {
  return NextResponse.json(
    { error },
    { status }
  );
}

