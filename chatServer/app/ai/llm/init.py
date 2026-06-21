"""
LLM Initialization Module
Initializes LangChain LLM models for Groq and Gemini
"""
import logging
from typing import Optional, Literal
from langchain_core.language_models import BaseLLM
from app.ai.config import llm_settings


logger = logging.getLogger(__name__)


class LLMProvider:
    """
    LLM Provider for initializing and managing language models
    Supports Groq and Gemini through third-party integrations
    """
    
    def __init__(self):
        self._groq_model: Optional[BaseLLM] = None
        self._gemini_model: Optional[BaseLLM] = None
    
    async def initialize_models(self) -> None:
        """Initialize all LLM models to ensure they are downloaded and ready"""
        try:
            logger.info("Initializing LLM models...")
            # Enforce strict initialization instead of on-demand
            await self.get_groq_llm()
            await self.get_gemini_llm()
            logger.info("✅ LLM initialization complete")
        except Exception as e:
            logger.error(f"❌ Failed to initialize LLM models: {e}")
            raise
    
    async def get_groq_llm(self) -> BaseLLM:
        """
        Get or initialize Groq LLM model via Groq API
        Uses langchain-groq integration
        """
        if self._groq_model is not None:
            return self._groq_model
        
        try:
            # Try to use langchain-groq integration
            try:
                from langchain_groq import ChatGroq
                
                if not llm_settings.GROQ_API_KEY or llm_settings.GROQ_API_KEY == "your-groq-api-key-here":
                    logger.warning("⚠️ Groq API key not configured - using Gemini instead")
                    return await self.get_gemini_llm()
                
                self._groq_model = ChatGroq(
                    api_key=llm_settings.GROQ_API_KEY,
                    model=llm_settings.GROQ_MODEL,
                    temperature=llm_settings.GROQ_TEMPERATURE,
                    max_tokens=llm_settings.GROQ_MAX_TOKENS,
                )
                logger.info("✅ Groq LLM initialized successfully")
                return self._groq_model
                
            except ImportError:
                logger.warning("⚠️ langchain-groq not installed - install with: pip install langchain-groq")
                logger.info("Falling back to Gemini")
                return await self.get_gemini_llm()
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize Groq model: {e} - falling back to Gemini")
            return await self.get_gemini_llm()
    
    async def get_gemini_llm(self) -> BaseLLM:
        """
        Get or initialize Gemini LLM model
        Requires google-generativeai package
        """
        if self._gemini_model is not None:
            return self._gemini_model
        
        try:
            try:
                from langchain_google_genai import ChatGoogleGenerativeAI
            except ImportError:
                logger.error("google-generativeai not installed. Install with: pip install langchain-google-genai google-generativeai")
                raise ImportError("langchain-google-genai package required")
            
            if not llm_settings.GEMINI_API_KEY:
                raise ValueError("GEMINI_API_KEY not configured in environment")
            
            self._gemini_model = ChatGoogleGenerativeAI(
                model=llm_settings.GEMINI_MODEL,
                google_api_key=llm_settings.GEMINI_API_KEY,
                temperature=llm_settings.GEMINI_TEMPERATURE,
                max_tokens=llm_settings.GEMINI_MAX_TOKENS,
                timeout=llm_settings.TIMEOUT,
            )
            
            logger.info("✅ Gemini model initialized successfully")
            return self._gemini_model
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize Gemini model: {e}")
            raise
    
    async def get_llm(self, provider: Literal["groq", "gemini"]) -> BaseLLM:
        """
        Get LLM model by provider name
        
        Args:
            provider: "groq" or "gemini"
            
        Returns:
            Initialized LLM model
        """
        if provider == "groq":
            return await self.get_groq_llm()
        elif provider == "gemini":
            return await self.get_gemini_llm()
        else:
            raise ValueError(f"Unknown provider: {provider}")
    
    async def get_default_llm(self) -> BaseLLM:
        """Get the default configured LLM"""
        return await self.get_llm(llm_settings.DEFAULT_LLM)


# Global LLM provider instance
llm_provider = LLMProvider()
