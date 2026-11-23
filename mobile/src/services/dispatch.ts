import { safeStorage } from './db';
import { recordMedicineMovement } from './inventoryService';

export interface OutboundOrderItem {
  id: string;
  productId?: string;
  productName: string;
  sku: string;
  requiredQty: number;
  pickedQty: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  suggestedBatch?: string;
}

export interface OutboundOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'DISPATCHED';
  priority: 'NORMAL' | 'URGENT' | 'COLD_CHAIN';
  deliveryDate: string;
  notes?: string;
  items: OutboundOrderItem[];
}

const STORAGE_ORDERS_KEY = '@congiotech_outbound_orders_v2';
const BACKEND_BASE_URL = process.env.EXPO_PUBLIC_OCR_API_URL || 'http://192.168.1.49:8080';

// Fallback seed customer orders matching the 5 Real Master Medicines
export const SEED_OUTBOUND_ORDERS: OutboundOrder[] = [
  {
    id: 'ord-001',
    orderNumber: 'ORD-2026-4412',
    customerName: 'Apollo Hospitals - Central Pharmacy',
    status: 'PENDING',
    priority: 'URGENT',
    deliveryDate: new Date(Date.now() + 86400000).toISOString(),
    notes: 'Urgent ICU replenishment. Verify tamper seal and expiry date (10/2028).',
    items: [
      {
        id: 'ord-item-001',
        productName: 'Calpol 650 Tablets',
        sku: 'MED-CALP-650',
        requiredQty: 20,
        pickedQty: 0,
        status: 'PENDING',
        suggestedBatch: 'BTH-CALP-2601',
      },
    ],
  },
  {
    id: 'ord-002',
    orderNumber: 'ORD-2026-4413',
    customerName: 'Fortis Healthcare - Pediatric Wing',
    status: 'PENDING',
    priority: 'COLD_CHAIN',
    deliveryDate: new Date(Date.now() + 172800000).toISOString(),
    notes: 'Antibiotic order. Box of 10 Tablets. Verify Abbott QR code authenticity.',
    items: [
      {
        id: 'ord-item-002',
        productName: 'Claribid 500 Tablets',
        sku: 'MED-CLAR-500',
        requiredQty: 15,
        pickedQty: 0,
        status: 'PENDING',
        suggestedBatch: 'BTH-CLAR-4091',
      },
    ],
  },
  {
    id: 'ord-003',
    orderNumber: 'ORD-2026-4414',
    customerName: 'Manipal Hospitals - Outpatient Dept',
    status: 'PENDING',
    priority: 'NORMAL',
    deliveryDate: new Date(Date.now() + 259200000).toISOString(),
    notes: '3 Cartons x 6 Tablets. Verify 2D DataMatrix (GTIN: 00368094900188).',
    items: [
      {
        id: 'ord-item-003',
        productName: 'Azithromycin Tablets USP 250mg',
        sku: 'MED-AZIT-250',
        requiredQty: 25,
        pickedQty: 0,
        status: 'PENDING',
        suggestedBatch: '4242407041',
      },
    ],
  },
  {
    id: 'ord-004',
    orderNumber: 'ORD-2026-4415',
    customerName: 'MIOT International - Acute Care',
    status: 'PENDING',
    priority: 'URGENT',
    deliveryDate: new Date(Date.now() + 345600000).toISOString(),
    notes: 'Cardiology emergency replenishment. Amlodipine 5mg. Batch BTH-AMLO-5510.',
    items: [
      {
        id: 'ord-item-004',
        productName: 'Amlokind 5 Tablets',
        sku: 'MED-AMLO-005',
        requiredQty: 30,
        pickedQty: 0,
        status: 'PENDING',
        suggestedBatch: 'BTH-AMLO-5510',
      },
    ],
  },
  {
    id: 'ord-005',
    orderNumber: 'ORD-2026-4416',
    customerName: 'Kauvery Hospital - Emergency Ward',
    status: 'PENDING',
    priority: 'NORMAL',
    deliveryDate: new Date(Date.now() + 432000000).toISOString(),
    notes: 'Bottle of 60 Tablets. NDC: 16110-502-01. Barcode: 316110502014.',
    items: [
      {
        id: 'ord-item-005',
        productName: 'Acticlate 150mg Tablets',
        sku: 'MED-ACTI-150',
        requiredQty: 20,
        pickedQty: 0,
        status: 'PENDING',
        suggestedBatch: 'BTH-ACTI-7812',
      },
    ],
  },
  {
    id: 'ord-006',
    orderNumber: 'ORD-2026-4417',
    customerName: 'SIMS Hospital - Inpatient Pharmacy',
    status: 'PENDING',
    priority: 'URGENT',
    deliveryDate: new Date(Date.now() + 518400000).toISOString(),
    notes: 'Fever management ward batch dispatch. Calpol 650 15-tablet strips.',
    items: [
      {
        id: 'ord-item-006',
        productName: 'Calpol 650 Tablets',
        sku: 'MED-CALP-650',
        requiredQty: 10,
        pickedQty: 0,
        status: 'PENDING',
        suggestedBatch: 'BTH-CALP-2601',
      },
    ],
  },
];

/**
 * Fetch all Outbound Customer Orders (Pick & Pack List)
 */
export async function getOutboundOrders(): Promise<{
  data: OutboundOrder[];
  source: 'database' | 'local_cache' | 'seed';
}> {
  // 1. Try Backend Gateway
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/v1/orders`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });

    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.orders) && json.orders.length > 0) {
        await safeStorage.setItem(STORAGE_ORDERS_KEY, JSON.stringify(json.orders));
        return { data: json.orders, source: 'database' };
      }
    }
  } catch (netErr: any) {
    console.warn('[ORDERS API NOTICE] Backend unavailable, using local cache:', netErr.message);
  } finally {
    clearTimeout(timeoutId);
  }

  // 2. Try Local Cache
  try {
    const cached = await safeStorage.getItem(STORAGE_ORDERS_KEY);
    if (cached) {
      const parsed: OutboundOrder[] = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Ensure all 5 real orders exist
        for (const seed of SEED_OUTBOUND_ORDERS) {
          if (!parsed.some((o) => o.orderNumber === seed.orderNumber)) {
            parsed.push({ ...seed });
          }
        }
        await safeStorage.setItem(STORAGE_ORDERS_KEY, JSON.stringify(parsed));
        return { data: parsed, source: 'local_cache' };
      }
    }
  } catch (cacheErr) {
    console.warn('Error reading orders from local cache:', cacheErr);
  }

  // 3. Fallback to Initial Seeds
  await safeStorage.setItem(STORAGE_ORDERS_KEY, JSON.stringify(SEED_OUTBOUND_ORDERS));
  return { data: SEED_OUTBOUND_ORDERS, source: 'seed' };
}

/**
 * Dispatch an order item:
 * 1. Decrements stock in PostgreSQL database & records OUTBOUND transaction
 * 2. Updates local order status & picked count
 */
export async function dispatchOrderItem(params: {
  orderNumber: string;
  productName: string;
  sku: string;
  batchNumber: string;
  quantity: number;
  userId?: string;
  userName?: string;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { orderNumber, productName, sku, batchNumber, quantity, userId, userName, notes } = params;

  // 1. Commit OUTBOUND stock deduction
  const result = await recordMedicineMovement({
    medicineName: productName,
    sku,
    batchNumber,
    expiryDate: '',
    quantity,
    type: 'OUTBOUND',
    userId,
    userName,
    poNumber: orderNumber,
    notes: notes || `Order ${orderNumber} fulfilled: -${quantity} units of ${productName} (Batch: ${batchNumber})`,
  });

  if (!result.success) {
    return { success: false, error: result.error || 'Failed to dispatch stock from inventory' };
  }

  // 2. Update local order status in storage cache
  try {
    const cached = await safeStorage.getItem(STORAGE_ORDERS_KEY);
    let orders: OutboundOrder[] = cached ? JSON.parse(cached) : [...SEED_OUTBOUND_ORDERS];

    const targetOrder = orders.find(
      (o) => o.orderNumber.trim().toUpperCase() === orderNumber.trim().toUpperCase()
    );

    if (targetOrder) {
      const item =
        targetOrder.items.find(
          (i) =>
            i.sku.toUpperCase() === sku.toUpperCase() ||
            i.productName.toLowerCase() === productName.toLowerCase()
        ) || targetOrder.items[0];

      if (item) {
        item.pickedQty = (item.pickedQty || 0) + quantity;
        item.status = item.pickedQty >= item.requiredQty ? 'COMPLETED' : 'IN_PROGRESS';
      }

      const allCompleted = targetOrder.items.every((i) => i.status === 'COMPLETED');
      targetOrder.status = allCompleted ? 'DISPATCHED' : 'IN_PROGRESS';

      await safeStorage.setItem(STORAGE_ORDERS_KEY, JSON.stringify(orders));
    }
  } catch (updateErr) {
    console.warn('Error updating local order state:', updateErr);
  }

  return { success: true };
}
