import { supabase } from './supabase'

export interface UserFeed {
  id: number
  user_id: string
  content_id: string
  content_type: number
  action_type: number
  score: number
  create_time: string
  update_time: string
  delete_status: number
  last_action_type: number
  last_action_time: string
  last_score_change: number
  total_actions: number
  favorite_count: number
  listen_count: number
  search_count: number
  click_count: number
  decay_count: number
  last_decay_time: string
}

export interface FeedDecayRule {
  id: number
  days_threshold: number
  decay_percentage: number
  min_score: number
  create_time: string
  update_time: string
  status: number
}

export interface RecommendationOptions {
  userId: string
  limit?: number
  contentType?: 1 | 2 | 3  // 1: podcast, 2: episode, 3: other
  minScore?: number
  excludeIds?: string[]
}

export interface RecommendationResult {
  contentId: string
  contentType: number
  score: number
  lastActionTime: Date
  totalActions: number
  title?: string
  description?: string
  image?: string
  author?: string
}

/**
 * Get user's recommended content
 * Recommend based on user's historical behavior and content scores
 */
export async function getRecommendations(options: RecommendationOptions): Promise<RecommendationResult[]> {
  const {
    userId,
    limit = 10,
    contentType,
    minScore = 0,
    excludeIds = []
  } = options

  // First get user feed data
  let query = supabase
    .from('tbl_user_feed')
    .select('content_id, content_type, score, last_action_time, total_actions')
    .eq('user_id', userId)
    .eq('delete_status', 1)
    .gt('score', minScore)
    .order('score', { ascending: false })
    .order('last_action_time', { ascending: false })
    .limit(limit)

  // If content type is specified, add content type filter
  if (contentType) {
    query = query.eq('content_type', contentType)
  }

  // If there are content IDs to exclude, add exclusion condition
  if (excludeIds.length > 0) {
    query = query.not('content_id', 'in', excludeIds)
  }

  const { data: feedData, error: feedError } = await query

  if (feedError) {
    console.error('Error fetching feed data:', feedError)
    throw feedError
  }

  if (!feedData || feedData.length === 0) {
    return []
  }

  // Get corresponding podcast information
  const contentIds = feedData.map(item => item.content_id)
  console.log('Content IDs from feed:', contentIds)

  const { data: podcastData, error: podcastError } = await supabase
    .from('tbl_podcast')
    .select('itunes_id, title, description, image, itunes_author')
    .in('itunes_id', contentIds)

  if (podcastError) {
    console.error('Error fetching podcast data:', podcastError)
    throw podcastError
  }

  console.log('Podcast data:', podcastData)

  // Merge data
  const podcastMap = new Map(podcastData?.map(podcast => [podcast.itunes_id, podcast]) || [])
  console.log('Podcast map keys:', Array.from(podcastMap.keys()))
  
  const results = feedData.map(item => {
    const podcast = podcastMap.get(item.content_id)
    console.log(`Matching content_id ${item.content_id} with podcast:`, podcast)
    
    return {
      contentId: item.content_id,
      contentType: item.content_type,
      score: item.score,
      lastActionTime: new Date(item.last_action_time),
      totalActions: item.total_actions,
      title: podcast?.title,
      description: podcast?.description,
      image: podcast?.image,
      author: podcast?.itunes_author
    }
  })

  console.log('Final results:', results)
  return results
}

/**
 * Update user's action record for content
 */
export async function updateUserFeedAction(
  userId: string,
  contentId: string,
  contentType: number,
  actionType: number,
  scoreChange: number
) {
  // Get current session
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('No session found');
  }

  // Call API endpoint instead of directly operating database
  const response = await fetch('/api/feed/action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({
      contentId,
      contentType,
      actionType,
      scoreChange
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to update user feed');
  }

  const result = await response.json();
  return result.data;
}

/**
 * Get content hot ranking
 */
export async function getContentHotRank(contentType?: number, limit = 10) {
  const query = `
    content_id,
    content_type,
    count(*) as user_count,
    sum(score) as total_score
  `

  let baseQuery = supabase
    .from('tbl_user_feed')
    .select(query)
    .eq('delete_status', 1)
    .order('total_score', { ascending: false })
    .limit(limit)

  if (contentType) {
    baseQuery = baseQuery.eq('content_type', contentType)
  }

  const { data, error } = await baseQuery

  if (error) {
    console.error('Error fetching content hot rank:', error)
    throw error
  }

  return data
}

/**
 * Get user's interest content type distribution
 */
export async function getUserInterests(userId: string) {
  const query = `
    content_type,
    count(*) as content_count,
    sum(score) as total_score
  `

  const { data, error } = await supabase
    .from('tbl_user_feed')
    .select(query)
    .eq('user_id', userId)
    .eq('delete_status', 1)
    .order('total_score', { ascending: false })

  if (error) {
    console.error('Error fetching user interests:', error)
    throw error
  }

  return data
} 