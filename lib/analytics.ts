import { useAuth } from './auth';
import { track } from '@vercel/analytics';

export interface UserAction {
  actionType: string;
  targetId?: string;
  targetType?: string;
  actionDetails?: any;
}

/**
 * Server-side page view tracking
 * Use this in server components or API routes
 */
export const trackPageViewServer = (page: string, pageTitle?: string) => {
  // For server-side tracking, we'll use the existing logUserAction
  // Vercel Analytics client-side tracking will be handled automatically
  return logUserAction({
    actionType: 'page_view',
    actionDetails: {
      page,
      pageTitle,
      action: 'view_page',
      source: 'server'
    }
  });
};

// ===== VERCEL ANALYTICS TRACKING FUNCTIONS =====

/**
 * Track search events
 * @param query Search query
 * @param resultCount Number of results
 * @param source Search source (navbar, search_page, etc.)
 */
export const trackSearch = (query: string, source?: string) => {
  const props: Record<string, string> = {
    query: query.substring(0, 255),
  };
  if (source) props.source = source;
  track('Search', props);
};

/**
 * Track podcast import events
 * @param platform Import platform (xiaoyuzhou, apple_podcast, youtube)
 * @param podcastId Podcast ID
 * @param podcastTitle Podcast title
 * @param success Whether import was successful
 */
export const trackPodcastImport = (platform: 'xiaoyuzhou' | 'apple_podcast' | 'youtube') => {
  track('Podcast Import', { platform });
};

/**
 * Track summary view events
 * @param episodeId Episode ID
 * @param episodeTitle Episode title
 * @param podcastName Podcast name
 * @param language Summary language
 */
export const trackSummaryView = (episodeTitle?: string, podcastName?: string, source?: string) => {
  const props: Record<string, string> = {};
  if (episodeTitle) props.title = episodeTitle.substring(0, 255);
  if (podcastName) props.podcast = podcastName.substring(0, 255);
  if (source) props.source = source;
  track('Summary View', props);
};

/**
 * Track transcript view events
 * @param episodeId Episode ID
 * @param episodeTitle Episode title
 * @param podcastName Podcast name
 * @param language Transcript language
 */
export const trackTranscriptView = (episodeTitle?: string, podcastName?: string, source?: string) => {
  const props: Record<string, string> = {};
  if (episodeTitle) props.title = episodeTitle.substring(0, 255);
  if (podcastName) props.podcast = podcastName.substring(0, 255);
  if (source) props.source = source;
  track('Transcript View', props);
};



/**
 * Track subscription events
 * @param action Subscription action (initiate, complete, cancel, manage)
 * @param planType Plan type
 * @param paymentMethod Payment method
 */
export const trackSubscription = (action: 'initiate' | 'complete' | 'cancel' | 'manage', paymentMethod?: string) => {
  const props: Record<string, string> = { action };
  if (paymentMethod) props.method = paymentMethod.substring(0, 255);
  track('Subscription', props);
};

/**
 * Track user registration events
 * @param provider Registration provider (email, google, etc.)
 * @param success Whether registration was successful
 */
export const trackRegistration = (provider: string) => {
  track('Registration', { provider: provider.substring(0, 255) });
};

/**
 * Track login events
 * @param provider Login provider
 * @param action Login action (attempt, success, failure)
 */
export const trackLogin = (provider: string, action: 'attempt' | 'success' | 'failure') => {
  track('Login', { provider: provider.substring(0, 255), action });
};

/**
 * Track page view events
 * @param page Page path
 * @param pageTitle Page title
 */
export const trackPageView = (page: string, pageTitle?: string) => {
  const props: Record<string, string> = { page: page.substring(0, 255) };
  if (pageTitle) props.title = pageTitle.substring(0, 255);
  track('Page View', props);
};

/**
 * Track content interaction events
 * @param action Interaction action (copy, share, like, dislike, rate, export_notion)
 * @param contentType Content type (summary, transcript, episode)
 * @param episodeId Episode ID
 */
export const trackContentInteraction = (action: 'copy' | 'share' | 'like' | 'dislike' | 'rate' | 'export_notion', contentType: 'summary' | 'transcript' | 'episode') => {
  track('Content Interaction', { action, type: contentType });
};



/**
 * Track error events
 * @param errorType Type of error
 * @param errorMessage Error message
 * @param context Error context
 */
export const trackError = (errorType: string, errorMessage: string) => {
  track('Error', { type: errorType.substring(0, 255), msg: errorMessage.substring(0, 255) });
};

/**
 * General function to log user actions
 * @param action User action object
 */
export const logUserAction = async (action: UserAction) => {
  try {
    const { data: { user } } = await import('@/lib/supabase').then(m => m.supabase.auth.getUser());
    
    const response = await fetch('/api/user/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: user?.id || null,
        actionType: action.actionType,
        targetId: action.targetId,
        targetType: action.targetType,
        actionDetails: {
          ...action.actionDetails,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href,
        }
      }),
    });

    if (!response.ok) {
      console.error('Failed to log user action:', response.status);
    }
  } catch (error) {
    console.error('Error logging user action:', error);
  }
};

/**
 * Log transcription request action
 * @param episodeId Episode ID
 * @param episodeTitle Episode title
 * @param podcastName Podcast name
 */
export const logTranscriptionRequest = async (episodeId: string, episodeTitle?: string, podcastName?: string) => {
  await logUserAction({
    actionType: 'transcription_request',
    targetId: episodeId,
    targetType: 'episode',
    actionDetails: {
      episodeTitle,
      podcastName,
      action: 'request_transcription'
    }
  });
};

/**
 * Log upgrade modal interaction action
 * @param action User selected action
 * @param usedCount Number of times used
 * @param monthlyLimit Monthly limit
 */
export const logUpgradeModalInteraction = async (action: 'upgrade' | 'later', usedCount?: number, monthlyLimit?: number) => {
  await logUserAction({
    actionType: 'upgrade_modal_interaction',
    actionDetails: {
      userChoice: action,
      usedCount,
      monthlyLimit,
      action: action === 'upgrade' ? 'clicked_upgrade' : 'clicked_later'
    }
  });
};

/**
 * Log search action
 * @param query Search keyword
 * @param resultCount Number of search results
 */
export const logSearchAction = async (query: string, resultCount?: number) => {
  await logUserAction({
    actionType: 'search',
    actionDetails: {
      query,
      resultCount,
      action: 'perform_search'
    }
  });
};

/**
 * Log subscription action
 * @param planType Subscription plan type
 * @param action Subscription-related action
 */
export const logSubscriptionAction = async (planType: string, action: 'initiate' | 'complete' | 'cancel') => {
  await logUserAction({
    actionType: 'subscription',
    actionDetails: {
      planType,
      action,
      actionType: `subscription_${action}`
    }
  });
};

/**
 * Log login action
 * @param provider Login provider
 * @param action Login-related action
 */
export const logLoginAction = async (provider: string, action: 'attempt' | 'success' | 'failure') => {
  await logUserAction({
    actionType: 'login',
    actionDetails: {
      provider,
      action,
      actionType: `login_${action}`
    }
  });
};

/**
 * Log page view action
 * @param page Page path
 * @param pageTitle Page title
 */
export const logPageView = async (page: string, pageTitle?: string) => {
  await logUserAction({
    actionType: 'page_view',
    actionDetails: {
      page,
      pageTitle,
      action: 'view_page'
    }
  });
};

/**
 * Log click action
 * @param element Clicked element
 * @param context Click context
 */
export const logClickAction = async (element: string, context?: any) => {
  await logUserAction({
    actionType: 'click',
    actionDetails: {
      element,
      context,
      action: 'click_element'
    }
  });
};

/**
 * Log Tracker-related actions
 * @param actionType Action type
 * @param targetId Target ID (optional, e.g., accountName)
 * @param actionDetails Action details
 * @param authToken Authentication token (optional)
 */
export const logTrackerAction = async (
  actionType: string,
  actionDetails?: any,
  targetId?: string | null,
  authToken?: string | null
) => {
  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    await fetch('/api/tracker/action', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        actionType,
        targetId: targetId || null,
        targetType: 'tracker',
        actionDetails: {
          ...actionDetails,
          timestamp: new Date().toISOString(),
        },
      }),
    });
  } catch (error) {
    console.error('Error logging tracker action:', error);
    // Don't block the UI if logging fails
  }
}; 