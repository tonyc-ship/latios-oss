import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/user-check';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {dataId, dataType, userName, userEmail, showTitle, episodeTitle, episodeDuration, episodePubDate, source} = body;
        
        const userId = await getUserIdFromRequest(request);

        // Summary tracking logic removed

        // Check parameters
        if (!dataId || !dataType) {
            return NextResponse.json(
                { success: false, error: 'Forbidden' },
                { status: 200 }
            );
        }

        if (!userId) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }


        // Update user summary record
        const { error } = await supabase
            .from('tbl_user_summarize_ref')
            .upsert([
                {
                    user_id: userId,
                    data_id: dataId,
                    data_type: dataType, // 1 for summary, 2 for transcript
                    delete_status: 1,
                    user_name: userName,
                    user_email: userEmail,
                    user_country: '',
                    user_city: '',
                    ip: '',
                    show_title: showTitle,
                    episode_title: episodeTitle,
                    episode_duration: episodeDuration,
                    publish_date: episodePubDate,
                }
            ], {
                onConflict: 'user_id,data_id,data_type',
                ignoreDuplicates: false
            });

        if (error) {
            console.error('Error setting reference:', error);
            return NextResponse.json(
                { success: false, error: 'Failed to set reference' },
                { status: 500 }
            );
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error setting reference:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to process request' },
            { status: 500 }
        );
    }
}