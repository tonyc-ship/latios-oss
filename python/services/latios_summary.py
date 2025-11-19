from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
import json
import os
import sys
import logging
from pathlib import Path
from datetime import datetime
from supabase import create_client, Client
import re
from dateutil import parser

# Add parent directory to path for lib imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from lib.llm_adapter import LLMAdapter, LLMProvider

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

# Models
class SummarizeRequest(BaseModel):
    episodeId: str
    podcastName: str
    episodeTitle: str
    episodeDuration: str
    episodePubDate: str
    userId: Optional[str] = 'guest'
    transcript: str
    language: int
    podcast_metadata: Optional[Dict[str, Any]] = None
    system_prompt: str
    user_prompt: str
    gating: Optional[Dict[str, Any]] = None
    # When true, skip writing any generated content to DB (for chat/QA cases)
    noPersist: Optional[bool] = False

class SummarizeResponse(BaseModel):
    content: str
    success: bool
    error: Optional[str] = None

# Database service
class DatabaseService:
    def __init__(self):
        self.url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        self.key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

        if not self.url or not self.key:
            logger.error("Missing Supabase credentials")
            raise ValueError("Missing Supabase credentials")

    def write_to_database(self, content: str, episode_id: str, podcast_name: str,
                         episode_title: str, episode_duration: str, episode_pub_date: str,
                         language: int, user_id: str):
        """Write summary to database"""
        if not content:
            logger.warning('No content to write to database')
            return False

        try:
            supabase: Client = create_client(self.url, self.key)
            current_time = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

            # Process timestamp fields that may be empty
            def safe_timestamp(value):
                """Safely handle timestamps, return None if empty, otherwise try to parse to ISO format"""
                if not value or value.strip() == "":
                    logger.info(f"Empty timestamp value: {repr(value)}")
                    return None

                # If already in ISO format, return directly
                if re.match(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}', value):
                    logger.info(f"Already ISO format timestamp: {value}")
                    return value

                # If only date format, add time
                if re.match(r'^\d{4}-\d{2}-\d{2}$', value):
                    result = f"{value}T00:00:00Z"
                    logger.info(f"Date format converted to ISO: {value} -> {result}")
                    return result

                try:
                    # Try to parse various date formats
                    # Handle "Streamed live on Aug 16, 2022" format
                    if "Streamed live on" in value:
                        # Extract date part
                        date_part = value.replace("Streamed live on ", "").strip()
                        logger.info(f"Processing 'Streamed live on' format: {value} -> {date_part}")
                        parsed_date = parser.parse(date_part)
                        result = parsed_date.strftime("%Y-%m-%dT%H:%M:%SZ")
                        logger.info(f"Parsed result: {result}")
                        return result

                    # Use dateutil.parser to parse other formats
                    logger.info(f"Parsing date with dateutil: {value}")
                    parsed_date = parser.parse(value)
                    result = parsed_date.strftime("%Y-%m-%dT%H:%M:%SZ")
                    logger.info(f"Parsed result: {result}")
                    return result

                except Exception as e:
                    logger.warning(f"Could not parse date '{value}': {str(e)}")
                    # If unable to parse, return None instead of original value
                    return None

            logger.info("Processing publish_date...")
            processed_pub_date = safe_timestamp(episode_pub_date)
            logger.info(f"Original publish_date: {repr(episode_pub_date)}")
            logger.info(f"Processed publish_date: {repr(processed_pub_date)}")

            data = {
                "episode_id": episode_id,
                "show_title": podcast_name or "",
                "episode_title": episode_title or "",
                "episode_duration": episode_duration or "",
                "publish_date": processed_pub_date,
                "language": language,
                "content": content,
                "count": 1,
                "create_user_id": user_id or "guest",
                "update_user_id": user_id or "guest",
                "create_time": current_time,
                "update_time": current_time,
                "status": 2  # 2 for finished
            }

            result = supabase.table("tbl_summarize").upsert(data, on_conflict='episode_id,language').execute()

            return True

        except Exception as e:
            logger.error(f'Database write error: {str(e)}')
            # Don't raise exception, just log error to avoid affecting frontend display
            return False


# FastAPI app
app = FastAPI(title="AI Summarization API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "ok", "message": "AI Summarization API is running"}

@app.post("/summarize")
async def summarize_podcast(request: SummarizeRequest):
    try:
        logger.info(f"Received streaming summarization request for episode: {request.episodeId}")

        # Initialize LLM adapter
        llm_adapter = LLMAdapter()

        # Prepare request data
        request_data = {
            'episodeId': request.episodeId,
            'podcastName': request.podcastName,
            'episodeTitle': request.episodeTitle,
            'episodeDuration': request.episodeDuration,
            'episodePubDate': request.episodePubDate,
            'language': request.language,
            'userId': request.userId
        }

        # Whether to persist the generated content
        no_persist = bool(getattr(request, 'noPersist', False))

        # Create streaming generator
        async def generate_stream():
            import asyncio
            from concurrent.futures import ThreadPoolExecutor

            full_text = ""

            queue: asyncio.Queue = asyncio.Queue()

            def read_llm_stream():
                try:
                    logger.info("Starting streaming summarization with LLM adapter")

                    # Stream from LLM adapter
                    for text in llm_adapter.generate_stream(
                        request.system_prompt,
                        request.user_prompt,
                        max_tokens=10000,
                        temperature=0.7
                    ):
                        queue.put_nowait(("text", text))

                    logger.info("LLM streaming summarization completed successfully")
                    queue.put_nowait(("done", None))
                except Exception as e:
                    logger.error(f"LLM streaming error: {str(e)}")
                    queue.put_nowait(("error", str(e)))

            # Read LLM stream in thread
            loop = asyncio.get_running_loop()
            _ = loop.run_in_executor(None, read_llm_stream)

            try:
                while True:
                    kind, payload = await queue.get()
                    if kind == "text":
                        text = payload
                        full_text += text
                        yield text
                    elif kind == "done":
                        break
                    elif kind == "error":
                        logger.error(f"Streaming error: {payload}")
                        yield f"Error: {payload}"
                        return
            except Exception as e:
                logger.error(f"Streaming error: {str(e)}")
                yield f"Error: {str(e)}"
                return

            # After streaming completes, asynchronously write to database (don't block frontend display)
            if full_text and not no_persist:
                try:
                    import asyncio
                    asyncio.create_task(write_to_db_async(
                        full_text,
                        request_data['episodeId'],
                        request_data['podcastName'],
                        request_data['episodeTitle'],
                        request_data['episodeDuration'],
                        request_data['episodePubDate'],
                        request_data['language'],
                        request_data['userId']
                    ))
                except Exception as db_error:
                    logger.error(f"Failed to schedule database write: {str(db_error)}")
        
        # Return streaming response
        return StreamingResponse(
            generate_stream(),
            media_type="text/plain; charset=utf-8"
        )
        
    except Exception as e:
        logger.error(f"Summarization error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Asynchronous database write function
async def write_to_db_async(content: str, episode_id: str, podcast_name: str, 
                           episode_title: str, episode_duration: str, episode_pub_date: str,
                           language: int, user_id: str):
    """Asynchronously write to database, don't block main flow"""
    try:
        db_service = DatabaseService()
        success = db_service.write_to_database(
            content, 
            episode_id,
            podcast_name,
            episode_title,
            episode_duration,
            episode_pub_date,
            language,
            user_id
        )
        if success:
            logger.info("Database write completed successfully")
        else:
            logger.warning("Database write failed but continuing")
    except Exception as e:
        logger.error(f"Database write error in async task: {str(e)}")
        # Don't throw exception to avoid affecting main flow

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)