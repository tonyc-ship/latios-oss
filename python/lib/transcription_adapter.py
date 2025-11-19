"""
Transcription Adapter Layer
Supports multiple transcription providers: Deepgram and Local Whisper
"""
import os
import logging
import json
import time
from typing import List, Dict, Optional, Any
from enum import Enum
from pathlib import Path

logger = logging.getLogger(__name__)


class TranscriptionProvider(str, Enum):
    DEEPGRAM = "deepgram"
    WHISPER = "whisper"


class TranscriptionAdapter:
    """Unified interface for different transcription providers"""
    
    def __init__(self, provider: Optional[TranscriptionProvider] = None):
        """
        Initialize transcription adapter
        
        Args:
            provider: Transcription provider to use (deepgram or whisper)
                     If None, will auto-detect based on available API keys
        """
        self.provider = provider or self._detect_provider()
        self._client = None
        logger.info(f"Transcription Adapter initialized with provider: {self.provider}")
    
    def _detect_provider(self) -> TranscriptionProvider:
        """Auto-detect which provider to use based on available API keys"""
        deepgram_key = os.environ.get("DEEPGRAM_API_KEY")
        
        if deepgram_key:
            logger.info("Detected Deepgram API key, using Deepgram as provider")
            return TranscriptionProvider.DEEPGRAM
        else:
            logger.info("No Deepgram API key found, using local Whisper as provider")
            return TranscriptionProvider.WHISPER
    
    def _init_deepgram(self):
        """Initialize Deepgram client"""
        if self._client is None:
            try:
                from deepgram import DeepgramClient
                api_key = os.environ.get("DEEPGRAM_API_KEY")
                if not api_key:
                    raise ValueError("DEEPGRAM_API_KEY not found in environment")
                # DeepgramClient reads API key from DEEPGRAM_API_KEY environment variable automatically
                # Set timeout to 15 minutes (900 seconds) to handle long audio files
                # Deepgram supports up to 10 minutes processing time, so we need a longer client timeout
                self._client = DeepgramClient(timeout=900.0)
                logger.info("Deepgram client initialized successfully")
            except ImportError:
                raise ImportError(
                    "deepgram-sdk package not installed. Install with: pip install deepgram-sdk"
                )
        return self._client
    
    def _init_whisper(self):
        """Initialize local Whisper transcriber"""
        if self._client is None:
            from lib.whisper_transcriber import WhisperTranscriber
            model_size = os.environ.get("WHISPER_MODEL_SIZE", "base")
            self._client = WhisperTranscriber(model_name=model_size)
            logger.info(f"Whisper transcriber initialized with model: {model_size}")
        return self._client
    
    def transcribe(
        self,
        audio_path: str,
        language: str = "en",
        enable_speaker_diarization: bool = True,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Transcribe audio file
        
        Args:
            audio_path: Path to audio file or URL
            language: Language code (en, zh, ja, etc.)
            enable_speaker_diarization: Whether to identify different speakers
            **kwargs: Additional provider-specific options
            
        Returns:
            List of transcript segments in standard format:
            [{"StartMs": int, "EndMs": int, "FinalSentence": str, "SpeakerId": str}]
        """
        if self.provider == TranscriptionProvider.DEEPGRAM:
            return self._transcribe_deepgram(
                audio_path, language, enable_speaker_diarization, **kwargs
            )
        elif self.provider == TranscriptionProvider.WHISPER:
            return self._transcribe_whisper(audio_path, language, **kwargs)
    
    def _transcribe_deepgram(
        self,
        audio_path: str,
        language: str,
        enable_speaker_diarization: bool,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """Transcribe using Deepgram"""
        client = self._init_deepgram()
        
        logger.info(f"Starting Deepgram transcription for: {audio_path}")
        logger.info(f"Language: {language}, Diarization: {enable_speaker_diarization}")
        
        try:
            # Map language codes to Deepgram format
            language_map = {
                'en': 'en-US',
                'zh': 'zh-CN',
                'ja': 'ja',
                'es': 'es',
                'fr': 'fr',
                'de': 'de',
                'it': 'it',
                'pt': 'pt',
                'ru': 'ru',
                'ko': 'ko'
            }
            deepgram_lang = language_map.get(language, 'en-US')
            
            # Configure Deepgram options
            options = {
                'model': 'nova-3',  # Latest and most accurate model
                'language': deepgram_lang,
                'punctuate': True,
                'diarize': enable_speaker_diarization,
                'smart_format': True,  # Automatic formatting
                'utterances': True,  # Get natural speech boundaries
            }
            
            # Handle URL vs local file
            # Set request timeout to 15 minutes (900 seconds) for long audio processing
            # Deepgram supports up to 10 minutes processing, so we need longer timeout
            request_options = {"timeout_in_seconds": 900}
            
            if audio_path.startswith('http://') or audio_path.startswith('https://'):
                # URL-based transcription
                logger.info("Transcribing from URL")
                response = client.listen.v1.media.transcribe_url(
                    url=audio_path,
                    model="nova-3",
                    language=deepgram_lang,
                    punctuate=True,
                    diarize=enable_speaker_diarization,
                    smart_format=True,
                    utterances=True,
                    request_options=request_options
                )
            else:
                # File-based transcription
                logger.info("Transcribing from local file")
                with open(audio_path, 'rb') as audio_file:
                    response = client.listen.v1.media.transcribe_file(
                        request=audio_file.read(),
                        model="nova-3",
                        language=deepgram_lang,
                        punctuate=True,
                        diarize=enable_speaker_diarization,
                        smart_format=True,
                        utterances=True,
                        request_options=request_options
                    )
            
            # Convert Deepgram response to standard format
            segments = []
            
            # Use utterances if available (better segmentation)
            if hasattr(response.results, 'utterances') and response.results.utterances:
                for utterance in response.results.utterances:
                    segments.append({
                        'StartMs': int(utterance.start * 1000),
                        'EndMs': int(utterance.end * 1000),
                        'FinalSentence': utterance.transcript,
                        'SpeakerId': f"Speaker {utterance.speaker}" if enable_speaker_diarization else "Speaker 1"
                    })
            else:
                # Fallback to words-based segmentation
                if hasattr(response.results, 'channels') and response.results.channels:
                    alternatives = response.results.channels[0].alternatives[0]
                    words = alternatives.words if hasattr(alternatives, 'words') else []
                    
                    # Group words into segments
                    current_segment = []
                    segment_start = None
                    current_speaker = None
                    
                    for word in words:
                        if segment_start is None:
                            segment_start = word.start
                            current_speaker = getattr(word, 'speaker', 0) if enable_speaker_diarization else 0
                        
                        current_segment.append(word.word)
                        
                        # Create segment at punctuation or speaker change
                        is_end_punct = word.word.endswith(('.', '!', '?'))
                        speaker_changed = (
                            enable_speaker_diarization and 
                            hasattr(word, 'speaker') and 
                            word.speaker != current_speaker
                        )
                        
                        if is_end_punct or speaker_changed or len(current_segment) >= 50:
                            segments.append({
                                'StartMs': int(segment_start * 1000),
                                'EndMs': int(word.end * 1000),
                                'FinalSentence': ' '.join(current_segment),
                                'SpeakerId': f"Speaker {current_speaker + 1}"
                            })
                            current_segment = []
                            segment_start = None
                    
                    # Add remaining segment
                    if current_segment and words:
                        segments.append({
                            'StartMs': int(segment_start * 1000),
                            'EndMs': int(words[-1].end * 1000),
                            'FinalSentence': ' '.join(current_segment),
                            'SpeakerId': f"Speaker {current_speaker + 1}"
                        })
            
            logger.info(f"Deepgram transcription completed: {len(segments)} segments")
            return segments
            
        except Exception as e:
            logger.error(f"Deepgram transcription error: {e}")
            raise
    
    def _transcribe_whisper(
        self,
        audio_path: str,
        language: str,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """Transcribe using local Whisper"""
        whisper = self._init_whisper()
        
        logger.info(f"Starting Whisper transcription for: {audio_path}")
        logger.info(f"Language: {language}")
        
        try:
            # If audio_path is a URL, need to download it first
            local_path = audio_path
            temp_file = None
            
            if audio_path.startswith('http://') or audio_path.startswith('https://'):
                import tempfile
                import requests
                
                logger.info("Downloading audio from URL for local transcription")
                temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp3')
                
                response = requests.get(audio_path, stream=True)
                response.raise_for_status()
                
                for chunk in response.iter_content(chunk_size=8192):
                    temp_file.write(chunk)
                
                temp_file.close()
                local_path = temp_file.name
                logger.info(f"Downloaded to: {local_path}")
            
            # Transcribe with Whisper
            segments = whisper.transcribe(local_path, language=language)
            
            # Clean up temp file
            if temp_file and os.path.exists(temp_file.name):
                os.remove(temp_file.name)
                logger.info("Cleaned up temporary audio file")
            
            logger.info(f"Whisper transcription completed: {len(segments)} segments")
            return segments
            
        except Exception as e:
            logger.error(f"Whisper transcription error: {e}")
            # Clean up temp file on error
            if 'temp_file' in locals() and temp_file and os.path.exists(temp_file.name):
                try:
                    os.remove(temp_file.name)
                except:
                    pass
            raise
    
    def clean_chinese_text(self, text: str) -> str:
        """
        Clean Chinese text - remove unnecessary spaces and convert unicode escapes
        
        Args:
            text: Input text to clean
            
        Returns:
            Cleaned text
        """
        try:
            import re
            
            # First try to convert Unicode escape sequences to Chinese characters
            if '\\u' in text:
                try:
                    text = json.loads(f'"{text}"')
                except Exception:
                    try:
                        import codecs
                        text = codecs.decode(text, 'unicode_escape')
                    except Exception:
                        pass
            
            # Remove unnecessary spaces in Chinese text
            # Remove single spaces between Chinese characters
            text = re.sub(r'(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])', '', text)
            
            # Remove spaces before punctuation
            text = re.sub(r'\s+([，。！？；：,\.!?;:])', r'\1', text)
            
            # Remove excessive spaces after punctuation, but keep one space
            text = re.sub(r'([，。！？；：,\.!?;:])\s+', r'\1 ', text)
            
            # Remove leading and trailing spaces
            text = text.strip()
            
            # Replace multiple consecutive spaces with single space
            text = re.sub(r'\s+', ' ', text)
            
            return text
        except Exception as e:
            logger.error(f"Error cleaning Chinese text: {e}")
            return text

