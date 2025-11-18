'use client';

import { useState, useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import React from 'react';
import { useAuth } from '@/lib/auth';
import { toast } from '@/components/ui/use-toast';
import Loading from './loading';
import { pollTranscriptFromDB, generateTranscript } from '@/lib/transcription';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { trackError } from '@/lib/analytics';

interface EpisodeSummaryProps {
  episode?: any;
  language: string;
  type: string;
  onContentChange?: (content: string) => void;
}

interface LoadingStep {
  id: string;
  title: string;
  status: 'pending' | 'loading' | 'completed' | 'error';
  description?: string;
}

export default React.memo(function EpisodeSummary({ episode, language, type, onContentChange }: EpisodeSummaryProps) {
  const [summary, setSummary] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [loadingSteps, setLoadingSteps] = useState<LoadingStep[]>([]);
  const [currentStep, setCurrentStep] = useState<string>('');
  const auth = useAuth(); 
  const user = auth?.user;
  const userId = user?.id;
  const [isStreamingComplete, setIsStreamingComplete] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { t } = useTranslation();
  const router = useRouter();

  const updateStepStatus = (stepId: string, status: LoadingStep['status'], description?: string) => {
    setLoadingSteps(prev => prev.map(step => 
      step.id === stepId 
        ? { ...step, status, description: description || step.description }
        : step
    ));
    setCurrentStep(stepId);
  };

  const initializeLoadingSteps = () => {
    const steps: LoadingStep[] = [
      {
        id: 'lookup',
        title: t('loading.lookupSummary') || 'Checking channel information',
        status: 'pending'
      },
      {
        id: 'transcript',
        title: t('loading.checkTranscript') || 'Fetching episode data',
        status: 'pending'
      },
      {
        id: 'transcribing',
        title: t('loading.transcribing') || 'Transcribing audio (this may take a few minutes)',
        status: 'pending'
      },
      {
        id: 'summarizing',
        title: t('loading.summarizing') || 'Generating intelligent summary',
        status: 'pending'
      }
    ];
    setLoadingSteps(steps);
  };

  const fetchSummaryData = async () => {
    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setLoading(true);
      setSummary('');
      setIsStreamingComplete(false);
      initializeLoadingSteps();

      // Step 1: Look up existing summary
      updateStepStatus('lookup', 'loading');
      let requestCount = 0;
      while (true) {
        const existingSummary = await fetchSummaryFromDB(episode.id, language);
        if (!existingSummary) {
          updateStepStatus('lookup', 'completed');
          break;
        } else if (existingSummary.status === 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          requestCount++;
          if (requestCount > 300) {
            updateStepStatus('lookup', 'error');
            break;
          }
        } else {
          updateStepStatus('lookup', 'completed');
          setSummary(existingSummary);
          onContentChange?.(existingSummary);
          setIsStreamingComplete(true);
          return;
        }
      }

      // Step 2: Check existing transcript
      updateStepStatus('transcript', 'loading');
      let transcript = '';
      let transcriptDB = await fetchTranscriptFromDB(episode.id);
      if (transcriptDB && transcriptDB.status === 2) {
        updateStepStatus('transcript', 'completed');
        updateStepStatus('transcribing', 'completed'); // Mark transcribing as completed since transcript is already available
        transcript = transcriptDB.content;
      } else if (transcriptDB && transcriptDB.status === 1) {
        updateStepStatus('transcribing', 'loading');
        const transcript_poll = await pollTranscriptFromDB(episode.id, auth, type==='xyz'? 2:1);
        transcript = transcript_poll;
        updateStepStatus('transcribing', 'completed');
        updateStepStatus('transcript', 'completed');
      } else {
        updateStepStatus('transcript', 'completed');
        if (!episode?.podcast_name) {
          toast({
            title: t('common.error'),
            description: t('episode.missingPodcastName'),
          });
          trackError('transcript', 'missing_podcast_name');
          return;
        }

        try {
          updateStepStatus('transcribing', 'loading');
          const transcript_new = await generateTranscript(
            episode.id,
            episode.type,
            episode.podcast_name,
            episode.title,
            episode.itunes_duration,
            episode.pub_date,
            userId!,
            user?.user_metadata?.full_name || user?.user_metadata?.name || '',
            user?.email || '',
            episode.enclosure_url,
            auth
          );

          if (!transcript_new) {
            updateStepStatus('transcribing', 'error');
            toast({
              title: t('common.error'),
              description: t('episode.generateTranscriptFailed'),
            });
            trackError('transcript', 'generate_failed');
            return;
          }
          transcript = transcript_new;
          updateStepStatus('transcribing', 'completed');
        } catch (e: any) {
          updateStepStatus('transcribing', 'error');
          trackError('transcript', e?.message || 'unknown');
          throw e;
        }
      }

      // Step 3: Generate summary
      updateStepStatus('summarizing', 'loading');
      const metadata = {
        title: episode.title,
        description: episode.description,
      };

      if (transcript) {
        const summaryContent = await generateSummary(
          episode.id,
          episode.podcast_name,
          episode.title,
          episode.itunes_duration,
          episode.pub_date,
          userId!,
          transcript,
          language,
          metadata,
          controller.signal
        );

        if (summaryContent) {
          setSummary(summaryContent);
          updateStepStatus('summarizing', 'completed');
        }
      } else {
        updateStepStatus('summarizing', 'error');
        setSummary('');
        transcript = '';
        toast({
          title: t('common.operationFailed'),
          description: t('episode.transcriptNotFound'),
        });
        trackError('summary', 'transcript_not_found');
      }

    } catch (error: any) {
      console.log('Error fetching summary: ', error);
      trackError('summary', error?.message || 'unknown');
    } finally {
      setLoading(false);
    }
  }

  // Retry functionality
  const handleRetry = async () => {
    setRetrying(true);
    try {
      await fetchSummaryData();
    } finally {
      setRetrying(false);
    }
  };

  // Fetch existing summary from database
  const fetchSummaryFromDB = async (episodeId: string, language: string) => {
    const response = await fetch(`/api/episode/summary?episodeId=${episodeId}&language=${language}`, {
      headers: {
        'Authorization': `Bearer ${auth?.session?.access_token}`
      }
    });
    if (response.ok) {
      const data = await response.json();
      if (data?.content) {
        return data.content;
      }
    }
    return null;
  }

  // Fetch transcript from database
  const fetchTranscriptFromDB = async (episodeId: string) => {
    const transcriptData = await fetch(`/api/episode/transcript?episodeId=${episodeId}&language=${episode.type==='xyz'?'2':'1'}`, {
      headers: {
        'Authorization': `Bearer ${auth?.session?.access_token}`
      }
    });
    if (transcriptData.ok) {
      const data = await transcriptData.json();
      return { status: data.status, content: data.content };
    }
    return null;
  }

  // Generate summary
  const generateSummary = async (
    episodeId: string,
    podcastName: string,
    episodeTitle: string,
    episodeDuration: string,
    episodePubDate: string,
    userId: string,
    transcript: string,
    language: string,
    metadata: { title: string; description: string },
    signal: AbortSignal
  ) => {
    const res = await fetch('/api/media/summarize', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth?.session?.access_token}`
       },
      body: JSON.stringify({
        episodeId,
        podcastName,
        episodeTitle,
        episodeDuration,
        episodePubDate,
        userId,
        transcript,
        language,
        podcast_metadata: metadata,
        type: type
      }),
      signal
    });

    // console.log('res: ', res);
    
    // Check status code, if 503 (service unavailable), show friendly error message
    if (res.status === 503) {
      toast({
        title: t('common.operationFailed') || 'Operation Failed',
        description: t('episode.generateSummaryFailed') || 'Failed to generate summary. Please try again later.',
        // //variant: "destructive",
      });
      return null;
    }
    
    if (!res.body) return null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let summaryText = '';
    let receivedMeaningfulChunk = false;

    try {
      while (true) {
        if (signal.aborted) break;
        const { value, done } = await reader.read();
        if (done) {
          setIsStreamingComplete(true);
          break;
        }
        const chunkText = decoder.decode(value);
          
          // Skip keep-alive placeholders (whitespace-only) to avoid blank UI
          if (!receivedMeaningfulChunk) {
          if (chunkText.trim().length === 0) {
              continue;
          }
          receivedMeaningfulChunk = true;
          setLoading(false);
        }
        summaryText += chunkText;
        setSummary(summaryText);
        
        if (signal.aborted) break;
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        // console.log('Aborted during summary streaming');
      } else {
        throw error;
      }
    }
    
    if (!receivedMeaningfulChunk) {
      // Stream ended without meaningful content; end loading to reveal fallback UI
      setLoading(false);
    }

    // 如果没有检测到标记，正常结束流
    if (!signal.aborted && !gatingLimitReached) {
      setIsStreamingComplete(true);
    }

    return summaryText;
  }

  useEffect(() => {
    setLoading(true);
    setSummary('');
    fetchSummaryData();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [episode, language]);



  if (loading) {
    // Ensure we have loading steps, even if they haven't been initialized yet
    const stepsToShow = loadingSteps.length > 0 ? loadingSteps : [
      {
        id: 'lookup',
        title: t('loading.lookupSummary') || 'Checking channel information',
        status: 'pending' as const
      },
      {
        id: 'transcript',
        title: t('loading.checkTranscript') || 'Fetching episode data',
        status: 'pending' as const
      },
      {
        id: 'transcribing',
        title: t('loading.transcribing') || 'Transcribing audio (this may take a few minutes)',
        status: 'pending' as const
      },
      {
        id: 'summarizing',
        title: t('loading.summarizing') || 'Generating intelligent summary',
        status: 'pending' as const
      }
    ];

    return (
      <Loading 
        currentStep={currentStep}
        steps={stepsToShow}
      />
    );
  }

  return (
    <div className="prose prose-sm prose-gray max-w-none dark:prose-invert prose-headings:text-xl prose-p:leading-normal prose-headings:scroll-m-20 relative">
      
      {loading && !summary && (
        <div className="text-foreground/90 leading-normal">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-2">
              <RefreshCw className="h-10 w-10 text-gray-400 mx-auto" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {t('episode.noSummaryTitle') || 'No Summary Available'}
            </h3>
            <p className="text-gray-500 mb-4 max-w-md">
              {t('episode.noSummaryDescription') || 'Unable to generate summary for this episode. Please try again.'}
            </p>
            <Button 
              onClick={handleRetry}
              disabled={retrying}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} />
              {retrying ? (t('episode.retrying') || 'Retrying...') : (t('episode.retry') || 'Retry')}
            </Button>
          </div>
        </div>
      )}


      {!loading && summary && (
        <article className="text-foreground/90 leading-normal py-4 relative">
          <Markdown>{summary}</Markdown>
        </article>
      )}
      
    </div>
  );
});
