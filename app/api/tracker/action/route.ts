import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { authenticateUser } from '@/lib/auth-utils';

export async function POST(request: NextRequest) {
  try {
    // Authenticate user (optional - allow anonymous users)
    const authResult = await authenticateUser(request, false);
    const userId = authResult.userId || null;
    const user = authResult.user;

    const data = await request.json();
    const { actionType, targetId, targetType, actionDetails } = data;

    if (!actionType) {
      return NextResponse.json(
        { success: false, error: 'Action type is required' },
        { status: 400 }
      );
    }

    // Get client IP address from request headers
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() : null;

    // Get user agent info
    const userAgent = request.headers.get('user-agent');

    // Prepare device info
    const deviceInfo = {
      userAgent,
    };

    // Prepare action data for Supabase
    const actionData = {
      user_id: userId,
      action_type: actionType,
      target_id: targetId || null,
      target_type: targetType || null,
      action_details: actionDetails || null,
      device_info: deviceInfo,
      ip_address: ip,
      create_user_id: userId,
      update_user_id: userId,
      create_time: new Date().toISOString(),
      update_time: new Date().toISOString(),
      delete_status: 1,
    };

    // Log the action to Supabase
    const { data: actionRecord, error: dbError } = await supabase
      .from('tbl_user_action')
      .insert(actionData)
      .select()
      .single();

    if (dbError) {
      console.error('Error logging user action:', dbError);
      // Don't fail the request if logging fails
    }


    return NextResponse.json({ 
      success: true, 
      data: actionRecord 
    });
  } catch (error) {
    console.error('Error in tracker action API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process tracker action' },
      { status: 500 }
    );
  }
}

