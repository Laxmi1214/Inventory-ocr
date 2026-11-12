import { pgTable, text, timestamp, varchar, integer, boolean, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Roles table - Predefined roles in Congiotech Inventory system
 * As specified in BRD Section 3 (User roles and end-to-end process)
 */
export const roles = pgTable('roles', {
  id: varchar('id', { length: 50 }).primaryKey(), // 'OPERATOR' | 'SUPERVISOR' | 'INVENTORY_ADMIN' | 'SYSTEM_ADMIN'
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Users table
 * Stores user profile, credentials (pw), and assigned role
 */
export const users = pgTable('users', {
  id: varchar('id', { length: 100 }).primaryKey(), // Unique User ID
  username: varchar('username', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: text('password').notNull(),
  role: varchar('role', { length: 50 })
    .notNull()
    .default('OPERATOR')
    .references(() => roles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * 1. Products Master Table
 * Contains pharmaceutical product details, SKU, packaging unit, and standard barcode/GTIN
 */
export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  sku: varchar('sku', { length: 100 }).notNull().unique(), // e.g. 'MED-PARA-500'
  name: varchar('name', { length: 255 }).notNull(), // e.g. 'Paracetamol 500mg Tablets'
  barcode: varchar('barcode', { length: 100 }), // Barcode / GTIN code
  packSize: varchar('pack_size', { length: 100 }), // e.g. 'Box of 100 Tablets'
  unit: varchar('unit', { length: 50 }).notNull().default('BOX'), // e.g. 'BOX', 'STRIP', 'BOTTLE'
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * 2. Batches / Lots Table
 * Tracks unique pharmaceutical manufacturing batch numbers, mfg date, and expiry date
 */
export const batches = pgTable('batches', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  batchNumber: varchar('batch_number', { length: 100 }).notNull(), // e.g. 'BATCH123'
  mfgDate: timestamp('mfg_date', { withTimezone: true }),
  expiryDate: timestamp('expiry_date', { withTimezone: true }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('ACTIVE'), // 'ACTIVE' | 'QUARANTINED' | 'EXPIRED' | 'REJECTED'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * 3. Inbound Shipments Table (Purchase Orders / ASN)
 * Tracks expected supplier deliveries arriving at the warehouse dock
 */
export const inboundShipments = pgTable('inbound_shipments', {
  id: uuid('id').defaultRandom().primaryKey(),
  poNumber: varchar('po_number', { length: 100 }).notNull().unique(), // e.g. 'PO-2026-0891'
  supplierName: varchar('supplier_name', { length: 255 }).notNull(), // e.g. 'Novartis Healthcare Pvt Ltd'
  status: varchar('status', { length: 50 }).notNull().default('PENDING'), // 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DISCREPANCY'
  expectedDeliveryDate: timestamp('expected_delivery_date', { withTimezone: true }),
  receivedBy: varchar('received_by', { length: 100 }).references(() => users.id),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * 4. Inbound Shipment Items Table
 * Expected product line items, quantities, and verification progress per shipment
 */
export const inboundShipmentItems = pgTable('inbound_shipment_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  shipmentId: uuid('shipment_id')
    .notNull()
    .references(() => inboundShipments.id, { onDelete: 'cascade' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  expectedBatch: varchar('expected_batch', { length: 100 }),
  expectedQty: integer('expected_qty').notNull(),
  receivedQty: integer('received_qty').notNull().default(0),
  status: varchar('status', { length: 50 }).notNull().default('PENDING'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * 5. Inventory Table (Physical On-Hand Stock)
 * Maintains current verified stock balances by product, batch, and warehouse location
 */
export const inventory = pgTable('inventory', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  batchId: uuid('batch_id')
    .notNull()
    .references(() => batches.id, { onDelete: 'cascade' }),
  locationCode: varchar('location_code', { length: 100 }).notNull().default('RECEIVING_DOCK'),
  quantity: integer('quantity').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * 6. Inventory Transactions Ledger
 * Tracks physical stock movements: INBOUND (Income), OUTBOUND (Go / Dispensed), ADJUSTMENT
 */
export const inventoryTransactions = pgTable('inventory_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  batchId: uuid('batch_id')
    .references(() => batches.id, { onDelete: 'set null' }),
  type: varchar('type', { length: 50 }).notNull(), // 'INBOUND' | 'OUTBOUND' | 'ADJUSTMENT'
  quantity: integer('quantity').notNull(),
  notes: text('notes'),
  createdBy: varchar('created_by', { length: 100 }).references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Relationships
export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  role: one(roles, {
    fields: [users.role],
    references: [roles.id],
  }),
  receivedShipments: many(inboundShipments),
  transactions: many(inventoryTransactions),
}));

export const productsRelations = relations(products, ({ many }) => ({
  batches: many(batches),
  shipmentItems: many(inboundShipmentItems),
  inventoryRecords: many(inventory),
  transactions: many(inventoryTransactions),
}));

export const batchesRelations = relations(batches, ({ one, many }) => ({
  product: one(products, {
    fields: [batches.productId],
    references: [products.id],
  }),
  inventoryRecords: many(inventory),
  transactions: many(inventoryTransactions),
}));

export const inboundShipmentsRelations = relations(inboundShipments, ({ one, many }) => ({
  receivedByUser: one(users, {
    fields: [inboundShipments.receivedBy],
    references: [users.id],
  }),
  items: many(inboundShipmentItems),
}));

export const inboundShipmentItemsRelations = relations(inboundShipmentItems, ({ one }) => ({
  shipment: one(inboundShipments, {
    fields: [inboundShipmentItems.shipmentId],
    references: [inboundShipments.id],
  }),
  product: one(products, {
    fields: [inboundShipmentItems.productId],
    references: [products.id],
  }),
}));

export const inventoryRelations = relations(inventory, ({ one }) => ({
  product: one(products, {
    fields: [inventory.productId],
    references: [products.id],
  }),
  batch: one(batches, {
    fields: [inventory.batchId],
    references: [batches.id],
  }),
}));

export const inventoryTransactionsRelations = relations(inventoryTransactions, ({ one }) => ({
  product: one(products, {
    fields: [inventoryTransactions.productId],
    references: [products.id],
  }),
  batch: one(batches, {
    fields: [inventoryTransactions.batchId],
    references: [batches.id],
  }),
  user: one(users, {
    fields: [inventoryTransactions.createdBy],
    references: [users.id],
  }),
}));

// TypeScript Types
export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type Batch = typeof batches.$inferSelect;
export type NewBatch = typeof batches.$inferInsert;

export type InboundShipment = typeof inboundShipments.$inferSelect;
export type NewInboundShipment = typeof inboundShipments.$inferInsert;

export type InboundShipmentItem = typeof inboundShipmentItems.$inferSelect;
export type NewInboundShipmentItem = typeof inboundShipmentItems.$inferInsert;

export type Inventory = typeof inventory.$inferSelect;
export type NewInventory = typeof inventory.$inferInsert;

export type InventoryTransaction = typeof inventoryTransactions.$inferSelect;
export type NewInventoryTransaction = typeof inventoryTransactions.$inferInsert;
