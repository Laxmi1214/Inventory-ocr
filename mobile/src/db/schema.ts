import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

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
 * Users profile table
 * Connected to Supabase auth.users via UUID primary key
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey(), // maps to supabase auth.users.id
  email: varchar('email', { length: 255 }).notNull().unique(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 })
    .notNull()
    .default('OPERATOR')
    .references(() => roles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

