const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createWorker } = require('tesseract.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const upload = multer({ dest: path.join(os.tmpdir(), 'ocr-uploads') });

let worker = null;

// Initialize OCR worker once at startup for high speed recognition
async function initWorker() {
  console.log('Initializing OCR Engine...');
  try {
    worker = await createWorker('eng');
    console.log('OCR Engine is ready to process images!');
  } catch (err) {
    console.error('Failed to initialize OCR Worker:', err);
  }
}
initWorker();

/**
 * Intelligent Pharmaceutical Label Text Parser
 * Extracts Product Name, SKU, Batch Number, Mfg Date, Expiry Date from OCR raw text
 */
function parsePharmaLabelText(rawText) {
  const lines = rawText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  let batchNumber = '';
  let expiryDate = '';
  let mfgDate = '';
  let productName = '';
  let sku = '';

  // 1. Regex for Explicit Product Name Line
  for (const line of lines) {
    const prodMatch = line.match(/(?:product(?:\s*name)?|item(?:\s*name)?|medicine(?:\s*name)?)[:\s\.\-]+(.+)/i);
    if (prodMatch && prodMatch[1]) {
      productName = prodMatch[1].trim();
      break;
    }
  }

  // 2. Regex for SKU
  for (const line of lines) {
    const skuMatch = line.match(/(?:sku|item\s*code|product\s*code)[:\s\.\-]+([A-Za-z0-9\-_]+)/i);
    if (skuMatch && skuMatch[1]) {
      sku = skuMatch[1].trim().toUpperCase();
      break;
    }
  }

  // 3. Regex for Batch / Lot Number
  const batchPatterns = [
    /(?:batch\s*(?:no|num|\#)?|b\.?no|lot\s*(?:no|\#)?|b\/n)[:\s\.\-]+([A-Za-z0-9\-_]{3,20})/i,
    /\b(?:B|L)[:\s]+([A-Za-z0-9\-_]{4,15})\b/i,
  ];

  for (const line of lines) {
    for (const pattern of batchPatterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        batchNumber = match[1].trim().toUpperCase();
        break;
      }
    }
    if (batchNumber) break;
  }

  // 4. Regex for Expiry Date
  const expPatterns = [
    /(?:exp(?:iry)?(?:\s*date|\.|\s*dt)?|use\s*before|valid\s*(?:till|thru))[:\s\.\-]+([0-9]{1,2}[\/\.\-][0-9]{2,4}|[A-Za-z]{3}[\/\.\-\s]+[0-9]{2,4}|[0-9]{4}[\/\.\-][0-9]{1,2}(?:[\/\.\-][0-9]{1,2})?)/i,
    /\b(?:EXP)[:\s]+([0-9]{1,2}[\/\.\-][0-9]{2,4}|[0-9]{4}[\/\.\-][0-9]{1,2})\b/i,
  ];

  for (const line of lines) {
    for (const pattern of expPatterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        expiryDate = match[1].trim();
        break;
      }
    }
    if (expiryDate) break;
  }

  // 5. Regex for Mfg Date
  const mfgPatterns = [
    /(?:mfg|mfd|date\s*of\s*mfg)[:\s\.\-]+([0-9]{1,2}[\/\.\-][0-9]{2,4}|[A-Za-z]{3}[\/\.\-\s]+[0-9]{2,4}|[0-9]{4}[\/\.\-][0-9]{1,2})/i,
  ];

  for (const line of lines) {
    for (const pattern of mfgPatterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        mfgDate = match[1].trim();
        break;
      }
    }
    if (mfgDate) break;
  }

  // 6. If Product Name not explicitly prefixed, detect medicine keywords or most prominent title
  if (!productName) {
    const pharmaSuffixes = ['tablets', 'capsules', 'suspension', 'syrup', 'injection', 'ointment', 'solution', 'drops', 'gel', 'cream', 'mg', 'ml', 'iu'];
    for (const line of lines) {
      const lower = line.toLowerCase();
      const hasPharmaSuffix = pharmaSuffixes.some(s => lower.includes(s));
      const isNotMeta = !lower.includes('b.no') && !lower.includes('batch') && !lower.includes('exp:') && !lower.includes('mfg:') && !lower.includes('mrp:');
      if (hasPharmaSuffix && isNotMeta && line.length >= 5) {
        productName = line;
        break;
      }
    }
  }

  // Fallback to first non-numeric/non-symbol line
  if (!productName) {
    for (const line of lines) {
      if (line.length >= 4 && !/^[0-9\W]+$/.test(line) && !line.includes('Result') && !line.includes('PaddleOCR')) {
        productName = line;
        break;
      }
    }
  }

  return {
    productName: productName || 'Pharmaceutical Product',
    sku: sku || undefined,
    batchNumber: batchNumber || undefined,
    expiryDate: expiryDate || undefined,
    mfgDate: mfgDate || undefined,
    rawText: rawText,
  };
}

/**
 * Health Check Endpoint
 */
app.get('/', (req, res) => {
  res.json({
    status: 'ONLINE',
    service: 'Congiotech Pharmaceutical OCR Engine',
    port: PORT,
    timestamp: new Date().toISOString(),
  });
});

/**
 * OCR Extraction Endpoint
 * Accepts JSON with image_base64 OR multipart file upload
 */
app.post('/api/ocr/extract', upload.single('file'), async (req, res) => {
  let imageSource = null;
  let tempFilePath = null;

  try {
    if (req.file) {
      imageSource = req.file.path;
      tempFilePath = req.file.path;
    } else if (req.body?.image_base64) {
      let base64Data = req.body.image_base64;
      if (base64Data.includes(',')) {
        base64Data = base64Data.split(',')[1];
      }
      imageSource = Buffer.from(base64Data, 'base64');
    } else {
      return res.status(400).json({ error: 'No image provided. Please send file or image_base64.' });
    }

    if (!worker) {
      worker = await createWorker('eng');
    }

    console.log(`[${new Date().toLocaleTimeString()}] Running OCR on incoming image...`);
    const startTime = Date.now();
    const { data } = await worker.recognize(imageSource);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`OCR Completed in ${duration}s. Confidence: ${Math.round(data.confidence)}%`);

    const parsed = parsePharmaLabelText(data.text);

    return res.json({
      success: true,
      product_name: parsed.productName,
      sku: parsed.sku,
      batch_number: parsed.batchNumber,
      expiry_date: parsed.expiryDate,
      mfg_date: parsed.mfgDate,
      confidence: (data.confidence / 100).toFixed(2),
      raw_text: data.text,
      duration_seconds: duration,
    });
  } catch (err) {
    console.error('OCR processing error:', err);
    return res.status(500).json({ error: err.message || 'OCR processing failed' });
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {}
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`  CONGIOTECH PHARMA OCR SERVER RUNNING ON PORT ${PORT} `);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://192.168.1.49:${PORT}`);
  console.log(`====================================================`);
});
