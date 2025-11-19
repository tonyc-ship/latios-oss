from fastapi import FastAPI, BackgroundTasks, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from pathlib import Path
from typing import Optional, Dict, List, Any
from pydantic import BaseModel, HttpUrl
from datetime import datetime
from enum import Enum
import uvicorn
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
from lib.transcription_adapter import TranscriptionAdapter, TranscriptionProvider

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load environment variables
env_files = ['.env', '.env.local', '../.env', '../.env.local', '../../.env', '../../.env.local']
for env_file in env_files:
    env_path = Path(env_file)
    if env_path.exists():
        from dotenv import load_dotenv
        load_dotenv(env_path)
        logger.info(f"Loaded environment variables from {env_file}")

# Constants
TEMP_AUDIO_DIR = "./audio_tmp"
WHISPER_MODEL_SIZE = os.environ.get("WHISPER_MODEL_SIZE", "base")  # Model size for local transcription

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
    type: Optional[str] = 'apple'

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

class Transcriber:
    def __init__(self):
        self.transcription_adapter = TranscriptionAdapter()
        os.makedirs(TEMP_AUDIO_DIR, exist_ok=True)

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

            # Get total file size if available
            total_size = response.headers.get('Content-Length')
            total_size = int(total_size) if total_size else None
            
            chunk_size = 8192
            from tqdm import tqdm

            with open(save_path, "wb") as file:
                if total_size:
                    # Use tqdm with known total size
                    with tqdm(
                        total=total_size,
                        unit='B',
                        unit_scale=True,
                        unit_divisor=1024,
                        desc="Downloading",
                        ncols=100
                    ) as pbar:
                        for chunk in response.iter_content(chunk_size=chunk_size):
                            if chunk:
                                file.write(chunk)
                                pbar.update(len(chunk))
                else:
                    # Use tqdm without total (shows rate and downloaded amount)
                    with tqdm(
                        unit='B',
                        unit_scale=True,
                        unit_divisor=1024,
                        desc="Downloading",
                        ncols=100
                    ) as pbar:
                        for chunk in response.iter_content(chunk_size=chunk_size):
                            if chunk:
                                file.write(chunk)
                                pbar.update(len(chunk))

            final_size_mb = os.path.getsize(save_path) / (1024 * 1024)
            logger.info(f"Download complete: {save_path} ({final_size_mb:.2f} MB)")
            return save_path

        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to download file: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to download file: {str(e)}")

    def process_url(self, url: str) -> str:
        """Process URL for transcription - always download for local processing"""
        logger.info(f'Downloading audio from URL: {url}')
        start_time = time.time()
        local_file = self.download_audio(url)
        end_time = time.time()
        logger.info(f'Download time: {end_time - start_time} seconds')
        return local_file

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

    def transcribe_audio(self, audio_path: str, language: str = "en", enable_speaker_diarization: bool = True) -> List[Dict]:
        """Transcribe audio using the transcription adapter"""
        try:
            segments = self.transcription_adapter.transcribe(
                audio_path=audio_path,
                language=language,
                enable_speaker_diarization=enable_speaker_diarization
            )
            return segments
        except Exception as e:
            logger.error(f"Transcription failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

# Helper functions

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
            type=request.type
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
                                                pub_date: str, user_id: str, type: str):
    """Background task to process audio and start transcription"""
    try:
        transcriber = Transcriber()
        is_chinese = (type == 'xyz')
        language = 'zh' if is_chinese else 'en'

        # Check if using Deepgram (can handle URLs directly) or Whisper (needs local file)
        from lib.transcription_adapter import TranscriptionAdapter, TranscriptionProvider
        adapter = TranscriptionAdapter()
        
        # Determine audio path based on provider
        if adapter.provider == TranscriptionProvider.DEEPGRAM:
            # Deepgram can transcribe from URL directly - no download needed!
            logger.info(f"Task {task_id}: Using Deepgram - passing URL directly (no download needed)")
            audio_path = url
            transcription_tasks[task_id] = {"status": "transcribing"}
        else:
            # Whisper needs local file - download first
            transcription_tasks[task_id] = {"status": "downloading"}
            logger.info(f"Task {task_id}: Using Whisper - downloading audio file")
            try:
                audio_path = transcriber.process_url(url)
                logger.info(f"Task {task_id}: Audio download completed")
            except Exception as e:
                logger.error(f"Task {task_id}: Audio download failed: {str(e)}")
                transcription_tasks[task_id] = {"status": "failed", "error": f"Audio download failed: {str(e)}"}
                active_episodes.pop(episode_id, None)
                return
            
            transcription_tasks[task_id] = {"status": "transcribing"}
            logger.info(f"Task {task_id}: Starting transcription")

        # Transcribe audio using the adapter
        try:
            segments = transcriber.transcribe_audio(
                audio_path=audio_path,
                language=language,
                enable_speaker_diarization=True
            )

            if segments:
                # Convert segments to JSON format expected by the system
                transcript = json.dumps(segments, ensure_ascii=False)

                # Save to database
                transcriber.save_to_db(episode_id, channel_title, episode_title,
                                     pub_date, user_id, status=2,
                                     transcript=transcript, is_chinese=is_chinese)
                transcription_tasks[task_id] = {"status": "completed", "transcript": transcript}
                logger.info(f"Task {task_id} completed successfully")
            else:
                transcription_tasks[task_id] = {"status": "failed", "error": "No transcript generated"}
                logger.error(f"Task {task_id} failed: No transcript generated")
                active_episodes.pop(episode_id, None)

        except Exception as e:
            logger.error(f"Task {task_id}: Transcription failed: {str(e)}")
            transcription_tasks[task_id] = {"status": "failed", "error": str(e)}
            active_episodes.pop(episode_id, None)

        # Clean up temporary files if they were downloaded (only for Whisper)
        if adapter.provider == TranscriptionProvider.WHISPER and audio_path != url and os.path.exists(audio_path):
            try:
                os.remove(audio_path)
                logger.info(f"Cleaned up temporary file: {audio_path}")
            except Exception as e:
                logger.warning(f"Failed to clean up temporary file: {e}")

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
    uvicorn.run(app, host="0.0.0.0", port=8000)