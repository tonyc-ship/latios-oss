'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/auth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { 
  Copy, 
  FileText,
  Languages,
  ChevronDown,
  SplitSquareVertical,
  Square,
  ScrollText,
  Share,
  ExternalLink
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import EpisodeSummary from './EpisodeSummary';
import EpisodeTranscript from './EpisodeTranscript';
import { Skeleton } from '@/components/ui/skeleton';
import { availableLanguages } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { TextHighlight } from "@/components/ui/text-highlight"
import { trackSummaryView, trackTranscriptView, trackContentInteraction, trackError } from "@/lib/analytics";

interface EpisodeContentProps {
  episodeId: string;
  loading?: boolean;
  type: string;
  episodeData?: any;
}

const LANGUAGE_STORAGE_KEY = 'user_preferred_language';

export default function EpisodeContent({ episodeId, loading, episodeData, type }: EpisodeContentProps) {
  const auth = useAuth();
  const user = auth?.user;
  const [activeTab, setActiveTab] = useState('summary');
  const [showTranslation, setShowTranslation] = useState(false);
  const [translationMode, setTranslationMode] = useState<'sideBySide' | 'translationOnly'>('sideBySide');
  
  const { t, i18n } = useTranslation();
  const languageCode = i18n.language;
  
  const [language, setLanguage] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (savedLanguage) {
        return savedLanguage;
      }
    }
    return i18n.language === 'zh' ? '2' : '1';
  });
  
  // Content references
  const summaryContentRef = useRef<string>('');
  const transcriptContentRef = useRef<string>('');
  const lastTrackedSummaryKeyRef = useRef<string | null>(null);

  // Track initial summary view on mount (default tab is summary)
  useEffect(() => {
    if (!episodeData) return;
    if (activeTab !== 'summary') return;

    const episodeKey = `${episodeId}|${language}`;
    if (lastTrackedSummaryKeyRef.current !== episodeKey) {
      const src = episodeData?.type === 'xyz' ? '小宇宙' : (episodeData?.type === 'youtube' ? 'YouTube' : 'Apple Podcast');
      trackSummaryView(episodeData?.title, episodeData?.podcast_name, src);
      lastTrackedSummaryKeyRef.current = episodeKey;
    }
  }, [episodeData, episodeId, language, activeTab]);
  
  // User action logging removed
  
  // Handle tab switching
  const handleTabChange = useCallback((newTab: string) => {
    if (newTab !== activeTab) {
      // Track tab changes with Vercel Analytics
      const src = episodeData?.type === 'xyz' ? '小宇宙' : (episodeData?.type === 'youtube' ? 'YouTube' : 'Apple Podcast');
      if (newTab === 'summary') {
        trackSummaryView(episodeData?.title, episodeData?.podcast_name, src);
      } else if (newTab === 'transcript') {
        trackTranscriptView(episodeData?.title, episodeData?.podcast_name, src);
      }
      
      setActiveTab(newTab);
    }
  }, [activeTab, episodeId, episodeData, language]);
  
  // Handle language switching
  const handleLanguageChange = useCallback((newLanguage: string) => {
    if (newLanguage !== language) {
      // Update language state
      setLanguage(newLanguage);
      
      // Save user's language preference to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, newLanguage);
      }
    }
  }, [language, activeTab]);
    
  // Wrap callback functions with useCallback
  const updateSummaryContent = useCallback((content: string) => {
    summaryContentRef.current = content;
  }, []);

  const updateTranscriptContent = useCallback((content: string) => {
    transcriptContentRef.current = content;
  }, []);
  
  // Handle copying content
  const handleCopyContent = useCallback(async () => {
    try {
      let text = '';
      
      // Get content based on active tab
      if (activeTab === 'summary') {
        text = summaryContentRef.current;
      } else if (activeTab === 'transcript') {
        text = transcriptContentRef.current;
      }
      
      if (!text) {
        toast({
          title: t('common.noContent'),
          description: t('common.noContentAvailable'),
          // //variant: "destructive",
          duration: 3000,
        });
        return;
      }
      
      await navigator.clipboard.writeText(text);

      // Track content interaction with Vercel Analytics
      trackContentInteraction('copy', activeTab as 'summary' | 'transcript');
      
      // Show success message
      toast({
        title: t('common.copiedToClipboard'),
        description: t('common.copied'),
        duration: 3000,
      });
    } catch (err: any) {
      console.error('Could not copy text: ', err);
      trackError('copy', err?.message || 'unknown');
      toast({
        title: t('common.failedToCopy'),
        description: t('common.failedToCopyContent'),
        // //variant: "destructive",
        duration: 3000,
      });
    }
  }, [activeTab, summaryContentRef, transcriptContentRef, t]);
  
  // Pro member check removed - all features are free

  // Handle export to Notion
  const handleExportToNotion = useCallback(async () => {
    try {
      let text = '';
      
      // Get content based on active tab
      if (activeTab === 'summary') {
        text = summaryContentRef.current;
      } else if (activeTab === 'transcript') {
        text = transcriptContentRef.current;
      }
      
      if (!text) {
        toast({
          title: t('common.noContent'),
          description: t('common.noContentAvailable'),
          duration: 3000,
        });
        return;
      }

      // Call Notion export API
      const response = await fetch('/api/export/notion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth?.session?.access_token}`
        },
        body: JSON.stringify({
          content: text,
          title: episodeData?.title || 'Episode Summary',
          podcastName: episodeData?.podcast_name || 'Unknown Show',
          contentType: activeTab,
          episodeUrl: window.location.href,
          publishDate: episodeData?.pub_date,
          episodeImage: episodeData?.itunes_image,
          channelImage: episodeData?.podcast_img
        })
      });

      const result = await response.json();

      if (!response.ok) {
        // If user hasn't connected Notion, redirect to OAuth
        if (response.status === 400 && result.error?.includes('Notion account not connected')) {
          // Get OAuth authorization URL
          const authResponse = await fetch('/api/notion/oauth/authorize', {
            headers: {
              'Authorization': `Bearer ${auth?.session?.access_token}`
            }
          });
          
          if (authResponse.ok) {
            const authData = await authResponse.json();
            // Redirect to Notion OAuth
            window.open(authData.authUrl, '_blank');
            
            toast({
              title: t('episode.connectNotionFirst'),
              description: t('episode.connectNotionFirstDescription'),
              duration: 5000,
            });
            return;
          }
        }
        throw new Error(result.error || 'Failed to export to Notion');
      }
      
      // Track content interaction with Vercel Analytics
      trackContentInteraction('export_notion', activeTab as 'summary' | 'transcript');
      
      // Show success message
      toast({
        title: t('episode.exportedToNotion'),
        description: t('episode.exportedToNotionDescription'),
        duration: 5000,
      });
    } catch (err: any) {
      console.error('Could not export to Notion: ', err);
      trackError('export_notion', err?.message || 'unknown');
      toast({
        title: t('episode.failedToExportToNotion'),
        description: t('episode.failedToExportToNotionDescription'),
        duration: 3000,
      });
    }
  }, [activeTab, summaryContentRef, transcriptContentRef, episodeData, auth?.session?.access_token, t]);

  return (
    <Card className="border-none shadow-sm bg-card mt-6">
      <CardContent className="p-0">
        {loading ? (
          <Skeleton />
        ) : (
          <Tabs defaultValue="summary" onValueChange={handleTabChange} className="w-full">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-gray-100 border-b mb-2 px-4">
                <TabsList className="mb-0 bg-transparent p-0 flex space-x-8">
                <TabsTrigger 
                  value="summary" 
                    className="px-2 pb-3 pt-3 bg-transparent rounded-none data-[state=active]:bg-transparent data-[state=active]:border-b-0 data-[state=active]:after:content-[''] data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-black data-[state=active]:shadow-none flex items-center gap-1.5 transition-all relative"
                >
                    <FileText className="h-4 w-4" />
                  {t('episode.summary')}
                </TabsTrigger>
                <TabsTrigger 
                  value="transcript" 
                    className="px-2 pb-3 pt-3 bg-transparent rounded-none data-[state=active]:bg-transparent data-[state=active]:border-b-0 data-[state=active]:after:content-[''] data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-black data-[state=active]:shadow-none flex items-center gap-1.5 transition-all relative"
                >
                    <ScrollText className="h-4 w-4" />
                  {t('episode.transcript')}
                </TabsTrigger>
              </TabsList>
              
              <div className="flex items-center mt-4 sm:mt-0 space-x-2">
                {activeTab === 'summary' && (
                  <div className="flex items-center bg-muted/30 rounded-md px-2 py-1">
                    <Languages className="h-4 w-4 mr-1" />
                    <Select value={language} onValueChange={handleLanguageChange}>
                      <SelectTrigger className="bg-transparent text-sm focus:outline-none font-medium border-0 shadow-none h-auto py-1 px-2 min-w-[120px]">
                        <SelectValue>
                          {(() => {
                            const selectedLang = availableLanguages.find(lang => lang.code === language);
                            return selectedLang ? selectedLang.nativeName : null;
                          })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {availableLanguages.map(lang => (
                          <SelectItem key={lang.code} value={lang.code} className="py-2">
                            <div className="flex flex-col">
                              <span className="font-medium">{lang.nativeName}</span>
                              {lang.nativeName !== lang.enName && (
                                <span className="text-xs text-muted-foreground">{lang.enName}</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                {/* {activeTab === 'transcript' && languageCode == 'en' && (
                  <div className="flex items-center">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button 
                                variant={showTranslation ? "default" : "outline"}
                                size="sm"
                                className={`h-8 px-3 flex items-center gap-1 border-0 ${
                                  showTranslation 
                                    ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                                    : 'bg-neutral-50/10'
                                }`}
                              >
                                <Languages className="h-4 w-4" />
                                <span className="text-sm">
                                  {showTranslation 
                                    ? translationMode === 'sideBySide' 
                                      ? t('episode.showSideBySide') 
                                      : t('episode.showTranslationOnly')
                                    : t('episode.translation')
                                  }
                                </span>
                                <ChevronDown className="h-4 w-4 ml-1" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setShowTranslation(!showTranslation);
                                  setTranslationMode('sideBySide');
                                }}
                                className="flex items-center gap-2"
                              >
                                <SplitSquareVertical className="h-4 w-4" />
                                {t('episode.showSideBySide')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setShowTranslation(!showTranslation);
                                  setTranslationMode('translationOnly');
                                }}
                                className="flex items-center gap-2"
                              >
                                <Square className="h-4 w-4" />
                                {t('episode.showTranslationOnly')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TooltipTrigger>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )} */}
                
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            <Share className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={handleCopyContent}
                            className="flex items-center gap-2"
                          >
                            <Copy className="h-4 w-4" />
                            {t('common.copyToClipboard')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={handleExportToNotion}
                            className="flex items-center gap-2"
                          >
                            <img 
                              src="/notion.png" 
                              alt="Notion" 
                              className="h-4 w-4"
                            />
                            <span>
                              {t('episode.exportToNotion')}
                            </span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('episode.export')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                </div>
            </div>
            
            <div className="px-4">
              <TabsContent value="summary" className="mt-0">
                <TextHighlight
                  podcastName={episodeData?.podcast_name}
                  episodeTitle={episodeData?.title}
                  contentType="summary"
                >
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <EpisodeSummary 
                      type={type}
                      episode={episodeData} 
                      language={language} 
                      onContentChange={updateSummaryContent}
                    />
                  </div>
                </TextHighlight>
              </TabsContent>
              
              <TabsContent value="transcript" className="mt-0">
                <TextHighlight
                  podcastName={episodeData?.podcast_name}
                  episodeTitle={episodeData?.title}
                  contentType="transcript"
                >
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <EpisodeTranscript 
                      episode={episodeData} 
                      language={language}
                      onContentChange={updateTranscriptContent}
                      showTranslation={showTranslation}
                      translationMode={translationMode}
                    />
                  </div>
                </TextHighlight>
              </TabsContent>
            </div>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
} 