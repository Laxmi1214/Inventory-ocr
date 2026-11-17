import { supabase, isSupabaseConfigured } from './supabase';

export interface UserRecord {
  id: string; // User ID
  username: string; // User Name
  email: string; // Email
  password?: string; // PW
  role: string; // Role ('OPERATOR' | 'SUPERVISOR' | 'INVENTORY_ADMIN' | 'SYSTEM_ADMIN')
  createdAt: string;
  updatedAt: string;
}

export interface UserSession {
  id: string;
  username: string;
  email: string;
  role: string;
  fullName?: string;
}

const STORAGE_USERS_KEY = '@congiotech_users_table_v1';
const STORAGE_SESSION_KEY = '@congiotech_active_session_v1';
const AUTH_API_URL = process.env.EXPO_PUBLIC_OCR_API_URL || 'http://192.168.1.47:8080';

// In-memory fallback map for environments without native AsyncStorage
const inMemoryStore = new Map<string, string>();

let nativeAsyncStorage: any = null;
try {
  const storageModule = require('@react-native-async-storage/async-storage');
  nativeAsyncStorage = storageModule?.default || storageModule;
} catch {
  // Fallback to in-memory store
}

export const safeStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (nativeAsyncStorage && typeof nativeAsyncStorage.getItem === 'function') {
        const val = await nativeAsyncStorage.getItem(key);
        if (val !== null && val !== undefined) return val;
      }
    } catch {
      // Continue to memory fallback
    }
    return inMemoryStore.get(key) || null;
  },

  setItem: async (key: string, value: string): Promise<void> => {
    inMemoryStore.set(key, value);
    try {
      if (nativeAsyncStorage && typeof nativeAsyncStorage.setItem === 'function') {
        await nativeAsyncStorage.setItem(key, value);
      }
    } catch {
      // Keep memory fallback
    }
  },

  removeItem: async (key: string): Promise<void> => {
    inMemoryStore.delete(key);
    try {
      if (nativeAsyncStorage && typeof nativeAsyncStorage.removeItem === 'function') {
        await nativeAsyncStorage.removeItem(key);
      }
    } catch {
      // Keep memory fallback
    }
  },
};

/**
 * Initial seed users in the database table
 */
const INITIAL_SEED_USERS: UserRecord[] = [
  {
    id: 'USR-SEED-001',
    username: 'Demo Operator',
    email: 'operator@congiotech.com',
    password: 'password123',
    role: 'OPERATOR',
    createdAt: new Date('2026-01-01').toISOString(),
    updatedAt: new Date('2026-01-01').toISOString(),
  },
  {
    id: 'USR-SEED-002',
    username: 'Demo Supervisor',
    email: 'supervisor@congiotech.com',
    password: 'password123',
    role: 'SUPERVISOR',
    createdAt: new Date('2026-01-01').toISOString(),
    updatedAt: new Date('2026-01-01').toISOString(),
  },
  {
    id: 'USR-SEED-003',
    username: 'System Admin',
    email: 'admin@congiotech.com',
    password: 'adminpassword',
    role: 'SYSTEM_ADMIN',
    createdAt: new Date('2026-01-01').toISOString(),
    updatedAt: new Date('2026-01-01').toISOString(),
  },
];

/**
 * Fetch all users from PostgreSQL Database via Backend API (falls back to local cache)
 */
export async function getAllUsers(): Promise<UserRecord[]> {
  try {
    const res = await fetch(`${AUTH_API_URL}/api/v1/auth/users`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.users)) {
        const formatted: UserRecord[] = data.users.map((u: any) => ({
          id: u.id,
          username: u.username,
          email: u.email,
          role: u.role,
          createdAt: u.created_at || new Date().toISOString(),
          updatedAt: u.updated_at || new Date().toISOString(),
        }));
        await safeStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(formatted));
        return formatted;
      }
    }
  } catch (netErr) {
    console.warn('[DB USERS FETCH NOTICE] Backend unavailable, using local cache:', netErr);
  }

  try {
    const raw = await safeStorage.getItem(STORAGE_USERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Error reading users from local storage:', err);
  }

  return [...INITIAL_SEED_USERS];
}

/**
 * Save users list to local storage
 */
async function saveUsersToDB(users: UserRecord[]): Promise<void> {
  await safeStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));
}

export interface RegisterUserInput {
  username: string;
  email: string;
  password: string;
  confirmPassword?: string;
  role: string;
}

/**
 * Register a new user directly in the PostgreSQL Database (Supabase)
 * Validates:
 * - Password and Confirm Password match
 * - Checks if email already exists in DB -> throws / returns exception: "Mail id already exists"
 * - Saves user (User id, user name, email, pw, role) in PostgreSQL DB
 */
export async function registerUser(
  input: RegisterUserInput
): Promise<{ user?: UserRecord; error?: string }> {
  try {
    const { username, email, password, confirmPassword, role } = input;

    // 1. Basic validation
    if (!username || !username.trim()) {
      return { error: 'Please enter a valid user name' };
    }

    if (!email || !email.trim()) {
      return { error: 'Please enter your email address' };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cleanEmail = email.trim().toLowerCase();
    if (!emailRegex.test(cleanEmail)) {
      return { error: 'Please enter a valid email address' };
    }

    if (!password || password.length < 6) {
      return { error: 'Password must be at least 6 characters long' };
    }

    // 2. Confirm password check
    if (confirmPassword !== undefined && password !== confirmPassword) {
      return { error: 'Passwords do not match' };
    }

    // 3. Post to PostgreSQL Backend Auth Gateway
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(`${AUTH_API_URL}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          email: cleanEmail,
          password: password,
          role: role || 'OPERATOR',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok || !data.success) {
        return { error: data.error || 'Failed to register user in database' };
      }

      const registeredUser: UserRecord = {
        id: data.user.id,
        username: data.user.username,
        email: data.user.email,
        role: data.user.role,
        createdAt: data.user.created_at || new Date().toISOString(),
        updatedAt: data.user.updated_at || new Date().toISOString(),
      };

      // Save to local storage as cache
      const existingUsers = await getAllUsers();
      await saveUsersToDB([...existingUsers.filter(u => u.email !== cleanEmail), registeredUser]);

      return { user: registeredUser };
    } catch (apiErr: any) {
      clearTimeout(timeoutId);
      console.error('[DB REGISTER API ERROR]:', apiErr.message);
      return {
        error: `Cannot connect to Database server (${AUTH_API_URL}). Please verify backend is running on your PC. (${apiErr.message})`,
      };
    }
  } catch (err: any) {
    return { error: err?.message || 'Failed to register user in database' };
  }
}

/**
 * Login user by comparing credentials against the PostgreSQL Database
 */
export async function loginUser(
  emailOrUsername: string,
  passwordInput: string
): Promise<{ user?: UserSession; error?: string }> {
  try {
    if (!emailOrUsername || !emailOrUsername.trim()) {
      return { error: 'Please enter your email or username' };
    }

    if (!passwordInput) {
      return { error: 'Please enter your password' };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    // 1. Post to PostgreSQL Backend Auth Gateway
    try {
      const response = await fetch(`${AUTH_API_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailOrUsername: emailOrUsername.trim(),
          password: passwordInput,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok || !data.success) {
        return { error: data.error || 'Authentication failed against database' };
      }

      const session: UserSession = {
        id: data.user.id,
        username: data.user.username,
        fullName: data.user.fullName || data.user.username,
        email: data.user.email,
        role: data.user.role,
      };

      await safeStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
      return { user: session };
    } catch (apiErr: any) {
      clearTimeout(timeoutId);
      console.warn('[DB LOGIN API NOTICE]:', apiErr.message);

      // Check seed demo users if completely offline
      const query = emailOrUsername.trim().toLowerCase();
      const demoUser = INITIAL_SEED_USERS.find(
        (u) =>
          (u.email.toLowerCase() === query || u.username.toLowerCase() === query) &&
          u.password === passwordInput
      );

      if (demoUser) {
        const session: UserSession = {
          id: demoUser.id,
          username: demoUser.username,
          fullName: demoUser.username,
          email: demoUser.email,
          role: demoUser.role,
        };
        await safeStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
        return { user: session };
      }

      return {
        error: `Cannot connect to Database server (${AUTH_API_URL}). Please verify backend is running on your PC.`,
      };
    }
  } catch (err: any) {
    return { error: err?.message || 'Login verification failed against database' };
  }
}

/**
 * Get active session user
 */
export async function getActiveSessionUser(): Promise<UserSession | null> {
  try {
    const raw = await safeStorage.getItem(STORAGE_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (session && session.email) {
      return session;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Log out user by clearing session
 */
export async function logoutUser(): Promise<void> {
  try {
    await safeStorage.removeItem(STORAGE_SESSION_KEY);
  } catch (err) {
    console.warn('Logout session clear warning:', err);
  }
}
