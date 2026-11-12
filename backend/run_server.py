import sys
import os

backend_dir = r"D:\Inventory-ocr\backend"
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import uvicorn

if __name__ == '__main__':
    uvicorn.run("app.main:app", host="0.0.0.0", port=8001, app_dir=backend_dir, log_level="info")
