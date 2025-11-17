'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import EpisodeHeader from '../../[...id]/_components/EpisodeHeader';
import EpisodeContent from '../../[...id]/_components/EpisodeContent';
import { EpisodeData } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { useTranslation } from 'react-i18next';
import Loading from '../../[...id]/loading';

export default function YouTubeEpisodeDetailPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useParams();
  
  const videoId = params?.id as string;
  const [loading, setLoading] = useState(true);
  const [episode, setEpisode] = useState<EpisodeData | null>(null);
  const auth = useAuth();
  const user = auth?.user;

  useEffect(() => {
    async function fetchEpisodeData() {
      if (!videoId) return;
      
      try {
        setLoading(true);
        
        // Get YouTube video data
        const response = await fetch(`/api/media/itunes/get?id=${videoId}&type=youtube`);
        const videoData = await response.json();

        // print debug info of videoData
        console.log('Fetched YouTube videoData:', videoData);
        
        if (videoData.error) {
          console.error('Error fetching video data:', videoData.error);
          setEpisode(null);
          return;
        }

        // Transform YouTube video data to match EpisodeData structure
        setEpisode({
          id: videoData.id || '',
          type: 'youtube',
          podcast_id: videoData.channel_id || '',
          podcast_name: videoData.channel_name || '',
          podcast_img: videoData.coverImage || '',
          status: 1,
          title: videoData.title || '',
          description: videoData.description || '',
          pub_date: videoData.published_at || '',
          author: videoData.author || '',
          enclosure_length: videoData.duration || '',
          enclosure_type: 'video/mp4',
          enclosure_url: videoData.video_url || '',
          itunes_image: videoData.coverImage || '',
          itunes_duration: videoData.duration || '',
          transcript_available: videoData.transcript_available || false,
          transcript: videoData.transcript || '',
          audio_url: videoData.video_url || '',
        });

      } catch (error) {
        console.error('Exception fetching YouTube video data:', error);
        setEpisode(null);
      } finally {
        setLoading(false);
      }
    }
    fetchEpisodeData();
  }, [videoId]);

  useEffect(() => {
    async function checkUserSummaryExists() {
      if (!videoId) return;
      
      try {
        const summaryData = {
          userId: user?.id,
          dataId: episode?.id,
          dataType: 1, // 1 for summary, 2 for transcript
          userName: user?.user_metadata?.full_name || user?.email || 'Guest',
          userEmail: user?.email || '',
          showTitle: episode?.podcast_name || '',
          episodeTitle: episode?.title || '',
          episodeDuration: episode?.itunes_duration || '',
          episodePubDate: episode?.pub_date || '',
          source: 'YouTube',
        };

        const response = await fetch('/api/episode/summary/status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${auth?.session?.access_token}`,
          },
          body: JSON.stringify(summaryData),
        });

        if (response.ok) {
          const data = await response.json();
          console.log('Summary status response:', data);
        }
      } catch (error) {
        console.error('Error checking summary status:', error);
      }
    }

    // Align with Apple/XYZ: send even if not logged in
    if (episode) {
      checkUserSummaryExists();
    }
  }, [episode, auth?.session?.access_token, user?.id, videoId]);

  if (loading) {
    return <Loading />;
  }

  if (!episode) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Video Not Found</h1>
          <p className="text-gray-600 mb-4">The YouTube video could not be loaded.</p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <>
        <EpisodeHeader episodeData={episode} type="youtube" />
        <EpisodeContent episodeId={episode.id} episodeData={episode} type="youtube" />
      </>
    </div>
  );
}
