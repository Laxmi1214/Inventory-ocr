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

// Fallback seed shipment matching the 5 Real Master Medicines
const FALLBACK_SHIPMENTS: InboundShipmentWithItems[] = [
  {
    id: 'po-ship-001',
    poNumber: 'PO-2026-0891',
    supplierName: 'GlaxoSmithKline Pharmaceuticals Ltd (GSK)',
    status: 'PENDING',
    expectedDeliveryDate: new Date(Date.now() + 86400000).toISOString(),
    notes: 'Verify tamper-evident seal and blister strip count (15 tablets per strip).',
    items: [
      {
        id: 'item-calp-001',
        shipmentId: 'po-ship-001',
        productId: 'prod-calp-650',
        expectedBatch: 'BTH-CALP-2601',
        expectedQty: 50,
        receivedQty: 0,
        status: 'PENDING',
        product: {
          id: 'prod-calp-650',
          sku: 'MED-CALP-650',
          name: 'Calpol 650 Tablets',
          barcode: '62000000089737',
          packSize: 'Strip of 15 Tablets',
          unit: 'STRIP',
        },
      },
    ],
  },
  {
    id: 'po-ship-002',
    poNumber: 'PO-2026-0892',
    supplierName: 'Abbott Healthcare Pvt Ltd',
    status: 'PENDING',
    expectedDeliveryDate: new Date(Date.now() + 172800000).toISOString(),
    notes: 'Store below 30°C. Protect from moisture. Scan QR code for batch authentication.',
    items: [
      {
        id: 'item-clar-002',
        shipmentId: 'po-ship-002',
        productId: 'prod-clar-500',
        expectedBatch: 'BTH-CLAR-4091',
        expectedQty: 50,
        receivedQty: 0,
        status: 'PENDING',
        product: {
          id: 'prod-clar-500',
          sku: 'MED-CLAR-500',
          name: 'Claribid 500 Tablets',
          barcode: '8901117245102',
          packSize: 'Box of 10 Tablets',
          unit: 'BOX',
        },
      },
    ],
  },
  {
    id: 'po-ship-003',
    poNumber: 'PO-2026-0893',
    supplierName: 'PrecisionDose Inc / CSPC',
    status: 'PENDING',
    expectedDeliveryDate: new Date(Date.now() + 259200000).toISOString(),
    notes: '3 Cartons x 6 Tablets. 2D DataMatrix GTIN: 00368094900188. Lot: 4242407041.',
    items: [
      {
        id: 'item-azit-003',
        shipmentId: 'po-ship-003',
        productId: 'prod-azit-250',
        expectedBatch: '4242407041',
        expectedQty: 50,
        receivedQty: 0,
        status: 'PENDING',
        product: {
          id: 'prod-azit-250',
          sku: 'MED-AZIT-250',
          name: 'Azithromycin Tablets USP 250mg',
          barcode: '00368094900188',
          packSize: 'Box of 18 Tablets (3x6)',
          unit: 'BOX',
        },
      },
    ],
  },
  {
    id: 'po-ship-004',
    poNumber: 'PO-2026-0894',
    supplierName: 'Mankind Pharma Ltd',
    status: 'PENDING',
    expectedDeliveryDate: new Date(Date.now() + 345600000).toISOString(),
    notes: 'Amlodipine Besilate IP 5mg. GTIN/Barcode: 8904103311105. Batch: BTH-AMLO-5510.',
    items: [
      {
        id: 'item-amlo-004',
        shipmentId: 'po-ship-004',
        productId: 'prod-amlo-005',
        expectedBatch: 'BTH-AMLO-5510',
        expectedQty: 50,
        receivedQty: 0,
        status: 'PENDING',
        product: {
          id: 'prod-amlo-005',
          sku: 'MED-AMLO-005',
          name: 'Amlokind 5 Tablets',
          barcode: '8904103311105',
          packSize: 'Strip of 10 Tablets',
          unit: 'STRIP',
        },
      },
    ],
  },
  {
    id: 'po-ship-005',
    poNumber: 'PO-2026-0895',
    supplierName: 'Aqua Pharmaceuticals / Catalent',
    status: 'PENDING',
    expectedDeliveryDate: new Date(Date.now() + 432000000).toISOString(),
    notes: 'Doxycycline Hyclate USP 150mg. NDC: 16110-502-01. Barcode: 316110502014.',
    items: [
      {
        id: 'item-acti-005',
        shipmentId: 'po-ship-005',
        productId: 'prod-acti-150',
        expectedBatch: 'BTH-ACTI-7812',
        expectedQty: 50,
        receivedQty: 0,
        status: 'PENDING',
        product: {
          id: 'prod-acti-150',
          sku: 'MED-ACTI-150',
          name: 'Acticlate 150mg Tablets',
          barcode: '316110502014',
          packSize: 'Bottle of 60 Tablets',
          unit: 'BOTTLE',
        },
      },
    ],
  },
  {
    id: 'po-ship-006',
    poNumber: 'PO-2026-0896',
    supplierName: 'Chartwell Pharmaceuticals LLC',
    status: 'PENDING',
    expectedDeliveryDate: new Date(Date.now() + 518400000).toISOString(),
    notes: 'Doxycycline Hyclate Capsules USP 50mg. NDC: 62135-984-05. Barcode: 62135984052.',
    items: [
      {
        id: 'item-doxy-006',
        shipmentId: 'po-ship-006',
        productId: 'prod-doxy-050',
        expectedBatch: 'BTH-DOXY-5098',
        expectedQty: 50,
        receivedQty: 0,
        status: 'PENDING',
        product: {
          id: 'prod-doxy-050',
          sku: 'MED-DOXY-050',
          name: 'Doxycycline Hyclate Capsules, USP 50 mg',
          barcode: '62135984052',
          packSize: 'Bottle of 500 Capsules',
          unit: 'BOTTLE',
        },
      },
    ],
  },
];

const BACKEND_BASE_URL = process.env.EXPO_PUBLIC_OCR_API_URL || 'http://192.168.1.45:8080';

/**
 * Flag a PO or Item as DISCREPANCY in PostgreSQL Database
 */
export async function flagShipmentDiscrepancy(params: {
  poNumber: string;
  itemId?: string;
  productId?: string;
  productName?: string;
  sku?: string;
  batchNumber?: string;
  expiryDate?: string;
  expectedQty?: number;
  receivedQty?: number;
  reasons: string[];
  notes?: string;
  userId?: string;
  locationCode?: string;
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

