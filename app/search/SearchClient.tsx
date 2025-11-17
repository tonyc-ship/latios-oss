'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Search, ArrowLeft } from "lucide-react";
import Link from 'next/link';
import Loading from "../loading";
import { supabase } from "@/lib/supabase";
import { useTranslation } from "react-i18next";
import { toast } from "@/components/ui/use-toast";
import { trackSearch, trackError } from "@/lib/analytics";

interface PodcastItem {
  id: number;
  title: string;
  author: string;
  description: string;
  coverImage: string;
  publishDate?: string;
  duration?: string;
  isFollowed?: boolean;
  category?: string;
  artwork?: string;
}

interface SearchClientProps {
  initialQuery: string;
}

export default function SearchClient({
  initialQuery,
}: SearchClientProps) {
  const router = useRouter();
  const [keyword, setKeyword] = useState(initialQuery);
  const [searchResults, setSearchResults] = useState<PodcastItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const resultsPerPage = 10;
  const { t } = useTranslation();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (initialQuery) {
      handleSearch();
    }
  }, [initialQuery]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

    const checkXiaoyuzhouUrl = (url: string): string | null => {
      const xyzPattern = /^https?:\/\/(?:www\.)?xiaoyuzhoufm\.com\/podcast\/([a-f0-9]+)/i;
      const xyzMatch = url.trim().match(xyzPattern);
      return xyzMatch ? xyzMatch[1] : null;
    };

    const checkApplePodcastUrl = (url: string): { podcastId: string; episodeId?: string } | null => {
      // Channel link format: https://podcasts.apple.com/cn/podcast/all-ears-english-podcast/id751574016
      // Episode link format: https://podcasts.apple.com/cn/podcast/should-you-poke-fun-at-someones-niche-interests/id751574016?i=1000720680743
      const applePattern = /^https?:\/\/(?:www\.)?podcasts\.apple\.com\/[a-z]{2}\/podcast\/[^\/]+\/id(\d+)(?:\?i=(\d+))?/i;
      const appleMatch = url.trim().match(applePattern);
      
      if (appleMatch) {
        const podcastId = appleMatch[1];
        const episodeId = appleMatch[2];
        return {
          podcastId,
          episodeId
        };
      }
      return null;
    };

    const checkYouTubeUrl = (url: string): string | null => {
      // Support multiple YouTube link formats
      const patterns = [
        /^https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/i,
        /^https?:\/\/(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]+)/i,
        /^https?:\/\/(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]+)/i,
      ];

      for (const pattern of patterns) {
        const match = url.trim().match(pattern);
        if (match) {
          return match[1];
        }
      }
      return null;
    };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!keyword.trim()) return;

    // Check if it's a Xiaoyuzhou URL
    const xyzPodcastId = checkXiaoyuzhouUrl(keyword);
    if (xyzPodcastId) {
      router.push(`/podcast/${xyzPodcastId}?type=xyz`);
      return;
    }

    // Check if it's an Apple Podcast URL
    const applePodcastInfo = checkApplePodcastUrl(keyword);
    if (applePodcastInfo) {
      const { podcastId, episodeId } = applePodcastInfo;
      if (episodeId) {
        // If it's an episode link, navigate to episode page
        router.push(`/episode/${podcastId}/${episodeId}`);
      } else {
        // If it's a channel link, navigate to podcast page
        router.push(`/podcast/${podcastId}?type=apple`);
      }
      return;
    }

    // Check if it's a YouTube URL
    const youtubeVideoId = checkYouTubeUrl(keyword);
    if (youtubeVideoId) {
              router.push(`/episode/youtube/${youtubeVideoId}`);
      return;
    }

    // Check if it's a URL (other than Xiaoyuzhou and Apple Podcast)
    const urlPattern = /^(https?:\/\/)/i;
    if (urlPattern.test(keyword.trim())) {
      toast({
        title: t('common.invalidSearch'),
        description: t('common.invalidSearchDescription')
      });
      return;
    }

    setIsSearching(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;
      const email = user?.email || '';
      const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || email;
      
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('query', keyword);
      currentUrl.searchParams.set('c', userId || '');
      window.history.pushState({}, '', currentUrl.toString());

      const results = await fetch('/api/media/itunes/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: keyword,
          userId: userId,
          email: email,
          userName: userName
        })
      });
      const data = await results.json();
      
      // Track with Vercel Analytics
      trackSearch(keyword, 'search_page');
      
      setCurrentPage(1);
      setSearchResults(data);
    } catch (error: any) {
      console.error('Search error:', error);
      trackError('search', error?.message || 'unknown');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const indexOfLastResult = currentPage * resultsPerPage;
  const indexOfFirstResult = indexOfLastResult - resultsPerPage;
  const currentResults = searchResults.slice(indexOfFirstResult, indexOfLastResult);
  const totalPages = Math.ceil(searchResults.length / resultsPerPage);

  const getVisiblePages = () => {
    const pageNumbers = [];
    const maxVisiblePages = isMobile ? 3 : totalPages;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      if (currentPage <= 2) {
        pageNumbers.push(1, 2, 3);
      } else if (currentPage >= totalPages - 1) {
        pageNumbers.push(totalPages - 2, totalPages - 1, totalPages);
      } else {
        pageNumbers.push(currentPage - 1, currentPage, currentPage + 1);
      }
    }

    return pageNumbers;
  };

  return (
    <>
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/podcast')}
            className="rounded-full hover:bg-gray-100"
            title={t('dashboard.title')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">{t('common.search')}</h1>
        </div>
        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <div className="relative flex-1 max-w-2xl mx-auto sm:mx-0">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input 
              placeholder={t('dashboard.searchPlaceholder')} 
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="pl-9 pr-9"
              autoFocus
            />
            {keyword && (
              <button 
                type="button"
                className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                onClick={() => setKeyword("")}
              >
                ×
              </button>
            )}
          </div>
          <Button type="submit" className="w-20">{t('search.title')}</Button>
        </form>
          
        {isSearching ? <Loading /> : (
          <div className="bg-white rounded-lg shadow">
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row justify-between items-center p-2 border-b text-sm text-gray-500">
                <div className="w-full sm:w-auto mb-2 sm:mb-0 text-center sm:text-left">
                  {t('podcast.discoverTotal', { count: searchResults.length })}
                </div>
                <div className="w-full sm:w-auto flex justify-center">
                  <Pagination>
                    <PaginationContent className="flex justify-center gap-1">
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          title={t('pagination.previous')}
                          onClick={(e) => {
                            e.preventDefault();
                            if (currentPage > 1) setCurrentPage(currentPage - 1);
                          }}
                          className={`${currentPage === 1 ? "pointer-events-none opacity-50" : ""} px-2`}
                        />
                      </PaginationItem>
                      {getVisiblePages().map((pageNum) => (
                        <PaginationItem key={pageNum}>
                          <PaginationLink
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              setCurrentPage(pageNum);
                            }}
                            isActive={currentPage === pageNum}
                            className="w-8 h-8 p-0 flex items-center justify-center"
                          >
                            {pageNum}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                          }}
                          className={`${currentPage === totalPages ? "pointer-events-none opacity-50" : ""} px-2`}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              </div>
            )}

            {searchResults.length > 0 ? (
              <>
                <div className="divide-y">
                  {currentResults?.map((podcast) => (
                    <Link
                      key={podcast.id}
                      href={`/podcast/${podcast.id}`}
                      className="block py-6 px-4 hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <div className="flex flex-col sm:flex-row gap-5">
                        <div className="flex-shrink-0">
                          <img
                            src={podcast.artwork || podcast.coverImage}
                            alt={podcast.title}
                            className="w-32 h-32 sm:w-30 sm:h-30 rounded-lg object-cover shadow-md"
                          />
                        </div>
                        <div className="flex flex-col flex-1 justify-between">
                          <div>
                            <h3
                              className="text-xl font-bold mb-2 line-clamp-2 hover:text-blue-600"
                              dangerouslySetInnerHTML={{ __html: podcast.title}}
                            ></h3>
                            <p className="text-md text-gray-700 mb-3">
                              <span className="text-gray-500">By </span>
                              <span dangerouslySetInnerHTML={{ __html: podcast.author }}></span>
                            </p>
                            {podcast.description && (
                              <p className="text-sm text-gray-600 line-clamp-2 mb-4">{podcast.description}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="flex flex-col sm:flex-row justify-between items-center p-2 border-t text-sm text-gray-500">
                    <div className="w-full sm:w-auto flex justify-center">
                      <Pagination>
                        <PaginationContent className="flex justify-center gap-1">
                          <PaginationItem>
                            <PaginationPrevious
                              href="#"
                              title={t('pagination.previous')}
                              onClick={(e) => {
                                e.preventDefault();
                                if (currentPage > 1) setCurrentPage(currentPage - 1);
                              }}
                              className={`${currentPage === 1 ? "pointer-events-none opacity-50" : ""} px-2`}
                            />
                          </PaginationItem>
                          {getVisiblePages().map((pageNum) => (
                            <PaginationItem key={pageNum}>
                              <PaginationLink
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setCurrentPage(pageNum);
                                }}
                                isActive={currentPage === pageNum}
                                className="w-8 h-8 p-0 flex items-center justify-center"
                              >
                                {pageNum}
                              </PaginationLink>
                            </PaginationItem>
                          ))}
                          <PaginationItem>
                            <PaginationNext
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                              }}
                              className={`${currentPage === totalPages ? "pointer-events-none opacity-50" : ""} px-2`}
                            />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-4 p-12 text-center">
                <div className="w-16 h-16 mx-auto">
                  <Search className="w-full h-full text-gray-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-400">
                    {t('podcast.notFound', { keyword })}
                  </h2>
                  <p className="mt-2 text-gray-400">
                    {t('search.noResultsFound', { keyword })}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}