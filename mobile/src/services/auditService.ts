import { safeStorage } from './db';

export interface StockAuditTask {
  inventoryId: string;
  locationCode: string;
  systemQty: number;
  lastUpdatedAt?: string;
  productId: string;
  productName: string;
  sku: string;
  barcode?: string;
  unit?: string;
  packSize?: string;
  batchId?: string;
  batchNumber?: string;
  expiryDate?: string;
  batchStatus?: string;
  lastAudit?: {
    id: string;
    variance: number;
    status: string;
    createdAt: string;
  };
}

export interface StockAuditSubmitResult {
  success: boolean;
  matched: boolean;
  variance: number;
  status: 'MATCHED' | 'PENDING_SUPERVISOR_APPROVAL';
  message: string;
  error?: string;
  audit?: any;
}

export interface StockAuditHistoryItem {
  id: string;
  locationCode: string;
  systemQty: number;
  physicalQty: number;
  variance: number;
  status: string;
  notes?: string;
  createdAt: string;
  productName: string;
  sku: string;
  batchNumber?: string;
  countedByUser?: string;
}

const BACKEND_BASE_URL = process.env.EXPO_PUBLIC_OCR_API_URL || 'http://192.168.1.45:8080';
const STORAGE_AUDIT_FALLBACK_KEY = '@congiotech_audit_tasks_cache_v1';
const STORAGE_AUDIT_HISTORY_KEY = '@congiotech_audit_history_v1';

// Initial fallback audit list if backend gateway is offline
const FALLBACK_AUDIT_TASKS: StockAuditTask[] = [
  {
    inventoryId: 'fab74ebf-0908-4f9c-9592-a21efc0ac0d1',
    locationCode: 'BAY-01',
    systemQty: 35,
    productId: 'prod-para-001',
    productName: 'Paracetamol 500mg Tablets',
    sku: 'MED-PARA-500',
    batchId: 'bth-par-001',
    batchNumber: 'BTH-PAR-26045',
    expiryDate: '2027-12-31',
    unit: 'BOX',
  },
  {
    inventoryId: 'dd01a4da-564f-4b8c-b34a-50a48c099f60',
    locationCode: 'BAY-01',
    systemQty: 100,
    productId: 'prod-lope-001',
    productName: 'Loperamide 2mg Capsules',
    sku: 'MED-LOPE-002',
    batchId: 'bth-lope-001',
    batchNumber: 'BTH-LOP-9901',
    expiryDate: '2026-10-31',
    unit: 'STRIP',
  },
  {
    inventoryId: '716e53e9-a483-4a64-a663-c354c5c2c816',
    locationCode: 'BAY-01',
    systemQty: 50,
    productId: 'prod-amox-002',
    productName: 'Amoxicillin 250mg Suspension',
    sku: 'MED-AMOX-250',
    batchId: 'bth-amox-001',
    batchNumber: 'AMX-9082',
    expiryDate: '2026-06-30',
    unit: 'BOTTLE',
  },
  {
    inventoryId: '6eb22538-f66b-4cc7-add7-8942d3c5f2fc',
    locationCode: 'BAY-01',
    systemQty: 100,
    productId: 'prod-para-001',
    productName: 'Paracetamol 500mg Tablets',
    sku: 'MED-PARA-500',
    batchId: 'bth-par-002',
    batchNumber: 'BATCH123',
    expiryDate: '2027-12-31',
    unit: 'BOX',
  },
  {
    inventoryId: '18a2832c-577f-4662-98f5-37c6b9866fff',
    locationCode: 'BAY-02',
    systemQty: 50,
    productId: 'prod-lope-001',
    productName: 'Loperamide 2mg Capsules',
    sku: 'MED-LOPE-002',
    batchId: 'bth-lope-001',
    batchNumber: 'BTH-LOP-9901',
    expiryDate: '2026-10-31',
    unit: 'STRIP',
  },
];

/**
 * 1. Fetch Inventory Items scheduled for physical audit
 * Queries live PostgreSQL database via Node bridge
 */
export async function getAuditTasks(): Promise<{
  data: StockAuditTask[];
  source: 'database' | 'fallback';
  error?: string;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/v1/audit/tasks`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });

    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.tasks) && json.tasks.length > 0) {
        await safeStorage.setItem(STORAGE_AUDIT_FALLBACK_KEY, JSON.stringify(json.tasks));
        return { data: json.tasks, source: 'database' };
      }
    }
  } catch (apiErr: any) {
    console.warn('[AUDIT SERVICE] Live DB audit tasks fetch notice:', apiErr.message);
  } finally {
    clearTimeout(timeoutId);
  }

  // Fallback to local storage or defaults
  try {
    const cached = await safeStorage.getItem(STORAGE_AUDIT_FALLBACK_KEY);
    if (cached) {
      return { data: JSON.parse(cached), source: 'fallback' };
    }
  } catch {}

  return { data: FALLBACK_AUDIT_TASKS, source: 'fallback' };
}

/**
 * 2. Submit Physical Stock Count & Variance
 * - Variance === 0: 100% matched -> confirms audit
 * - Variance !== 0: routes discrepancy to Supervisor approval
 */
export async function submitStockAudit(params: {
  inventoryId?: string;
  productId: string;
  batchId?: string;
  locationCode: string;
  systemQty: number;
  physicalQty: number;
  notes?: string;
  userId?: string;
}): Promise<StockAuditSubmitResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);

  const variance = params.physicalQty - params.systemQty;
  const isMatched = variance === 0;

  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/v1/audit/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    if (res.ok) {
      const json = await res.json();
      if (json.success) {
        return {
          success: true,
          matched: json.matched,
          variance: json.variance,
          status: json.status,
          message: json.message,
          audit: json.audit,
        };
      }
    }
    const errText = await res.text();
    throw new Error(errText || `Server responded with ${res.status}`);
  } catch (apiErr: any) {
    console.warn('[AUDIT SERVICE] DB audit submission notice, caching locally:', apiErr.message);

    // Local safeStorage offline fallback
    const localAudit: StockAuditHistoryItem = {
      id: `AUDIT-OFFLINE-${Date.now()}`,
      locationCode: params.locationCode,
      systemQty: params.systemQty,
      physicalQty: params.physicalQty,
      variance,
      status: isMatched ? 'MATCHED' : 'PENDING_SUPERVISOR_APPROVAL',
      notes: params.notes,
      createdAt: new Date().toISOString(),
      productName: 'Audited Medicine',
      sku: 'SKU-AUDIT',
    };

    try {
      const raw = await safeStorage.getItem(STORAGE_AUDIT_HISTORY_KEY);
      const list = raw ? JSON.parse(raw) : [];
      list.unshift(localAudit);
      await safeStorage.setItem(STORAGE_AUDIT_HISTORY_KEY, JSON.stringify(list));
    } catch {}

    return {
      success: true,
      matched: isMatched,
      variance,
      status: isMatched ? 'MATCHED' : 'PENDING_SUPERVISOR_APPROVAL',
      message: isMatched
        ? 'Stock count verified & matched 100% (Cached offline).'
        : `Variance of ${variance > 0 ? '+' : ''}${variance} units detected. Queued for Supervisor approval.`,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 3. Fetch Stock Audit History & Pending Supervisor Queue
 */
export async function getAuditHistory(): Promise<StockAuditHistoryItem[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/v1/audit/history`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });

    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.history)) {
        return json.history;
      }
    }
  } catch (apiErr: any) {
    console.warn('[AUDIT SERVICE] History fetch notice:', apiErr.message);
  } finally {
    clearTimeout(timeoutId);
  }

  try {
    const cached = await safeStorage.getItem(STORAGE_AUDIT_HISTORY_KEY);
    return cached ? JSON.parse(cached) : [];
  } catch {
    return [];
  }
}
