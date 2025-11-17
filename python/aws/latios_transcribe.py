from fastapi import FastAPI, BackgroundTasks, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from pathlib import Path
from typing import Optional, Dict, List, Any
from pydantic import BaseModel, HttpUrl
from datetime import datetime
from enum import Enum
import uvicorn
import boto3
import json
import os
import sys
import time
import requests
import logging
import re
from urllib.parse import urlparse
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

# Add parent directory to path for lib imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from lib.whisper_transcriber import WhisperTranscriber

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load environment variables
env_files = ['../../.env', '../../.env.local']
for env_file in env_files:
    env_path = Path(env_file)
    if env_path.exists():
        from dotenv import load_dotenv
        load_dotenv(env_path)
        logger.info(f"Loaded environment variables from {env_file}")

# Constants
DEFAULT_REGION = "ap-northeast-1"
BLOCKED_DOMAINS = ['substack', 'cloudfront', 'acast.com']
TEMP_AUDIO_DIR = "./audio_tmp"
TRANSCRIPTION_MODE = os.environ.get("TRANSCRIPTION_MODE", "aws")  # "aws" or "local"
WHISPER_MODEL_SIZE = os.environ.get("WHISPER_MODEL_SIZE", "base")  # Model size for local transcription

# Transcription Mode Enum
class TranscriptionMode(str, Enum):
    AWS = "aws"
    LOCAL = "local"

# Models
class TranscriptionRequest(BaseModel):
    url: HttpUrl
    episode_id: str
    channel_title: Optional[str] = None
    podcast_name: Optional[str] = None  # 兼容旧的参数名
    episode_title: str
    pub_date: Optional[str] = None
    episode_pub_date: Optional[str] = None  # 兼容旧的参数名
    user_id: Optional[str] = 'guest'
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    force_download: Optional[bool] = False
    type: Optional[str] = 'apple'
    mode: Optional[TranscriptionMode] = None  # Transcription mode: aws or local

    def get_channel_title(self) -> str:
        return self.channel_title or self.podcast_name or ''

    def get_pub_date(self) -> str:
        pub_date = self.pub_date or self.episode_pub_date
        if pub_date:
            return pub_date
        else:
            # Return current UTC time if no pub_date provided
            return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

class TranscriptionSegment(BaseModel):
    StartMs: int
    EndMs: int
    FinalSentence: str
    SpeakerId: str
    FormattedTime: str

class MinuteSegment(BaseModel):
    minute: int
    segments: List[TranscriptionSegment]

class TranscriptionStatus(BaseModel):
    status: str
    progress: Optional[float] = None
    error: Optional[str] = None
    message: Optional[str] = None

    def get_status_message(self) -> str:
        status_messages = {
            "pending": "任务已创建，等待处理",
            "downloading": "正在下载音频文件",
            "uploading": "正在上传音频文件到云端",
            "transcribing": "正在转录音频",
            "completed": "转录完成",
            "failed": "转录失败"
        }
        return status_messages.get(self.status, "未知状态")

    def get_progress_percentage(self) -> float:
        progress_map = {
            "pending": 0.0,
            "downloading": 25.0,
            "uploading": 50.0,
            "transcribing": 75.0,
            "completed": 100.0,
            "failed": 0.0
        }
        return progress_map.get(self.status, 0.0)

# AWS Configuration
class AWSConfig:
    def __init__(self):
        self.access_key_id = os.environ.get("AWS_ACCESS_KEY_ID")
        self.secret_access_key = os.environ.get("AWS_SECRET_ACCESS_KEY")
        self.region = os.environ.get("AWS_REGION", DEFAULT_REGION)
        self.bucket_name = os.environ.get("AWS_S3_BUCKET")

        if not all([self.access_key_id, self.secret_access_key, self.bucket_name]):
            logger.error("Missing required AWS credentials")
            raise ValueError("Missing required AWS credentials")

        logger.info(f"AWS Configuration initialized with region: {self.region}")

    def get_client(self, service: str) -> Any:
        return boto3.client(
            service,
            aws_access_key_id=self.access_key_id,
            aws_secret_access_key=self.secret_access_key,
            region_name=self.region
        )

class Transcriber:
    def __init__(self):
        self.aws_config = AWSConfig()
        self.transcribe_client = self.aws_config.get_client('transcribe')
        self.s3_client = self.aws_config.get_client('s3')
        os.makedirs(TEMP_AUDIO_DIR, exist_ok=True)

    def clean_chinese_text(self, text: str) -> str:
        """清理中文文本：转换ASCII码并去除多余空格"""
        try:
            # 首先尝试将Unicode转义序列转换为中文字符
            if '\\u' in text:
                try:
                    # 使用json.loads来处理unicode转义序列，这是最可靠的方法
                    import json
                    text = json.loads(f'"{text}"')
                except Exception:
                    try:
                        # 备用方法：使用codecs.decode
                        import codecs
                        text = codecs.decode(text, 'unicode_escape')
                    except Exception:
                        try:
                            text = text.encode('utf-8').decode('unicode_escape')
                        except UnicodeDecodeError:
                            try:
                                text = text.encode('latin-1').decode('unicode_escape')
                            except:
                                pass  # 如果转换失败，保持原文本
            
            # 去除中文文本中的多余空格
            import re
            
            # 去除中文词汇间的单个空格（中文不需要单词间空格）
            text = re.sub(r'(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])', '', text)
            
            # 去除标点符号前的空格
            text = re.sub(r'\s+([，。！？；：,\.!?;:])', r'\1', text)
            
            # 去除标点符号后的多余空格，但保留一个空格（用于句子分隔）
            text = re.sub(r'([，。！？；：,\.!?;:])\s+', r'\1 ', text)
            
            # 去除行首行尾空格
            text = text.strip()
            
            # 将多个连续空格替换为单个空格
            text = re.sub(r'\s+', ' ', text)
            
            return text
        except Exception as e:
            logger.error(f"Error cleaning Chinese text: {e}")
            return text

    def download_audio(self, url: str) -> str:
        try:
            os.makedirs(TEMP_AUDIO_DIR, exist_ok=True)
            parsed_url = urlparse(url)
            original_filename = os.path.basename(parsed_url.path)

            if not original_filename:
                import hashlib
                original_filename = hashlib.md5(url.encode()).hexdigest() + '.mp3'

            safe_filename = re.sub(r'[^\w\-_\.]', '_', original_filename)
            save_path = os.path.join(TEMP_AUDIO_DIR, safe_filename)

            # Headers to mimic a real browser and avoid 403 errors
            headers = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'audio/mpeg, audio/*, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'audio',
                'Sec-Fetch-Mode': 'no-cors',
                'Sec-Fetch-Site': 'cross-site'
            }
            response = requests.get(url, stream=True, headers=headers)
            response.raise_for_status()

            with open(save_path, "wb") as file:
                for chunk in response.iter_content(chunk_size=8192):
                    file.write(chunk)

            logger.info(f"Downloaded: {save_path}")
            return save_path

        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to download file: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to download file: {str(e)}")

    def upload_to_s3(self, local_file: str) -> str:
        try:
            filename = os.path.basename(local_file)
            self.s3_client.upload_file(local_file, self.aws_config.bucket_name, filename)
            s3_url = f"s3://{self.aws_config.bucket_name}/{filename}"

            if os.path.exists(local_file):
                os.remove(local_file)
                logger.info(f"Deleted temporary file: {local_file}")

            return s3_url

        except Exception as e:
            logger.error(f"Error uploading file to S3: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to upload to S3: {str(e)}")

    def process_url(self, url: str, force_download: bool = False) -> str:
        if not force_download and not any(domain in url for domain in BLOCKED_DOMAINS):
            return url

        logger.info(f'Processing audio URL: {url}')
        # count time of download + upload
        start_time = time.time()
        local_file = self.download_audio(url)
        end_time = time.time()
        logger.info(f'Download time: {end_time - start_time} seconds')
        start_time = time.time()
        s3_url = self.upload_to_s3(local_file)
        end_time = time.time()
        logger.info(f'Upload time: {end_time - start_time} seconds')
        return s3_url

    def save_to_db(self, episode_id: str, channel_title: str, episode_title: str,
                  pub_date: str, user_id: str, status: int, transcript: str = '', is_chinese: bool = False) -> None:
        try:
            url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
            key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

            if not url or not key:
                logger.warning('Supabase credentials not found, skipping database save')
                return

            # Validate and format pub_date
            if not pub_date or pub_date.strip() == "":
                pub_date = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
                logger.info(f"Using current time for pub_date: {pub_date}")
            
            supabase: Client = create_client(url, key)
            current_time = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

            data = {
                "episode_id": episode_id,
                "show_title": channel_title or "",
                "episode_title": episode_title or "",
                "language": 2 if is_chinese else 1,  # 中文=2，英文=1
                "content": transcript or "",
                "publish_date": pub_date,
                "count": 1,
                "create_user_id": user_id or "guest",
                "update_user_id": user_id or "guest",
                "create_time": current_time,
                "update_time": current_time,
                "status": status
            }

            logger.info(f'Saving to database with data: {data}')
            supabase.table("tbl_transcript").upsert(data, on_conflict='episode_id,language').execute()

            logger.info(f'Successfully saved to database with status {status}')

        except Exception as e:
            logger.error(f"Failed to save to database: {str(e)}")
            # Don't raise HTTPException here, just log the error
            # This allows the transcription to continue even if DB save fails
            logger.warning("Continuing transcription process despite database save failure")

    def process_transcript_data(self, transcript_data: Dict, is_chinese: bool = False) -> List[MinuteSegment]:
        segments = []
        current_minute = -1
        minute_segments = []
        speaker_count = 1
        speaker_map = {}
        current_sentence = []
        sentence_start_time = None
        current_speaker = None

        try:
            items = transcript_data['results']['items']
            i = 0

            while i < len(items):
                item = items[i]

                if item['type'] != 'punctuation':
                    start_time = float(item['start_time'])
                    speaker_label = item.get('speaker_label', 'spk_0')

                    if sentence_start_time is None:
                        sentence_start_time = start_time
                        if speaker_label not in speaker_map:
                            speaker_map[speaker_label] = f"Speaker {speaker_count}"
                            speaker_count += 1
                        current_speaker = speaker_label

                    if 'alternatives' in item and item['alternatives']:
                        word = item['alternatives'][0]['content']
                        current_sentence.append(word)

                        # Look ahead for punctuation
                        next_idx = i + 1
                        if next_idx < len(items) and items[next_idx]['type'] == 'punctuation':
                            punct = items[next_idx]['alternatives'][0]['content']
                            current_sentence[-1] += punct
                            i += 1

                # Check for segment breaks
                should_create_segment = False
                if current_sentence:
                    last_word = current_sentence[-1]
                    is_sentence_end = any(last_word.endswith(marker) for marker in ['.', '!', '?'])

                    if i + 1 < len(items):
                        next_item = items[i + 1]
                        if next_item['type'] != 'punctuation':
                            next_time = float(next_item['start_time'])
                            next_speaker = next_item.get('speaker_label', 'spk_0')

                            should_create_segment = (
                                (is_sentence_end and next_time - start_time > 4.0 and len(current_sentence) >= 20) or
                                (next_speaker != current_speaker and is_sentence_end and len(current_sentence) >= 15) or
                                (len(current_sentence) >= 150)
                            )
                    elif current_sentence:
                        should_create_segment = True

                if should_create_segment and current_sentence:
                    sentence = ' '.join(current_sentence)
                    # 如果是中文内容，进行文本清理（包括ASCII码转换）
                    if is_chinese:
                        sentence = self.clean_chinese_text(sentence)
                    start_ms = int(sentence_start_time * 1000)
                    end_ms = int(float(item.get('end_time', start_time)) * 1000)
                    current_item_minute = int(sentence_start_time / 60)

                    if current_minute != -1 and current_minute != current_item_minute:
                        if minute_segments:
                            segments.append(MinuteSegment(minute=current_minute, segments=minute_segments))
                            minute_segments = []

                    current_minute = current_item_minute
                    minute_segments.append(TranscriptionSegment(
                        StartMs=start_ms,
                        EndMs=end_ms,
                        FinalSentence=sentence,
                        SpeakerId=speaker_map.get(current_speaker, "Speaker 1"),
                        FormattedTime=time.strftime("%H:%M:%S", time.gmtime(start_ms/1000))
                    ))

                    current_sentence = []
                    if i + 1 < len(items) and items[i + 1]['type'] != 'punctuation':
                        sentence_start_time = float(items[i + 1]['start_time'])
                        current_speaker = items[i + 1].get('speaker_label', 'spk_0')
                    else:
                        sentence_start_time = None
                        current_speaker = None

                i += 1

            # Handle remaining content
            if current_sentence:
                sentence = ' '.join(current_sentence)
                # 如果是中文内容，进行文本清理（包括ASCII码转换）
                if is_chinese:
                    sentence = self.clean_chinese_text(sentence)
                start_ms = int(sentence_start_time * 1000)
                end_ms = int(float(items[-1].get('end_time', sentence_start_time)) * 1000)
                current_item_minute = int(sentence_start_time / 60)

                if current_minute != -1 and current_minute != current_item_minute:
                    if minute_segments:
                        segments.append(MinuteSegment(minute=current_minute, segments=minute_segments))
                        minute_segments = []

                current_minute = current_item_minute
                minute_segments.append(TranscriptionSegment(
                    StartMs=start_ms,
                    EndMs=end_ms,
                    FinalSentence=sentence,
                    SpeakerId=speaker_map.get(current_speaker, "Speaker 1"),
                    FormattedTime=time.strftime("%H:%M:%S", time.gmtime(start_ms/1000))
                ))

            if minute_segments:
                segments.append(MinuteSegment(minute=current_minute, segments=minute_segments))

            return segments

        except Exception as e:
            logger.error(f"Failed to process transcript data: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to process transcript: {str(e)}")

    def monitor_asr_task(self, task_id: str, episode_id: str, user_id: str, is_chinese: bool = False, interval: int = 3) -> Optional[str]:
        try:
            while True:
                response = self.transcribe_client.get_transcription_job(TranscriptionJobName=task_id)
                job_status = response['TranscriptionJob']['TranscriptionJobStatus']

                if job_status == 'COMPLETED':
                    transcript_uri = response['TranscriptionJob']['Transcript']['TranscriptFileUri']
                    transcript_response = requests.get(transcript_uri)
                    transcript_response.raise_for_status()

                    transcript_data = transcript_response.json()
                    segments = self.process_transcript_data(transcript_data, is_chinese)
                    
                    # 提取所有 segments 并扁平化，去掉 minute 分组和 FormattedTime
                    flat_segments = []
                    for minute_segment in segments:
                        for segment in minute_segment.segments:
                            flat_segments.append({
                                "StartMs": segment.StartMs,
                                "EndMs": segment.EndMs,
                                "FinalSentence": segment.FinalSentence,
                                "SpeakerId": segment.SpeakerId
                            })
                    
                    return json.dumps(flat_segments, ensure_ascii=False)

                elif job_status == 'FAILED':
                    error_message = response['TranscriptionJob'].get('FailureReason', 'Unknown error')
                    logger.error(f"Transcription job failed: {error_message}")
                    raise HTTPException(status_code=500, detail=f"Transcription failed: {error_message}")

                time.sleep(interval)

        except Exception as e:
            logger.error(f"Error monitoring ASR task: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Monitoring failed: {str(e)}")

# Local Transcription Helper
_whisper_transcriber = None

def get_whisper_transcriber() -> WhisperTranscriber:
    """Lazy load whisper transcriber (singleton pattern)"""
    global _whisper_transcriber
    if _whisper_transcriber is None:
        _whisper_transcriber = WhisperTranscriber(model_name=WHISPER_MODEL_SIZE)
    return _whisper_transcriber

async def transcribe_local(
    audio_url: str,
    episode_id: str,
    channel_title: str,
    episode_title: str,
    pub_date: str,
    user_id: str,
    is_chinese: bool = False
) -> str:
    """
    Transcribe using local whisper.cpp
    
    Args:
        audio_url: Audio URL
        episode_id: Episode ID
        channel_title: Channel title
        episode_title: Episode title
        pub_date: Publication date
        user_id: User ID
        is_chinese: Whether the content is Chinese
        
    Returns:
        JSON string of transcript segments
    """
    transcriber = Transcriber()
    local_file = None
    
    try:
        # Download audio file
        logger.info(f"Downloading audio for local transcription: {audio_url}")
        local_file = transcriber.download_audio(audio_url)
        
        # Transcribe locally with whisper.cpp
        logger.info(f"Starting local Whisper transcription with model: {WHISPER_MODEL_SIZE}")
        whisper = get_whisper_transcriber()
        
        # Set language code for whisper
        language = 'zh' if is_chinese else 'en'
        segments = whisper.transcribe(local_file, language=language)
        
        # Clean Chinese text if needed
        if is_chinese:
            for segment in segments:
                segment['FinalSentence'] = whisper.clean_chinese_text(segment['FinalSentence'])
        
        # Convert to JSON
        transcript = json.dumps(segments, ensure_ascii=False)
        
        logger.info(f"Local transcription completed: {len(segments)} segments")
        return transcript
        
    except Exception as e:
        logger.error(f"Local transcription failed: {e}")
        raise
    finally:
        # Clean up local file
        if local_file and os.path.exists(local_file):
            try:
                os.remove(local_file)
                logger.info(f"Removed temporary file: {local_file}")
            except Exception as e:
                logger.warning(f"Failed to remove temporary file: {e}")

# FastAPI app
app = FastAPI(title="Transcription API")

# Add CORS middleware to allow requests from Vercel
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for debugging
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)

transcription_tasks: Dict[str, Dict] = {}
active_episodes: Dict[str, str] = {}

@app.get("/health")
async def health_check():
    return {"status": "ok", "message": "Transcription API is running"}

@app.get("/test")
async def test_endpoint():
    """Simple test endpoint to verify basic connectivity"""
    return {
        "status": "ok", 
        "message": "Test endpoint working", 
        "timestamp": datetime.utcnow().isoformat(),
        "cors_enabled": True
    }

@app.post("/test")
async def test_post_endpoint(request: Request):
    """Test POST endpoint to verify request handling"""
    try:
        body = await request.json()
        return {
            "status": "ok", 
            "message": "POST test successful",
            "received_data": body,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Test POST endpoint error: {str(e)}")
        return JSONResponse(
            status_code=400,
            content={"status": "error", "message": f"Failed to parse JSON: {str(e)}"}
        )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error("=== Validation Error Details ===")
    logger.error(f"Request URL: {request.url}")
    logger.error(f"Request method: {request.method}")
    logger.error(f"Request headers: {dict(request.headers)}")
    logger.error(f"Validation errors: {exc.errors()}")
    logger.error("=== End Validation Error Details ===")
    return JSONResponse(status_code=422, content={"detail": exc.errors()})

@app.post("/transcribe")
async def start_transcription(request: TranscriptionRequest, background_tasks: BackgroundTasks) -> Dict[str, str]:
    try:
        # Log detailed request information for debugging
        logger.info("=== Transcription Request Details ===")
        logger.info(f"Request method: POST")
        logger.info(f"Request URL: /transcribe")
        logger.info(f"Request body: {request.model_dump()}")
        logger.info("=== End Request Details ===")
        
        logger.info(f"Received transcription request: {request.model_dump()}")

        # Check if there's an active task for this episode
        if request.episode_id in active_episodes:
            task_id = active_episodes[request.episode_id]
            if task_id in transcription_tasks:
                task_status = transcription_tasks[task_id].get("status")
                if task_status in ["processing", "downloading", "uploading", "transcribing", "completed"]:
                    logger.info(f"Task already {task_status} for episode {request.episode_id}")
                    return {"task_id": task_id}

        # Check database for existing transcript
        url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        if url and key:
            supabase: Client = create_client(url, key)
            existing_transcript = supabase.table("tbl_transcript").select("*").eq("episode_id", request.episode_id).eq("language", 1).eq("status", 2).execute()
            if existing_transcript.data:
                logger.info(f"Found existing completed transcript for episode {request.episode_id}")
                task_id = f"existing_{request.episode_id}"
                transcription_tasks[task_id] = {"status": "completed"}
                active_episodes[request.episode_id] = task_id
                return {"task_id": task_id}

        # Generate task ID and save initial status
        task_id = f"transcribe_{request.episode_id}_{int(time.time())}"
        transcription_tasks[task_id] = {"status": "pending"}
        active_episodes[request.episode_id] = task_id

        # Determine transcription mode
        mode = request.mode or (
            TranscriptionMode.LOCAL if TRANSCRIPTION_MODE == "local" 
            else TranscriptionMode.AWS
        )
        logger.info(f"Using transcription mode: {mode}")

        # Save initial status to database
        transcriber = Transcriber()
        is_chinese = (request.type == 'xyz')
        transcriber.save_to_db(request.episode_id, request.get_channel_title(), request.episode_title, request.get_pub_date(), request.user_id, status=1, is_chinese=is_chinese)

        # Add background task for processing audio and transcription
        background_tasks.add_task(
            process_audio_and_transcribe_background,
            task_id=task_id,
            episode_id=request.episode_id,
            url=str(request.url),
            channel_title=request.get_channel_title(),
            episode_title=request.episode_title,
            pub_date=request.get_pub_date(),
            user_id=request.user_id,
            type=request.type,
            force_download=request.force_download,
            mode=mode
        )

        logger.info(f"Started background task {task_id} for episode {request.episode_id}")
        return JSONResponse(
            content={"task_id": task_id},
            status_code=200,
            headers={
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            }
        )

    except Exception as e:
        logger.error(f"Error starting transcription: {str(e)}", exc_info=True)
        if 'task_id' in locals():
            transcription_tasks.pop(task_id, None)
            active_episodes.pop(request.episode_id, None)
        raise HTTPException(status_code=500, detail=str(e))

async def process_audio_and_transcribe_background(task_id: str, episode_id: str, url: str,
                                                channel_title: str, episode_title: str, 
                                                pub_date: str, user_id: str, type: str, 
                                                force_download: bool = False,
                                                mode: TranscriptionMode = TranscriptionMode.AWS):
    """Background task to process audio and start transcription"""
    try:
        transcriber = Transcriber()
        is_chinese = (type == 'xyz')
        
        # Check if using LOCAL mode
        if mode == TranscriptionMode.LOCAL:
            # LOCAL MODE - Direct transcription with whisper.cpp
            transcription_tasks[task_id] = {"status": "transcribing"}
            logger.info(f"Task {task_id}: Using LOCAL Whisper transcription (Metal-accelerated on Mac)")
            
            try:
                transcript = await transcribe_local(
                    url, episode_id, channel_title, 
                    episode_title, pub_date, user_id, is_chinese
                )
                
                if transcript:
                    transcriber.save_to_db(episode_id, channel_title, episode_title, 
                                         pub_date, user_id, status=2, 
                                         transcript=transcript, is_chinese=is_chinese)
                    transcription_tasks[task_id] = {"status": "completed", "transcript": transcript}
                    logger.info(f"Task {task_id} completed successfully (local)")
                else:
                    transcription_tasks[task_id] = {"status": "failed", "error": "No transcript generated"}
                    logger.error(f"Task {task_id} failed: No transcript generated")
                    active_episodes.pop(episode_id, None)
                    
            except Exception as e:
                logger.error(f"Task {task_id}: Local transcription failed: {str(e)}")
                transcription_tasks[task_id] = {"status": "failed", "error": f"Local transcription failed: {str(e)}"}
                active_episodes.pop(episode_id, None)
            
            return
        
        # AWS MODE - Original logic
        # Update status to downloading
        transcription_tasks[task_id] = {"status": "downloading"}
        logger.info(f"Task {task_id}: Using AWS Transcribe")
        logger.info(f"Task {task_id}: Starting audio processing")
        
        # Process URL (download and upload if needed)
        try:
            # Check if we need to download and upload
            if force_download or any(domain in url for domain in BLOCKED_DOMAINS):
                # Download audio
                logger.info(f"Task {task_id}: Downloading audio file")
                local_file = transcriber.download_audio(url)
                
                # Update status to uploading
                transcription_tasks[task_id] = {"status": "uploading"}
                logger.info(f"Task {task_id}: Uploading audio to S3")
                
                # Upload to S3
                processed_url = transcriber.upload_to_s3(local_file)
                logger.info(f"Task {task_id}: Audio upload completed")
            else:
                # Use original URL directly
                processed_url = url
                logger.info(f"Task {task_id}: Using original URL directly")
                
            logger.info(f"Task {task_id}: Audio processing completed")
        except Exception as e:
            logger.error(f"Task {task_id}: Audio processing failed: {str(e)}")
            transcription_tasks[task_id] = {"status": "failed", "error": f"Audio processing failed: {str(e)}"}
            active_episodes.pop(episode_id, None)
            return
        
        # Update status to transcribing
        transcription_tasks[task_id] = {"status": "transcribing"}
        logger.info(f"Task {task_id}: Starting AWS transcription job")
        
        # Start transcription job
        try:
            transcriber.transcribe_client.start_transcription_job(
                TranscriptionJobName=task_id,
                Media={'MediaFileUri': processed_url},
                MediaFormat='mp3',
                LanguageCode='zh-CN' if type == 'xyz' else 'en-US',
                Settings={'ShowSpeakerLabels': True, 'MaxSpeakerLabels': 10}
            )
            logger.info(f"Task {task_id}: AWS transcription job started")
        except Exception as e:
            logger.error(f"Task {task_id}: Failed to start AWS transcription job: {str(e)}")
            transcription_tasks[task_id] = {"status": "failed", "error": f"Failed to start transcription: {str(e)}"}
            active_episodes.pop(episode_id, None)
            return
        
        # Monitor the transcription task
        try:
            transcript = transcriber.monitor_asr_task(task_id, episode_id, user_id, is_chinese)
            if transcript:
                transcriber.save_to_db(episode_id, channel_title, episode_title, pub_date, user_id, status=2, transcript=transcript, is_chinese=is_chinese)
                transcription_tasks[task_id] = {"status": "completed", "transcript": transcript}
                logger.info(f"Task {task_id} completed successfully")
            else:
                transcription_tasks[task_id] = {"status": "failed", "error": "No transcript generated"}
                logger.error(f"Task {task_id} failed: No transcript generated")
                active_episodes.pop(episode_id, None)
        except Exception as e:
            logger.error(f"Task {task_id}: Transcription monitoring failed: {str(e)}")
            transcription_tasks[task_id] = {"status": "failed", "error": str(e)}
            active_episodes.pop(episode_id, None)

    except Exception as e:
        logger.error(f"Error in background task {task_id}: {str(e)}")
        transcription_tasks[task_id] = {"status": "failed", "error": str(e)}
        active_episodes.pop(episode_id, None)

@app.get("/transcribe/{task_id}/status")
async def get_transcription_status(task_id: str) -> TranscriptionStatus:
    if task_id not in transcription_tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    task_info = transcription_tasks[task_id]
    status = task_info["status"]
    
    # Create status object with progress and message
    status_obj = TranscriptionStatus(
        status=status,
        error=task_info.get("error"),
        progress=TranscriptionStatus.get_progress_percentage(TranscriptionStatus(status=status)),
        message=TranscriptionStatus.get_status_message(TranscriptionStatus(status=status))
    )
    
    return status_obj

@app.get("/transcribe/{task_id}/result")
async def get_transcription_result(task_id: str):
    """Get transcription result when task is completed"""
    if task_id not in transcription_tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    task_info = transcription_tasks[task_id]
    status = task_info["status"]
    
    if status == "completed":
        return {
            "status": "completed",
            "transcript": task_info.get("transcript"),
            "message": "转录完成"
        }
    elif status == "failed":
        return {
            "status": "failed",
            "error": task_info.get("error"),
            "message": "转录失败"
        }
    else:
        raise HTTPException(status_code=400, detail=f"Task is still {status}, not ready for result")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=6005)