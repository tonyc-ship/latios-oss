import { supabase } from '@/lib/supabase';

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
 * @returns User ID or null
 */
export async function getUserIdFromRequest(request: Request): Promise<string | null> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.split(' ')[1];
    if(!token || token === 'undefined') {
      console.log('token is undefined');
      return null;
    }

    // If token starts with 'job_', treat it as an open job token, return the job ID
    if(token.startsWith('job_')) {
      return token.split('_')[1];
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user?.id) {
      return null;
    }

    return user.id;
  } catch (error) {
    console.error('Error getting user from request:', error);
    return null;
  }
} 