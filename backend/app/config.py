import os
try:
    from pydantic_settings import BaseSettings
except ImportError:
    from pydantic import BaseModel as BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "Congiotech Pharma OCR Microservice"
    APP_ENV: str = "production"
    API_V1_PREFIX: str = "/api/v1"
    
    # Security: Confidential API Key for mobile clients
    API_KEY: str = os.getenv("PHARMA_OCR_API_KEY", "congiotech-pharma-secret-key-2026")
    
    # CORS: Allowed origins
    CORS_ORIGINS: list[str] = ["*"]
    
    # PaddleOCR configuration
    OCR_LANG: str = "en"
    OCR_USE_ANGLE_CLS: bool = True
    USE_GPU: bool = False

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
