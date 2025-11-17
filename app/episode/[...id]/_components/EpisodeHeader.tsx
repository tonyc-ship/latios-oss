'use client'
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  ArrowLeft,
  Clock,
  Calendar,
  User,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Skeleton } from '@/components/ui/skeleton';
import { EpisodeData } from '@/lib/types';
import { useTranslation } from 'react-i18next';

interface EpisodeHeaderProps {
  episodeData?: EpisodeData;
  onLoadingChange?: (loading: boolean) => void;
  type: string;
}

export default function EpisodeHeader({ episodeData, onLoadingChange, type }: EpisodeHeaderProps) {
  const router = useRouter();
  const auth = useAuth();
  const user = auth?.user;
  const [episode, setEpisode] = useState<EpisodeData | null>(episodeData || null);
  const [loading, setLoading] = useState(!episodeData);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isDescriptionOverflowing, setIsDescriptionOverflowing] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
      setEpisode(episodeData || null);
      setLoading(false);
      onLoadingChange?.(false);
  }, [episodeData, user]);

  // 检查描述是否溢出
  useEffect(() => {
    if (episode?.description) {
      const checkOverflow = () => {
        const descriptionElement = document.querySelector('.episode-description');
        if (descriptionElement) {
          const lineHeight = parseInt(window.getComputedStyle(descriptionElement).lineHeight);
          const maxLines = window.innerWidth >= 768 ? 4 : 3; // md:line-clamp-4, line-clamp-3
          const maxHeight = lineHeight * maxLines;
          setIsDescriptionOverflowing(descriptionElement.scrollHeight > maxHeight);
        }
      };

      // 延迟检查，确保DOM已更新
      setTimeout(checkOverflow, 100);
      window.addEventListener('resize', checkOverflow);

      return () => window.removeEventListener('resize', checkOverflow);
    }
  }, [episode?.description]);

  
  // 格式化日期
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  if (loading) {
    return (
        <Skeleton />
    );
  }

  if (!episode) {
    return (
      <div className="text-center py-10">
        <p className="text-lg text-muted-foreground">{t('episode.notFound')}</p>
      </div>
    );
  }

  return (
    <>
      {/* Only show back button for non-YouTube content */}
      {/* {type !== 'youtube' && ( */}
        <div className="flex justify-between items-center mb-6">
          <Button 
            variant="ghost" 
            size="sm" 
            className="group flex items-center text-muted-foreground hover:text-foreground transition-colors bg-gray-100"
            // onClick={() => router.push(`/podcast/${episode.podcast_id}?type=${type}`)}
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
            {t('episode.goBack', { podcastName: episode.podcast_name || 'Podcast' })}
          </Button>
        </div>
      {/* )} */}
      
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-8">
        <div className="md:col-span-4 lg:col-span-3">
          <div className="relative aspect-square rounded-xl overflow-hidden shadow-md group">
            <img 
              src={episode.itunes_image || episode.podcast_img} 
              alt={episode.title} 
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </div>
        </div>
        
        <div className="md:col-span-8 lg:col-span-9">
          <div className="flex flex-col h-full justify-between">
            <div className="space-y-3">
              {/* Podcast info */}
              <div className="flex items-center">
                <a href={`/podcast/${episode.podcast_id}?type=${type}`} className="flex items-center hover:text-blue-600">
                  <Avatar className="h-8 h-8 mr-2">
                    <AvatarImage src={episode.podcast_img} />
                    <AvatarFallback>{episode.podcast_name?.[0]}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{episode.podcast_name}</span>
                </a>
              </div>
              
              {/* Episode title */}
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight line-clamp-2">{episode.title}</h1>
              
              {/* Episode metadata */}
              <div className="flex flex-wrap items-center text-sm text-muted-foreground gap-x-4 gap-y-2">
                <div className="flex items-center">
                  <Calendar className="h-4 w-4 mr-1.5" />
                  {formatDate(episode.pub_date)}
                </div>
                <div className="flex items-center">
                  <Clock className="h-4 w-4 mr-1.5" />
                  {episode.itunes_duration}
                </div>
                {episode.author && (
                  <div className="flex items-center cursor-pointer hover:text-blue-600" onClick={() => { if(episode.type !== 'xyz') {
                    window.open(episode.audio_url, '_blank')
                  } else {
                    window.open(episode.enclosure_url, '_blank')
                  } }} >
                    <User className="h-4 w-4 mr-1.5 "/>
                    {episode.author}
                  </div>
                )}
              </div>
              
              {/* Description */}
              <div className="space-y-2">
                <p 
                  className={`text-muted-foreground text-sm leading-relaxed episode-description ${
                    !isDescriptionExpanded ? 'line-clamp-3 md:line-clamp-4' : ''
                  }`}
                >
                  {episode.description}
                </p>
                {isDescriptionOverflowing && (
                  <button
                    onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                  >
                    {isDescriptionExpanded ? (
                      <>
                        {t('episode.showLess')} <ChevronUp className="h-3 w-3" />
                      </>
                    ) : (
                      <>
                        {t('episode.showMore')} <ChevronDown className="h-3 w-3" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
} 