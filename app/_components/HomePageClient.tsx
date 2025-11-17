'use client';

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, ChevronDown, ChevronUp, LayoutGrid } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { SearchAndImportBar } from "@/components/ui/search-and-import-bar";
import { useRouter } from "next/navigation";

interface EpisodeItem {
  guid: string;
  podcast_id: string;
  podcast_name: string;
  title: string;
  line_title: string;
  description: string;
  pub_date: string;
  author: string;
  itunes_image: string;
  itunes_duration: string;
  itunes_summary: string;
  itunes_subtitle: string;
  create_time: string;
  update_time: string;
  type: number;
  tbl_podcast?: {
    itunes_id: string;
    title: string;
    short_title: string;
    image: string;
    itunes_image: string;
  };
}

export default function HomePageClient() {
  const { t } = useTranslation();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('discover');
  const [discoverEpisodes, setDiscoverEpisodes] = useState<EpisodeItem[]>([]);
  const [followingEpisodes, setFollowingEpisodes] = useState<EpisodeItem[]>([]);
  const [discoverPage, setDiscoverPage] = useState(1);
  const [followingPage, setFollowingPage] = useState(1);
  const [hasMoreDiscover, setHasMoreDiscover] = useState(true);
  const [hasMoreFollowing, setHasMoreFollowing] = useState(true);
  const [loadingDiscover, setLoadingDiscover] = useState(false);
  const [loadingFollowing, setLoadingFollowing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [expandedTitles, setExpandedTitles] = useState<Set<string>>(new Set());
  const auth = useAuth();

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.matchMedia('(max-width: 768px)').matches);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const loadEpisodes = async (page: number = 1, append: boolean = false) => {
    try {
      setLoadingDiscover(true);
      const response = await fetch(`/api/dashboard?type=discover&page=${page}&limit=10`);
      const data = await response.json();
      if (data.data && data.data.length > 0) {
        if (append) {
          setDiscoverEpisodes(prev => [...prev, ...data.data]);
        } else {
          setDiscoverEpisodes(data.data);
        }
        setHasMoreDiscover(data.data.length === 10);
      } else {
        if (!append) setDiscoverEpisodes([]);
        setHasMoreDiscover(false);
      }
    } catch (error) {
      console.error('Error fetching discover episodes:', error);
    } finally {
      setLoadingDiscover(false);
    }
  };

  const loadFollowingEpisodes = async (page: number = 1, append: boolean = false) => {
    try {
      if (!auth?.session?.access_token) {
        console.error('Need login');
        return;
      }
      setLoadingFollowing(true);
      const response = await fetch(`/api/dashboard?type=following&page=${page}&limit=10`, {
        headers: { 'Authorization': `Bearer ${auth?.session?.access_token}` }
      });
      const data = await response.json();
      if (data.data && data.data.length > 0) {
        if (append) {
          setFollowingEpisodes(prev => [...prev, ...data.data]);
        } else {
          setFollowingEpisodes(data.data);
        }
        setHasMoreFollowing(data.data.length === 10);
      } else {
        if (!append) setFollowingEpisodes([]);
        setHasMoreFollowing(false);
      }
    } catch (error) {
      console.error('Error fetching following episodes:', error);
    } finally {
      setLoadingFollowing(false);
    }
  };

  useEffect(() => {
    loadEpisodes(1, false);
  }, []);

  useEffect(() => {
    if (activeTab === 'discover' && discoverEpisodes.length === 0) {
      loadEpisodes(1, false);
    } else if (activeTab === 'following' && followingEpisodes.length === 0 && auth?.user?.id) {
      loadFollowingEpisodes(1, false);
    }
  }, [activeTab]);

  const handleLoadMoreDiscover = () => {
    const nextPage = discoverPage + 1;
    setDiscoverPage(nextPage);
    loadEpisodes(nextPage, true);
  };

  const handleLoadMoreFollowing = () => {
    const nextPage = followingPage + 1;
    setFollowingPage(nextPage);
    loadFollowingEpisodes(nextPage, true);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (isMobile) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
  };

  const formatDuration = (duration: string) => {
    if (!duration) return '';
    const match = duration.match(/(\d+):(\d+):(\d+)/);
    if (match) {
      const hours = parseInt(match[1]);
      const minutes = parseInt(match[2]);
      const seconds = parseInt(match[3]);
      if (hours > 0) {
        return isMobile ? `${hours}h ${minutes}m` : `${hours}h ${minutes}m ${seconds}s`;
      } else if (minutes > 0) {
        return isMobile ? `${minutes}m` : `${minutes}m ${seconds}s`;
      } else {
        return isMobile ? `${minutes}m` : `${seconds}s`;
      }
    }
    const match2 = duration.match(/(\d+):(\d+)/);
    if (match2) {
      const minutes = parseInt(match2[1]);
      const seconds = parseInt(match2[2]);
      if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return isMobile ? `${hours}h ${remainingMinutes}m` : `${hours}h ${remainingMinutes}m ${seconds}s`;
      }
      return isMobile ? `${minutes}m` : `${minutes}m ${seconds}s`;
    }
    return duration;
  };

  const toggleTitleExpansion = (episodeId: string) => {
    setExpandedTitles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(episodeId)) newSet.delete(episodeId); else newSet.add(episodeId);
      return newSet;
    });
  };

  const getPodcastTitle = (episode: EpisodeItem) => {
    if (isMobile && episode.tbl_podcast?.short_title) {
      return episode.tbl_podcast.short_title;
    }
    return episode.tbl_podcast?.title || episode.podcast_name;
  };

  return (
    <>
      {/* 搜索和导入栏 */}
      <SearchAndImportBar />
      
      <div className="mb-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex justify-end items-center gap-3 mb-6">
            <TabsList className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
              <TabsTrigger value="discover" className="min-w-[120px] px-6">{t('dashboard.discover')}</TabsTrigger>
              <TabsTrigger value="following" className="min-w-[120px] px-6">{t('dashboard.following')}</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="discover">
            {loadingDiscover && discoverEpisodes.length === 0 ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <Card key={i} className="p-4">
                    <div className="flex gap-4">
                      <div className="w-16 h-16 bg-gray-200 rounded animate-pulse"></div>
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                        <div className="h-3 bg-gray-200 rounded animate-pulse w-2/3"></div>
                        <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2"></div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : discoverEpisodes.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {t('dashboard.noEpisodesFound')}
              </div>
            ) : (
              <div className="space-y-4">
                {discoverEpisodes.map((episode, index) => {
                  const episodeId = `${episode.podcast_id}-${episode.guid}`;
                  const isExpanded = expandedTitles.has(episodeId);
                  const title = episode.title || episode.line_title;
                  const podcastTitle = getPodcastTitle(episode);
                  return (
                    <Card key={index} className="p-4 hover:shadow-md transition-shadow">
                      <div className="flex gap-4">
                        <div className="flex-shrink-0">
                          <a href={`/episode/${episode.podcast_id}/${episode.guid}/${episode.type==1?'apple':'xyz'}`} className="block">
                            <img 
                              src={episode.itunes_image || episode.tbl_podcast?.itunes_image || episode.tbl_podcast?.image || "https://placehold.co/100x100"} 
                              alt={title} 
                              className="w-16 h-16 object-cover rounded"
                            />
                          </a>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-1">
                                <a href={`/episode/${episode.podcast_id}/${episode.guid}/${episode.type==1?'apple':'xyz'}`} className="block hover:text-blue-600 transition-colors">
                                  <h3 className={`font-semibold text-sm sm:text-base ${isExpanded ? '' : 'line-clamp-2'} flex-1`}>
                                    {title}
                                  </h3>
                                </a>
                                {isMobile && title.length > 60 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleTitleExpansion(episodeId);
                                    }}
                                    className="flex-shrink-0 mt-0.5 text-gray-500 hover:text-gray-700"
                                  >
                                    {isExpanded ? (
                                      <ChevronUp className="w-4 h-4" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4" />
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                            <a href={`/podcast/${episode.podcast_id}?type=${episode.type==1?'apple':'xyz'}`} className="flex items-center gap-1 flex-shrink-0 hover:text-blue-600 transition-colors">
                              <img 
                                src={episode.tbl_podcast?.itunes_image || episode.tbl_podcast?.image || "https://placehold.co/100x100"} 
                                alt={podcastTitle}
                                className="w-3 h-3 rounded-full object-cover"
                              />
                              <span className="truncate max-w-[120px]">{podcastTitle}</span>
                            </a>
                            <div className="flex items-center gap-4 flex-shrink-0">
                              {episode.pub_date && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatDate(episode.pub_date)}
                                </span>
                              )}
                              {episode.itunes_duration && (
                                <span>{formatDuration(episode.itunes_duration)}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
                {hasMoreDiscover && (
                  <div className="text-center pt-4">
                    <Button onClick={handleLoadMoreDiscover} disabled={loadingDiscover} variant="outline">
                      {loadingDiscover ? t('common.loading') : t('dashboard.loadMore')}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="following">
            {!auth?.session?.access_token ? (
              <div className="text-center py-12">
                <div className="max-w-md mx-auto">
                  <div className="bg-gradient-to-br from-gray-50 to-slate-50 rounded-xl p-8 border border-gray-100">
                    <div className="mb-6">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                      <p className="text-gray-600 text-sm leading-relaxed">
                        {t('dashboard.loginToViewFollowing')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : loadingFollowing && followingEpisodes.length === 0 ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <Card key={i} className="p-4">
                    <div className="flex gap-4">
                      <div className="w-16 h-16 bg-gray-200 rounded animate-pulse"></div>
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                        <div className="h-3 bg-gray-200 rounded animate-pulse w-2/3"></div>
                        <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2"></div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : followingEpisodes.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-500 mb-4">{t('dashboard.noFollowingContent')}</div>
                <Button onClick={() => setActiveTab('discover')} variant="outline">
                  {t('dashboard.discover')}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {followingEpisodes.map((episode) => {
                  const episodeId = `${episode.podcast_id}-${episode.guid}`;
                  const isExpanded = expandedTitles.has(episodeId);
                  const title = episode.title || episode.line_title;
                  const podcastTitle = getPodcastTitle(episode);
                  return (
                    <Card key={episode.podcast_id + episode.guid} className="p-4 hover:shadow-md transition-shadow">
                      <a href={`/episode/${episode.tbl_podcast?.itunes_id}/${episode.guid}/apple`} className="block">
                        <div className="flex gap-4">
                          <div className="flex-shrink-0">
                            <img 
                              src={episode.tbl_podcast?.itunes_image || episode.tbl_podcast?.image || episode.itunes_image || "https://placehold.co/100x100"} 
                              alt={title} 
                              className="w-16 h-16 object-cover rounded"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start gap-1">
                                  <h3 className={`font-semibold text-sm sm:text-base ${isExpanded ? '' : 'line-clamp-2'} flex-1`}>
                                    {title}
                                  </h3>
                                  {isMobile && title.length > 60 && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleTitleExpansion(episodeId);
                                      }}
                                      className="flex-shrink-0 mt-0.5 text-gray-500 hover:text-gray-700"
                                    >
                                      {isExpanded ? (
                                        <ChevronUp className="w-4 h-4" />
                                      ) : (
                                        <ChevronDown className="w-4 h-4" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                              <span className="flex items-center gap-1 flex-shrink-0">
                                <img 
                                  src={episode.tbl_podcast?.itunes_image || episode.tbl_podcast?.image || "https://placehold.co/100x100"} 
                                  alt={podcastTitle}
                                  className="w-3 h-3 rounded-full object-cover"
                                />
                                <span className="truncate max-w-[120px]">{podcastTitle}</span>
                              </span>
                              <div className="flex items-center gap-4 flex-shrink-0">
                                {episode.pub_date && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatDate(episode.pub_date)}
                                  </span>
                                )}
                                {episode.itunes_duration && (
                                  <span>{formatDuration(episode.itunes_duration)}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </a>
                    </Card>
                  );
                })}
                {hasMoreFollowing && (
                  <div className="text-center pt-4">
                    <Button onClick={handleLoadMoreFollowing} disabled={loadingFollowing} variant="outline">
                      {loadingFollowing ? t('common.loading') : t('dashboard.loadMore')}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}


