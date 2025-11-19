import { supabase } from '@/lib/supabase';
import { DEFAULT_LOCAL_USER_ID } from './utils';

export interface SubscriptionCheckResult {
  success: boolean;
  hasValidSubscription: boolean;
  error?: string;
  message?: string;
  usedCount?: number;
  monthlyLimit?: number;
}

/**
 * Check user subscription status and usage limits
 * @param userId User ID
 * @returns SubscriptionCheckResult
 */
export async function checkSubscription(userId: string): Promise<SubscriptionCheckResult> {
  // Always return success - all features are free
  return {
    success: true,
    hasValidSubscription: true,
  };
}

/**
 * Check if user is logged in
 * @param request Next.js Request object
 * @returns User ID (always returns default local user ID if no valid token)
 */
export async function getUserIdFromRequest(request: Request): Promise<string | null> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      // Return default local user ID for open-sourced version
      return DEFAULT_LOCAL_USER_ID;
    }

    const token = authHeader.split(' ')[1];
    if(!token || token === 'undefined') {
      console.log('token is undefined, using default local user ID');
      // Return default local user ID for open-sourced version
      return DEFAULT_LOCAL_USER_ID;
    }

    // If token starts with 'job_', treat it as an open job token, return the job ID
    if(token.startsWith('job_')) {
      return token.split('_')[1];
    }

    // If token is the local guest token, return default user ID
    if(token === 'local-guest-token') {
      return DEFAULT_LOCAL_USER_ID;
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user?.id) {
      // Return default local user ID if token is invalid
      return DEFAULT_LOCAL_USER_ID;
    }

    return user.id;
  } catch (error) {
    console.error('Error getting user from request:', error);
    // Return default local user ID on error
    return DEFAULT_LOCAL_USER_ID;
  }
} 