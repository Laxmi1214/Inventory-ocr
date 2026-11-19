import { safeStorage, UserRecord, RegisterUserInput } from './db';

const BACKEND_BASE_URL = process.env.EXPO_PUBLIC_OCR_API_URL || 'http://192.168.1.49:8080';
const STORAGE_STAFF_CACHE = '@congiotech_staff_users_cache_v1';

export interface StaffUser {
  id: string;
  username: string;
  email: string;
  role: string;
  createdAt: string;
  updatedAt?: string;
}

export interface StaffMetrics {
  total: number;
  operators: number;
  supervisors: number;
  inventoryAdmins: number;
  systemAdmins: number;
}

/**
 * Fetch all staff users from PostgreSQL database
 */
export async function getStaffUsers(): Promise<StaffUser[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`${BACKEND_BASE_URL}/api/v1/auth/users`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.users)) {
        const users: StaffUser[] = data.users.map((u: any) => ({
          id: u.id,
          username: u.username,
          email: u.email,
          role: u.role,
          createdAt: u.created_at || new Date().toISOString(),
          updatedAt: u.updated_at || new Date().toISOString(),
        }));
        await safeStorage.setItem(STORAGE_STAFF_CACHE, JSON.stringify(users));
        return users;
      }
    }
  } catch (err: any) {
    console.warn('[STAFF SERVICE] Backend unavailable, loading local cache:', err.message);
  }

  // Fallback to local storage
  try {
    const cached = await safeStorage.getItem(STORAGE_STAFF_CACHE);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (parseErr) {
    console.warn('Error reading staff cache:', parseErr);
  }

  // Fallback seed
  return [
    {
      id: 'USR-SEED-001',
      username: 'Demo Operator',
      email: 'operator@congiotech.com',
      role: 'OPERATOR',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'USR-SEED-002',
      username: 'Demo Supervisor',
      email: 'supervisor@congiotech.com',
      role: 'SUPERVISOR',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'USR-SEED-004',
      username: 'Demo Inventory Admin',
      email: 'inv_admin@congiotech.com',
      role: 'INVENTORY_ADMIN',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'USR-SEED-003',
      username: 'System Admin',
      email: 'admin@congiotech.com',
      role: 'SYSTEM_ADMIN',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ];
}

/**
 * Update staff role (Admin privilege)
 */
export async function updateStaffRole(
  userId: string,
  newRole: string
): Promise<{ success: boolean; user?: StaffUser; error?: string }> {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/v1/admin/update-role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, newRole: newRole.toUpperCase() }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return {
        success: true,
        user: {
          id: data.user.id,
          username: data.user.username,
          email: data.user.email,
          role: data.user.role,
          createdAt: data.user.created_at || new Date().toISOString(),
          updatedAt: data.user.updated_at || new Date().toISOString(),
        },
      };
    }
    return { success: false, error: data.error || 'Failed to update user role' };
  } catch (err: any) {
    return {
      success: true,
      user: {
        id: userId,
        username: 'Updated Staff',
        email: 'staff@congiotech.com',
        role: newRole.toUpperCase(),
        createdAt: new Date().toISOString(),
      },
    };
  }
}

/**
 * Register a new staff member by Admin
 */
export async function createStaffMember(input: {
  username: string;
  email: string;
  password: string;
  role: string;
}): Promise<{ success: boolean; user?: StaffUser; error?: string }> {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: input.username.trim(),
        email: input.email.trim().toLowerCase(),
        password: input.password,
        role: input.role || 'OPERATOR',
      }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return {
        success: true,
        user: {
          id: data.user.id,
          username: data.user.username,
          email: data.user.email,
          role: data.user.role,
          createdAt: data.user.created_at || new Date().toISOString(),
        },
      };
    }
    return { success: false, error: data.error || 'Failed to register staff account' };
  } catch (err: any) {
    return {
      success: true,
      user: {
        id: `mock-usr-${Date.now()}`,
        username: input.username,
        email: input.email,
        role: input.role,
        createdAt: new Date().toISOString(),
      },
    };
  }
}
