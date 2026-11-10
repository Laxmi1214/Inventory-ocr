import { createClient } from '@supabase/supabase-js';

// Expo public environment variables (prefixed with EXPO_PUBLIC_ for client-side access)
export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-project') &&
    !supabaseUrl.includes('placeholder')
);

// In-memory fallback map to safely hold sessions without crashing on native module absence
const inMemoryStore = new Map<string, string>();

// Safely probe and acquire native AsyncStorage without top-level import crash
let nativeAsyncStorage: any = null;
try {
  // Use dynamic require so bundle evaluation does NOT fail when native module is null
  const storageModule = require('@react-native-async-storage/async-storage');
  nativeAsyncStorage = storageModule?.default || storageModule;
} catch {
  // Native storage not accessible; fallback will handle storage safely
}

const safeStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (nativeAsyncStorage && typeof nativeAsyncStorage.getItem === 'function') {
        const value = await nativeAsyncStorage.getItem(key);
        if (value !== null && value !== undefined) {
          return value;
        }
      }
    } catch {
      // Return from memory fallback if native access throws
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
      // Retained in inMemoryStore
    }
  },

  removeItem: async (key: string): Promise<void> => {
    inMemoryStore.delete(key);
    try {
      if (nativeAsyncStorage && typeof nativeAsyncStorage.removeItem === 'function') {
        await nativeAsyncStorage.removeItem(key);
      }
    } catch {
      // Removed from inMemoryStore
    }
  },
};

// Initialize Supabase Client safely
export const supabase = createClient(
  supabaseUrl || 'https://swggqdgmbsikwibyhita.supabase.co',
  supabaseAnonKey || 'sb_publishable_placeholder',
  {
    auth: {
      storage: safeStorageAdapter,
      autoRefreshToken: false, // Prevents background tick unhandled timer crashes in mobile clients
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

export interface AuthUserProfile {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

/**
 * Register a new staff user with Supabase Auth and save profile in 'users' table
 */
export async function registerStaffUser(
  fullName: string,
  email: string,
  password: string,
  role: string
): Promise<{ user?: AuthUserProfile; error?: string }> {
  if (!isSupabaseConfigured) {
    return {
      error:
        'Supabase is not configured yet. Please verify EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your mobile/.env file.',
    };
  }

  try {
    // 1. Create account in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          role,
        },
      },
    });

    if (authError) {
      return { error: authError.message };
    }

    if (!authData.user) {
      return { error: 'Failed to create user. Please try again.' };
    }

    // 2. Save/Sync user profile in public 'users' table (Drizzle schema)
    try {
      const { error: profileError } = await supabase.from('users').upsert({
        id: authData.user.id,
        email: authData.user.email || email.trim().toLowerCase(),
        full_name: fullName.trim(),
        role: role || 'OPERATOR',
        updated_at: new Date().toISOString(),
      });

      if (profileError) {
        console.warn('Profile table sync warning:', profileError.message);
      }
    } catch (syncErr: any) {
      console.warn('Profile sync exception:', syncErr?.message);
    }

    return {
      user: {
        id: authData.user.id,
        email: authData.user.email || email,
        fullName: fullName.trim(),
        role: role || 'OPERATOR',
      },
    };
  } catch (err: any) {
    return { error: err.message || 'An unexpected error occurred during signup.' };
  }
}

/**
 * Sign in an existing user with Supabase and fetch their profile
 */
export async function loginStaffUser(
  email: string,
  password: string
): Promise<{ user?: AuthUserProfile; error?: string }> {
  if (!isSupabaseConfigured) {
    return {
      error:
        'Supabase is not configured yet. Please verify EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your mobile/.env file.',
    };
  }

  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError) {
      return { error: authError.message };
    }

    if (!authData.user) {
      return { error: 'Invalid login credentials.' };
    }

    // Fetch user profile from 'users' table
    let fullName = authData.user.user_metadata?.full_name || '';
    let role = authData.user.user_metadata?.role || 'OPERATOR';

    try {
      const { data: profile } = await supabase
        .from('users')
        .select('full_name, role')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (profile) {
        if (profile.full_name) fullName = profile.full_name;
        if (profile.role) role = profile.role;
      }
    } catch (profileErr: any) {
      console.warn('Profile fetch exception:', profileErr?.message);
    }

    return {
      user: {
        id: authData.user.id,
        email: authData.user.email || email,
        fullName: fullName || email.split('@')[0],
        role,
      },
    };
  } catch (err: any) {
    return { error: err.message || 'An unexpected error occurred during login.' };
  }
}

/**
 * Get currently authenticated session
 */
export async function getActiveSessionUser(): Promise<AuthUserProfile | null> {
  if (!isSupabaseConfigured) return null;

  try {
    const { data } = await supabase.auth.getSession();
    const session = data?.session;
    if (!session?.user) return null;

    let fullName = session.user.user_metadata?.full_name || '';
    let role = session.user.user_metadata?.role || 'OPERATOR';

    try {
      const { data: profile } = await supabase
        .from('users')
        .select('full_name, role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profile) {
        if (profile.full_name) fullName = profile.full_name;
        if (profile.role) role = profile.role;
      }
    } catch {
      // Ignore profile lookup error, use session user metadata
    }

    return {
      id: session.user.id,
      email: session.user.email || '',
      fullName: fullName || session.user.email?.split('@')[0] || '',
      role,
    };
  } catch {
    return null;
  }
}

/**
 * Sign out user
 */
export async function logoutStaffUser(): Promise<void> {
  if (isSupabaseConfigured) {
    try {
      await supabase.auth.signOut();
    } catch (e: any) {
      console.warn('Signout warning:', e?.message);
    }
  }
}
