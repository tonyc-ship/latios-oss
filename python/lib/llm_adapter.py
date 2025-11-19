"""
LLM Adapter Layer
Supports multiple LLM providers: Anthropic Claude, OpenAI, and local Ollama
"""
import os
import logging
from typing import Optional, Iterator
from enum import Enum

logger = logging.getLogger(__name__)


class LLMProvider(str, Enum):
    ANTHROPIC = "anthropic"
    OPENAI = "openai"
    OLLAMA = "ollama"


class LLMAdapter:
    """Unified interface for different LLM providers"""
    
    def __init__(self, provider: Optional[LLMProvider] = None):
        """
        Initialize LLM adapter
        
        Args:
            provider: LLM provider to use (anthropic, openai, or ollama)
                     If None, will auto-detect based on available API keys or Ollama availability
        """
        self.provider = provider or self._detect_provider()
        self._client = None
        logger.info(f"LLM Adapter initialized with provider: {self.provider}")
    
    def _detect_provider(self) -> LLMProvider:
        """Auto-detect which provider to use based on available API keys or Ollama availability"""
        # Check for explicit provider selection first
        explicit_provider = os.environ.get("LLM_PROVIDER")
        if explicit_provider:
            try:
                provider = LLMProvider(explicit_provider.lower())
                logger.info(f"Using explicitly set LLM provider: {provider}")
                return provider
            except ValueError:
                logger.warning(
                    f"Invalid LLM_PROVIDER value: {explicit_provider}. "
                    f"Valid options: {', '.join([p.value for p in LLMProvider])}. "
                    "Falling back to auto-detection."
                )
        
        # Auto-detect based on available keys/services
        anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
        openai_key = os.environ.get("OPENAI_API_KEY")
        ollama_base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
        
        if anthropic_key:
            logger.info("Detected Anthropic API key, using Anthropic as provider")
            return LLMProvider.ANTHROPIC
        elif openai_key:
            logger.info("Detected OpenAI API key, using OpenAI as provider")
            return LLMProvider.OPENAI
        elif self._check_ollama_available(ollama_base_url):
            logger.info("Detected Ollama running locally, using Ollama as provider")
            return LLMProvider.OLLAMA
        else:
            raise ValueError(
                "No LLM provider found. Please set either ANTHROPIC_API_KEY, OPENAI_API_KEY, "
                "or ensure Ollama is running locally (install from https://ollama.ai). "
                f"Alternatively, explicitly set LLM_PROVIDER to one of: {', '.join([p.value for p in LLMProvider])}"
            )
    
    def _check_ollama_available(self, base_url: str) -> bool:
        """Check if Ollama is available by testing the API endpoint"""
        try:
            import requests
            response = requests.get(f"{base_url}/api/tags", timeout=2)
            return response.status_code == 200
        except Exception:
            return False
    
    def _init_anthropic(self):
        """Initialize Anthropic client"""
        if self._client is None:
            try:
                from anthropic import Anthropic
                api_key = os.environ.get("ANTHROPIC_API_KEY")
                if not api_key:
                    raise ValueError("ANTHROPIC_API_KEY not found in environment")
                self._client = Anthropic(api_key=api_key)
                logger.info("Anthropic client initialized successfully")
            except ImportError:
                raise ImportError(
                    "anthropic package not installed. Install with: pip install anthropic"
                )
        return self._client
    
    def _init_openai(self):
        """Initialize OpenAI client"""
        if self._client is None:
            try:
                from openai import OpenAI
                api_key = os.environ.get("OPENAI_API_KEY")
                if not api_key:
                    raise ValueError("OPENAI_API_KEY not found in environment")
                self._client = OpenAI(api_key=api_key)
                logger.info("OpenAI client initialized successfully")
            except ImportError:
                raise ImportError(
                    "openai package not installed. Install with: pip install openai"
                )
        return self._client
    
    def _init_ollama(self):
        """Initialize Ollama client"""
        if self._client is None:
            try:
                from openai import OpenAI
                # Ollama has an OpenAI-compatible API
                base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434/v1")
                self._client = OpenAI(
                    base_url=base_url,
                    api_key="ollama"  # Ollama doesn't require a real API key
                )
                logger.info(f"Ollama client initialized successfully at {base_url}")
            except ImportError:
                raise ImportError(
                    "openai package not installed. Install with: pip install openai"
                )
        return self._client
    
    def generate_stream(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 10000,
        temperature: float = 0.7,
        model: Optional[str] = None
    ) -> Iterator[str]:
        """
        Generate text with streaming
        
        Args:
            system_prompt: System instructions
            user_prompt: User message
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature (0-1)
            model: Specific model to use (optional, uses provider default if not specified)
            
        Yields:
            Text chunks as they are generated
        """
        if self.provider == LLMProvider.ANTHROPIC:
            yield from self._generate_anthropic_stream(
                system_prompt, user_prompt, max_tokens, temperature, model
            )
        elif self.provider == LLMProvider.OPENAI:
            yield from self._generate_openai_stream(
                system_prompt, user_prompt, max_tokens, temperature, model
            )
        elif self.provider == LLMProvider.OLLAMA:
            yield from self._generate_ollama_stream(
                system_prompt, user_prompt, max_tokens, temperature, model
            )
    
    def _generate_anthropic_stream(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
        temperature: float,
        model: Optional[str]
    ) -> Iterator[str]:
        """Generate with Anthropic Claude (streaming)"""
        client = self._init_anthropic()

        # Use Claude Sonnet 4.5 as default
        model = model or "claude-sonnet-4-5-20250929"
        
        logger.info(f"Streaming with Anthropic model: {model}")
        
        try:
            with client.messages.stream(
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}]
            ) as stream:
                for text in stream.text_stream:
                    yield text
                    
        except Exception as e:
            logger.error(f"Anthropic streaming error: {e}")
            raise
    
    def _generate_openai_stream(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
        temperature: float,
        model: Optional[str]
    ) -> Iterator[str]:
        """Generate with OpenAI (streaming)"""
        client = self._init_openai()
        
        # Use GPT-5.1 as default
        model = model or "gpt-5.1"
        
        logger.info(f"Streaming with OpenAI model: {model}")
        
        try:
            stream = client.chat.completions.create(
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                stream=True
            )
            
            for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
                    
        except Exception as e:
            logger.error(f"OpenAI streaming error: {e}")
            raise
    
    def _generate_ollama_stream(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
        temperature: float,
        model: Optional[str]
    ) -> Iterator[str]:
        """Generate with Ollama (streaming)"""
        client = self._init_ollama()
        
        # Use gemma3:12b as default (good balance of quality and speed)
        # Users can override with OLLAMA_MODEL env var or model parameter
        model = model or os.environ.get("OLLAMA_MODEL", "gemma3:12b")
        
        logger.info(f"Streaming with Ollama model: {model}")
        
        try:
            stream = client.chat.completions.create(
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                stream=True
            )
            
            for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
                    
        except Exception as e:
            logger.error(f"Ollama streaming error: {e}")
            raise
    
