import { supabase, isSupabaseConfigured } from './supabase';

export interface UserRecord {
  id: string; // User ID
  username: string; // User Name
  email: string; // Email
  password: string; // PW
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
 * Fetch all users from the user table
 */
export async function getAllUsers(): Promise<UserRecord[]> {
  try {
    const raw = await safeStorage.getItem(STORAGE_USERS_KEY);
    if (!raw) {
      // Initialize with seed users
      await safeStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(INITIAL_SEED_USERS));
      return [...INITIAL_SEED_USERS];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [...INITIAL_SEED_USERS];
  } catch (err) {
    console.warn('Error reading users from DB storage:', err);
    return [...INITIAL_SEED_USERS];
  }
}

/**
 * Save users list to the user table
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
 * Register a new user in the Database
 * Validates:
 * - Password and Confirm Password match
 * - Checks if email already exists in DB -> throws / returns exception: "Mail id already exists"
 * - Saves user (User id, user name, email, pw, role) in DB
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

    // 3. Check if email already exists in DB (User table query)
    const existingUsers = await getAllUsers();
    const isEmailTaken = existingUsers.some(
      (u) => u.email.trim().toLowerCase() === cleanEmail
    );

    if (isEmailTaken) {
      // Exception: Duplicate email
      throw new Error('Mail id already exists');
    }

    // 4. Create new user record
    const uniqueId = `USR-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();

    const newUser: UserRecord = {
      id: uniqueId,
      username: username.trim(),
      email: cleanEmail,
      password: password, // In production, hash this with bcrypt/argon2
      role: role || 'OPERATOR',
      createdAt: now,
      updatedAt: now,
    };

    // 5. Insert into DB user table
    const updatedUsers = [...existingUsers, newUser];
    await saveUsersToDB(updatedUsers);

    // 6. Optional Supabase Sync if configured
    if (isSupabaseConfigured) {
      try {
        await supabase.from('users').upsert({
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          password: newUser.password,
          role: newUser.role,
          created_at: newUser.createdAt,
          updated_at: newUser.updatedAt,
        });
      } catch (cloudErr: any) {
        console.warn('Cloud DB sync notice:', cloudErr?.message);
      }
    }

    return { user: newUser };
  } catch (err: any) {
    return { error: err?.message || 'Failed to register user in database' };
  }
}

/**
 * Login user by comparing credentials against the user table in the DB
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

    const query = emailOrUsername.trim().toLowerCase();

    // Query DB users table
    const users = await getAllUsers();

    // Find user by email or username
    const matchedUser = users.find(
      (u) =>
        u.email.toLowerCase() === query ||
        u.username.toLowerCase() === query
    );

    if (!matchedUser) {
      return { error: 'No account found with this email or username' };
    }

    // Compare password with DB
    if (matchedUser.password !== passwordInput) {
      return { error: 'Incorrect password. Please verify and try again.' };
    }

    // Valid login: Create session
    const session: UserSession = {
      id: matchedUser.id,
      username: matchedUser.username,
      fullName: matchedUser.username,
      email: matchedUser.email,
      role: matchedUser.role,
    };

    await safeStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));

    return { user: session };
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

