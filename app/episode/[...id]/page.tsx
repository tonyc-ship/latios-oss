'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import EpisodeHeader from './_components/EpisodeHeader';
import EpisodeContent from './_components/EpisodeContent';
import { EpisodeData } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { useTranslation } from 'react-i18next';
import Loading from './loading';
import AskAIChat from './_components/AskAIChat';

export default function EpisodeDetailPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useParams();
  
  const idParams = (params?.id as string[]) || [];
  const [podcastId, episodeId, type] = idParams;
  let platform = type || 'apple';
  const [loading, setLoading] = useState(true);
  const [episode, setEpisode] = useState<EpisodeData | null>(null);
  const auth = useAuth();
  const user = auth?.user;

  useEffect(() => {
    async function fetchEpisodeData() {
      if (!episodeId) return;
      
      try {
        setLoading(true);
        
        // 首先尝试从数据库获取episode数据
        const episodeResponse = await fetch(`/api/episode/${episodeId}`);
        if (episodeResponse.ok) {
          const episodeData = await episodeResponse.json();
          setEpisode({
            ...episodeData,
            id: episodeData?.id || '',
            type: platform || '',
            podcast_id: episodeData?.podcast_id || '',
            podcast_name: episodeData?.podcast_name || '',
            podcast_img: episodeData?.podcast_img || '',
            status: episodeData?.status || 1,
            title: episodeData?.title || '',
            description: episodeData?.description || '',
            pub_date: episodeData?.pub_date || '',
            author: episodeData?.author || '',
            enclosure_length: episodeData?.enclosure_length || '',
            enclosure_type: episodeData?.enclosure_type || '',
            enclosure_url: episodeData?.enclosure_url || '',
            itunes_image: episodeData?.itunes_image || '',
            itunes_duration: episodeData?.itunes_duration || '',
          });
          return;
        }
        
        // 如果数据库中没有找到，尝试从iTunes API获取
        if (podcastId) {
          const response = await fetch(`/api/media/itunes/get?id=${podcastId}&type=${platform}&episodeId=${episodeId}`);
          const podcastData = await response.json();
          
          // If episodeId is provided, find the specific episode in the episodes array
          let episodeData = podcastData;
          if (episodeId && podcastData?.episodes && Array.isArray(podcastData.episodes)) {
            const foundEpisode = podcastData.episodes.find((ep: any) => ep.id === episodeId);
            if (foundEpisode) {
              console.log('[EpisodePage] Found episode in episodes array:', foundEpisode);
              episodeData = foundEpisode;
              // Merge podcast-level data with episode data
              episodeData = {
                ...foundEpisode,
                podcast_name: foundEpisode.podcast_name || podcastData.title,
                podcast_img: foundEpisode.podcast_img || foundEpisode.episode_image || podcastData.coverImage,
              };
            } else {
              console.warn('[EpisodePage] Episode not found in episodes array, using podcast data');
            }
          }
          
          const processedEpisode = {
            ...episodeData,
            id: episodeData?.id || episodeId || '',
            type: platform || '',
            podcast_id: episodeData?.channel_id || podcastId || '',
            podcast_name: episodeData?.podcast_name || podcastData?.title || '',
            podcast_img: episodeData?.podcast_img || episodeData?.episode_image || podcastData?.coverImage || '',
            status: 1,
            title: episodeData?.title || podcastData?.title || '',
            description: episodeData?.description || podcastData?.description || '',
            pub_date: episodeData?.published_at || '',
            author: episodeData?.author || podcastData?.author || '',
            enclosure_length: episodeData?.duration || '',
            enclosure_type: episodeData?.enclosure_type || '',
            enclosure_url: episodeData?.audio_url || '',
            itunes_image: episodeData?.episode_image || episodeData?.podcast_img || podcastData?.coverImage || '',
            itunes_duration: episodeData?.duration || '',
          };
          setEpisode(processedEpisode);
        }

      } catch (error) {
        console.error('Exception fetching data:', error);
        setEpisode(null);
      } finally {
        setLoading(false);
      }
    }
    fetchEpisodeData();
  }, [episodeId, podcastId, platform]);


useEffect(() => {
  async function checkUserSummaryExists() {
    if (!episodeId) return;
    
    try {
      const summaryData = {
        userId: user?.id,
        dataId: episode?.id,
        dataType: 1, // 1 for summary, 2 for transcript
        userName: user?.user_metadata?.full_name || user?.user_metadata?.name || '',
        userEmail: user?.email,
        showTitle: episode?.podcast_name,
        episodeTitle: episode?.title,
        episodeDuration: episode?.itunes_duration,
        episodePubDate: episode?.pub_date,
        source: (episode?.type === 'xyz' ? '小宇宙' : (episode?.type === 'youtube' ? 'YouTube' : 'Apple Podcast')),
      }
      // console.log('summaryData: ', summaryData);
      await fetch(`/api/episode/summary/status`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${auth?.session?.access_token}`,
        },
        body: JSON.stringify(summaryData),
      });

    } catch (error) {
      console.error('Error setting summary ref:', error);
    }

    if(user?.id) {
      try {
        fetch('/api/history', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${auth?.session?.access_token}`,
          },
          body: JSON.stringify({
            userId: user?.id,
            episodeId: episode?.id,
            podcastId: episode?.podcast_id,
            platform: episode?.type,
            title: episode?.title,
            img: episode?.itunes_image || episode?.podcast_img,
            podcastName: episode?.podcast_name,
            description: episode?.description,
            url: episode?.enclosure_url,
          }),
        });
      } catch (error) {
        console.error('Error getting summary:', error);
      }
    }
  }
  checkUserSummaryExists();
}, [user, episode]);

  if (loading) {
    return <Loading />
  }

  return (
    <>
    {!episode ? (
      <div className="text-center py-10">
        <p className="text-lg text-muted-foreground">{t('episode.notFound')}</p>
      </div>
    ) : ( 
      <>
        <EpisodeHeader
          episodeData={episode}
          onLoadingChange={() => {}}
          type={type}
        />
        
        <EpisodeContent 
          episodeId={episodeId}
          loading={false}
          episodeData={episode}
          type={platform}
        />
        {/* Floating Ask AI chat widget */}
        {episodeId && <AskAIChat episodeId={episodeId} />}
      </>
    )}
    </>
  );
} 
