import os
import io
import pathlib
import threading
import numpy as np
from PIL import Image
from typing import List, Dict, Any

# Disable online model check and Pir/MKLDNN issues on Windows PaddlePaddle 3.x
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
os.environ["FLAGS_use_mkldnn"] = "0"
os.environ["FLAGS_enable_pir_api"] = "0"
os.environ["FLAGS_enable_pir_in_executor"] = "0"

# Model cache directory in project
_BASE_DIR = pathlib.Path(__file__).resolve().parent.parent.parent
_CACHE_DIR = os.path.join(str(_BASE_DIR), ".cache", "easyocr_models")
if not os.path.exists(_CACHE_DIR):
    os.makedirs(_CACHE_DIR, exist_ok=True)

# Optional PyTorch multi-threading optimization if torch is installed
try:
    import torch
    cpu_cores = os.cpu_count() or 4
    torch.set_num_threads(max(1, cpu_cores - 1))
except Exception:
    pass

# Global singleton OCR engine instance and thread synchronization lock
_ocr_instance = None
_ocr_lock = threading.Lock()

def get_ocr_engine():
    """
    Lazy singleton initialization of PaddleOCR 3.x (PP-OCRv4) engine.
    Uses local offline deep-learning weights with PIR/oneDNN CPU compatibility.
    Zero-cloud, zero-disk retention for utmost pharma confidentiality.
    """
    global _ocr_instance
    if _ocr_instance is None:
        try:
            from paddleocr import PaddleOCR
            _ocr_instance = PaddleOCR(
                ocr_version="PP-OCRv4",
                lang="en",
                enable_mkldnn=False,
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
            )
            print("[OCR ENGINE] PaddleOCR 3.x (PP-OCRv4) engine initialized successfully!")
        except Exception as e:
            print(f"[OCR ENGINE PADDLEOCR INITIALIZATION ERROR]: {e}")
            try:
                import easyocr
                _ocr_instance = easyocr.Reader(['en'], gpu=False, download_enabled=False, verbose=False)
                print("[OCR ENGINE] EasyOCR fallback initialized successfully!")
            except Exception as e2:
                print(f"[OCR ENGINE FALLBACK ERROR]: {e2}")
                _ocr_instance = None
    return _ocr_instance

def run_paddle_ocr(image_bytes: bytes) -> List[Dict[str, Any]]:
    """
    High-Speed Pharmaceutical OCR on in-memory image bytes.
    Thread-safe execution with zero-disk retention.
    Returns detected text lines and any QR / 2D barcodes found on packaging.
    """
    try:
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        w, h = pil_image.size
        max_dim = 1440
        if max(w, h) > max_dim:
            scale = max_dim / float(max(w, h))
            new_w, new_h = int(w * scale), int(h * scale)
            pil_image = pil_image.resize((new_w, new_h), Image.Resampling.BILINEAR)

        np_image = np.array(pil_image)
    except Exception as img_err:
        print(f"[IMAGE DECODE ERROR]: {img_err}")
        return []

    results: List[Dict[str, Any]] = []

    # 1. Barcode & QR Code scan using OpenCV
    try:
        import cv2
        qr_detector = cv2.QRCodeDetector()
        qr_text, _, _ = qr_detector.detectAndDecode(np_image)
        if qr_text and qr_text.strip():
            results.append({
                "text": qr_text.strip(),
                "confidence": 1.0,
                "box": []
            })
    except Exception as cv_err:
        print(f"[OPENCV QR DECODE NOTICE]: {cv_err}")

    engine = get_ocr_engine()
    if engine is None:
        return results

    # Thread-safe prediction
    with _ocr_lock:
        try:
            # 1. PaddleOCR predict API (PaddleOCR 3.x / PaddleX)
            if hasattr(engine, "predict"):
                predictions = list(engine.predict(np_image))
                for page in predictions:
                    if hasattr(page, "get") or isinstance(page, dict):
                        rec_texts = page.get("rec_texts", [])
                        rec_scores = page.get("rec_scores", [])
                        rec_polys = page.get("rec_polys", page.get("dt_polys", []))
                        for idx, text in enumerate(rec_texts):
                            t = str(text).strip()
                            if t:
                                score = float(rec_scores[idx]) if idx < len(rec_scores) else 0.95
                                poly = rec_polys[idx] if idx < len(rec_polys) else []
                                box = poly.tolist() if hasattr(poly, "tolist") else (list(poly) if isinstance(poly, (list, tuple)) else [])
                                results.append({
                                    "text": t,
                                    "confidence": round(score, 3),
                                    "box": box
                                })
                    elif isinstance(page, list):
                        for item in page:
                            if isinstance(item, list) and len(item) == 2:
                                box = item[0]
                                text_tuple = item[1]
                                if isinstance(text_tuple, (tuple, list)) and len(text_tuple) >= 2:
                                    t = str(text_tuple[0]).strip()
                                    s = float(text_tuple[1])
                                    if t:
                                        results.append({
                                            "text": t,
                                            "confidence": round(s, 3),
                                            "box": box.tolist() if hasattr(box, "tolist") else list(box)
                                        })
                if results:
                    return results

            # 2. EasyOCR readtext API (if fallback was loaded)
            if hasattr(engine, "readtext"):
                raw_detections = engine.readtext(np_image, canvas_size=1080, batch_size=8, workers=0, detail=1)
                for item in raw_detections:
                    if len(item) >= 3:
                        box = item[0]
                        text = str(item[1]).strip()
                        conf = float(item[2])
                        if text and conf > 0.15:
                            results.append({
                                "text": text,
                                "confidence": round(conf, 3),
                                "box": box if isinstance(box, list) else (box.tolist() if hasattr(box, "tolist") else [])
                            })
                return results

        except Exception as err:
            print(f"[OCR INFERENCE ERROR]: {err}")
            return results

    return results
