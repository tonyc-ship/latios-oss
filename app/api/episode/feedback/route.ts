import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET endpoint to fetch user feedback for an episode
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const episodeId = searchParams.get('episodeId');
  const email = searchParams.get('email');
  
  if (!episodeId || !email) {
    return NextResponse.json(
      { error: 'episodeId and email are required parameters' },
      { status: 400 }
    );
  }
  
  try {
    // Get like status
    const { data: likeData } = await supabase
      .from('tbl_user_feedback')
      .select('*')
      .eq('email', email)
      .eq('episode_id', episodeId)
      .eq('feedback_type', 'like')
      .eq('delete_status', 1)
      .maybeSingle();
    
    // Get dislike status
    const { data: dislikeData } = await supabase
      .from('tbl_user_feedback')
      .select('*')
      .eq('email', email)
      .eq('episode_id', episodeId)
      .eq('feedback_type', 'dislike')
      .eq('delete_status', 1)
      .maybeSingle();
    
    // Get comment/rating status
    const { data: commentData } = await supabase
      .from('tbl_user_feedback')
      .select('*')
      .eq('email', email)
      .eq('episode_id', episodeId)
      .eq('feedback_type', 'comment')
      .eq('delete_status', 1)
      .maybeSingle();
    
    return NextResponse.json({
      isLiked: !!likeData,
      isDisliked: !!dislikeData,
      rating: commentData?.rating || null,
      comment: commentData?.comment || '',
    });
  } catch (error) {
    console.error('Error fetching feedback status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch feedback status' },
      { status: 500 }
    );
  }
}

// POST endpoint to add or update user feedback
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, userId, episodeId, feedbackType, rating, comment } = body;
    
    if (!email || !userId || !episodeId || !feedbackType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Validate feedbackType
    if (!['like', 'dislike', 'comment'].includes(feedbackType)) {
      return NextResponse.json(
        { error: 'Invalid feedback type' },
        { status: 400 }
      );
    }
    
    // Check if feedback already exists
    const { data: existingData } = await supabase
      .from('tbl_user_feedback')
      .select('id')
      .eq('email', email)
      .eq('episode_id', episodeId)
      .eq('feedback_type', feedbackType)
      .maybeSingle();
    
    // Base feedback object
    const feedback: {
      email: string;
      episode_id: string;
      feedback_type: string;
      update_user_id: string;
      update_time: string;
      rating?: number | null;
      comment?: string;
    } = {
      email,
      episode_id: episodeId,
      feedback_type: feedbackType,
      update_user_id: userId,
      update_time: new Date().toISOString(),
    };
    
    // For comment type, add rating and comment fields
    if (feedbackType === 'comment') {
      feedback['rating'] = rating || null;
      feedback['comment'] = comment || '';
    }
    
    let response;
    
    if (existingData) {
      // Update existing record
      if (body.delete_status === 0) {
        // Soft delete (unlike/undislike)
        response = await supabase
          .from('tbl_user_feedback')
          .update({ 
            delete_status: 0,
            update_time: new Date().toISOString(),
            update_user_id: userId
          })
          .eq('id', existingData.id);
      } else {
        // Update existing record
        response = await supabase
          .from('tbl_user_feedback')
          .update({
            ...feedback,
            delete_status: 1
          })
          .eq('id', existingData.id);
      }
    } else if (body.delete_status !== 0) {
      // Only create new record if not deleting
      response = await supabase
        .from('tbl_user_feedback')
        .insert({
          ...feedback,
          create_user_id: userId,
          create_time: new Date().toISOString(),
          delete_status: 1
        });
    }
    
    if (response?.error) {
      return NextResponse.json(
        { error: 'Failed to update feedback', details: response.error },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ 
      success: true,
      message: body.delete_status === 0 
        ? `${feedbackType} removed successfully` 
        : `${feedbackType} updated successfully`
    });
  } catch (error) {
    console.error('Error processing feedback:', error);
    return NextResponse.json(
      { error: 'Failed to process feedback' },
      { status: 500 }
    );
  }
} 