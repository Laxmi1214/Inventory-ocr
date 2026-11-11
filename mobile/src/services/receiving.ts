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

/**
 * Fetch active Inbound Shipments (PO list) with expected medicines from Supabase
 */
export async function getInboundShipments(): Promise<{
  data: InboundShipmentWithItems[];
  source: 'database' | 'fallback';
  error?: string;
}> {
  if (!isSupabaseConfigured) {
    return { data: FALLBACK_SHIPMENTS, source: 'fallback' };
  }

  try {
    const { data, error } = await supabase
      .from('inbound_shipments')
      .select('*, items:inbound_shipment_items(*, product:products(*))')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase fetch inbound_shipments error:', error.message);
      return { data: FALLBACK_SHIPMENTS, source: 'fallback', error: error.message };
    }

    if (!data || data.length === 0) {
      return { data: FALLBACK_SHIPMENTS, source: 'fallback' };
    }

    // Map database snake_case to typed camelCase
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
  } catch (err: any) {
    console.warn('Exception during getInboundShipments:', err);
    return { data: FALLBACK_SHIPMENTS, source: 'fallback', error: err?.message };
  }
}

