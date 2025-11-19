import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

interface FeedUpdate {
  feed: {
    id: number;
    score: number;
    update_time: string;
  };
  log: {
    user_id: string;
    content_id: string;
    content_type: number;
    action_type: number;
    score_change: number;
  };
}

// This API should be called by scheduled tasks, e.g., daily at midnight
export async function POST(request: Request) {
  try {
    const { headers } = request;
    const authToken = headers.get('x-cron-auth-token');
    
    // Verify if called by scheduled task
    if (authToken !== process.env.CRON_AUTH_TOKEN) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get all Feed records that need to be updated
    const { data: feeds, error: fetchError } = await supabase
      .from('tbl_user_feed')
      .select('*')
      .eq('delete_status', 1)
      .gt('score', 0)
      .lt('update_time', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    if (fetchError) {
      console.error('Error fetching feeds:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch feeds' },
        { status: 500 }
      );
    }

    if (!feeds || feeds.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No feeds to update'
      });
    }

    // Batch update scores
    const updates: FeedUpdate[] = feeds.map(feed => {
      // Calculate new score (decrease by 10 points every 7 days)
      const daysSinceUpdate = Math.floor(
        (Date.now() - new Date(feed.update_time).getTime()) / (1000 * 60 * 60 * 24)
      );
      const decayAmount = Math.floor(daysSinceUpdate / 7) * 10;
      const newScore = Math.max(0, feed.score - decayAmount);

      // If score changed, log it
      if (newScore !== feed.score) {
        return {
          feed: {
            id: feed.id,
            score: newScore,
            update_time: new Date().toISOString()
          },
          log: {
            user_id: feed.user_id,
            content_id: feed.content_id,
            content_type: feed.content_type,
            action_type: 5, // 5: time decay
            score_change: newScore - feed.score
          }
        };
      }
      return null;
    }).filter((update): update is FeedUpdate => update !== null);

    if (updates.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No scores need to be updated'
      });
    }

    // Batch update scores
    const { error: updateError } = await supabase
      .from('tbl_user_feed')
      .upsert(
        updates.map(u => ({
          id: u.feed.id,
          score: u.feed.score,
          update_time: u.feed.update_time
        }))
      );

    if (updateError) {
      console.error('Error updating feed scores:', updateError);
      return NextResponse.json(
        { error: 'Failed to update feed scores' },
        { status: 500 }
      );
    }

    // Batch insert logs
    const { error: logError } = await supabase
      .from('tbl_feed_score_log')
      .insert(updates.map(u => u.log));

    if (logError) {
      console.error('Error logging score changes:', logError);
      // Don't return error, because scores were updated successfully
    }

    return NextResponse.json({
      success: true,
      updatedCount: updates.length,
      message: 'Feed scores updated successfully'
    });
  } catch (error) {
    console.error('Error in feed decay API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 