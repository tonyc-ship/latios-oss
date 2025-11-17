'use client';

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from 'react-i18next';

interface PodcastItem {
  id: number;
  itunes_id: number;
  title: string;
  short_title?: string;
  itunes_author?: string;
  description: string;
  introduction?: string;
  image?: string;
  pub_date?: string;
  items?: string;
  isFollowed?: boolean;
  viewedAt?: string;
  last_update_time?: string;
}

interface ExpandableDescriptionProps {
  description: string;
  introduction?: string;
}

function ExpandableDescription({ description, introduction }: ExpandableDescriptionProps) {
  const { i18n } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  const { t } = useTranslation();

  // Select display content based on language
  const displayText = i18n.language === 'zh' && introduction ? introduction : description;

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.matchMedia('(max-width: 768px)').matches);
    };

    const checkOverflow = () => {
      const element = textRef.current;
      if (element) {
        const lineHeight = parseInt(window.getComputedStyle(element).lineHeight);
        const actualLineHeight = isNaN(lineHeight) ? element.clientHeight / 2 : lineHeight;
        setIsOverflowing(element.scrollHeight > actualLineHeight * 2);
      }
    };

    // Initial check
    checkMobile();
    checkOverflow();

    // Listen for screen width changes
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    mediaQuery.addEventListener('change', checkMobile);
    window.addEventListener('resize', checkOverflow);

    return () => {
      mediaQuery.removeEventListener('change', checkMobile);
      window.removeEventListener('resize', checkOverflow);
    };
  }, [displayText]);

  return (
    <div className="w-full">
      <p
        ref={textRef}
        className={`text-sm text-gray-600 ${!isExpanded || !isMobile ? 'line-clamp-2' : ''}`}
      >
        {displayText}
      </p>
      {isOverflowing && isMobile && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-1 text-xs text-gray-500 hover:text-gray-700 flex items-center"
        >
          {isExpanded ? (
            <>
              {t('podcast.showLess')} <ChevronUp className="h-3 w-3 ml-1" />
            </>
          ) : (
            <>
              {t('podcast.showMore')} <ChevronDown className="h-3 w-3 ml-1" />
            </>
          )}
        </button>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [recommendedPodcasts, setRecommendedPodcasts] = useState<PodcastItem[]>([]);
  const [loading, setLoading] = useState(true);
  const type = i18n.language === 'zh' ? '2' : '1';
  const platform = i18n.language === 'zh' ? 'xyz' : 'apple';
  const [isMobile, setIsMobile] = useState(false);

  // Check if it's a mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.matchMedia('(max-width: 768px)').matches);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const fetchRecommendedPodcasts = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/podcast?type=1`);
      const data = await response.json();
      
      if (data && data.length > 0) {
        setRecommendedPodcasts(data);
      }
    } catch (error) {
      console.error('Error fetching recommended podcasts:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRecommendedPodcasts();
  }, []);

  return (
    <>
      {/* Recommended Podcasts */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">{t('dashboard.recommended')}</h2>
        </div>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Card key={i} className="overflow-hidden">
                <div className="h-60 animate-pulse bg-gray-200"></div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recommendedPodcasts.map(podcast => (
              <Card key={podcast.id} className="overflow-hidden relative">
                <CardHeader className="p-0">
                  <a href={`/podcast/${podcast.itunes_id}?type=${platform}`} className="block">
                    <div className="flex">
                      <img 
                        src={podcast.image || "https://placehold.co/100x100"} 
                        alt={podcast.title} 
                        className="w-24 h-24 object-cover"
                      />
                      <div className="p-4">
                        <CardTitle className="text-base">{podcast.title}</CardTitle>
                        <p className="text-sm text-gray-500">{podcast.itunes_author}</p>
                      </div>
                    </div>
                  </a>
                </CardHeader>
                <CardFooter className="border-t p-4">
                  <ExpandableDescription description={podcast.description} introduction={podcast.introduction} />
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
