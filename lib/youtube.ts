import { getVideoDetails } from 'youtube-caption-extractor';

// Helper function to format time
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return [
    hours > 0 ? String(hours).padStart(2, '0') : '',
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0')
  ].filter(Boolean).join(':');
}

export interface YouTubeVideoDetails {
  success: boolean;
  video?: {
    id: string;
    title: string;
    description: string;
    transcript_available: boolean;
    transcript: string;
    subtitles: any[];
    channel: {
      id?: string;
      name?: string;
      url?: string;
    } | null;
    published_at: string | null;
    upload_date: string | null;
    view_count: number | null;
    like_count: number | null;
    duration_seconds: number | null;
    duration_formatted: string | null;
    is_live: boolean | null;
    category: string | null;
    keywords: string[];
    thumbnails: any[];
    coverImage: string | null;
    video_url: string;
  };
  error?: {
    message: string;
    type: string;
  };
}

export async function getYouTubeVideoDetails(videoId: string): Promise<YouTubeVideoDetails> {
  if (!videoId) {
    return {
      success: false,
      error: {
        message: 'Video ID is required',
        type: 'validation_error'
      }
    };
  }

  try {
    const videoDetails = await getVideoDetails({ videoID: videoId, lang: 'en' });
    
    if (!videoDetails || !videoDetails.title) {
      return {
        success: false,
        error: {
          message: 'Video not found or no details available',
          type: 'not_found_error'
        }
      };
    }

    // Fetch richer metadata via youtubei.js (Innertube)
    let ytMetadata: any = {};
    try {
      const { Innertube } = await import('youtubei.js');
      const yt = await Innertube.create();
      let info: any;
      try {
        // Try getInfo first for richer metadata including publish date
        info = await yt.getInfo(videoId);
      } catch (getInfoError: any) {
        // Fallback to getBasicInfo if getInfo fails
        info = await yt.getBasicInfo(videoId);
      }

      const basic = info?.basic_info ?? {};
      const primary = info?.primary_info ?? {};
      const secondary = info?.secondary_info ?? {};
      const micro = info?.microformat ?? {};

      const getText = (v: any) => typeof v === 'string' ? v : (v?.text ?? v?.toString?.());

      // Channel details
      const subscriptionBtn = secondary?.owner?.subscription_button || secondary?.owner?.subscribe_button;
      const author = secondary?.owner?.author;
      const channelId = subscriptionBtn?.channel_id || basic.channel_id || basic.channelId || micro?.channel_id;
      const channelName = getText(author?.name) || basic.channel || basic.author || basic.channel_name || micro?.owner_channel_name;
      const channelUrl = author?.url || basic.channel_url || (channelId ? `https://www.youtube.com/channel/${channelId}` : undefined);

      // Title/description
      const title = getText(primary?.title) || basic.title;
      const description = getText(secondary?.description) || basic.short_description || basic.description;

      // Published/metrics - primary_info.published.text contains the actual publish date
      const published_at = getText(primary?.published) || basic.publish_date || micro.publish_date;
      const upload_date = basic.upload_date || micro.upload_date;
      const view_count_raw = primary?.view_count?.original_view_count || basic.view_count || micro.view_count;
      const view_count = typeof view_count_raw === 'string' ? parseInt(view_count_raw) : view_count_raw;
      const like_count = basic.like_count ?? undefined;

      // Duration
      const durationSeconds = (typeof basic.duration === 'number' ? basic.duration : undefined)
        ?? (typeof basic.length_seconds === 'string' ? parseInt(basic.length_seconds) : basic.length_seconds)
        ?? (typeof micro.length_seconds === 'string' ? parseInt(micro.length_seconds) : micro.length_seconds);

      // Thumbnails
      const thumbs = (basic.thumbnail?.thumbnails || basic.thumbnail || micro?.thumbnail?.thumbnails || []) as any[];
      const thumbnails = Array.isArray(thumbs) ? thumbs : [];
      const bestThumb = thumbnails.reduce((best: any, cur: any) => {
        const bestWidth = best?.width ?? 0;
        const curWidth = cur?.width ?? 0;
        return curWidth > bestWidth ? cur : best;
      }, null as any);

      ytMetadata = {
        title,
        description,
        channel: channelId || channelName || channelUrl ? {
          id: channelId,
          name: channelName,
          url: channelUrl
        } : undefined,
        published_at,
        upload_date,
        view_count: typeof view_count === 'number' && !isNaN(view_count) ? view_count : undefined,
        like_count,
        duration_seconds: typeof durationSeconds === 'number' && !isNaN(durationSeconds) ? durationSeconds : undefined,
        duration_formatted: typeof durationSeconds === 'number' && !isNaN(durationSeconds) ? formatTime(durationSeconds * 1000) : undefined,
        is_live: basic.is_live ?? micro.is_live_content,
        category: basic.category || micro.category,
        keywords: basic.keywords || micro.keywords || [],
        thumbnails,
        best_thumbnail_url: bestThumb?.url,
        video_url: `https://www.youtube.com/watch?v=${videoId}`
      };

      // Fallback to oEmbed if critical fields are missing
      if (!ytMetadata.title || !ytMetadata.channel?.name || !ytMetadata.best_thumbnail_url) {
        try {
          const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
          if (oembedRes.ok) {
            const oembed = await oembedRes.json();
            ytMetadata.title = ytMetadata.title || oembed.title;
            ytMetadata.channel = ytMetadata.channel || {
              id: channelId,
              name: oembed.author_name,
              url: oembed.author_url
            };
            ytMetadata.best_thumbnail_url = ytMetadata.best_thumbnail_url || oembed.thumbnail_url;
            ytMetadata.thumbnails = ytMetadata.thumbnails && ytMetadata.thumbnails.length > 0 ? ytMetadata.thumbnails : [{ url: oembed.thumbnail_url }];
          }
        } catch {}
      }
    } catch (ytErr) {
      console.warn('youtubei.js metadata fetch failed:', ytErr);
      // Continue without yt metadata
    }

    // Convert subtitles to the expected transcript format
    let transcript = '';
    if (videoDetails.subtitles && videoDetails.subtitles.length > 0) {
      // Create structured transcript format
      const transcriptSegments = videoDetails.subtitles.map((item: any, index: number) => {
        let startMs = Math.floor((item.start || 0) * 1000);
        
        // Calculate end time with proper validation
        let endMs: number;
        if (item.duration && typeof item.duration === 'number' && item.duration > 0) {
          endMs = Math.floor((item.start + item.duration) * 1000);
        } else {
          // If no duration, use start time + 3 seconds as fallback
          endMs = startMs + 3000;
        }
        
        // Ensure we have valid numbers
        if (isNaN(startMs) || isNaN(endMs)) {
          startMs = 0;
          endMs = 3000;
        }
        
        return {
          FinalSentence: item.text || '',
          StartMs: startMs,
          EndMs: endMs,
          SpeakerId: 'Speaker 1',
          FormattedTime: formatTime(startMs)
        };
      });
      
      transcript = JSON.stringify(transcriptSegments);
    }

    // console.log('ytMetadata', ytMetadata);
    // console.log('videoDetails', videoDetails);

    return {
      success: true,
      video: {
        id: videoId,
        title: (ytMetadata.title as string) || (videoDetails as any).title,
        description: (ytMetadata.description as string) || (videoDetails as any).description,
        transcript_available: (videoDetails as any).subtitles && (videoDetails as any).subtitles.length > 0,
        transcript: transcript,
        subtitles: (videoDetails as any).subtitles || [],
        // Additional metadata from youtubei.js
        channel: ytMetadata.channel || null,
        published_at: ytMetadata.published_at || null,
        upload_date: ytMetadata.upload_date || null,
        view_count: ytMetadata.view_count ?? null,
        like_count: ytMetadata.like_count ?? null,
        duration_seconds: ytMetadata.duration_seconds ?? null,
        duration_formatted: ytMetadata.duration_formatted || null,
        is_live: ytMetadata.is_live ?? null,
        category: ytMetadata.category || null,
        keywords: ytMetadata.keywords || [],
        thumbnails: ytMetadata.thumbnails || [],
        coverImage: ytMetadata.best_thumbnail_url || null,
        video_url: ytMetadata.video_url || `https://www.youtube.com/watch?v=${videoId}`
      }
    };
  } catch (error) {
    console.error('Error fetching YouTube video details:', error);
    
    return {
      success: false,
      error: {
        message: (error as Error).message,
        type: 'youtube_api_error'
      }
    };
  }
}
