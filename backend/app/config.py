import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "Congiotech Pharma OCR Microservice"
    APP_ENV: str = "production"
    API_V1_PREFIX: str = "/api/v1"
    
    # Security: Confidential API Key for mobile clients
    # Default key provided for quick local development; override in production
    API_KEY: str = os.getenv("PHARMA_OCR_API_KEY", "congiotech-pharma-secret-key-2026")
    
    # CORS: Allowed origins (can specify mobile dev IP or '*' for internal network)
    CORS_ORIGINS: list[str] = ["*"]
    
    # PaddleOCR configuration
    OCR_LANG: str = "en"
    OCR_USE_ANGLE_CLS: bool = True  # Automatically rotate upside-down medicine text
    USE_GPU: bool = False           # Set True if deploying on GPU server

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

