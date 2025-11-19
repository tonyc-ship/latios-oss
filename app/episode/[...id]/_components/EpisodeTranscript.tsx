'use client'
import { useState, useEffect } from 'react';
import React from 'react';
import { useAuth } from '@/lib/auth';
import { toast } from '@/components/ui/use-toast';
import { generateTranscript } from '@/lib/transcription';
import { availableLanguages } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import Loading from './loading';
import Markdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

interface TranscriptSegment {
  EndMs: number;
  FinalSentence: string;
  SpeakerId: string;
  StartMs: number;
  FormattedTime: string;
  TranslatedSentence?: string;
}

interface MinuteSegment {
  minute: number;
  segments: TranscriptSegment[];
}

interface RawTranscriptSegment {
  FinalSentence: string;
  StartMs: number | string;
  EndMs: number | string;
  SpeakerId: string | number;
}

interface MinuteGroup {
  minute: number;
  segments: RawTranscriptSegment[];
}

const DISPLAY_MODE_KEY = 'translationDisplayMode';
const DEFAULT_DISPLAY_MODE = 'sideBySide';
const DEFAULT_LANGUAGE = '1';

// Convert milliseconds to HH:MM:SS format
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  // Format as HH:MM:SS
  return [
    hours > 0 ? String(hours).padStart(2, '0') : '',
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0')
  ].filter(Boolean).join(':');
}

interface EpisodeTranscriptProps {
  episode?: any;
  language: string;
  onContentChange?: (content: string) => void;
  showTranslation?: boolean;
  translationMode?: 'sideBySide' | 'translationOnly';
}

export default React.memo(function EpisodeTranscript({ 
  episode, 
  language, 
  onContentChange,
  showTranslation = false,
  translationMode = DEFAULT_DISPLAY_MODE
}: EpisodeTranscriptProps) {
  // State
  const [loading, setLoading] = useState(true);
  const [minuteSegments, setMinuteSegments] = useState<MinuteSegment[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`transcript_${episode?.id}`);
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [translatedMinuteSegments, setTranslatedMinuteSegments] = useState<MinuteSegment[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`transcript_${episode?.id}_translated`);
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [displayMode, setDisplayMode] = useState<'sideBySide' | 'translationOnly'>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(DISPLAY_MODE_KEY) as 'sideBySide' | 'translationOnly' || DEFAULT_DISPLAY_MODE;
    }
    return DEFAULT_DISPLAY_MODE;
  });

  // Hooks
  const auth = useAuth();
  const user = auth?.user;
  const userId = user?.id;
  // No subscription checks, all content is free
  const { t, i18n } = useTranslation();
  const languageCode = i18n.language;
  const router = useRouter();

  // Handlers
  const updateDisplayMode = (mode: 'sideBySide' | 'translationOnly') => {
    setDisplayMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem(DISPLAY_MODE_KEY, mode);
    }
  };

  // Subscribe functionality removed

  const getTranscriptData = async (targetLanguage: string = DEFAULT_LANGUAGE) => {
    try {
      const response = await fetch(`/api/episode/transcript?episodeId=${episode.id}&language=${targetLanguage}`,
        {
          headers: {
            'Authorization': `Bearer ${auth?.session?.access_token}`
          }
        }
      );
      if (!response.ok) return null;

      const data = await response.json();
      if (!data.content) return null;

      try {
        let parsedData: any;
        try {
          parsedData = JSON.parse(data.content);
        } catch (parseError) {
          // Database content is not JSON (e.g., plain text), wrap it for error tolerance
          parsedData = [{
            FinalSentence: String(data.content),
            StartMs: 0,
            EndMs: 0,
            SpeakerId: 'Speaker 1',
            FormattedTime: '00:00'
          }];
        }

        // Validate data format
        if (!Array.isArray(parsedData)) {
          console.error('Invalid transcript data format: not an array', parsedData);
          return null;
        }

        // Check if data is already in minute-grouped format
        const isPreGrouped = parsedData.length > 0 &&
          typeof parsedData[0] === 'object' &&
          'minute' in parsedData[0] &&
          'segments' in parsedData[0];

        if (isPreGrouped) {
          // Validate each minute segment's data format
          const invalidSegments = parsedData.filter(minute => {
            if (!Array.isArray(minute.segments)) {
              return true;
            }

            const hasInvalidSegments = minute.segments.some((segment: RawTranscriptSegment) =>
              !(typeof segment === 'object' &&
                typeof segment.FinalSentence === 'string' &&
                (typeof segment.StartMs === 'number' || typeof segment.StartMs === 'string') &&
                (typeof segment.EndMs === 'number' || typeof segment.EndMs === 'string') &&
                (typeof segment.SpeakerId === 'string' || typeof segment.SpeakerId === 'number'))
            );

            if (hasInvalidSegments) {
              console.log('Invalid segments in minute:', minute);
            }

            return hasInvalidSegments;
          });

          if (invalidSegments.length > 0) {
            console.error('Invalid minute segments found:', invalidSegments);
            return null;
          }

          // Process each minute segment's data
          const processedSegments = parsedData.map((minute: MinuteGroup) => ({
            minute: minute.minute,
            segments: minute.segments.map((segment: RawTranscriptSegment) => ({
              ...segment,
              StartMs: typeof segment.StartMs === 'string' ? parseInt(segment.StartMs) : segment.StartMs,
              EndMs: typeof segment.EndMs === 'string' ? parseInt(segment.EndMs) : segment.EndMs,
              SpeakerId: String(segment.SpeakerId),
              FormattedTime: formatTime(typeof segment.StartMs === 'string' ? parseInt(segment.StartMs) : segment.StartMs)
            }))
          }));

          // Save to localStorage
          if (typeof window !== 'undefined') {
            localStorage.setItem(`transcript_${episode.id}`, JSON.stringify(processedSegments));
          }

          return processedSegments;
        }

        // If not pre-grouped format, process with original logic
        // Validate each segment's data format
        const invalidSegments = parsedData.filter((segment: RawTranscriptSegment) => {
          // More tolerant validation that handles null values and edge cases
          const isValid = typeof segment === 'object' &&
            typeof segment.FinalSentence === 'string' &&
            (typeof segment.StartMs === 'number' || typeof segment.StartMs === 'string') &&
            (typeof segment.EndMs === 'number' || typeof segment.EndMs === 'string' || segment.EndMs === null) &&
            (typeof segment.SpeakerId === 'string' || typeof segment.SpeakerId === 'number');

          if (!isValid) {
            console.log('Invalid segment:', segment);
            console.log('Segment types:', {
              FinalSentence: typeof segment.FinalSentence,
              StartMs: typeof segment.StartMs,
              EndMs: typeof segment.EndMs,
              SpeakerId: typeof segment.SpeakerId
            });
          }

          return !isValid;
        });

        if (invalidSegments.length > 0) {
          console.error('Invalid segments found:', invalidSegments);
          console.error('Expected format:', {
            FinalSentence: 'string',
            StartMs: 'number or string',
            EndMs: 'number or string',
            SpeakerId: 'string or number'
          });
          return null;
        }

        // Convert data to required format
        const minuteSegments: MinuteSegment[] = [];
        let currentMinute = 0;
        let currentSegments: TranscriptSegment[] = [];

        parsedData.forEach((segment: RawTranscriptSegment, index) => {
          // Ensure numeric types are correct
          const startMs = typeof segment.StartMs === 'string' ? parseInt(segment.StartMs) : segment.StartMs;
          const endMs = typeof segment.EndMs === 'string' ? parseInt(segment.EndMs) : segment.EndMs;
          const speakerId = String(segment.SpeakerId); // Ensure SpeakerId is a string

          const minute = Math.floor(startMs / 60000);

          if (minute !== currentMinute) {
            if (currentSegments.length > 0) {
              minuteSegments.push({
                minute: currentMinute,
                segments: currentSegments
              });
            }
            currentMinute = minute;
            currentSegments = [];
          }

          currentSegments.push({
            ...segment,
            StartMs: startMs,
            EndMs: endMs,
            SpeakerId: speakerId,
            FormattedTime: formatTime(startMs)
          });

          // Handle last segment
          if (index === parsedData.length - 1) {
            minuteSegments.push({
              minute: currentMinute,
              segments: currentSegments
            });
          }
        });

        // Save to localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem(`transcript_${episode.id}`, JSON.stringify(minuteSegments));
        }

        return minuteSegments;
      } catch (e) {
        console.error('Error parsing transcript data:', e);
        return null;
      }
    } catch (error) {
      console.error('Error fetching transcript data:', error);
      return null;
    }
  }

  const generateTranscripted = async (language: string = DEFAULT_LANGUAGE) => {
    if (!userId) throw new Error("userId is undefined");

    if (!episode?.podcast_name) {
      toast({
        title: "Missing Data",
        description: "Podcast name is required but missing",
        //variant: "destructive",
      });
      throw new Error("podcast_name is required");
    }

    try {
      const transcriptData = await generateTranscript(
        episode.id,
        episode.type,
        episode.podcast_name,
        episode.title,
        episode.itunes_duration,
        episode.pub_date,
        userId,
        user?.user_metadata?.full_name || user?.user_metadata?.name || '',
        user?.email || '',
        episode.enclosure_url,
        auth
      )
      if (!transcriptData) {
        console.error('No transcript data returned');
        return null;
      }

      try {
        console.log('Raw transcript data:', transcriptData);
        
        // Check if transcriptData is already an object or needs to be parsed
        let parsedData;
        if (typeof transcriptData === 'string') {
          try {
            parsedData = JSON.parse(transcriptData);
          } catch (parseError) {
            console.error('Error parsing transcript data as JSON:', parseError);
            // If it's not valid JSON, treat it as plain text and create a simple segment
            parsedData = [{
              FinalSentence: transcriptData,
              StartMs: 0,
              EndMs: 0,
              SpeakerId: 'Speaker 1',
              FormattedTime: '00:00'
            }];
          }
        } else {
          parsedData = transcriptData;
        }
        
        console.log('Parsed transcript data:', parsedData);

        // Validate data format
        if (!Array.isArray(parsedData)) {
          console.error('Invalid transcript data format: not an array', parsedData);
          return null;
        }

        // Check if data is already in minute-grouped format
        const isPreGrouped = parsedData.length > 0 &&
          typeof parsedData[0] === 'object' &&
          'minute' in parsedData[0] &&
          'segments' in parsedData[0];

        if (isPreGrouped) {
          console.log('Data is already grouped by minute');
          // Validate each minute segment's data format
          const invalidSegments = parsedData.filter(minute => {
            if (!Array.isArray(minute.segments)) {
              console.log('Invalid minute segment:', minute);
              return true;
            }

            const hasInvalidSegments = minute.segments.some((segment: RawTranscriptSegment) =>
              !(typeof segment === 'object' &&
                typeof segment.FinalSentence === 'string' &&
                (typeof segment.StartMs === 'number' || typeof segment.StartMs === 'string') &&
                (typeof segment.EndMs === 'number' || typeof segment.EndMs === 'string') &&
                (typeof segment.SpeakerId === 'string' || typeof segment.SpeakerId === 'number'))
            );

            if (hasInvalidSegments) {
              console.log('Invalid segments in minute:', minute);
            }

            return hasInvalidSegments;
          });

          if (invalidSegments.length > 0) {
            console.error('Invalid minute segments found:', invalidSegments);
            return null;
          }

          // Process each minute segment's data
          const processedSegments = parsedData.map((minute: MinuteGroup) => ({
            minute: minute.minute,
            segments: minute.segments.map((segment: RawTranscriptSegment) => ({
              ...segment,
              StartMs: typeof segment.StartMs === 'string' ? parseInt(segment.StartMs) : segment.StartMs,
              EndMs: typeof segment.EndMs === 'string' ? parseInt(segment.EndMs) : segment.EndMs,
              SpeakerId: String(segment.SpeakerId),
              FormattedTime: formatTime(typeof segment.StartMs === 'string' ? parseInt(segment.StartMs) : segment.StartMs)
            }))
          }));

          // Save to localStorage
          if (typeof window !== 'undefined') {
            localStorage.setItem(`transcript_${episode.id}`, JSON.stringify(processedSegments));
          }

          return processedSegments;
        }

        // If not pre-grouped format, process with original logic
        console.log('Processing raw segment data');
        // Validate each segment's data format
        const invalidSegments = parsedData.filter((segment: RawTranscriptSegment) => {
          // More tolerant validation that handles null values and edge cases
          const isValid = typeof segment === 'object' &&
            typeof segment.FinalSentence === 'string' &&
            (typeof segment.StartMs === 'number' || typeof segment.StartMs === 'string') &&
            (typeof segment.EndMs === 'number' || typeof segment.EndMs === 'string' || segment.EndMs === null) &&
            (typeof segment.SpeakerId === 'string' || typeof segment.SpeakerId === 'number');

          if (!isValid) {
            console.log('Invalid segment:', segment);
            console.log('Segment types:', {
              FinalSentence: typeof segment.FinalSentence,
              StartMs: typeof segment.StartMs,
              EndMs: typeof segment.EndMs,
              SpeakerId: typeof segment.SpeakerId
            });
          }

          return !isValid;
        });

        if (invalidSegments.length > 0) {
          console.error('Invalid segments found:', invalidSegments);
          console.error('Expected format:', {
            FinalSentence: 'string',
            StartMs: 'number or string',
            EndMs: 'number or string',
            SpeakerId: 'string or number'
          });
          return null;
        }

        // Convert data to required format
        const minuteSegments: MinuteSegment[] = [];
        let currentMinute = 0;
        let currentSegments: TranscriptSegment[] = [];

        parsedData.forEach((segment: RawTranscriptSegment, index) => {
          // Ensure numeric types are correct
          const startMs = typeof segment.StartMs === 'string' ? parseInt(segment.StartMs) : segment.StartMs;
          let endMs = typeof segment.EndMs === 'string' ? parseInt(segment.EndMs) : segment.EndMs;
          const speakerId = String(segment.SpeakerId); // Ensure SpeakerId is a string

          // Handle null or invalid EndMs values
          if (endMs === null || isNaN(endMs) || endMs <= startMs) {
            endMs = startMs + 3000; // Default to 3 seconds duration
          }

          const minute = Math.floor(startMs / 60000);

          if (minute !== currentMinute) {
            if (currentSegments.length > 0) {
              minuteSegments.push({
                minute: currentMinute,
                segments: currentSegments
              });
            }
            currentMinute = minute;
            currentSegments = [];
          }

          currentSegments.push({
            ...segment,
            StartMs: startMs,
            EndMs: endMs,
            SpeakerId: speakerId,
            FormattedTime: formatTime(startMs)
          });

          // Handle last segment
          if (index === parsedData.length - 1) {
            minuteSegments.push({
              minute: currentMinute,
              segments: currentSegments
            });
          }
        });

        // Save to localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem(`transcript_${episode.id}`, JSON.stringify(minuteSegments));
        }

        return minuteSegments;
      } catch (e) {
        console.error('Error parsing transcript data:', e);
        return null;
      }
    } catch (e) {
      console.error('Error generating transcript:', e);
      throw e;
    }
  };

  const handleTranslationToggle = async () => {
    try {
      setLoading(true);
      let parsedData = await getTranscriptData("2");

      if (!parsedData) {
        const translation = await fetch('/api/media/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            episodeId: episode.id,
            podcastName: episode.podcast_name,
            episodeTitle: episode.title,
            episodePubDate: episode.pub_date,
            userId: userId,
            content: JSON.stringify(minuteSegments.map(minute => ({
              minute: minute.minute,
              segments: minute.segments.map(segment => ({
                FinalSentence: segment.FinalSentence
              }))
            }))),
            targetLanguage: 2
          })
        });
        
        if (translation.ok) {
          parsedData = await translation.json();
          // Save translation to localStorage
          if (typeof window !== 'undefined') {
            localStorage.setItem(`transcript_${episode.id}_translated`, JSON.stringify(parsedData));
          }
        }
      }

      if (parsedData) {
        setTranslatedMinuteSegments(parsedData);
      }
    } catch (error) {
      console.error('Error fetching translation data:', error);
      setTranslatedMinuteSegments([]);
      toast({
        title: t('episode.translationError'),
        description: t('episode.translationErrorDescription'),
        //variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchTranscriptData = async (episode: any) => {
    try {
      setLoading(true);
      let parsedData = await getTranscriptData(episode?.type === 'xyz'? '2':'1');

      if (!parsedData) {
        parsedData = await generateTranscripted(episode?.type === 'xyz'? '2':'1');
      }

      if (parsedData) {
        setMinuteSegments(parsedData);
        const textContent = parsedData
          .map(minute => minute.segments.map(segment => segment.FinalSentence).join('\n\n'))
          .join('\n\n');
        onContentChange?.(textContent);
      } else {
        toast({
          title: t('episode.transcriptError'),
          description: t('episode.transcriptErrorDescription'),
          //variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Error fetching transcript data:', error);
      setMinuteSegments([]);
      toast({
        title: "Operation failed",
        description: error.name === 'AbortError' ? "transcript aborted" : "transcript error",
        //variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Effects
  useEffect(() => {
    fetchTranscriptData(episode);
  }, [episode]);

  useEffect(() => {
    if (showTranslation) {
      handleTranslationToggle();
    }
  }, [showTranslation]);

  useEffect(() => {
    if (translationMode) {
      updateDisplayMode(translationMode);
    }
  }, [translationMode]);

  // Subscription checks removed

  // Render helpers
  const renderTranscriptSegment = (segment: TranscriptSegment) => {
    // Handle SpeakerId display format
    const formatSpeakerId = (speakerId: string) => {
      // If already in "Speaker X" format, return directly
      if (speakerId.startsWith('Speaker ')) {
        return speakerId;
      }
      
      // If it's a number (string form), convert to "Speaker X" format
      const speakerNum = parseInt(speakerId);
      if (!isNaN(speakerNum)) {
        return `Speaker ${speakerNum + 1}`; // Start from 1
      }
      
      // If other format, try to extract number
      const match = speakerId.match(/(\d+)/);
      if (match) {
        return `Speaker ${parseInt(match[1]) + 1}`;
      }
      
      // If cannot parse, return original value
      return speakerId;
    };

    return (
      <div className="p-2 sm:p-3 bg-white/50 rounded-lg shadow-sm space-y-2 mb-4">
        <div className="flex items-center justify-between">
          <div className="font-medium text-gray-700 dark:text-gray-300">
            {formatSpeakerId(segment.SpeakerId)}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {formatTime(segment.StartMs)}
          </div>
        </div>
        <div className="text-foreground/90 leading-normal">
          <div className="whitespace-pre-wrap break-words">
            {segment.FinalSentence}
          </div>
          {showTranslation && segment.TranslatedSentence && (
            <div className={`mt-2 ${translationMode === 'sideBySide' ? 'ml-4' : ''} text-foreground/70`}>
              <div className="whitespace-pre-wrap break-words">
                {segment.TranslatedSentence}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render
  if (loading) return <Loading />;

  if (minuteSegments.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        {t('episode.noTranscriptAvailable', {
          language: availableLanguages.find(
            (lang) => lang.code === language
          )?.[languageCode === 'zh' ? 'cnName' : 'enName']
        })}
      </div>
    );
  }

  return (
    <div className="w-full relative">
      <div className="space-y-2">
        {minuteSegments.map((minute, minuteIndex) => (
          <div key={minuteIndex}>
            {minute.segments.map((segment, segmentIndex) => (
              <React.Fragment key={segmentIndex}>
                {renderTranscriptSegment(segment)}
              </React.Fragment>
            ))}
          </div>
        ))}
      </div>
      
      {/* Premium overlay removed - all content is free */}
    </div>
  );
});