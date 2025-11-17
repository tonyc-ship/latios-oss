'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { AppleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { CheckCircle, XCircle, Link as LinkIcon, Sparkles, AlertCircle } from 'lucide-react';
import { trackPodcastImport, trackError } from '@/lib/analytics';

interface PodcastImportProps {
  children?: React.ReactNode;
}

interface ImportState {
  input: string;
  detectedPlatform: 'apple' | 'xyz' | 'youtube' | null;
  isValid: boolean;
  errorMessage: string;
  showInstructions: boolean;
  isProcessing: boolean;
}

export function PodcastImport({ children }: PodcastImportProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [importState, setImportState] = useState<ImportState>({
    input: '',
    detectedPlatform: null,
    isValid: false,
    errorMessage: '',
    showInstructions: false,
    isProcessing: false,
  });


  // 提取Apple Podcast ID
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

  // 提取小宇宙频道ID
  const extractXiaoyuzhouId = (link: string) => {
    const xyzPattern = /^https?:\/\/(?:www\.)?xiaoyuzhoufm\.com\/podcast\/([a-f0-9]+)/i;
    const xyzMatch = link.trim().match(xyzPattern);
    return xyzMatch ? xyzMatch[1] : null;
  };

  // 提取YouTube视频ID
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

  // 防抖检测函数
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

  // 更新检测状态
  const updateDetectionState = useCallback((input: string) => {
    if (!input.trim()) {
      setImportState({
        input: '',
        detectedPlatform: null,
        isValid: false,
        errorMessage: '',
        showInstructions: false,
        isProcessing: false,
      });
      return;
    }

    // 按优先级检测：Apple -> 小宇宙 -> YouTube
    const appleId = extractApplePodcastId(input);
    if (appleId) {
      setImportState({
        input,
        detectedPlatform: 'apple',
        isValid: true,
        errorMessage: '',
        showInstructions: false,
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
        showInstructions: false,
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
        showInstructions: false,
        isProcessing: false,
      });
      return;
    }

    // 链接格式错误
    setImportState({
      input,
      detectedPlatform: null,
      isValid: false,
      errorMessage: t('import.invalidLink'),
      showInstructions: false,
      isProcessing: false,
    });
  }, [t]);

  // 处理输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLinkInput(value);
    debouncedDetect(value);
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
      setIsDialogOpen(false);
      setLinkInput('');
      setImportState({
        input: '',
        detectedPlatform: null,
        isValid: false,
        errorMessage: '',
        showInstructions: false,
        isProcessing: false,
      });
    } else {
      toast({
        title: t('import.invalidLink'),
        description: t('import.pleaseCheckLinkFormat'),
      });
      trackError('import', importState.detectedPlatform || 'unknown');
      setImportState(prev => ({ ...prev, isProcessing: false }));
    }
  };

  // 获取状态显示文本
  const getStatusText = () => {
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

  // 获取状态图标
  const getStatusIcon = () => {
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

  // 渲染链接示例
  const renderLinkExamples = () => {
    return (
      <div className="mt-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">{t('import.supportedLinkFormats')}</h3>
        <div className="space-y-3">
          {/* Apple Podcast 示例 */}
          <div className="p-3 bg-gray-50 rounded-lg border hover:bg-gray-100 transition-colors cursor-pointer" 
               onClick={() => handleExampleClick(t('import.applePodcastPlaceholder'))}>
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center">
                <span className="text-sm">
                  <img src="/podcast.png" alt="Apple Podcast" width={24} height={24} />
                </span>
              </div>
              <span className="text-sm font-medium text-gray-700">{t('import.applePodcast')}</span>
            </div>
            <div className="text-xs text-gray-600 font-mono bg-white p-2 rounded border">
              {t('import.applePodcastPlaceholder')}
            </div>
          </div>

          {/* 小宇宙示例 */}
          <div className="p-3 bg-gray-50 rounded-lg border hover:bg-gray-100 transition-colors cursor-pointer"
               onClick={() => handleExampleClick(t('import.xiaoyuzhouPlaceholder'))}>
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center">
                <span className="text-sm">
                  <img src="/xyz.png" alt="Xiaoyuzhou" width={24} height={24} />
                </span>
              </div>
              <span className="text-sm font-medium text-gray-700">{t('import.xiaoyuzhou')}</span>
            </div>
            <div className="text-xs text-gray-600 font-mono bg-white p-2 rounded border">
              {t('import.xiaoyuzhouPlaceholder')}
            </div>
          </div>

          {/* YouTube 示例 */}
          <div className="p-3 bg-gray-50 rounded-lg border hover:bg-gray-100 transition-colors cursor-pointer"
               onClick={() => handleExampleClick(t('import.youtubePlaceholder'))}>
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center">
                <span className="text-sm">
                  <img src="/youtube.png" alt="YouTube" width={24} height={24} />
                </span>
              </div>
              <span className="text-sm font-medium text-gray-700">{t('import.youtube')}</span>
            </div>
            <div className="text-xs text-gray-600 font-mono bg-white p-2 rounded border">
              {t('import.youtubePlaceholder')}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="ghost" size="sm" className="flex items-center gap-2">
            <LinkIcon className="w-4 h-4" />
            {t('import.importPodcast')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="text-center">
          <DialogTitle className="text-lg font-bold text-gray-900">
            {t('import.importPodcast')}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* 统一输入框 */}
          <div className="space-y-4">
            <div className="space-y-2">
              
              <label className="text-sm font-medium text-gray-700">
                {t('import.pasteApplePodcastXiaoyuzhouYoutubeLink')}
              </label>
              <Input
                placeholder={t('import.pasteApplePodcastXiaoyuzhouYoutubeLink')}
                value={linkInput}
                onChange={handleInputChange}
                className={`h-12 text-sm ${
                  importState.isValid 
                    ? 'border-green-500 focus:border-green-500' 
                    : importState.errorMessage 
                    ? 'border-red-500 focus:border-red-500' 
                    : ''
                }`}
              />
              <div className="flex items-center space-x-2">
                  <img src="/podcast.png" alt="Apple Podcast" width={24} height={24} />
                  <img src="/xyz.png" alt="Xiaoyuzhou" width={24} height={24} />
                  <img src="/youtube.png" alt="YouTube" width={24} height={24} />
                </div>
            </div>

            {/* 状态显示区域 */}
            {importState.input.trim() && (
            <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
              {getStatusIcon()}
              <span className={`text-sm font-medium ${
                importState.isValid 
                  ? 'text-green-700' 
                  : importState.errorMessage 
                  ? 'text-red-700' 
                  : 'text-gray-600'
              }`}>
                {getStatusText()}
              </span>
            </div>
            )}

            {/* 确认按钮 - 仅在检测成功时显示 */}
            {importState.isValid && importState.detectedPlatform && (
              <Button 
                onClick={handleConfirmImport}
                disabled={importState.isProcessing}
                className="w-full h-12 text-sm font-medium bg-gray-800 hover:bg-gray-900 text-white"
              >
                {importState.isProcessing ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {t('common.processing')}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    {t('import.confirm')}
                  </>
                )}
              </Button>
            )}
          </div>

          {/* 链接示例区域 */}
          {renderLinkExamples()}
        </div>
      </DialogContent>
    </Dialog>
  );
} 