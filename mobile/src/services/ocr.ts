/**
 * Barcode & QR Code Scanning Service
 * Handles live 1D/2D barcode & QR decoding, GS1 pharma parsing, and structured field extraction
 */

export interface ExtractedLabelData {
  source: 'BARCODE' | 'QR_CODE' | 'MANUAL';
  barcode?: string;
  barcodeType?: string;
  productName?: string;
  sku?: string;
  batchNumber?: string;
  mfgDate?: string;
  expiryDate?: string;
  quantity?: number;
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
  if (cleanCode.length >= 14 && (cleanCode.startsWith('01') || cleanCode.startsWith('(01)'))) {
    try {
      const gtin = cleanCode.substring(2, 16);
      let expiry = '';
      let batch = '';

      const expIndex = cleanCode.indexOf('17');
      if (expIndex !== -1 && cleanCode.length >= expIndex + 8) {
        const yymmdd = cleanCode.substring(expIndex + 2, expIndex + 8);
        const year = '20' + yymmdd.substring(0, 2);
        const month = yymmdd.substring(2, 4);
        const day = yymmdd.substring(4, 6);
        expiry = `${year}-${month}-${day}`;
      }

      const batchIndex = cleanCode.indexOf('10');
      if (batchIndex !== -1) {
        batch = cleanCode.substring(batchIndex + 2, batchIndex + 12).replace(/[^A-Za-z0-9]/g, '');
      }

      return {
        source: isQR ? 'QR_CODE' : 'BARCODE',
        barcode: gtin || cleanCode,
        barcodeType: isQR ? 'GS1_QR_CODE' : 'GS1_DATAMATRIX',
        batchNumber: batch || undefined,
        expiryDate: expiry || undefined,
        confidence: 1.0,
        rawText: cleanCode,
      };
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
