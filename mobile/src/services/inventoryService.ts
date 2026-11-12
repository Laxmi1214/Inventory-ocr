import { safeStorage } from './db';
import { supabase, isSupabaseConfigured } from './supabase';

export interface InventoryMetrics {
  totalInStock: number;
  totalIncome: number;
  totalGo: number;
  medicineCount: number;
}

export interface MedicineTransaction {
  id: string;
  medicineName: string;
  batchNumber: string;
  expiryDate: string;
  type: 'INBOUND' | 'OUTBOUND';
  quantity: number;
  userName?: string;
  createdAt: string;
  notes?: string;
}

export interface OcrScanResult {
  medicineName: string;
  sku?: string;
  poNumber?: string;
  medicineConfidence: number;
  batchNumber: string;
  expiryDate: string;
  mfgDate?: string;
  mrp?: number;
  rawText?: string;
  allLines?: string[];
  linesCount?: number;
}

const STORAGE_INVENTORY_KEY = '@congiotech_inventory_items_v1';
const STORAGE_TRANSACTIONS_KEY = '@congiotech_inventory_transactions_v1';

// Initial pre-loaded stock so dashboard has realistic pharma data immediately
const INITIAL_STOCK: Array<{
  id: string;
  name: string;
  sku: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
}> = [
  {
    id: 'MED-1',
    name: 'Paracetamol 500mg Tablets',
    sku: 'MED-PARA-500',
    batchNumber: 'PARA-2026-08',
    expiryDate: '12/2027',
    quantity: 450,
  },
  {
    id: 'MED-2',
    name: 'Amoxicillin 250mg Suspension',
    sku: 'MED-AMOX-250',
    batchNumber: 'AMX-9082',
    expiryDate: '06/2026',
    quantity: 180,
  },
  {
    id: 'MED-3',
    name: 'Metformin Hydrochloride 500mg',
    sku: 'MED-METF-500',
    batchNumber: 'MET-4412',
    expiryDate: '09/2028',
    quantity: 320,
  },
];

const INITIAL_TRANSACTIONS: MedicineTransaction[] = [
  {
    id: 'TXN-001',
    medicineName: 'Paracetamol 500mg Tablets',
    batchNumber: 'PARA-2026-08',
    expiryDate: '12/2027',
    type: 'INBOUND',
    quantity: 450,
    userName: 'Warehouse Operator',
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    notes: 'Initial stock intake verified via OCR',
  },
  {
    id: 'TXN-002',
    medicineName: 'Amoxicillin 250mg Suspension',
    batchNumber: 'AMX-9082',
    expiryDate: '06/2026',
    type: 'INBOUND',
    quantity: 200,
    userName: 'Warehouse Operator',
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    notes: 'Dock Bay 3 intake',
  },
  {
    id: 'TXN-003',
    medicineName: 'Amoxicillin 250mg Suspension',
    batchNumber: 'AMX-9082',
    expiryDate: '06/2026',
    type: 'OUTBOUND',
    quantity: 20,
    userName: 'Supervisor',
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    notes: 'Hospital pharmacy dispatch',
  },
];

/**
 * Fetch inventory metrics: Total In Stock, Total Income (Inbound), Total Go (Outbound)
 */
export async function getInventoryMetrics(): Promise<InventoryMetrics> {
  try {
    const txRaw = await safeStorage.getItem(STORAGE_TRANSACTIONS_KEY);
    let transactions: MedicineTransaction[] = txRaw ? JSON.parse(txRaw) : INITIAL_TRANSACTIONS;
    if (!txRaw) {
      await safeStorage.setItem(STORAGE_TRANSACTIONS_KEY, JSON.stringify(INITIAL_TRANSACTIONS));
    }

    const stockRaw = await safeStorage.getItem(STORAGE_INVENTORY_KEY);
    let stockItems = stockRaw ? JSON.parse(stockRaw) : INITIAL_STOCK;
    if (!stockRaw) {
      await safeStorage.setItem(STORAGE_INVENTORY_KEY, JSON.stringify(INITIAL_STOCK));
    }

    let totalIncome = 0;
    let totalGo = 0;

    transactions.forEach((tx) => {
      if (tx.type === 'INBOUND') {
        totalIncome += tx.quantity;
      } else if (tx.type === 'OUTBOUND') {
        totalGo += tx.quantity;
      }
    });

    const totalInStock = stockItems.reduce((acc: number, item: any) => acc + (item.quantity || 0), 0);

    return {
      totalInStock,
      totalIncome,
      totalGo,
      medicineCount: stockItems.length,
    };
  } catch (err) {
    console.warn('Error reading inventory metrics:', err);
    return {
      totalInStock: 950,
      totalIncome: 650,
      totalGo: 20,
      medicineCount: 3,
    };
  }
}

/**
 * Fetch recent inventory movements
 */
export async function getRecentTransactions(): Promise<MedicineTransaction[]> {
  try {
    const raw = await safeStorage.getItem(STORAGE_TRANSACTIONS_KEY);
    if (!raw) return INITIAL_TRANSACTIONS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.reverse().slice(0, 10) : INITIAL_TRANSACTIONS;
  } catch {
    return INITIAL_TRANSACTIONS;
  }
}

/**
 * Record a new medicine transaction:
 * - INBOUND ("Income"): increases stock
 * - OUTBOUND ("Go"): decreases stock
 */
export async function recordMedicineMovement(params: {
  medicineName: string;
  batchNumber: string;
  expiryDate: string;
  type: 'INBOUND' | 'OUTBOUND';
  quantity: number;
  userName?: string;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { medicineName, batchNumber, expiryDate, type, quantity, userName, notes } = params;

    if (!medicineName || !medicineName.trim()) {
      return { success: false, error: 'Medicine name is required.' };
    }
    if (!batchNumber || !batchNumber.trim()) {
      return { success: false, error: 'Batch number is required.' };
    }
    if (!quantity || quantity <= 0) {
      return { success: false, error: 'Quantity must be greater than zero.' };
    }

    // 1. Update stock records
    const stockRaw = await safeStorage.getItem(STORAGE_INVENTORY_KEY);
    let stockItems: any[] = stockRaw ? JSON.parse(stockRaw) : [...INITIAL_STOCK];

    const cleanBatch = batchNumber.trim().toUpperCase();
    const cleanMedName = medicineName.trim();

    const existingIndex = stockItems.findIndex(
      (item) =>
        item.name.toLowerCase() === cleanMedName.toLowerCase() &&
        item.batchNumber.toUpperCase() === cleanBatch
    );

    if (type === 'OUTBOUND') {
      if (existingIndex === -1) {
        return {
          success: false,
          error: `Batch ${cleanBatch} of ${cleanMedName} not found in inventory stock to dispatch.`,
        };
      }
      if (stockItems[existingIndex].quantity < quantity) {
        return {
          success: false,
          error: `Insufficient stock! Available: ${stockItems[existingIndex].quantity}, Requested: ${quantity}`,
        };
      }
      stockItems[existingIndex].quantity -= quantity;
    } else {
      // INBOUND (Income)
      if (existingIndex !== -1) {
        stockItems[existingIndex].quantity += quantity;
      } else {
        stockItems.push({
          id: `MED-${Date.now()}`,
          name: cleanMedName,
          sku: `SKU-${cleanMedName.substring(0, 4).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`,
          batchNumber: cleanBatch,
          expiryDate: expiryDate || '12/2027',
          quantity,
        });
      }
    }

    await safeStorage.setItem(STORAGE_INVENTORY_KEY, JSON.stringify(stockItems));

    // 2. Append transaction record
    const txRaw = await safeStorage.getItem(STORAGE_TRANSACTIONS_KEY);
    let transactions: MedicineTransaction[] = txRaw ? JSON.parse(txRaw) : [...INITIAL_TRANSACTIONS];

    const newTx: MedicineTransaction = {
      id: `TXN-${Date.now().toString(36).toUpperCase()}`,
      medicineName: cleanMedName,
      batchNumber: cleanBatch,
      expiryDate: expiryDate || '12/2027',
      type,
      quantity,
      userName: userName || 'Warehouse Staff',
      createdAt: new Date().toISOString(),
      notes: notes || (type === 'INBOUND' ? 'PaddleOCR scanned intake' : 'Outbound dispatch'),
    };

    transactions.push(newTx);
    await safeStorage.setItem(STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions));

    // 3. Supabase Cloud Sync if configured
    if (isSupabaseConfigured) {
      try {
        // Query product id
        const { data: prodData } = await supabase
          .from('products')
          .select('id')
          .ilike('name', `%${cleanMedName}%`)
          .limit(1)
          .maybeSingle();

        if (prodData?.id) {
          await supabase.from('inventory_transactions').insert({
            product_id: prodData.id,
            type,
            quantity,
            notes: newTx.notes,
            created_at: newTx.createdAt,
          });
        }
      } catch (cloudErr) {
        console.warn('Cloud transaction sync warning:', cloudErr);
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to record inventory movement.' };
  }
}

/**
 * Call Private OCR Microservice using Base64 string directly from CameraView
 * In-memory zero-disk transmission for confidential pharma data
 */
export async function sendBase64ToPaddleOcr(base64Image: string): Promise<OcrScanResult> {
  const ocrBaseUrl = process.env.EXPO_PUBLIC_OCR_API_URL || 'http://192.168.1.47:8080';

  let cleanB64 = base64Image;
  if (cleanB64.includes('base64,')) {
    cleanB64 = cleanB64.split('base64,')[1];
  }

  const response = await fetch(`${ocrBaseUrl}/api/v1/ocr/scan-base64`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ image_base64: cleanB64 }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OCR Server Error (${response.status}): ${errText || 'Failed to scan image'}`);
  }

  const data = await response.json();
  const allLines = data.all_lines || [];
  const detectedText = data.detected_text || allLines.join('\n');

  return {
    medicineName: data.medicine_name || (allLines.length > 0 ? allLines[0] : 'Pharmaceutical Item'),
    sku: data.sku || '',
    poNumber: data.po_number || '',
    medicineConfidence: 0.95,
    batchNumber: data.batch_number || '',
    expiryDate: data.expiry_date || '',
    mfgDate: data.mfg_date || '',
    mrp: data.mrp,
    rawText: detectedText,
    allLines,
    linesCount: data.lines_count || allLines.length,
  };
}

/**
 * Call Private PaddleOCR Microservice with image URI
 */
export async function sendImageToPaddleOcr(imageUri: string): Promise<OcrScanResult> {
  const ocrBaseUrl = process.env.EXPO_PUBLIC_OCR_API_URL || 'http://192.168.1.47:8000';

  const formData = new FormData();
  const filename = imageUri.split('/').pop() || 'medicine.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : 'image/jpeg';

  // @ts-ignore: React Native formData image upload format
  formData.append('file', {
    uri: imageUri,
    name: filename,
    type,
  });

  const response = await fetch(`${ocrBaseUrl}/api/v1/ocr/scan`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OCR Server Error (${response.status}): ${errText || 'Failed to scan image'}`);
  }

  const data = await response.json();
  const allLines = data.all_lines || [];
  const detectedText = data.detected_text || allLines.join('\n');

  return {
    medicineName: data.medicine_name || (allLines.length > 0 ? allLines[0] : 'Pharmaceutical Item'),
    sku: data.sku || '',
    poNumber: data.po_number || '',
    medicineConfidence: 0.95,
    batchNumber: data.batch_number || '',
    expiryDate: data.expiry_date || '',
    mfgDate: data.mfg_date || '',
    mrp: data.mrp,
    rawText: detectedText,
    allLines,
    linesCount: data.lines_count || allLines.length,
  };
}

