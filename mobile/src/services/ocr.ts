/**
 * Barcode & QR Code Scanning Service
 * Handles live 1D/2D barcode & QR decoding, GS1 pharma parsing, and structured field extraction
 */

export interface ExtractedLabelData {
  source: 'BARCODE' | 'QR_CODE' | 'OCR' | 'MANUAL';
  barcode?: string;
  barcodeType?: string;
  productName?: string;
  sku?: string;
  batchNumber?: string;
  mfgDate?: string;
  expiryDate?: string;
  quantity?: number;
  price?: number | string;
  poNumber?: string;
  confidence?: number;
  rawText?: string;
}

/**
 * Decodes barcode or QR code string and extracts structured fields
 * Handles:
 *  1. QR Code JSON formats (e.g. {"sku": "...", "batch": "...", "expiry": "..."})
 *  2. QR Code Delimited strings (e.g. "SKU|BATCH|EXPIRY" or URL parameters)
 *  3. GS1 DataMatrix 2D codes for pharma: (01)GTIN (17)YYMMDD (10)BATCH
 *  4. Standard 1D/2D Barcodes (Code128, EAN-13, Code39)
 */
export function decodePharmaBarcode(rawCode: string, codeType?: string): ExtractedLabelData {
  const cleanCode = rawCode.trim();
  const isQR = codeType?.toLowerCase().includes('qr') || cleanCode.startsWith('{') || cleanCode.includes('http');

  // Case 1: QR Code containing JSON payload
  if (cleanCode.startsWith('{') && cleanCode.endsWith('}')) {
    try {
      const parsed = JSON.parse(cleanCode);
      return {
        source: 'QR_CODE',
        barcode: parsed.barcode || parsed.sku || parsed.gtin || cleanCode,
        barcodeType: 'QR_CODE (JSON)',
        productName: parsed.product || parsed.name || parsed.productName,
        sku: parsed.sku || parsed.productCode,
        batchNumber: parsed.batch || parsed.batchNumber || parsed.lot,
        mfgDate: parsed.mfg || parsed.mfgDate,
        expiryDate: parsed.expiry || parsed.expiryDate || parsed.exp,
        quantity: parsed.quantity || parsed.qty,
        confidence: 1.0,
        rawText: cleanCode,
      };
    } catch {
      // Continue
    }
  }

  // Case 2: QR Code containing URL with query params
  if (cleanCode.includes('?') && (cleanCode.startsWith('http://') || cleanCode.startsWith('https://'))) {
    try {
      const queryString = cleanCode.split('?')[1];
      const params = new URLSearchParams(queryString);
      const sku = params.get('sku') || params.get('product') || undefined;
      const batch = params.get('batch') || params.get('lot') || undefined;
      const exp = params.get('exp') || params.get('expiry') || undefined;
      const gtin = params.get('gtin') || params.get('barcode') || undefined;

      if (sku || batch || gtin) {
        return {
          source: 'QR_CODE',
          barcode: gtin || sku || cleanCode,
          barcodeType: 'QR_CODE (Digital Link)',
          sku: sku,
          batchNumber: batch,
          expiryDate: exp,
          confidence: 1.0,
          rawText: cleanCode,
        };
      }
    } catch {
      // Continue
    }
  }

  // Case 3: Delimited QR code (e.g. "MED-PARA-500|BATCH123|2027-12-31")
  if (isQR && (cleanCode.includes('|') || cleanCode.includes(';'))) {
    const delimiter = cleanCode.includes('|') ? '|' : ';';
    const parts = cleanCode.split(delimiter).map((p) => p.trim());
    if (parts.length >= 2) {
      return {
        source: 'QR_CODE',
        barcode: parts[0],
        barcodeType: 'QR_CODE (Delimited)',
        sku: parts[0],
        batchNumber: parts[1],
        expiryDate: parts[2] || undefined,
        confidence: 1.0,
        rawText: cleanCode,
      };
    }
  }

  // Case 4: GS1 DataMatrix / GS1 QR Code for pharma: (01)GTIN (17)YYMMDD (10)BATCH
  if (cleanCode.length >= 14 && (cleanCode.startsWith('01') || cleanCode.startsWith('(01)') || cleanCode.includes('(01)'))) {
    try {
      let gtin = '';
      let expiry = '';
      let batch = '';

      // Match GTIN: (01)14-digits or starting with 01 followed by 14 digits
      const gtinMatch = cleanCode.match(/(?:\(01\)|(?<=^01))(\d{14})/);
      if (gtinMatch) {
        gtin = gtinMatch[1];
      } else if (cleanCode.startsWith('01') && cleanCode.length >= 16) {
        gtin = cleanCode.substring(2, 16);
      }

      // Match Expiry date AI (17): YYMMDD
      const expMatch = cleanCode.match(/(?:\(17\)|(?<=\D17|^.{16}17))(\d{2})(\d{2})(\d{2})/);
      if (expMatch) {
        const year = '20' + expMatch[1];
        const month = expMatch[2];
        const day = expMatch[3];
        expiry = `${month}/${year}`;
      }

      // Match Batch / Lot AI (10)
      const batchMatch = cleanCode.match(/(?:\(10\)|(?<=\D10|^.{24}10))([A-Za-z0-9\-_]{2,20})/);
      if (batchMatch) {
        batch = batchMatch[1].trim();
      }

      if (gtin || batch || expiry) {
        return {
          source: isQR ? 'QR_CODE' : 'BARCODE',
          barcode: gtin || cleanCode,
          barcodeType: isQR ? 'GS1_QR_CODE' : 'GS1_DATAMATRIX',
          batchNumber: batch || undefined,
          expiryDate: expiry || undefined,
          confidence: 1.0,
          rawText: cleanCode,
        };
      }
    } catch {
      // Fallback
    }
  }

  // Case 5: Standard 1D Barcode or Plain QR Code
  return {
    source: isQR ? 'QR_CODE' : 'BARCODE',
    barcode: cleanCode,
    barcodeType: codeType?.toUpperCase() || (isQR ? 'QR_CODE' : 'BARCODE'),
    confidence: 1.0,
    rawText: cleanCode,
  };
}
