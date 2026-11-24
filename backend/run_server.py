import sys
import os

# Dynamic backend directory resolution
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Essential execution flags for PaddlePaddle on Windows
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
os.environ["FLAGS_use_mkldnn"] = "0"
os.environ["FLAGS_enable_pir_api"] = "0"
os.environ["FLAGS_enable_pir_in_executor"] = "0"

import uvicorn

if __name__ == '__main__':
    # Listen on 0.0.0.0 so mobile devices and emulator can connect
    uvicorn.run("app.main:app", host="0.0.0.0", port=8001, app_dir=backend_dir, log_level="info")
