import base64
from fastapi import FastAPI, File, UploadFile, Header, HTTPException, status, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from app.config import settings
from app.ocr_engine import run_paddle_ocr
from app.pharma_parser import PharmaEntityExtractor

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Privacy-first OCR microservice for real text extraction from medicine packaging."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Base64ScanRequest(BaseModel):
    image_base64: str

class ScanResponse(BaseModel):
    success: bool
    detected_text: str
    all_lines: List[str]
    medicine_name: str
    sku: Optional[str] = ""
    po_number: Optional[str] = ""
    batch_number: str
    expiry_date: str
    mfg_date: Optional[str] = ""
    mrp: Optional[float] = None
    lines_count: int

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "environment": settings.APP_ENV,
        "ocr_engine": "PaddleOCR Native (Real Text Extraction)"
    }

@app.post(
    f"{settings.API_V1_PREFIX}/ocr/scan",
    response_model=ScanResponse
)
async def scan_medicine_file(
    file: UploadFile = File(...)
):
    """
    Upload image file. Runs real PaddleOCR in memory and returns detected text.
    """
    image_bytes = await file.read()
    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty image file received.")

    ocr_lines = run_paddle_ocr(image_bytes)
    entities = PharmaEntityExtractor.extract_entities(ocr_lines)
    print(f"[OCR RAW DETECTED LINES COUNT: {len(ocr_lines)}]")
    for idx, l in enumerate(ocr_lines[:25]):
        print(f"  [{idx}] {l.get('text')} (conf: {l.get('confidence')})")
    print(f"[EXTRACTED ENTITIES]: name={entities.get('medicine_name')} | sku={entities.get('sku')} | po={entities.get('po_number')} | batch={entities.get('batch_number')} | mfg={entities.get('mfg_date')} | exp={entities.get('expiry_date')} | mrp={entities.get('mrp')}")

    return ScanResponse(
        success=True,
        detected_text=entities["detected_text"],
        all_lines=entities["all_lines"],
        medicine_name=entities["medicine_name"],
        sku=entities.get("sku", ""),
        po_number=entities.get("po_number", ""),
        batch_number=entities["batch_number"],
        expiry_date=entities["expiry_date"],
        mfg_date=entities.get("mfg_date", ""),
        mrp=entities.get("mrp"),
        lines_count=entities["lines_count"],
    )

@app.post(
    f"{settings.API_V1_PREFIX}/ocr/scan-base64",
    response_model=ScanResponse
)
async def scan_medicine_base64(
    request: Base64ScanRequest
):
    """
    Direct base64 scanning endpoint from React Native CameraView.
    """
    try:
        raw_b64 = request.image_base64
        if "base64," in raw_b64:
            raw_b64 = raw_b64.split("base64,")[1]
        image_bytes = base64.b64decode(raw_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image string.")

    ocr_lines = run_paddle_ocr(image_bytes)
    entities = PharmaEntityExtractor.extract_entities(ocr_lines)
    print(f"[OCR RAW DETECTED LINES COUNT: {len(ocr_lines)}]")
    for idx, l in enumerate(ocr_lines[:25]):
        print(f"  [{idx}] {l.get('text')} (conf: {l.get('confidence')})")
    print(f"[EXTRACTED ENTITIES]: name={entities.get('medicine_name')} | sku={entities.get('sku')} | po={entities.get('po_number')} | batch={entities.get('batch_number')} | mfg={entities.get('mfg_date')} | exp={entities.get('expiry_date')} | mrp={entities.get('mrp')}")

    return ScanResponse(
        success=True,
        detected_text=entities["detected_text"],
        all_lines=entities["all_lines"],
        medicine_name=entities["medicine_name"],
        sku=entities.get("sku", ""),
        po_number=entities.get("po_number", ""),
        batch_number=entities["batch_number"],
        expiry_date=entities["expiry_date"],
        mfg_date=entities.get("mfg_date", ""),
        mrp=entities.get("mrp"),
        lines_count=entities["lines_count"],
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
