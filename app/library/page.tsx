'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuth } from "@/lib/auth";
import { toast } from "@/components/ui/use-toast";
import { useTranslation } from 'react-i18next';
import Loading from './loading';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Calendar, List } from 'lucide-react';

interface Podcast {
  id: string;
  data_id: string;
  title: string;
  img: string;
  platform: string;
  type: number;
}

interface Episode {
  id: string;
  podcast_id: string;
  episode_id: string;
  title: string;
  img: string;
  url: string;
  description: string;
  create_time: string;
  platform: string;
}

interface GroupedEpisodes {
  date: string;
  episodes: Episode[];
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export default function LibraryPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const auth = useAuth();
  const user = auth?.user;

  // State management
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [groupedEpisodes, setGroupedEpisodes] = useState<GroupedEpisodes[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());
  
  // Pagination state
  const [currentPodcastPage, setCurrentPodcastPage] = useState(1);
  const [currentEpisodePage, setCurrentEpisodePage] = useState(1);
  const [podcastsPerPage] = useState(8);
  const [episodesPerPage] = useState(20);
  const [podcastPagination, setPodcastPagination] = useState<PaginationInfo | null>(null);
  const [episodePagination, setEpisodePagination] = useState<PaginationInfo | null>(null);
  const [loadingMoreEpisodes, setLoadingMoreEpisodes] = useState(false);


  // Data mapping utility function
  const mapPodcastData = (data: any[]): Podcast[] => {
    return data.map(item => ({
      id: item.id.toString(),
      data_id: item.data_id || item.id.toString(),
      title: item.title,
      img: item.img,
      platform: item.platform || '',
      type: item.type || 0
    }));
  };

  const mapEpisodeData = (data: any[]): Episode[] => {
    return data.map(item => ({
      id: item.id.toString(),
      podcast_id: item.podcast_id?.toString() || '',
      episode_id: item.episode_id?.toString() || '',
      title: item.title,
      img: item.img,
      url: item.url,
      description: item.description,
      create_time: item.create_time,
      platform: item.platform || ''
    }));
  };

  // Group episodes by date
  const groupEpisodesByDate = (episodes: Episode[]) => {
    const grouped: { [key: string]: Episode[] } = {};
    
    episodes.forEach(episode => {
      const date = new Date(episode.create_time);
      const dateKey = date.toLocaleDateString(i18n.language === 'zh' ? 'zh-CN' : 'en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(episode);
    });
    
    const sortedGroups = Object.entries(grouped)
      .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
      .map(([date, episodes]) => ({ date, episodes }));
    
    setGroupedEpisodes(sortedGroups);
  };

  // Fetch favorited podcasts
  const fetchPodcasts = async () => {
    if (!user) return;

    try {
      const response = await fetch(`/api/favorites?type=1&page=${currentPodcastPage}&limit=${podcastsPerPage}`, {
        headers: {
          'Authorization': `Bearer ${auth?.session?.access_token}`,
        },
      });
      const data = await response.json();
      
      if (data.data) {
        setPodcasts(mapPodcastData(data.data));
        setPodcastPagination(data.pagination);
      }
    } catch (error) {
      console.error('Error fetching podcasts:', error);
      toast({
        title: t('library.error'),
        description: t('library.fetchError'),
        variant: 'destructive',
      });
    }
  };

  // Fetch history records
  const fetchEpisodes = async (page: number = 1, append: boolean = false) => {
    if (!user) return;

    try {
      if (!append) {
        setLoading(true);
      }
      
      const response = await fetch(`/api/history?page=${page}&limit=${episodesPerPage}`, {
        headers: {
          'Authorization': `Bearer ${auth?.session?.access_token}`,
        },
      });
      const data = await response.json();
      
      if (data.data) {
        const newEpisodes = mapEpisodeData(data.data);
        
        if (append) {
          setEpisodes(prev => [...prev, ...newEpisodes]);
        } else {
          setEpisodes(newEpisodes);
        }
        
        setEpisodePagination(data.pagination);
        setCurrentEpisodePage(page);
        
        // Regroup
        const allEpisodes = append ? [...episodes, ...newEpisodes] : newEpisodes;
        groupEpisodesByDate(allEpisodes);
      }
    } catch (error) {
      console.error('Error fetching episodes:', error);
      toast({
        title: t('library.error'),
        description: t('library.fetchError'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // 加载更多episodes
  const loadMoreEpisodes = async () => {
    if (loadingMoreEpisodes || !episodePagination?.hasMore) return;
    
    setLoadingMoreEpisodes(true);
    try {
      await fetchEpisodes(currentEpisodePage + 1, true);
    } finally {
      setLoadingMoreEpisodes(false);
    }
  };

  // Podcast分页处理
  const handlePodcastPageChange = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && currentPodcastPage > 1) {
      setCurrentPodcastPage(currentPodcastPage - 1);
    } else if (direction === 'next' && podcastPagination?.hasMore) {
      setCurrentPodcastPage(currentPodcastPage + 1);
    }
  };

  // 导航函数
  const handleNavigateToPodcast = (podcast: Podcast) => {
    router.push(`/podcast/${podcast.data_id}?type=${podcast.platform}`);
  };
  
  const handleNavigateToEpisode = (podcastId: string, episodeId: string, platform: string) => {
    router.push(`/episode/${podcastId}/${episodeId}/${platform}`);
  };

  // 切换描述展开状态
  const toggleDescription = (episodeId: string) => {
    setExpandedDescriptions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(episodeId)) {
        newSet.delete(episodeId);
      } else {
        newSet.add(episodeId);
      }
      return newSet;
    });
  };

  // 监听语言变化，重新分组episodes
  useEffect(() => {
    if (episodes.length > 0) {
      groupEpisodesByDate(episodes);
    }
  }, [i18n.language, episodes.length]);

  // 初始数据加载
  useEffect(() => {
    if (user) {
      fetchPodcasts();
      fetchEpisodes();
    } else {
      // If no user, stop loading
      setLoading(false);
    }
  }, [user, currentPodcastPage]);

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="container mx-auto px-2 sm:px-6 md:px-8">
      {/* Podcasts Section */}
      <div className="mb-10">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">{t('library.channels')}</h2>
        </div>

        {podcasts.length === 0 ? (
          <div className="text-center py-6 bg-gray-50 rounded-lg">
            <p className="text-gray-500">{t('podcast.notFound')}</p>
          </div>
        ) : (
          <div className="relative">
            <div className="flex gap-6 overflow-x-auto pb-4">
              {podcasts.map((podcast) => (
                <div 
                  key={podcast.id} 
                  className="flex flex-col items-center min-w-max"
                  onClick={() => handleNavigateToPodcast(podcast)}
                >
                  <div className="relative w-20 h-20 rounded-full overflow-hidden cursor-pointer border-2 border-transparent hover:border-gray-300 transition-all">
                    <img
                      src={podcast.img}
                      alt={podcast.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="text-sm mt-2 text-center font-medium text-gray-800 max-w-[100px] truncate cursor-pointer">
                    {podcast.title}
                  </p>
                </div>
              ))}
            </div>
            
            {/* Podcast分页控制 */}
            {podcastPagination && podcastPagination.totalPages > 1 && (
              <div className="absolute bottom-0 right-0 flex items-center gap-2 bg-white/80 backdrop-blur-sm rounded-lg p-2 shadow-sm">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePodcastPageChange('prev')}
                  disabled={currentPodcastPage === 1}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-gray-600 min-w-[60px] text-center">
                  {currentPodcastPage} / {podcastPagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePodcastPageChange('next')}
                  disabled={!podcastPagination.hasMore}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Episodes Section */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">{t('library.allEpisodes')}</h2>
        </div>

        {episodes.length === 0 ? (
          <div className="text-center py-6 bg-gray-50 rounded-lg">
            <p className="text-gray-500">{t('podcast.noEpisodesAvailable')}</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="divide-y divide-gray-200">
              {groupedEpisodes.map((group, groupIndex) => (
                <div key={groupIndex} className="relative">
                  {/* 时间轴标题 */}
                  <div className="sticky top-0 bg-gray-50 px-4 py-3 border-b border-gray-200 z-10">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                      <Calendar className="h-4 w-4" />
                      {group.date}
                    </div>
                  </div>
                  
                  {/* 该日期的所有集数 */}
                  {group.episodes.map((episode) => (
                    <div key={episode.id} className="p-3 sm:p-4 hover:bg-gray-50">
                      <div className="flex gap-3 sm:gap-4 mb-2">
                        <img
                          src={episode.img}
                          alt={episode.title}
                          className="w-14 h-14 sm:w-16 sm:h-16 rounded object-cover flex-shrink-0 cursor-pointer"
                          onClick={() => handleNavigateToEpisode(episode.podcast_id, episode.episode_id, episode.platform)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="space-y-1">
                            <h3
                              className="font-medium sm:font-semibold cursor-pointer hover:text-blue-600 text-sm sm:text-base sm:truncate"
                              onClick={() => handleNavigateToEpisode(episode.podcast_id, episode.episode_id, episode.platform)}
                            >
                              {episode.title}
                            </h3>
                            <div className="relative">
                              <p className={`text-sm text-gray-500 ${expandedDescriptions.has(episode.id) ? '' : 'line-clamp-1'}`}>
                                {episode.description}
                              </p>
                              {episode.description && episode.description.length > 100 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleDescription(episode.id);
                                  }}
                                  className="mt-1 text-xs text-gray-500 hover:text-gray-700 flex items-center"
                                >
                                  {expandedDescriptions.has(episode.id) ? (
                                    <>
                                      {t('library.showLess')} <ChevronUp className="h-3 w-3 ml-1" />
                                    </>
                                  ) : (
                                    <>
                                      {t('library.showMore')} <ChevronDown className="h-3 w-3 ml-1" />
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              
              {/* 加载更多按钮 */}
              {episodePagination?.hasMore && (
                <div className="p-4 text-center border-t border-gray-200">
                  <Button
                    onClick={loadMoreEpisodes}
                    disabled={loadingMoreEpisodes}
                    variant="outline"
                    className="w-full sm:w-auto"
                  >
                    {loadingMoreEpisodes ? t('common.loading') : t('library.loadMore')}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
