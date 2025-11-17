from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
import boto3
import json
import os
import logging
from pathlib import Path
from datetime import datetime
from supabase import create_client, Client
import re
from dateutil import parser
from botocore.config import Config

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load environment variables
env_files = ['.env', '.env.local']
for env_file in env_files:
    env_path = Path(env_file)
    if env_path.exists():
        from dotenv import load_dotenv
        load_dotenv(env_path)
        logger.info(f"Loaded environment variables from {env_file}")

# Constants
DEFAULT_REGION = "us-east-1"
config = Config(
    region_name=DEFAULT_REGION,
    read_timeout=3600,
    connect_timeout=60,
    retries={"max_attempts": 1}
)
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

            # 处理可能为空的时间戳字段
            def safe_timestamp(value):
                """安全处理时间戳，如果为空则返回None，否则尝试解析为ISO格式"""
                if not value or value.strip() == "":
                    logger.info(f"Empty timestamp value: {repr(value)}")
                    return None

                # 如果已经是ISO格式，直接返回
                if re.match(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}', value):
                    logger.info(f"Already ISO format timestamp: {value}")
                    return value

                # 如果只是日期格式，添加时间
                if re.match(r'^\d{4}-\d{2}-\d{2}$', value):
                    result = f"{value}T00:00:00Z"
                    logger.info(f"Date format converted to ISO: {value} -> {result}")
                    return result

                try:
                    # 尝试解析各种日期格式
                    # 处理 "Streamed live on Aug 16, 2022" 这样的格式
                    if "Streamed live on" in value:
                        # 提取日期部分
                        date_part = value.replace("Streamed live on ", "").strip()
                        logger.info(f"Processing 'Streamed live on' format: {value} -> {date_part}")
                        parsed_date = parser.parse(date_part)
                        result = parsed_date.strftime("%Y-%m-%dT%H:%M:%SZ")
                        logger.info(f"Parsed result: {result}")
                        return result

                    # 使用 dateutil.parser 解析其他格式
                    logger.info(f"Parsing date with dateutil: {value}")
                    parsed_date = parser.parse(value)
                    result = parsed_date.strftime("%Y-%m-%dT%H:%M:%SZ")
                    logger.info(f"Parsed result: {result}")
                    return result

                except Exception as e:
                    logger.warning(f"Could not parse date '{value}': {str(e)}")
                    # 如果无法解析，返回None而不是原始值
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
            # 不抛出异常，只记录错误，避免影响前端显示
            return False

# AWS Bedrock Configuration
class AWSBedrockService:
    def __init__(self):
        self.access_key_id = os.environ.get("AWS_ACCESS_KEY_ID")
        self.secret_access_key = os.environ.get("AWS_SECRET_ACCESS_KEY")
        self.region = os.environ.get("AWS_REGION", DEFAULT_REGION)

        if not all([self.access_key_id, self.secret_access_key]):
            logger.error("Missing required AWS credentials")
            raise ValueError("Missing required AWS credentials")

        self.client = boto3.client(
            'bedrock-runtime',
            aws_access_key_id=self.access_key_id,
            aws_secret_access_key=self.secret_access_key,
            region_name=self.region,
            config=config
        )

        logger.info(f"AWS Bedrock Service initialized with region: {self.region}")

    def summarize_with_claude_stream(self, system_prompt: str, user_prompt: str, max_tokens: int = 10000):
        """Summarize using Claude model (streaming)"""
        try:
            body = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": max_tokens,
                "system": system_prompt,
                "messages": [
                    {
                        "role": "user",
                        "content": user_prompt
                    }
                ]
            }

            response = self.client.invoke_model_with_response_stream(
                modelId='us.anthropic.claude-3-7-sonnet-20250219-v1:0',
                contentType='application/json',
                accept='application/json',
                body=json.dumps(body)
            )

            return response

        except Exception as e:
            logger.error(f"Claude streaming failed: {str(e)}")
            raise e

    def summarize_with_titan_stream(self, prompt: str, max_tokens: int = 10000):
        """Summarize using Titan model (streaming)"""
        try:
            body = {
                "inputText": prompt,
                "textGenerationConfig": {
                    "maxTokenCount": max_tokens,
                    "temperature": 0.7,
                    "topP": 0.9
                }
            }

            response = self.client.invoke_model_with_response_stream(
                modelId='amazon.titan-text-premier-v1:0',
                contentType='application/json',
                accept='application/json',
                body=json.dumps(body)
            )

            return response

        except Exception as e:
            logger.error(f"Titan streaming failed: {str(e)}")
            raise e

    def summarize_with_claude(self, system_prompt: str, user_prompt: str, max_tokens: int = 100000) -> str:
        """Summarize using Claude model (non-streaming) - for fallback"""
        try:
            body = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": max_tokens,
                "system": system_prompt,
                "messages": [
                    {
                        "role": "user",
                        "content": user_prompt
                    }
                ]
            }

            response = self.client.invoke_model(
                modelId='us.anthropic.claude-3-7-sonnet-20250219-v1:0',
                contentType='application/json',
                accept='application/json',
                body=json.dumps(body)
            )

            response_body = json.loads(response['body'].read())
            return response_body['content'][0]['text']

        except Exception as e:
            logger.error(f"Claude summarization failed: {str(e)}")
            raise e

    def summarize_with_titan(self, prompt: str, max_tokens: int = 10000) -> str:
        """Summarize using Titan model as fallback (non-streaming) - for fallback"""
        try:
            body = {
                "inputText": prompt,
                "textGenerationConfig": {
                    "maxTokenCount": max_tokens,
                    "temperature": 0.7,
                    "topP": 0.9
                }
            }

            response = self.client.invoke_model(
                modelId='amazon.titan-text-premier-v1:0',
                contentType='application/json',
                accept='application/json',
                body=json.dumps(body)
            )

            response_body = json.loads(response['body'].read())
            return response_body['results'][0]['outputText']

        except Exception as e:
            logger.error(f"Titan summarization failed: {str(e)}")
            raise e



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

        # 初始化 AWS Bedrock service
        bedrock_service = AWSBedrockService()

        # 准备请求数据
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

        # 创建流式生成器（将 Bedrock 流读取放到后台线程，避免阻塞事件循环）
        async def generate_stream():
            import asyncio
            from concurrent.futures import ThreadPoolExecutor

            full_text = ""
            streamed_chars = 0
            max_client_chars = request.gating.get('maxClientChars', 1200) if request.gating else 1200
            allow_full_stream = request.gating.get('allowFullStream', False) if request.gating else False
            client_closed = False
            GATING_LIMIT_MARKER = "\n---GATING_LIMIT_REACHED---\n"

            queue: asyncio.Queue = asyncio.Queue()

            def read_bedrock_stream_claude():
                try:
                    logger.info("Attempting streaming summarization with Claude")
                    response = bedrock_service.summarize_with_claude_stream(
                        request.system_prompt,
                        request.user_prompt
                    )

                    for event in response.get('body'):
                        chunk = event.get('chunk')
                        if chunk and chunk.get('bytes'):
                            chunk_data = json.loads(chunk['bytes'].decode())
                            if chunk_data.get('type') == 'content_block_delta' and chunk_data.get('delta', {}).get('text'):
                                queue.put_nowait(("text", chunk_data['delta']['text']))
                            elif chunk_data.get('type') == 'message_stop':
                                break
                    logger.info("Claude streaming summarization completed successfully")
                    queue.put_nowait(("done", None))
                except Exception as e:
                    queue.put_nowait(("error", str(e)))

            # 在线程中读取 Bedrock 流
            loop = asyncio.get_running_loop()
            _ = loop.run_in_executor(None, read_bedrock_stream_claude)

            try:
                while True:
                    kind, payload = await queue.get()
                    if kind == "text":
                        text = payload
                        full_text += text

                        if allow_full_stream:
                            yield text
                        elif not client_closed:
                            remaining = max_client_chars - streamed_chars
                            if remaining > 0:
                                if len(text) <= remaining:
                                    yield text
                                    streamed_chars += len(text)
                                else:
                                    yield text[:remaining]
                                    streamed_chars += remaining
                                    # 发送特殊标记，告知前端已达到限制
                                    yield GATING_LIMIT_MARKER
                                    client_closed = True
                            else:
                                # 已达上限，发送特殊标记
                                yield GATING_LIMIT_MARKER
                                client_closed = True
                    elif kind == "done":
                        break
                    elif kind == "error":
                        # 回退到 Titan（同步读取也放到线程中）
                        def read_bedrock_stream_titan():
                            try:
                                full_prompt = f"{request.system_prompt}\n\n{request.user_prompt}"
                                response = bedrock_service.summarize_with_titan_stream(full_prompt)
                                for event in response.get('body'):
                                    chunk = event.get('chunk')
                                    if chunk and chunk.get('bytes'):
                                        chunk_data = json.loads(chunk['bytes'].decode())
                                        if chunk_data.get('outputText'):
                                            queue.put_nowait(("text", chunk_data['outputText']))
                                        elif chunk_data.get('completionReason') == 'FINISH':
                                            break
                                queue.put_nowait(("done", None))
                            except Exception as e2:
                                queue.put_nowait(("fatal", str(e2)))

                        _ = loop.run_in_executor(None, read_bedrock_stream_titan)
            except Exception as e:
                logger.error(f"Streaming error: {str(e)}")
                yield f"Error: {str(e)}"
                return

            # 处理 Titan 回退的致命错误
            try:
                while True:
                    if queue.empty():
                        break
                    kind, payload = await queue.get()
                    if kind == "fatal":
                        logger.error(f"Both streaming models failed: {payload}")
                        yield f"Error: {payload}"
                        return
                    elif kind == "text":
                        text = payload
                        full_text += text
                        if allow_full_stream:
                            yield text
                        # 免费用户这里无需再处理（已在前面处理过配额）
                    elif kind == "done":
                        break
            except Exception:
                pass

            # 流式处理完成后，异步写入数据库（不阻塞前端显示）
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
        
        # 返回流式响应
        return StreamingResponse(
            generate_stream(),
            media_type="text/plain; charset=utf-8"
        )
        
    except Exception as e:
        logger.error(f"Summarization error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# 异步数据库写入函数
async def write_to_db_async(content: str, episode_id: str, podcast_name: str, 
                           episode_title: str, episode_duration: str, episode_pub_date: str,
                           language: int, user_id: str):
    """异步写入数据库，不阻塞主流程"""
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
        # 不抛出异常，避免影响主流程

# 保留原有的非流式端点作为备用
@app.post("/summarize-sync", response_model=SummarizeResponse)
async def summarize_podcast_sync(request: SummarizeRequest):
    try:
        logger.info(f"Received sync summarization request for episode: {request.episodeId}")
        
        # Initialize AWS Bedrock service
        bedrock_service = AWSBedrockService()
        
        # Use prompts passed from Node.js
        system_prompt = request.system_prompt
        user_prompt = request.user_prompt
        
        logger.info("Using prompts from Node.js")
        
        # Try Claude first, fallback to Titan
        try:
            logger.info("Attempting summarization with Claude")
            content = bedrock_service.summarize_with_claude(system_prompt, user_prompt)
            logger.info("Claude summarization completed successfully")
        except Exception as claude_error:
            logger.warning(f"Claude failed, falling back to Titan: {str(claude_error)}")
            try:
                full_prompt = f"{system_prompt}\n\n{user_prompt}"
                content = bedrock_service.summarize_with_titan(full_prompt)
                logger.info("Titan summarization completed successfully")
            except Exception as titan_error:
                logger.error(f"Both models failed: {str(titan_error)}")
                raise HTTPException(status_code=500, detail=f"AI summarization failed: {str(titan_error)}")
        
        return SummarizeResponse(
            content=content,
            success=True
        )
        
    except Exception as e:
        logger.error(f"Summarization error: {str(e)}")
        return SummarizeResponse(
            content="",
            success=False,
            error=str(e)
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7000) 
