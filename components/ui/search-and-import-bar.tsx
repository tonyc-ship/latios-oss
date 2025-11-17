'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Search, Link as LinkIcon, CheckCircle, XCircle, AlertCircle, HelpCircle } from 'lucide-react';
import { trackSearch, trackPodcastImport, trackError } from '@/lib/analytics';

interface ImportState {
  input: string;
  detectedPlatform: 'apple' | 'xyz' | 'youtube' | null;
  isValid: boolean;
  errorMessage: string;
  isProcessing: boolean;
}

export function SearchAndImportBar() {
  const { t } = useTranslation();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'search' | 'import'>('search');
  const [searchTerm, setSearchTerm] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [importState, setImportState] = useState<ImportState>({
    input: '',
    detectedPlatform: null,
    isValid: false,
    errorMessage: '',
    isProcessing: false,
  });

  const searchInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Extract Apple Podcast ID
  const extractApplePodcastId = (link: string) => {
    const patterns = [
      /^https?:\/\/podcasts\.apple\.com\/[a-z]{2}\/podcast\/[^\/]+\/id(\d+)/i,
      /^https?:\/\/itunes\.apple\.com\/[a-z]{2}\/podcast\/[^\/]+\/id(\d+)/i,
      /^https?:\/\/podcasts\.apple\.com\/podcast\/[^\/]+\/id(\d+)/i,
    ];

    for (const pattern of patterns) {
      const match = link.trim().match(pattern);
      if (match) {
        return match[1];
      }
    }
    return null;
  };

  // Extract Xiaoyuzhou channel ID
  const extractXiaoyuzhouId = (link: string) => {
    const xyzPattern = /^https?:\/\/(?:www\.)?xiaoyuzhoufm\.com\/podcast\/([a-f0-9]+)/i;
    const xyzMatch = link.trim().match(xyzPattern);
    return xyzMatch ? xyzMatch[1] : null;
  };

  // Extract YouTube video ID
  const extractYouTubeId = (link: string) => {
    const patterns = [
      /^https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/i,
      /^https?:\/\/(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]+)/i,
      /^https?:\/\/(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]+)/i,
    ];

    for (const pattern of patterns) {
      const match = link.trim().match(pattern);
      if (match) {
        return match[1];
      }
    }
    return null;
  };

  // Debounced detection function
  const debouncedDetect = useMemo(
    () => {
      let timeoutId: NodeJS.Timeout;
      return (input: string) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          updateDetectionState(input);
        }, 300);
      };
    },
    []
  );

  // Update detection state
  const updateDetectionState = useCallback((input: string) => {
    if (!input.trim()) {
      setImportState({
        input: '',
        detectedPlatform: null,
        isValid: false,
        errorMessage: '',
        isProcessing: false,
      });
      return;
    }

    // Detect by priority: Apple -> Xiaoyuzhou -> YouTube
    const appleId = extractApplePodcastId(input);
    if (appleId) {
      setImportState({
        input,
        detectedPlatform: 'apple',
        isValid: true,
        errorMessage: '',
        isProcessing: false,
      });
      return;
    }

    const xyzId = extractXiaoyuzhouId(input);
    if (xyzId) {
      setImportState({
        input,
        detectedPlatform: 'xyz',
        isValid: true,
        errorMessage: '',
        isProcessing: false,
      });
      return;
    }

    const youtubeId = extractYouTubeId(input);
    if (youtubeId) {
      setImportState({
        input,
        detectedPlatform: 'youtube',
        isValid: true,
        errorMessage: '',
        isProcessing: false,
      });
      return;
    }

    // Link format error
    setImportState({
      input,
      detectedPlatform: null,
      isValid: false,
      errorMessage: t('import.invalidLink'),
      isProcessing: false,
    });
  }, [t]);

  // 处理导入输入变化
  const handleImportInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLinkInput(value);
    debouncedDetect(value);
  };

  // 处理搜索
  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchTerm.trim()) return;
    
    // Track search with Vercel Analytics
    trackSearch(searchTerm, 'podcast_page');
    
    // 跳转到搜索页面
    router.push(`/search?query=${encodeURIComponent(searchTerm)}`);
    setSearchTerm('');
  };

  // 处理确认导入
  const handleConfirmImport = () => {
    if (!importState.isValid || !importState.detectedPlatform) return;

    setImportState(prev => ({ ...prev, isProcessing: true }));

    let podcastId = null;
    let type = '';

    if (importState.detectedPlatform === 'apple') {
      podcastId = extractApplePodcastId(importState.input);
      type = 'apple';
    } else if (importState.detectedPlatform === 'xyz') {
      podcastId = extractXiaoyuzhouId(importState.input);
      type = 'xyz';
    } else if (importState.detectedPlatform === 'youtube') {
      podcastId = extractYouTubeId(importState.input);
      type = 'youtube';
    }

    if (podcastId) {
      console.log(`Importing content: ${podcastId} with type: ${type}`);
      
      // Track podcast import with Vercel Analytics
      const platform = type === 'xyz' ? 'xiaoyuzhou' : type === 'apple' ? 'apple_podcast' : 'youtube';
      trackPodcastImport(platform);
      
      if (type === 'youtube') {
        router.push(`/episode/youtube/${podcastId}`);
      } else {
        router.push(`/podcast/${podcastId}?type=${type}`);
      }
      setLinkInput('');
      setImportState({
        input: '',
        detectedPlatform: null,
        isValid: false,
        errorMessage: '',
        isProcessing: false,
      });
    } else {
      trackError('import', importState.detectedPlatform || 'unknown');
      setImportState(prev => ({ ...prev, isProcessing: false }));
    }
  };

  // 获取导入状态显示文本
  const getImportStatusText = () => {
    if (!importState.input.trim()) {
      return '';
    }
    
    if (importState.isValid && importState.detectedPlatform) {
      switch (importState.detectedPlatform) {
        case 'apple':
          return t('import.detectedApplePodcastLinkFormatCorrect');
        case 'xyz':
          return t('import.detectedXiaoyuzhouLinkFormatCorrect');
        case 'youtube':
          return t('import.detectedYouTubeLinkFormatCorrect');
        default:
          return '';
      }
    }
    
    return importState.errorMessage || t('import.invalidLink');
  };

  // 获取导入状态图标
  const getImportStatusIcon = () => {
    if (!importState.input.trim()) {
      return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
    
    if (importState.isValid) {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
    
    return <XCircle className="w-5 h-5 text-red-500" />;
  };

  // 处理示例链接点击
  const handleExampleClick = (exampleLink: string) => {
    setLinkInput(exampleLink);
    updateDetectionState(exampleLink);
  };

  // 切换 Tab 时重置输入
  const handleTabChange = (value: string) => {
    setActiveTab(value as 'search' | 'import');
    if (value === 'search') {
      setLinkInput('');
      setImportState({
        input: '',
        detectedPlatform: null,
        isValid: false,
        errorMessage: '',
        isProcessing: false,
      });
      // 聚焦搜索输入框
      setTimeout(() => searchInputRef.current?.focus(), 0);
    } else {
      setSearchTerm('');
      // 聚焦导入输入框
      setTimeout(() => importInputRef.current?.focus(), 0);
    }
  };

  return (
    <Card className="p-4 sm:p-6 mb-6 shadow-sm">
      {/* Tab 切换 */}
      <div className="mb-4">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
            <TabsTrigger value="search" className="min-w-[100px] px-4 flex items-center gap-2">
              <Search className="h-4 w-4" />
              <span>{t('common.search')}</span>
            </TabsTrigger>
            <TabsTrigger value="import" className="min-w-[100px] px-4 flex items-center gap-2">
              <LinkIcon className="h-4 w-4" />
              <span>{t('import.importPodcast')}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* 搜索/导入输入框 */}
      <div className="mb-4">
        {activeTab === 'search' ? (
          <form onSubmit={handleSearch} className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input 
                ref={searchInputRef}
                placeholder={t('dashboard.searchPlaceholder')} 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-10 h-12"
              />
              {searchTerm && (
                <button 
                  type="button"
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setSearchTerm('')}
                >
                  ×
                </button>
              )}
            </div>
          </form>
        ) : (
          <form onSubmit={(e) => {
            e.preventDefault();
            if (importState.isValid && importState.detectedPlatform) {
              handleConfirmImport();
            }
          }} className="space-y-3">
            <div className="relative">
              <LinkIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                ref={importInputRef}
                placeholder={t('import.pasteApplePodcastXiaoyuzhouYoutubeLink')}
                value={linkInput}
                onChange={handleImportInputChange}
                className={`pl-10 pr-10 h-12 ${
                  importState.isValid 
                    ? 'border-green-500 focus:border-green-500' 
                    : importState.errorMessage 
                    ? 'border-red-500 focus:border-red-500' 
                    : ''
                }`}
              />
              {linkInput && (
                <button 
                  type="button"
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => {
                    setLinkInput('');
                    setImportState({
                      input: '',
                      detectedPlatform: null,
                      isValid: false,
                      errorMessage: '',
                      isProcessing: false,
                    });
                  }}
                >
                  ×
                </button>
              )}
            </div>
            
            {/* 支持的平台图标和帮助按钮 */}
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <img src="/podcast.png" alt="Apple Podcast" width={20} height={20} />
              <img src="/xyz.png" alt="Xiaoyuzhou" width={20} height={20} />
              <img src="/youtube.png" alt="YouTube" width={20} height={20} />
              <button
                type="button"
                onClick={() => setIsHelpDialogOpen(true)}
                className="ml-1 text-gray-400 hover:text-gray-600 transition-colors"
                title={t('import.supportedLinkFormats')}
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            </div>

            {/* 导入状态显示 */}
            {importState.input.trim() && (
              <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                {getImportStatusIcon()}
                <span className={`text-sm font-medium ${
                  importState.isValid 
                    ? 'text-green-700' 
                    : importState.errorMessage 
                    ? 'text-red-700' 
                    : 'text-gray-600'
                }`}>
                  {getImportStatusText()}
                </span>
              </div>
            )}
          </form>
        )}
      </div>

      {/* 帮助对话框 - 显示支持的链接格式示例 */}
      <Dialog open={isHelpDialogOpen} onOpenChange={setIsHelpDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('import.supportedLinkFormats')}</DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            {/* Apple Podcast 示例 */}
            <div className="p-3 bg-gray-50 rounded-lg border hover:bg-gray-100 transition-colors cursor-pointer" 
                 onClick={() => {
                   handleExampleClick(t('import.applePodcastPlaceholder'));
                   setIsHelpDialogOpen(false);
                 }}>
              <div className="flex items-center space-x-2 mb-2">
                <img src="/podcast.png" alt="Apple Podcast" width={24} height={24} />
                <span className="text-sm font-medium text-gray-700">{t('import.applePodcast')}</span>
              </div>
              <div className="text-xs text-gray-600 font-mono bg-white p-2 rounded border break-all">
                {t('import.applePodcastPlaceholder')}
              </div>
            </div>

            {/* 小宇宙示例 */}
            <div className="p-3 bg-gray-50 rounded-lg border hover:bg-gray-100 transition-colors cursor-pointer"
                 onClick={() => {
                   handleExampleClick(t('import.xiaoyuzhouPlaceholder'));
                   setIsHelpDialogOpen(false);
                 }}>
              <div className="flex items-center space-x-2 mb-2">
                <img src="/xyz.png" alt="Xiaoyuzhou" width={24} height={24} />
                <span className="text-sm font-medium text-gray-700">{t('import.xiaoyuzhou')}</span>
              </div>
              <div className="text-xs text-gray-600 font-mono bg-white p-2 rounded border break-all">
                {t('import.xiaoyuzhouPlaceholder')}
              </div>
            </div>

            {/* YouTube 示例 */}
            <div className="p-3 bg-gray-50 rounded-lg border hover:bg-gray-100 transition-colors cursor-pointer"
                 onClick={() => {
                   handleExampleClick(t('import.youtubePlaceholder'));
                   setIsHelpDialogOpen(false);
                 }}>
              <div className="flex items-center space-x-2 mb-2">
                <img src="/youtube.png" alt="YouTube" width={24} height={24} />
                <span className="text-sm font-medium text-gray-700">{t('import.youtube')}</span>
              </div>
              <div className="text-xs text-gray-600 font-mono bg-white p-2 rounded border break-all">
                {t('import.youtubePlaceholder')}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

