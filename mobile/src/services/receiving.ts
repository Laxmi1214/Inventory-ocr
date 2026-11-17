import { supabase, isSupabaseConfigured } from './supabase';

export interface ExpectedProductItem {
  id: string;
  shipmentId: string;
  productId: string;
  expectedBatch?: string;
  expectedQty: number;
  receivedQty: number;
  status: string;
  product?: {
    id: string;
    sku: string;
    name: string;
    barcode?: string;
    packSize?: string;
    unit: string;
  };
}

export interface InboundShipmentWithItems {
  id: string;
  poNumber: string;
  supplierName: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DISCREPANCY';
  expectedDeliveryDate?: string;
  notes?: string;
  items: ExpectedProductItem[];
}

// Fallback seed shipment if network/database is temporarily unreachable
const FALLBACK_SHIPMENTS: InboundShipmentWithItems[] = [
  {
    id: 'c9ffc537-3dfe-4b70-bfa6-7445d38c8f12',
    poNumber: 'PO-2026-0891',
    supplierName: 'Novartis Healthcare Pvt Ltd',
    status: 'PENDING',
    expectedDeliveryDate: new Date(Date.now() + 86400000).toISOString(),
    notes: 'Standard delivery at Dock Bay 3. Handle with care.',
    items: [
      {
        id: '59c403b8-df88-44ea-ab3c-daa1131c9b73',
        shipmentId: 'c9ffc537-3dfe-4b70-bfa6-7445d38c8f12',
        productId: 'bd36431d-33ac-4fde-9fac-267974bb0f45',
        expectedBatch: 'BATCH123',
        expectedQty: 100,
        receivedQty: 0,
        status: 'PENDING',
        product: {
          id: 'bd36431d-33ac-4fde-9fac-267974bb0f45',
          sku: 'MED-PARA-500',
          name: 'Paracetamol 500mg Tablets',
          barcode: '08901234567890',
          packSize: 'Box of 100 Tablets',
          unit: 'BOX',
        },
      },
    ],
  },
  {
    id: 'f1a92e10-4491-4e8c-8512-bce490123891',
    poNumber: 'PO-2026-0914',
    supplierName: 'Pfizer Pharmaceuticals Ltd',
    status: 'PENDING',
    expectedDeliveryDate: new Date(Date.now() + 172800000).toISOString(),
    notes: 'Temperature sensitive: 2°C - 8°C cold chain required upon receipt.',
    items: [
      {
        id: 'item-amox-002',
        shipmentId: 'f1a92e10-4491-4e8c-8512-bce490123891',
        productId: 'prod-amox-002',
        expectedBatch: 'AMX-9082',
        expectedQty: 50,
        receivedQty: 0,
        status: 'PENDING',
        product: {
          id: 'prod-amox-002',
          sku: 'MED-AMOX-250',
          name: 'Amoxicillin 250mg Suspension',
          barcode: '08909876543210',
          packSize: 'Bottle of 100ml',
          unit: 'BOTTLE',
        },
      },
    ],
  },
];

const BACKEND_BASE_URL = process.env.EXPO_PUBLIC_OCR_API_URL || 'http://192.168.1.49:8080';

/**
 * Flag a PO or Item as DISCREPANCY in PostgreSQL Database
 */
export async function flagShipmentDiscrepancy(params: {
  poNumber: string;
  itemId?: string;
  reasons: string[];
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/v1/receiving/flag-discrepancy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    if (res.ok) {
      const json = await res.json();
      return { success: json.success };
    }
    return { success: false, error: `Failed to flag discrepancy: status ${res.status}` };
  } catch (err: any) {
    console.warn('[RECEIVING] Discrepancy flagging notice:', err.message);
    return { success: false, error: err.message };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch active Inbound Shipments (PO list) with expected medicines from PostgreSQL Database
 */
export async function getInboundShipments(): Promise<{
  data: InboundShipmentWithItems[];
  source: 'database' | 'fallback';
  error?: string;
}> {
  // 1. Primary Source: Node Gateway connected directly to PostgreSQL DB
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/v1/receiving/shipments`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });

    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.shipments) && json.shipments.length > 0) {
        console.log(`[RECEIVING] Loaded ${json.shipments.length} real PO shipments from PostgreSQL DB`);
        return { data: json.shipments, source: 'database' };
      }
    }
  } catch (apiErr: any) {
    console.warn('[RECEIVING] Node DB gateway fetch notice:', apiErr.message);
  } finally {
    clearTimeout(timeoutId);
  }

  // 2. Secondary Source: Direct Supabase Client if configured
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('inbound_shipments')
        .select('*, items:inbound_shipment_items(*, product:products(*))')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        const mapped: InboundShipmentWithItems[] = data.map((s: any) => ({
          id: s.id,
          poNumber: s.po_number,
          supplierName: s.supplier_name,
          status: s.status || 'PENDING',
          expectedDeliveryDate: s.expected_delivery_date,
          notes: s.notes,
          items: (s.items || []).map((i: any) => ({
            id: i.id,
            shipmentId: i.shipment_id,
            productId: i.product_id,
            expectedBatch: i.expected_batch,
            expectedQty: i.expected_qty,
            receivedQty: i.received_qty || 0,
            status: i.status || 'PENDING',
            product: i.product
              ? {
                  id: i.product.id,
                  sku: i.product.sku,
                  name: i.product.name,
                  barcode: i.product.barcode,
                  packSize: i.product.pack_size,
                  unit: i.product.unit,
                }
              : undefined,
          })),
        }));
        return { data: mapped, source: 'database' };
      }
    } catch (supErr: any) {
      console.warn('Supabase direct query notice:', supErr.message);
    }
  }

  // 3. Fallback only if offline / unreachable
  return { data: FALLBACK_SHIPMENTS, source: 'fallback' };
}

