import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Get client IP address from request headers
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() : null;
    
    // Get user agent info
    const userAgent = request.headers.get('user-agent');
    
    // Basic validation
    if (!data.actionType) {
      return NextResponse.json(
        { success: false, error: 'Action type is required' },
        { status: 400 }
      );
    }
    
    // Prepare device info
    const deviceInfo = {
      userAgent,
      // You can add more device information here if needed
    };
    
    // Log the incoming data for debugging
    const prepareData = {
      user_id: data.userId || null,
      action_type: data.actionType,
      target_id: data.targetId || null,
      target_type: data.targetType || null,
      action_details: data.actionDetails || null,
      device_info: deviceInfo,
      ip_address: ip,
      create_user_id: data.userId || null,
      update_user_id: data.userId || null,
      create_time: new Date().toISOString(),
      update_time: new Date().toISOString(),
      delete_status: 1
    }
    console.log('Logging user action:', prepareData);
    
    // Insert into bl_user_action table
    const { data: actionRecord, error } = await supabase
      .from('tbl_user_action')
      .insert(prepareData)
      .select()
      .single();

    if (error) {
      console.error('Error logging user action:', error);
      throw error;
    }

    return NextResponse.json({ success: true, data: actionRecord });
  } catch (error) {
    console.error('Error logging user action:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to log user action' },
      { status: 500 }
    );
  }
} 