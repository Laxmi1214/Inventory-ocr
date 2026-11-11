import { pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

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
  id: varchar('id', { length: 100 }).primaryKey(), // Unique User ID (e.g. USER-xxxx or UUID)
  username: varchar('username', { length: 100 }).notNull(), // User Name
  email: varchar('email', { length: 255 }).notNull().unique(), // User Email (unique)
  password: text('password').notNull(), // Password / PW
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
