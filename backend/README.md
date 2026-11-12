# Congiotech Pharmaceutical Private PaddleOCR Microservice

Privacy-first, zero-disk-retention optical character recognition (OCR) microservice tailored for extracting pharmaceutical entities from medicine strips, boxes, and cartons.

## Features
- **Zero-Disk Retention**: Images are processed directly from memory buffers (RAM) and immediately cleared. No patient or proprietary pharma data touches the disk.
- **PaddleOCR Engine**: Deep-learning text detection (DBNet) and recognition (CRNN) with automatic orientation classification.
- **Pharma Entity Extractor**: Built-in regex and fuzzy matching for:
  - Medicine Brand & Generic Name
  - Batch / Lot Number
  - Expiry Date (MM/YYYY)
  - Manufacturing Date
  - M.R.P.
- **Production API Security**: Protected by `X-API-Key` header authentication.
- **Hugging Face Spaces Ready**: Can be deployed as a **Private Hugging Face Space** with 1 click using the included Dockerfile.

---

## 1. Quick Local Execution (Development)

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
Interactive Swagger API documentation will be available at:
`http://localhost:8000/docs`

---

## 2. Docker Execution (Production)

```bash
cd backend
docker-compose up -d --build
```

---

## 3. Deploying as a Private Hugging Face Space (Cloud Confidentiality)

1. Go to [Hugging Face](https://huggingface.co/) and click **New Space**.
2. Space Name: `pharma-paddle-ocr`
3. Space SDK: **Docker** -> **Blank**.
4. Visibility: Select **Private** (Ensures zero public access!).
5. Clone the space repository and copy the contents of `backend/` into it.
6. Push to Hugging Face:
   ```bash
   git add .
   git commit -m "Deploy confidential pharma OCR"
   git push
   ```
7. Hugging Face will automatically build and start your secure OCR microservice.
8. Add your Space URL into your mobile `.env`:
   `EXPO_PUBLIC_OCR_API_URL=https://your-username-pharma-paddle-ocr.hf.space`

