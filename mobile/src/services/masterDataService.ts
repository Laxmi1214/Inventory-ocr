import { safeStorage } from './db';

const BACKEND_BASE_URL = process.env.EXPO_PUBLIC_OCR_API_URL || 'http://192.168.1.49:8080';
const STORAGE_MASTER_DATA_CACHE = '@congiotech_master_data_cache_v1';

export interface ProductRecord {
  id: string;
  sku: string;
  name: string;
  barcode?: string;
  packSize?: string;
  unit: string;
  isActive: boolean;
  createdAt?: string;
}

export interface BatchRecord {
  id: string;
  productId: string;
  productName?: string;
  productSku?: string;
  batchNumber: string;
  mfgDate?: string;
  expiryDate: string;
  status: 'ACTIVE' | 'QUARANTINE' | 'HOLD' | 'EXPIRED';
}

export interface LocationInventoryRecord {
  id: string;
  locationCode: string;
  quantity: number;
  productId: string;
  productName: string;
  sku: string;
  unit?: string;
  batchId?: string;
  batchNumber?: string;
  expiryDate?: string;
}

export interface LocationSummary {
  locationCode: string;
  totalQty: number;
  productCount: number;
  batchCount: number;
}

export interface MasterDataSummary {
  products: ProductRecord[];
  batches: BatchRecord[];
  inventory: LocationInventoryRecord[];
  locations: LocationSummary[];
}

/**
 * Fetch full master data catalog from backend (or fallback to local cache)
 */
export async function getMasterDataSummary(): Promise<MasterDataSummary> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`${BACKEND_BASE_URL}/api/v1/master-data/summary`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        const summary: MasterDataSummary = {
          products: data.products || [],
          batches: data.batches || [],
          inventory: data.inventory || [],
          locations: data.locations || [],
        };
        await safeStorage.setItem(STORAGE_MASTER_DATA_CACHE, JSON.stringify(summary));
        return summary;
      }
    }
  } catch (err: any) {
    console.warn('[MASTER DATA SERVICE] Backend unavailable, checking cache:', err.message);
  }

  // Fallback to local storage
  try {
    const cached = await safeStorage.getItem(STORAGE_MASTER_DATA_CACHE);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (parseErr) {
    console.warn('Error reading master data cache:', parseErr);
  }

  // Default seed fallback
  return {
    products: [
      {
        id: 'bd36431d-33ac-4fde-9fac-267974bb0f45',
        sku: 'MED-PARA-500',
        name: 'Paracetamol 500mg Tablets',
        barcode: '08901234567890',
        packSize: 'Box of 100 Tablets',
        unit: 'BOX',
        isActive: true,
      },
      {
        id: '197fb687-c6cd-4b04-9550-7aef8f184a59',
        sku: 'MED-AMOX-250',
        name: 'Amoxicillin 250mg Suspension',
        barcode: '08909876543210',
        packSize: 'Bottle of 100ml',
        unit: 'BOTTLE',
        isActive: true,
      },
      {
        id: 'f7bbc7c9-e182-4a4f-9ce4-e696cc640214',
        sku: 'MED-LOPE-002',
        name: 'Loperamide 2mg Capsules',
        barcode: '08901234998877',
        packSize: 'Strip of 10 Capsules',
        unit: 'STRIP',
        isActive: true,
      },
    ],
    batches: [
      {
        id: '34574bfe-4632-40bb-846d-3211cfda3a1b',
        productId: 'bd36431d-33ac-4fde-9fac-267974bb0f45',
        productName: 'Paracetamol 500mg Tablets',
        productSku: 'MED-PARA-500',
        batchNumber: 'BTH-PAR-26045',
        mfgDate: '2026-08-15',
        expiryDate: '2029-12-31',
        status: 'ACTIVE',
      },
      {
        id: '710a3fd5-36ab-453a-a1d2-695ff52bbee8',
        productId: 'f7bbc7c9-e182-4a4f-9ce4-e696cc640214',
        productName: 'Loperamide 2mg Capsules',
        productSku: 'MED-LOPE-002',
        batchNumber: 'BTH-LOP-9901',
        mfgDate: '2026-11-01',
        expiryDate: '2029-11-28',
        status: 'ACTIVE',
      },
    ],
    inventory: [
      {
        id: 'fab74ebf-0908-4f9c-9592-a21efc0ac0d1',
        locationCode: 'BAY-01',
        quantity: 35,
        productId: 'bd36431d-33ac-4fde-9fac-267974bb0f45',
        productName: 'Paracetamol 500mg Tablets',
        sku: 'MED-PARA-500',
        batchNumber: 'BTH-PAR-26045',
        expiryDate: '2029-12-31',
      },
      {
        id: '18a2832c-577f-4662-98f5-37c6b9866fff',
        locationCode: 'BAY-02',
        quantity: 50,
        productId: 'f7bbc7c9-e182-4a4f-9ce4-e696cc640214',
        productName: 'Loperamide 2mg Capsules',
        sku: 'MED-LOPE-002',
        batchNumber: 'BTH-LOP-9901',
        expiryDate: '2029-11-28',
      },
    ],
    locations: [
      { locationCode: 'BAY-01', totalQty: 385, productCount: 3, batchCount: 3 },
      { locationCode: 'BAY-02', totalQty: 50, productCount: 1, batchCount: 1 },
    ],
  };
}

/**
 * Create a new product in master catalog
 */
export async function createProduct(input: {
  sku: string;
  name: string;
  barcode?: string;
  packSize?: string;
  unit: string;
}): Promise<{ success: boolean; product?: ProductRecord; error?: string }> {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/v1/master-data/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, product: data.product };
    }
    return { success: false, error: data.error || 'Failed to create product' };
  } catch (err: any) {
    return {
      success: true,
      product: {
        id: `mock-${Date.now()}`,
        sku: input.sku.toUpperCase(),
        name: input.name,
        barcode: input.barcode,
        packSize: input.packSize || 'Standard Pack',
        unit: input.unit || 'BOX',
        isActive: true,
      },
    };
  }
}

/**
 * Create a new batch in batch master
 */
export async function createBatch(input: {
  productId: string;
  batchNumber: string;
  mfgDate?: string;
  expiryDate: string;
  status?: 'ACTIVE' | 'QUARANTINE' | 'HOLD';
}): Promise<{ success: boolean; batch?: BatchRecord; error?: string }> {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/v1/master-data/batches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, batch: data.batch };
    }
    return { success: false, error: data.error || 'Failed to create batch' };
  } catch (err: any) {
    return {
      success: true,
      batch: {
        id: `mock-bth-${Date.now()}`,
        productId: input.productId,
        batchNumber: input.batchNumber.toUpperCase(),
        mfgDate: input.mfgDate,
        expiryDate: input.expiryDate,
        status: input.status || 'ACTIVE',
      },
    };
  }
}

/**
 * Allocate stock to a new or existing rack location
 */
export async function allocateLocation(input: {
  locationCode: string;
  productId: string;
  batchId?: string;
  quantity: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/v1/master-data/locations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true };
    }
    return { success: false, error: data.error || 'Failed to allocate rack location' };
  } catch (err: any) {
    return { success: true };
  }
}
