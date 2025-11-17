import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // This should contain the user ID
    const error = searchParams.get('error');

    if (error) {
      console.error('Notion OAuth error:', error);
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/profile?notion_error=${error}`);
    }

    if (!code || !state) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/profile?notion_error=missing_parameters`);
    }

    // Exchange the authorization code for an access token
    const clientId = process.env.NOTION_CLIENT_ID;
    const clientSecret = process.env.NOTION_CLIENT_SECRET;
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/notion/oauth/callback`;

    if (!clientId || !clientSecret) {
      console.error('Notion OAuth credentials not configured');
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/profile?notion_error=configuration_error`);
    }

    // Create Basic Auth header
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenResponse = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Notion token exchange failed:', errorData);
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/profile?notion_error=token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token, workspace_id, workspace_name } = tokenData;

    // Store the access token in the database
    const { error: dbError } = await supabase
      .from('tbl_user_notion_tokens')
      .upsert({
        user_id: state,
        access_token: access_token,
        workspace_id: workspace_id,
        workspace_name: workspace_name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (dbError) {
      console.error('Failed to store Notion token:', dbError);
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/profile?notion_error=storage_failed`);
    }

    // Redirect back to profile page with success message
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/profile?notion_success=true`);

  } catch (error: any) {
    console.error('Notion OAuth callback error:', error);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/profile?notion_error=callback_error`);
  }
}
