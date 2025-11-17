'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Heart, HeartOff, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Clock, Calendar, Menu, User, Headphones } from 'lucide-react';
import { useAuth } from "@/lib/auth";
import { toast } from '@/components/ui/use-toast';
import Loading from './loading';
import { useTranslation } from 'react-i18next';
import React from 'react';
import { supabase } from '@/lib/supabase';

interface PodcastChannel {
  id: string;
  type: string;
  title: string;
  author: string;
  description: string;
  cover_image: string;
  episode_count?: number;
  created_at?: string;
}

interface PodcastEpisode {
  id: string;
  type: string;
  channel_id: string;
  title: string;
  description: string;
  audio_url: string;
  duration: string;
  published_at: string;
  is_followed?: boolean;
  episode_image?: string;
}
interface ItunesEpisode {
  id: number;
  type: string,
  title: string;
  description?: string;
  audio_url?: string;
  duration?: string;
  published_at?: string;
  episode_image?: string;
}

export default function PodcastDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [channel, setChannel] = useState<PodcastChannel | null>(null);
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFollowed, setIsFollowed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const auth = useAuth();
  const user = auth?.user;
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [episodesPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEpisodes, setTotalEpisodes] = useState(0);
  const [dataSource, setDataSource] = useState<'database' | 'apple' | null>(null);
  const { t, i18n } = useTranslation();

  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [expandedEpisodeId, setExpandedEpisodeId] = useState<string | null>(null);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.matchMedia('(max-width: 640px)').matches);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch podcast details
  const fetchPodcastDetails = async () => {
    const { id } = await params;
    const paramId = id;
    const searchParams = new URLSearchParams(window.location.search);
    console.log("searchParams",searchParams);
    const type = searchParams.get('type') || 'apple';
    console.log("type",type);

    setLoading(true);
    let podcastData = null;
    let response = null;
      
    try {
      response = await fetch(`/api/podcast/detail?id=${paramId}`);
      const dbData = await response.json();
      if (dbData && !dbData.error) {
        podcastData = {
          title: dbData.title,
          author: dbData.itunes_author,
          description: dbData.description,
          coverImage: dbData.image || dbData.itunes_image,
          episodeCount: dbData.items || 0,
          source: 'database'
        };
      }else{
        response = await fetch(`/api/media/itunes/get?id=${paramId}&type=${type}`);
        podcastData = await response.json();
        if(podcastData) {
          podcastData.source = 'apple';
        }
      }

      if (podcastData) {
        setChannel({
          id: paramId,
          type: type || '',
          title: podcastData.title,
          author: podcastData.author,
          description: podcastData.description || '',
          cover_image: podcastData.coverImage || '',
          episode_count: podcastData.episodeCount || 0
        });
        
        if (podcastData.source === 'database') {
          await fetchEpisodesFromDatabase(paramId);
        } else {
          if (podcastData.episodes && podcastData.episodes.length > 0) {
            setEpisodes(podcastData.episodes.map((ep: ItunesEpisode) => ({
              id: ep.id.toString(),
              channel_id: paramId,
              type: type || '',
              title: ep.title,
              description: ep.description || '',
              audio_url: ep.audio_url || '',
              duration: ep.duration || '',
              published_at: ep.published_at || new Date().toISOString(),
              is_followed: false,
              episode_image: ep.episode_image || '',
            })));
            
            // Set pagination info for Apple API data source
            setDataSource('apple');
            setTotalEpisodes(podcastData.episodes.length);
            setTotalPages(Math.ceil(podcastData.episodes.length / episodesPerPage));
            setCurrentPage(1);
          }
        }
      }else{
        toast({
          title: t('podcast.operationFailed'),
          description: t('podcast.itunesIdNotFound'),
        });
      }
    } catch (dbError) {
      console.log("Database fetch failed, will try Apple API:", dbError);
    } finally {
      setLoading(false);
    }
      
    // Update score
    if (user?.id) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          console.error('No session found');
          return;
        }

        // Update score
        const response = await fetch('/api/feed/update', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            podcastId: paramId,
            actionType: 1, // 1: 打开播客
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          console.error('Failed to update feed score:', {
            status: response.status,
            statusText: response.statusText,
            error: data.error,
            details: data.details
          });
        } else {
          console.log('Feed score updated successfully:', data);
        }
      } catch (error) {
        console.error('Error updating feed score:', error);
      }
    }
  }

  const fetchEpisodesFromDatabase = async (podcastId: string, page: number = 1) => {
    try {
      const response = await fetch(`/api/podcast/episodes?podcastId=${podcastId}&page=${page}&limit=10`);
      const data = await response.json();
      
      if (data.episodes) {
        const formattedEpisodes = data.episodes.map((ep: any) => ({
          id: ep.id.toString(),
          channel_id: podcastId,
          type: 'apple',
          title: ep.title,
          description: ep.description || '',
          audio_url: ep.audio_url || '',
          duration: ep.duration || '',
          published_at: ep.published_at || new Date().toISOString(),
          is_followed: false,
          episode_image: ep.episode_image || '',
        }));
        
        setEpisodes(formattedEpisodes);
        setDataSource('database');
        
        // 设置分页信息
        if (data.pagination) {
          setTotalPages(data.pagination.totalPages);
          setTotalEpisodes(data.pagination.total);
          setCurrentPage(data.pagination.page);
        }
        
        console.log('Episodes loaded from database:', data.pagination);
      }
    } catch (error) {
      console.error('Error fetching episodes from database:', error);
    }
  }

  // Handle follow toggle
  const handleFollowToggle = async () => {
    if (!channel) return;
    setIsFollowed(!isFollowed);
    
    try {
      if (!user?.id) return;
      setIsFollowed(!isFollowed);
      
      const response = await fetch('/api/favorites', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 1,
          platform: channel.type,
          userId: user.id,
          dataId: channel.id,
          isFollowed: isFollowed,
          title: channel.title,
          img: channel.cover_image,
          url: '',
          description: channel.description
        }),
      });

    } catch (error) {
      toast({
        title: t('podcast.operationFailed'),
        description: t('podcast.updateFavoriteFailed'),
      });
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const locale = i18n.language === 'zh' ? 'zh-CN' : 'en-US';
    return date.toLocaleDateString(locale, { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  // Calculate pagination values
  const indexOfLastEpisode = currentPage * episodesPerPage;
  const indexOfFirstEpisode = indexOfLastEpisode - episodesPerPage;
  const currentEpisodes = episodes.slice(indexOfFirstEpisode, indexOfLastEpisode);

  // 根据数据源决定显示的episodes
  const displayEpisodes = dataSource === 'database' ? episodes : currentEpisodes;

  // Function to change page
  const paginate = async (pageNumber: number) => {
    if (pageNumber > 0 && pageNumber <= totalPages) {
      setCurrentPage(pageNumber);
      
      // 如果是数据库数据源，需要重新获取数据
      if (dataSource === 'database' && channel) {
        setLoading(true); // 添加加载状态
        try {
          await fetchEpisodesFromDatabase(channel.id, pageNumber);
        } finally {
          setLoading(false);
        }
      }
    }
  };

  const handleEpisodeClick = async (episodeId: string, type: string) => {
    try {
      if (user && channel) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          await fetch('/api/feed/update', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
              podcastId: channel.id,
              actionType: 2, // 2: 点击进入播客的单集
            }),
          });
        }
      }
      // 跳转到单集详情页
      router.push(`/episode/${channel?.id}/${episodeId}/${type}`);
    } catch (error) {
      console.error('Error handling episode click:', error);
      toast({
        title: t('podcast.operationFailed'),
        description: t('podcast.navigationFailed'),
        //variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchPodcastDetails();
  }, [params]);


  useEffect(() => {
    const checkFollowStatus = async () => {
      if (user?.id && auth?.session?.access_token) {
        try {
          const { id } = await params;
          console.log("id", id);
          
          const response = await fetch(`/api/favorites?type=1&dataId=${id}&userId=${user.id}`, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${auth.session.access_token}`
            },
          });
          
          if (response.ok) {
            const data = await response.json();
            setIsFollowed(!!data.isFollowed);
          } else {
            console.error('Failed to fetch follow status:', response.status);
          }
        } catch (error) {
          console.error('Error checking follow status:', error);
        }
      }
    };

    checkFollowStatus();
  }, [user?.id, auth?.session?.access_token, params]);

  if (loading) {
    return <Loading />
  }

  if (!channel) {
    return (
      <div className="container mx-auto py-10 text-center">
        <p>{t('podcast.notFound')}</p>
      </div>
    );
  }

  return (
    <div className="w-full px-2 sm:px-4 py-4 sm:py-8">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6 mb-4 sm:mb-8">
        {/* Left side - Cover Image */}
        <div className="md:col-span-4 lg:col-span-3">
          <div className="relative aspect-square rounded-xl overflow-hidden shadow-md group">
            <img 
              src={channel.cover_image} 
              alt={channel.title} 
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </div>
        </div>
        
        {/* Right side - Content */}
        <div className="md:col-span-8 lg:col-span-9">
          <div className="flex flex-col h-full justify-between">
            <div className="space-y-2 sm:space-y-3">
              
              
              {/* Channel title */}
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight line-clamp-2">
                {channel.title}
              </h1>
              {/* Channel info and metadata */}
              <div className="flex flex-wrap items-center text-xs sm:text-sm text-muted-foreground gap-x-3 sm:gap-x-4 gap-y-1 sm:gap-y-2">
                <div className="flex items-center">
                  <User className="h-4 w-4 mr-1.5" />
                  <span className="font-medium">{channel.author}</span>
                </div>
                {channel.episode_count && (
                  <div className="flex items-center">
                    <Headphones className="h-4 w-4 mr-1.5" />
                    {t('podcast.episodeCount', { count: channel.episode_count })}
                  </div>
                )}
              </div>
              
              {/* Description */}
              <div className="relative mt-1">
                <p className={`text-muted-foreground text-xs sm:text-sm leading-relaxed ${isDescriptionExpanded ? '' : 'line-clamp-3 md:line-clamp-none'}`}>
                  {channel.description}
                </p>
                {channel.description && channel.description.length > 100 && (
                  <button
                    onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                    className="md:hidden mt-1 text-xs text-gray-500 hover:text-gray-700 flex items-center"
                  >
                    {isDescriptionExpanded ? (
                      <>
                        {t('Show less')} <ChevronUp className="h-3 w-3 ml-1" />
                      </>
                    ) : (
                      <>
                        {t('Show more')} <ChevronDown className="h-3 w-3 ml-1" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
            
            {/* Follow button */}
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center space-x-2">
              </div>
              <Button 
                onClick={handleFollowToggle} 
                variant={isFollowed ? "outline" : "default"} 
                className="md:min-w-[110px] border-1 border-gray-200 shadow-sm hover:shadow-md transition-all"
                disabled={loading}
              >
                {isFollowed ? 
                  <Heart className="h-4 w-4 mr-2 text-red-500" /> : 
                  <Heart className="h-4 w-4 mr-2" />
                }
                {loading ? t('podcast.updating') : isFollowed ? t('podcast.unfollow') : t('podcast.follow')}
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Episodes List */}
      <div className="mt-4 sm:mt-6">
        <h2 className="text-lg sm:text-2xl font-semibold mb-3 sm:mb-4">{t('podcast.episodesTitle')}</h2>
        
        {/* Mobile Version */}
        <div className="md:hidden">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="w-full">
                <Table>
                  <TableHeader className="hidden sm:table-header-group">
                    <TableRow>
                      <TableHead className="w-[85%]">{t('podcast.tableTitle')}</TableHead>
                      <TableHead className="w-[15%] text-right pr-4">{t('podcast.tableActions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayEpisodes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center py-6 text-gray-500">
                          {t('podcast.noEpisodesAvailable')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      displayEpisodes.map((episode) => (
                        <React.Fragment key={episode.id}>
                          <TableRow className="group">
                            <TableCell className="py-2 px-2 sm:px-4 max-w-0">
                              <div className="flex items-center space-x-2 sm:space-x-3 w-full">
                                <div className="relative w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0 rounded-md overflow-hidden">
                                  <a href={`/episode/${channel.id}/${episode.id}/${episode.type}`} className="block">
                                    <img
                                      src={episode.episode_image || channel.cover_image}
                                      alt={episode.title}
                                      className="object-cover w-full h-full"
                                      onError={(e) => {
                                        e.currentTarget.src = channel.cover_image;
                                      }}
                                    />
                                  </a>
                                </div>
                                <div className="flex-1 min-w-0 flex items-center">
                                  <a
                                    href={`/episode/${channel.id}/${episode.id}/${episode.type}`}
                                    className="font-medium hover:text-blue-600 truncate text-xs sm:text-sm flex-1 min-w-0 pr-2"
                                  >
                                    {episode.title}
                                  </a>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setExpandedEpisodeId(expandedEpisodeId === episode.id ? null : episode.id)}
                                    className="p-0 h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0 group"
                                    title={episode.title}
                                  >
                                    {expandedEpisodeId === episode.id ? (
                                      <ChevronUp className="h-4 w-4" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                          {expandedEpisodeId === episode.id && (
                            <TableRow>
                              <TableCell colSpan={2} className="px-2 sm:px-4 py-2 bg-gray-50">
                                <div className="text-xs sm:text-sm text-gray-600">
                                  {episode.description}
                                </div>
                                <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                                  <div className="flex items-center">
                                    <Clock className="h-3 w-3 mr-1" />
                                    {episode.duration}
                                  </div>
                                  <div className="flex items-center">
                                    <Calendar className="h-3 w-3 mr-1" />
                                    <time dateTime={new Date(episode.published_at).toISOString()}>{formatDate(episode.published_at)}</time>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      ))
                    )}
                  </TableBody>
                </Table>

                {/* Mobile Pagination Controls */}
                {episodes.length > 0 && (
                  <div className="flex items-center justify-between px-4 py-4 border-t">
                    <div className="text-xs text-gray-500">
                      {t('podcast.showingEpisodes', {
                        start: indexOfFirstEpisode + 1,
                        end: Math.min(indexOfLastEpisode, episodes.length),
                        total: episodes.length
                      })}
                    </div>
                    <div className="flex space-x-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => paginate(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="h-7 w-7 p-0"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>

                      {/* Page numbers display */}
                      <div className="flex items-center space-x-1">
                        {Array.from({ length: Math.min(3, totalPages) }).map((_, idx) => {
                          let pageNum;
                          if (totalPages <= 3) {
                            pageNum = idx + 1;
                          } else if (currentPage <= 2) {
                            pageNum = idx + 1;
                          } else if (currentPage >= totalPages - 1) {
                            pageNum = totalPages - 2 + idx;
                          } else {
                            pageNum = currentPage - 1 + idx;
                          }

                          return (
                            <Button
                              key={pageNum}
                              variant={currentPage === pageNum ? "default" : "outline"}
                              size="sm"
                              onClick={() => paginate(pageNum)}
                              className="h-7 w-7 p-0 text-xs"
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => paginate(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="h-7 w-7 p-0"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Desktop Version */}
        <div className="hidden md:block">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[75%]">{t('podcast.tableTitle')}</TableHead>
                    <TableHead className="w-[10%]">{t('podcast.tableDuration')}</TableHead>
                    <TableHead className="w-[15%]">{t('podcast.tablePublished')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayEpisodes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-gray-500">
                        {t('podcast.noEpisodesAvailable')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayEpisodes.map((episode) => (
                      <TableRow key={episode.id}>
                        <TableCell className="max-w-0 w-[75%]">
                          <div className="flex items-center space-x-4">
                            <div className="relative w-16 h-16 rounded overflow-hidden">
                              <a href={`/episode/${channel.id}/${episode.id}/${episode.type}`} className="block">
                                <img
                                  src={episode.episode_image || channel.cover_image}
                                  alt={episode.title}
                                  className="object-cover w-full h-full"
                                  onError={(e) => {
                                    e.currentTarget.src = channel.cover_image;
                                  }}
                                />
                              </a>
                            </div>
                            <div className="min-w-0 flex-1 overflow-hidden">
                              <a
                                href={`/episode/${channel.id}/${episode.id}/${episode.type}`}
                                className="font-medium hover:text-blue-600 truncate block"
                              >
                                {episode.title}
                              </a>
                              <div className="relative">
                                <div className={`text-sm text-gray-500 ${expandedEpisodeId === episode.id ? '' : 'line-clamp-1'}`}>
                                  {episode.description}
                                </div>
                                {episode.description && episode.description.length > 100 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedEpisodeId(expandedEpisodeId === episode.id ? null : episode.id);
                                    }}
                                    className="mt-1 text-xs text-gray-500 hover:text-gray-700 flex items-center"
                                  >
                                    {expandedEpisodeId === episode.id ? (
                                      <>
                                        {t('Show less')} <ChevronUp className="h-3 w-3 ml-1" />
                                      </>
                                    ) : (
                                      <>
                                        {t('Show more')} <ChevronDown className="h-3 w-3 ml-1" />
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="w-[10%]">{episode.duration}</TableCell>
                        <TableCell className="w-[15%]">{formatDate(episode.published_at)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Pagination Controls */}
              {(episodes.length > 0 || (dataSource === 'database' && totalEpisodes > 0)) && (
                <div className="flex items-center justify-between px-4 py-4 border-t">
                  <div className="text-sm text-gray-500">
                    {dataSource === 'database' ? (
                      // 数据库模式：显示当前页的episodes范围
                      `${t('podcast.showingEpisodes', {
                        start: (currentPage - 1) * episodesPerPage + 1,
                        end: Math.min(currentPage * episodesPerPage, totalEpisodes),
                        total: totalEpisodes
                      })}`
                    ) : (
                      // Apple API模式：显示前端分页信息
                      `${t('podcast.showingEpisodes', {
                        start: indexOfFirstEpisode + 1,
                        end: Math.min(indexOfLastEpisode, episodes.length),
                        total: episodes.length
                      })}`
                    )}
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => paginate(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>

                    {/* Page numbers display */}
                    <div className="flex items-center space-x-1">
                      {Array.from({ length: Math.min(5, totalPages) }).map((_, idx) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = idx + 1;
                        } else if (currentPage <= 3) {
                          pageNum = idx + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + idx;
                        } else {
                          pageNum = currentPage - 2 + idx;
                        }

                        return (
                          <Button
                            key={pageNum}
                            variant={currentPage === pageNum ? "default" : "outline"}
                            size="sm"
                            onClick={() => paginate(pageNum)}
                            className="w-8 h-8 p-0"
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>

                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => paginate(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}