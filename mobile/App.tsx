import React, { useEffect, useState } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import DashboardScreen, { UserSession } from './src/screens/DashboardScreen';
import {
  getActiveSessionUser,
  logoutStaffUser,
  supabase,
  isSupabaseConfigured,
  AuthUserProfile,
} from './src/services/supabase';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'login' | 'signup'>('login');
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Check for existing active session in Supabase when app loads
  useEffect(() => {
    let isMounted = true;

    async function checkAuthSession() {
      try {
        if (isSupabaseConfigured) {
          const user = await getActiveSessionUser();
          if (isMounted && user) {
            setCurrentUser(user);
          }
        }
      } catch (err) {
        console.warn('Session check error:', err);
      } finally {
        if (isMounted) {
          setIsCheckingAuth(false);
        }
      }
    }

    checkAuthSession();

    // Listen to real-time auth changes safely
    if (isSupabaseConfigured) {
      let authSub: any = null;
      try {
        const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (!isMounted) return;
          try {
            if (event === 'SIGNED_IN' && session?.user) {
              const user = await getActiveSessionUser();
              if (user && isMounted) setCurrentUser(user);
            } else if (event === 'SIGNED_OUT') {
              if (isMounted) {
                setCurrentUser(null);
                setCurrentScreen('login');
              }
            }
          } catch (authErr) {
            console.warn('Auth state change handler error:', authErr);
          }
        });
        authSub = data?.subscription;
      } catch (subErr) {
        console.warn('Auth listener registration warning:', subErr);
      }

      return () => {
        isMounted = false;
        if (authSub && typeof authSub.unsubscribe === 'function') {
          authSub.unsubscribe();
        }
      };
    } else {
      setIsCheckingAuth(false);
    }

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLoginSuccess = (user: AuthUserProfile | UserSession) => {
    setCurrentUser(user);
  };

  const handleLogout = async () => {
    try {
      await logoutStaffUser();
    } catch (e) {
      console.warn('Logout error:', e);
    }
    setCurrentUser(null);
    setCurrentScreen('login');
  };

  if (isCheckingAuth) {
    return (
      <View style={[styles.container, styles.centered]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#38BDF8" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {currentUser ? (
        <DashboardScreen user={currentUser} onLogout={handleLogout} />
      ) : currentScreen === 'login' ? (
        <LoginScreen
          onNavigateToSignup={() => setCurrentScreen('signup')}
          onLoginSuccess={handleLoginSuccess}
        />
      ) : (
        <SignupScreen
          onNavigateToLogin={() => setCurrentScreen('login')}
          onSignupSuccess={handleLoginSuccess}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
