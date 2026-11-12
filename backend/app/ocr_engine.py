import os
import io
import pathlib
import numpy as np
from PIL import Image
from typing import List, Dict, Any

# Ensure cache and home directories are strictly inside the backend folder
CACHE_DIR = r"D:\Inventory-ocr\backend\cache"
os.environ["USERPROFILE"] = CACHE_DIR
os.environ["HOME"] = CACHE_DIR
os.environ["MPLCONFIGDIR"] = os.path.join(CACHE_DIR, "mpl")
os.makedirs(os.path.join(CACHE_DIR, "mpl"), exist_ok=True)
pathlib.Path.home = lambda: pathlib.Path(CACHE_DIR)

# Global singleton OCR engine instance
_ocr_instance = None

def get_ocr_engine():
    """
    Lazy singleton initialization of OCR engine.
    Uses local offline deep-learning OCR weights in CACHE_DIR.
    Zero-cloud, zero-disk retention for utmost pharma confidentiality.
    """
    global _ocr_instance
    if _ocr_instance is None:
        try:
            import easyocr
            easyocr_model_dir = os.path.join(CACHE_DIR, "easyocr")
            os.makedirs(easyocr_model_dir, exist_ok=True)
            _ocr_instance = easyocr.Reader(
                ['en'],
                gpu=False,
                model_storage_directory=easyocr_model_dir,
                user_network_directory=easyocr_model_dir,
                download_enabled=False,
                verbose=False
            )
            print("[OCR ENGINE] EasyOCR Reader initialized successfully with local weights!")
        except Exception as e:
            print(f"[OCR ENGINE INITIALIZATION ERROR]: {e}")
            _ocr_instance = None
    return _ocr_instance

def run_paddle_ocr(image_bytes: bytes) -> List[Dict[str, Any]]:
    """
    Runs real OCR on in-memory image bytes.
    Zero-disk retention: image bytes exist only in RAM during execution and are discarded.
    NO STATIC FALLBACK TEXT: returns exactly what is detected on the image.
    """
    try:
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        np_image = np.array(pil_image)
    except Exception as img_err:
        print(f"[IMAGE DECODE ERROR]: {img_err}")
        return []

    engine = get_ocr_engine()
    results: List[Dict[str, Any]] = []

    if engine is not None:
        try:
            # EasyOCR returns: (bbox, text, confidence)
            raw_detections = engine.readtext(np_image)
            for item in raw_detections:
                if len(item) >= 3:
                    box = item[0]
                    text = str(item[1]).strip()
                    conf = float(item[2])
                    if text:
                        results.append({
                            "text": text,
                            "confidence": round(conf, 3),
                            "box": box if isinstance(box, list) else (box.tolist() if hasattr(box, "tolist") else [])
                        })
            return results
        except Exception as err:
            print(f"[OCR INFERENCE ERROR]: {err}")
            return []

    return results
