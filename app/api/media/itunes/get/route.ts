import { toast } from '@/components/ui/use-toast';
import { NextResponse } from 'next/server';
import { parseStringPromise } from 'xml2js';
import { getYouTubeVideoDetails } from '@/lib/youtube';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const type = searchParams.get('type') || 'none';
    const episodeId = searchParams.get('episodeId');
    
    if (!id) {
        return NextResponse.json(
            { error: 'Podcast ID is required' },
            { status: 400 }
        );
    }

    try {
      let data;
      if (type === 'xyz') {
        data = await getXiaoyuzhouPodcastDetails(id);
      } else if (type === 'youtube') {
        data = await getYouTubeVideoDetailsForPodcast(id);
      } else {
        data = await getPodcastDetails(id);
      }

      if (!data) {
          return NextResponse.json(
              { error: 'Podcast not found' },
              { status: 404 }
          );
      }
      
      return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching podcast details:', error);
        return NextResponse.json(
            { error: 'Failed to fetch podcast details' },
            { status: 500 }
        );
    }
}

async function getXiaoyuzhouPodcastDetails(podcastId: string) {
  try {
    // Debug: check environment variables
    console.log('XIAOYUZHOU_URL:', process.env.XIAOYUZHOU_URL);
    
    if (!process.env.XIAOYUZHOU_URL) {
      console.error('XIAOYUZHOU_URL environment variable is not set');
      throw new Error('XIAOYUZHOU_URL not configured');
    }
    
    const response = await fetch(
      process.env.XIAOYUZHOU_URL + `/xiaoyuzhou/podcast/${podcastId}`
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch Xiaoyuzhou podcast');
    }
    
    const xmlText = await response.text();
    // console.log("xmlText",xmlText);
    const parsed = await parseStringPromise(xmlText, { explicitArray: false });
    const channel = parsed.rss.channel;
    const items = Array.isArray(channel.item) ? channel.item : [channel.item];
    
    const episodes = items.map((item: any) => {
      const description = item.description || item['itunes:summary'] || '';
      const enclosureUrl = item.enclosure?.$.url || '';
      // Extract guid from the URL path
      const guidMatch = item.guid?._?.match(/\/([^\/]+)$/);
      const guid = guidMatch ? guidMatch[1] : '';

      return {
        id: guid,
        type:'xyz',
        channel_id: podcastId,
        title: item.title || '',
        description: stripHtml(description),
        audio_url: enclosureUrl,
        duration: formatDuration(item['itunes:duration'] || ''),
        published_at: formatDate(item.pubDate),
        is_followed: false,
        episode_image: item['itunes:image']?.$.href || channel.image?.url || '',
        episode_number: item['itunes:episode'] || '',
        season: item['itunes:season'] || '',
        explicit: item['itunes:explicit'] === 'yes',
        keywords: item['itunes:keywords'] || '',
        podcast_name: channel.title || '',
        author: channel['itunes:author'],
        podcast_img: channel.image?.url || channel['itunes:image']?.$.href || ''
      };
    });

    return {
      id: podcastId,
      type:'xyz',
      title: channel.title,
      author: channel['itunes:author'],
      description: stripHtml(channel.description),
      coverImage: channel.image?.url || channel['itunes:image']?.$.href || '',
      episodeCount: episodes.length,
      episodes: episodes,
      categories: Array.isArray(channel['itunes:category']) 
        ? channel['itunes:category'].map((cat: any) => cat?.$.text || '')
        : [channel['itunes:category']?.$.text || ''],
      language: channel.language || 'en',
      websiteUrl: channel.link || '',
      feedUrl: process.env.XIAOYUZHOU_URL + `/xiaoyuzhou/podcast/${podcastId}`
    };
  } catch (error) {
    console.error('Error fetching Xiaoyuzhou podcast details:', error);
    return null;
  }
}

async function getYouTubeVideoDetailsForPodcast(videoId: string) {
  try {
    // Call the YouTube service directly instead of making an API request
    const data = await getYouTubeVideoDetails(videoId);
    console.log('data', data);
    if (!data.success || !data.video) {
      throw new Error('Failed to fetch YouTube video details');
    }
    
    const enrichedVideo = data.video;
    
    // Transform the data to match our expected format
    const video = {
      id: videoId,
      type: 'youtube',
      title: enrichedVideo.title,
      author: enrichedVideo.channel?.name,
      description: enrichedVideo.description || '',
      coverImage: enrichedVideo.coverImage || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      duration: enrichedVideo.duration_formatted || '',
      published_at: enrichedVideo.published_at || enrichedVideo.upload_date || '',
      view_count: enrichedVideo.view_count || 0,
      like_count: enrichedVideo.like_count || 0,
      channel_id: enrichedVideo.channel?.id || '',
      channel_name: enrichedVideo.channel?.name,
      video_url: enrichedVideo.video_url || `https://www.youtube.com/watch?v=${videoId}`,
      embed_url: `https://www.youtube.com/embed/${videoId}`,
      transcript_available: enrichedVideo.transcript_available || false,
      transcript: enrichedVideo.transcript || '',
      episodeCount: 1,
      episodes: [{
        id: videoId,
        type: 'youtube',
        channel_id: enrichedVideo.channel?.id || videoId,
        title: enrichedVideo.title,
        description: enrichedVideo.description || '',
        audio_url: enrichedVideo.video_url || `https://www.youtube.com/watch?v=${videoId}`,
        duration: enrichedVideo.duration_formatted || '',
        published_at: enrichedVideo.published_at || enrichedVideo.upload_date || '',
        is_followed: false,
        episode_image: enrichedVideo.coverImage || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        episode_number: '',
        season: '',
        explicit: false,
        keywords: '',
        podcast_name: enrichedVideo.channel?.name,
        podcast_img: enrichedVideo.coverImage || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      }],
      categories: enrichedVideo.category ? [enrichedVideo.category] : [],
      language: 'en',
      websiteUrl: enrichedVideo.video_url || `https://www.youtube.com/watch?v=${videoId}`,
      feedUrl: enrichedVideo.video_url || `https://www.youtube.com/watch?v=${videoId}`
    };

    return video;
  } catch (error) {
    console.error('Error fetching YouTube video details:', error);
    // Return a minimal video object even on complete failure
    return {
      id: videoId,
      type: 'youtube',
      title: "",
      author: '',
      description: '',
      coverImage: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      duration: '',
      published_at: '',
      view_count: 0,
      like_count: 0,
      channel_id: '',
      channel_name: '',
      video_url: `https://www.youtube.com/watch?v=${videoId}`,
      embed_url: `https://www.youtube.com/embed/${videoId}`,
      transcript_available: false,
      transcript: '',
      episodeCount: 1,
      episodes: [{
        id: videoId,
        type: 'youtube',
        channel_id: videoId,
        title: "",
        description: '',
        audio_url: `https://www.youtube.com/watch?v=${videoId}`,
        duration: '',
        published_at: '',
        is_followed: false,
        episode_image: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        episode_number: '',
        season: '',
        explicit: false,
        keywords: '',
        podcast_name: '',
        podcast_img: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      }],
      categories: [],
      language: 'en',
      websiteUrl: `https://www.youtube.com/watch?v=${videoId}`,
      feedUrl: `https://www.youtube.com/watch?v=${videoId}`
    };
  }
}

async function getPodcastDetails(podcastId: string) {
  try {
    const response = await fetch(
      `https://itunes.apple.com/lookup?id=${podcastId}&entity=podcast&limit=1`
    );
    
    if (!response.ok) {
      toast({
        title: "Error",
        description: "iTunes search failed",
        //variant: "destructive",
      });
    }
    
    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      return null;
    }
    
    const podcast = data.results[0];
    const feedUrl = podcast.feedUrl;
    
    // Fetch and parse RSS feed to get episodes
    // Define interfaces for episodes
    interface Episode {
      id: string;
      channel_id: string;
      title: string;
      description: string;
      audio_url: string;
      duration: string;
      published_at: string;
      is_followed: boolean;
      episode_image?: string;
      episode_number?: string;
      season?: string;
      explicit?: boolean;
      keywords?: string;
      podcast_name?: string;
      podcast_img?: string;
    }
    
    let episodes: Episode[] = [];
    let channelImage = podcast.artworkUrl600 || podcast.artworkUrl100;
    let channelTitle = podcast.trackName;
    let channelDescription = '';
    let channelCategories: string[] = [];
    let channelLanguage = 'en';
    
    if (feedUrl) {
      try {
        const rssResponse = await fetch(feedUrl);
        if (!rssResponse.ok) {
          toast({
            title: "Error",
            description: "Failed to fetch RSS feed",
            //variant: "destructive",
          });
        }
        const rssText = await rssResponse.text();
        
        const parsed = await parseStringPromise(rssText, { explicitArray: false });

        const channel = parsed.rss.channel;
        channelTitle = channel.title || '';
        channelDescription = stripHtml(channel.description) || '';
        channelImage = channel.image?.url || channel['itunes:image']?.$.href || '';
        channelLanguage = channel.language || 'en';
        channelCategories = Array.isArray(channel['itunes:category'])
          ? channel['itunes:category'].map((cat: any) => cat?.$.text || '')
          : [channel['itunes:category']?.$.text || ''];

        const items = Array.isArray(channel.item) ? channel.item : [channel.item];

        episodes = items.map((item: any, index: number) => {
          const description = item.description || item['itunes:summary'] || item['content:encoded'] || '';
          const enclosureUrl = item.enclosure?.$.url || '';
          const guid = (item.guid?._ || item.guid || '').replace(/[\/\?\:\=]/g, '');

          return {
            id: `${guid}`,
            type:'apple',
            channel_id: podcastId,
            title: item.title || '',
            description: stripHtml(description),
            audio_url: enclosureUrl,
            duration: formatDuration(item['itunes:duration'] || item.duration || ''),
            published_at: formatDate(item.pubDate),
            is_followed: false,
            episode_image: item['itunes:image']?.$.href || item.image || channelImage,
            episode_number: item['itunes:episode'] || '',
            season: item['itunes:season'] || '',
            explicit: item['itunes:explicit'] === 'yes',
            keywords: item['itunes:keywords'] || '',
            podcast_name: channelTitle,
            podcast_img: channelImage
          };
        });
      } catch (rssError) {
        console.error('Error parsing RSS feed:', rssError);
      }
    }
    
    return {
      id: podcast.trackId.toString(),
      type:'apple',
      title: podcast.trackName,
      author: podcast.artistName,
      description: channelDescription,
      coverImage: podcast.artworkUrl600 || podcast.artworkUrl100,
      episodeCount: podcast.trackCount || episodes.length || 0,
      episodes: episodes,
      categories: channelCategories,
      language: channelLanguage,
      websiteUrl: podcast.collectionViewUrl || '',
      feedUrl: feedUrl || ''
    };
  } catch (error) {
    console.error('Error fetching podcast details:', error);
    return null;
  }
}

// Helper function to strip HTML tags from description
function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>?/gm, ' ');
}

function formatDuration(duration: string | number): string {
  if (!duration) return '';
  
  // If already formatted as HH:MM:SS or MM:SS
  if (typeof duration === 'string' && duration.includes(':')) return duration;
  
  // Convert seconds to HH:MM:SS
  const seconds = parseInt(String(duration), 10);
  if (isNaN(seconds)) return String(duration);
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}


// Helper function to format date
function formatDate(dateString: string): string {
  if (!dateString) return new Date().toISOString();
  
  try {
    const date = new Date(dateString);
    return date.toISOString();
  } catch (e) {
    return new Date().toISOString();
  }
}