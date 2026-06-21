from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
import warnings

from app.core.config import settings
from app.core.database import Database
from app.core.logging import setup_logging
from app.core.chat_routes import router as chat_router
from app.core.rag_routes import router as rag_router
from app.core.transactionParser.router import router as import_router
from app.websocket import init_socket_server
from app.ai.orchestrator import get_orchestrator
from app.services.userService import init_user_service
from app.ai.llm.embeddingService import EmbeddingService
from app.ai.llm.ragPipeline import rag_pipeline
from app.services.notificationService import init_notification_service
from app.websocket.notification_poller import init_notification_poller

# Suppress Pydantic V1 warning for Python 3.14+
warnings.filterwarnings('ignore', category=UserWarning, message='.*Pydantic V1 functionality.*')

# Setup logging
setup_logging()
logger = logging.getLogger(__name__)

# Security check: Warn about default SECRET_KEY
if settings.SECRET_KEY == "your-secret-key-change-in-production":
    if settings.ENVIRONMENT == "production":
        raise RuntimeError("⚠️  ERROR: Using default SECRET_KEY in production! Change this by setting SECRET_KEY in .env file")
    logger.warning("⚠️  WARNING: Using default SECRET_KEY! Change this in production by setting SECRET_KEY in .env file")


# Parse CORS origins
cors_origins_list = ["*"] if settings.CORS_ORIGINS == "*" else settings.CORS_ORIGINS.split(",")

# Initialize Socket.IO server BEFORE creating FastAPI app
socket_server = init_socket_server(cors_origins=cors_origins_list)
logger.info("✅ Socket.IO server initialized")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager
    Handles startup and shutdown events
    """
    # Startup
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info(f"Server will be available at: http://{settings.HOST}:{settings.PORT}")
    logger.info(f"WebSocket endpoint: ws://{settings.HOST}:{settings.PORT}/socket.io/")
    
    await Database.connect_db()
    logger.info("✅ Database connected")
    
    # Initialize EmbeddingService (singleton for Google embeddings)
    try:
        EmbeddingService.init()
        logger.info("✅ EmbeddingService initialized (Google text-embedding-004)")
    except Exception as e:
        logger.error(f"⚠️ EmbeddingService initialization failed: {e}")
        logger.info("RAG pipeline may not work without embeddings")
    
    # Initialize UserService
    try:
        db = Database.get_db()
        init_user_service(db)
        logger.info("✅ UserService initialized")
    except Exception as e:
        logger.error(f"⚠️ UserService initialization failed: {e}")

    # Initialize NotificationService
    try:
        db = Database.get_db()
        init_notification_service(db)
        logger.info("✅ NotificationService initialized")
    except Exception as e:
        logger.error(f"⚠️ NotificationService initialization failed: {e}")

    # Initialize NotificationPoller (needs live sio + sessions reference)
    try:
        sio = socket_server.get_sio()
        sessions = socket_server.handlers.sessions  # live reference — always current
        init_notification_poller(sio, sessions)
        logger.info("✅ NotificationPoller initialized")
    except Exception as e:
        logger.error(f"⚠️ NotificationPoller initialization failed: {e}")
    
    # Initialize AI Orchestrator & Models
    try:
        from app.ai.llm.init import llm_provider
        await llm_provider.initialize_models()
        
        db = Database.get_db()
        orchestrator = await get_orchestrator(db)
        logger.info("✅ AI Orchestrator initialized")
    except Exception as e:
        logger.error(f"⚠️ AI Orchestrator initialization failed: {e}")
        logger.info("Chat functionality may be limited")
    
    # Initialize RAG Pipeline cron scheduler
    scheduler = None
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.triggers.interval import IntervalTrigger
        
        scheduler = AsyncIOScheduler()
        
        # Schedule RAG pipeline to run every N seconds (configurable)
        # coalesce=True: skip missed runs if job takes too long
        # max_instances=1: prevent multiple concurrent runs
        scheduler.add_job(
            rag_pipeline.process_all_unprocessed,
            trigger=IntervalTrigger(seconds=settings.CRON_INTERVAL_SECONDS),
            id="rag_pipeline_watcher",
            name="RAG Pipeline Watcher",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
        )

        # Notification poller — emits pending DB notifications to connected users
        from app.websocket.notification_poller import get_notification_poller
        scheduler.add_job(
            get_notification_poller().poll,
            trigger=IntervalTrigger(seconds=settings.NOTIFICATION_POLL_SECONDS),
            id="notification_poller",
            name="Notification Poller",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
        )

        scheduler.start()
        app.state.scheduler = scheduler
        logger.info(
            f"✅ RAG Pipeline scheduler started "
            f"(runs every {settings.CRON_INTERVAL_SECONDS} seconds)"
        )
    except ImportError:
        logger.warning("⚠️ APScheduler not installed. RAG pipeline will not run automatically.")
        logger.info("Run: pip install apscheduler")
    except Exception as e:
        logger.error(f"⚠️ Failed to start RAG scheduler: {e}")
    
    yield
    
    # Shutdown
    logger.info("Shutting down application...")
    
    # Stop scheduler
    if scheduler and scheduler.running:
        scheduler.shutdown(wait=True)
        logger.info("RAG scheduler shut down")
    
    await Database.close_db()
    logger.info("Shutdown complete")


# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AI-powered financial chat server with MongoDB integration and Socket.IO",
    lifespan=lifespan,
    debug=settings.DEBUG,
    docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT == "development" else None,
)


# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Socket.IO application
# This allows Socket.IO to handle WebSocket connections at /socket.io
if socket_server:
    app.mount("/socket.io", socket_server.get_asgi_app())
    logger.info("✅ Socket.IO mounted at /socket.io")
else:
    logger.error("❌ Failed to initialize Socket.IO server!")

# Include chat routes
app.include_router(chat_router)
logger.info("✅ Chat routes registered at /api/chat")

app.include_router(rag_router)
logger.info("✅ RAG routes registered at /api/rag")

app.include_router(import_router)
logger.info("✅ Transaction import routes registered at /api/import")


# Health check endpoints
@app.get("/")
def root():
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "websocket": f"ws://{settings.HOST}:{settings.PORT}/socket.io/",
        "environment": settings.ENVIRONMENT
    }


@app.get("/health")
@app.get("/api/v1/health")
def health_check():
    return {
        "status": "healthy",
        "database": "connected" if Database.client else "disconnected",
        "websocket": "initialized" if socket_server else "not initialized",
        "port": settings.PORT
    }

#Keep my server alive
@app.get("/api/ping")
@app.head("/api/ping")
def ping_handler():
    return {"message": "pong"}

# This is only used when running directly: python app/main.py
# You're using run.py instead, which is fine
if __name__ == "__main__":
    import uvicorn
    logger.info(f"🚀 Starting server on {settings.HOST}:{settings.PORT}")
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info"
    )