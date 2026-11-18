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

const STORAGE_ORDERS_KEY = '@congiotech_outbound_orders_v1';
const BACKEND_BASE_URL = process.env.EXPO_PUBLIC_OCR_API_URL || 'http://192.168.1.47:8080';

// Fallback seed customer orders if backend is temporarily unreachable
export const SEED_OUTBOUND_ORDERS: OutboundOrder[] = [
  {
    id: 'ord-001',
    orderNumber: 'ORD-2026-4412',
    customerName: 'Apollo Hospitals - Central Pharmacy',
    status: 'PENDING',
    priority: 'URGENT',
    deliveryDate: new Date(Date.now() + 86400000).toISOString(),
    notes: 'Urgent ICU replenishment. Verify tamper seal and expiry.',
    items: [
      {
        id: 'ord-item-001',
        productName: 'Paracetamol 500mg Tablets',
        sku: 'MED-PARA-500',
        requiredQty: 20,
        pickedQty: 0,
        status: 'PENDING',
        suggestedBatch: 'BTH-PAR-26045',
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
    notes: 'Pediatric suspension order. Maintain ambient temp below 25°C.',
    items: [
      {
        id: 'ord-item-002',
        productName: 'Amoxicillin 250mg Suspension',
        sku: 'MED-AMOX-250',
        requiredQty: 15,
        pickedQty: 0,
        status: 'PENDING',
        suggestedBatch: 'AMX-9082',
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
    notes: 'Inpatient fever management stock replenishment.',
    items: [
      {
        id: 'ord-item-003',
        productName: 'Dolo 650 Paracetamol Tablets',
        sku: 'MED-DOLO-650',
        requiredQty: 50,
        pickedQty: 0,
        status: 'PENDING',
        suggestedBatch: 'BTH-DOLO-8821',
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
    notes: 'Antidiarrheal emergency ward replenishment.',
    items: [
      {
        id: 'ord-item-004',
        productName: 'Loperamide 2mg Capsules',
        sku: 'MED-LOPE-002',
        requiredQty: 30,
        pickedQty: 0,
        status: 'PENDING',
        suggestedBatch: 'BTH-LOP-9901',
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
    notes: 'Emergency unit bulk order.',
    items: [
      {
        id: 'ord-item-005',
        productName: 'Dolo 650 Paracetamol Tablets',
        sku: 'MED-DOLO-650',
        requiredQty: 25,
        pickedQty: 0,
        status: 'PENDING',
        suggestedBatch: 'BTH-DOLO-8821',
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
    notes: 'Inpatient general ward batch delivery.',
    items: [
      {
        id: 'ord-item-006',
        productName: 'Paracetamol 500mg Tablets',
        sku: 'MED-PARA-500',
        requiredQty: 40,
        pickedQty: 0,
        status: 'PENDING',
        suggestedBatch: 'BATCH123',
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
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
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
