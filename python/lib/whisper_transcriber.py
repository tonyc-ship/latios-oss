"""
Local Whisper transcription service using whisper.cpp via pywhispercpp
Supports Metal acceleration on Mac for optimal performance
"""
import os
import json
import logging
import re
from typing import List, Dict, Optional
from pathlib import Path

logger = logging.getLogger(__name__)


class WhisperTranscriber:
    """Local transcription using whisper.cpp (Metal-accelerated on Mac)"""
    
    def __init__(self, model_name: str = "base"):
        """
        Initialize Whisper model
        
        Args:
            model_name: Model size - tiny, base, small, medium, large-v2, large-v3
                       Sizes: tiny=75MB, base=142MB, small=466MB, medium=1.5GB, large=2.9GB
                       Note: Using multilingual models (not .en versions) for multi-language support
        """
        self.model_name = model_name
        self._model = None
        self._model_dir = Path.home() / ".cache" / "whisper"
        self._model_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"WhisperTranscriber initialized with model: {model_name}")
    
    def _init_model(self):
        """Lazy load the model"""
        if self._model is None:
            try:
                from pywhispercpp.model import Model
                
                logger.info(f"Loading Whisper model: {self.model_name}")
                logger.info(f"Model directory: {self._model_dir}")
                
                # Model will be downloaded automatically if not present
                # Metal acceleration is automatically used on Mac if available
                self._model = Model(
                    self.model_name,
                    models_dir=str(self._model_dir),
                    # Allow whisper.cpp logs to show progress
                    redirect_whispercpp_logs_to=False,  # Show progress logs
                )
                
                logger.info(f"Whisper model '{self.model_name}' loaded successfully")
                
            except Exception as e:
                logger.error(f"Failed to load Whisper model: {e}")
                raise
        
        return self._model
    
    def transcribe(
        self,
        audio_path: str,
        language: Optional[str] = None,
        translate_to_english: bool = False,
    ) -> List[Dict]:
        """
        Transcribe audio file
        
        Args:
            audio_path: Path to audio file (mp3, wav, m4a, etc.)
            language: ISO language code (en, zh, ja, etc.) or None for auto-detect
            translate_to_english: If True, translate to English
            
        Returns:
            List of segments with StartMs, EndMs, FinalSentence, SpeakerId format
            Example: [{"StartMs": 0, "EndMs": 5000, "FinalSentence": "Hello world", "SpeakerId": "Speaker 1"}]
        """
        model = self._init_model()
        
        # Get file size for logging
        import os
        file_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
        
        logger.info(f"=" * 60)
        logger.info(f"Starting Whisper transcription")
        logger.info(f"Audio file: {audio_path} ({file_size_mb:.2f} MB)")
        logger.info(f"Language: {language or 'auto-detect'}")
        logger.info(f"Model: {self.model_name}")
        logger.info(f"=" * 60)
        
        try:
            # Transcribe with whisper.cpp
            # pywhispercpp automatically uses Metal on Mac for acceleration
            # Progress will be shown in real-time below
            segments = model.transcribe(
                audio_path,
                language=language,
                translate=translate_to_english,
            )
            
            # Convert to the expected format
            result = []
            for segment in segments:
                result.append({
                    "StartMs": int(segment.t0 * 10),  # pywhispercpp returns centiseconds, convert to milliseconds
                    "EndMs": int(segment.t1 * 10),    # multiply by 10 to get milliseconds
                    "FinalSentence": segment.text.strip(),
                    "SpeakerId": "Speaker 1"  # Whisper doesn't do speaker diarization by default
                })
            
            logger.info(f"=" * 60)
            logger.info(f"✓ Transcription complete: {len(result)} segments generated")
            logger.info(f"=" * 60)
            return result
            
        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            raise
    
    def clean_chinese_text(self, text: str) -> str:
        """
        Clean Chinese text - remove unnecessary spaces and convert unicode escapes
        Reused from latios_transcribe.py logic
        
        Args:
            text: Input text to clean
            
        Returns:
            Cleaned text
        """
        try:
            # First try to convert Unicode escape sequences to Chinese characters
            if '\\u' in text:
                try:
                    # Use json.loads to handle unicode escape sequences
                    text = json.loads(f'"{text}"')
                except Exception:
                    try:
                        # Backup method: use codecs.decode
                        import codecs
                        text = codecs.decode(text, 'unicode_escape')
                    except Exception:
                        try:
                            text = text.encode('utf-8').decode('unicode_escape')
                        except UnicodeDecodeError:
                            try:
                                text = text.encode('latin-1').decode('unicode_escape')
                            except:
                                pass  # If conversion fails, keep original text
            
            # Remove unnecessary spaces in Chinese text
            # Remove single spaces between Chinese characters (Chinese doesn't need word spacing)
            text = re.sub(r'(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])', '', text)
            
            # Remove spaces before punctuation
            text = re.sub(r'\s+([，。！？；：,\.!?;:])', r'\1', text)
            
            # Remove excessive spaces after punctuation, but keep one space (for sentence separation)
            text = re.sub(r'([，。！？；：,\.!?;:])\s+', r'\1 ', text)
            
            # Remove leading and trailing spaces
            text = text.strip()
            
            # Replace multiple consecutive spaces with single space
            text = re.sub(r'\s+', ' ', text)
            
            return text
        except Exception as e:
            logger.error(f"Error cleaning Chinese text: {e}")
            return text

