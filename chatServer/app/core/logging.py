import logging
import sys
from app.core.config import settings


def setup_logging():
    """Configure application logging"""
    
    log_level = logging.DEBUG if settings.DEBUG else logging.INFO
    
    # Configure root logger
    logging.basicConfig(
        level=log_level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(sys.stdout)
        ]
    )
    
    # Set specific loggers
    logging.getLogger("uvicorn").setLevel(log_level)
    logging.getLogger("fastapi").setLevel(log_level)
    logging.getLogger("motor").setLevel(logging.WARNING)
    logging.getLogger("pymongo").setLevel(logging.WARNING)
    logging.getLogger("apscheduler").setLevel(logging.WARNING)
    
    logger = logging.getLogger(__name__)
    logger.info(f"Logging configured - Level: {logging.getLevelName(log_level)}")