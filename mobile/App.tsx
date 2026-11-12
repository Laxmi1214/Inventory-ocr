import React, { useEffect, useState } from 'react';
import { StyleSheet, View, ActivityIndicator, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import DashboardScreen, { UserSession } from './src/screens/DashboardScreen';
import TaskDetailScreen, { TaskInfo } from './src/screens/TaskDetailScreen';
import ReceivingPOScreen from './src/screens/ReceivingPOScreen';
import ScannerScreen from './src/screens/ScannerScreen';
import { InboundShipmentWithItems } from './src/services/receiving';
import { ExtractedLabelData } from './src/services/ocr';
import { recordMedicineMovement } from './src/services/inventoryService';
import {
  getActiveSessionUser,
  logoutUser,
} from './src/services/db';
import {
  supabase,
  isSupabaseConfigured,
} from './src/services/supabase';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'login' | 'signup'>('login');
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [selectedTaskType, setSelectedTaskType] = useState<string | null>(null);
  const [selectedShipment, setSelectedShipment] = useState<InboundShipmentWithItems | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Check for existing active database session when app loads
  useEffect(() => {
    let isMounted = true;

    async function checkAuthSession() {
      try {
        const user = await getActiveSessionUser();
        if (isMounted && user) {
          setCurrentUser(user);
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

    // Listen to real-time auth changes if Supabase is configured
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
                setSelectedTaskType(null);
                setSelectedShipment(null);
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
    }

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLoginSuccess = (user: UserSession) => {
    setCurrentUser(user);
    setSelectedTaskType(null);
    setSelectedShipment(null);
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch (e) {
      console.warn('Logout error:', e);
    }
    setCurrentUser(null);
    setSelectedTaskType(null);
    setSelectedShipment(null);
    setCurrentScreen('login');
  };

  // Goods Reception Confirm & Receive Handler
  const handleProceedToValidate = async (
    extractedData: ExtractedLabelData,
    shipment: InboundShipmentWithItems
  ) => {
    const prodName = extractedData.productName || shipment.items[0]?.product?.name || 'Pharmaceutical Item';
    const batch = extractedData.batchNumber || shipment.items[0]?.expectedBatch || 'BATCH-REC-01';
    const expiry = extractedData.expiryDate || '12/2027';
    const qty = extractedData.quantity || shipment.items[0]?.expectedQty || 10;
    const priceText = extractedData.price ? `₹${extractedData.price}` : 'N/A';

    try {
      // Record inbound stock intake into database / storage ledger
      await recordMedicineMovement({
        medicineName: prodName,
        batchNumber: batch,
        expiryDate: expiry,
        type: 'INBOUND',
        quantity: qty,
        userName: currentUser?.fullName || currentUser?.username || 'Operator',
        notes: `PO ${shipment.poNumber} received via ${extractedData.source} (SKU: ${extractedData.sku || 'N/A'}, Price: ${priceText})`,
      });

      Alert.alert(
        'Stock Received Successfully',
        `• PO Number: ${shipment.poNumber}\n` +
          `• Product: ${prodName}\n` +
          `• SKU: ${extractedData.sku || 'N/A'}\n` +
          `• Batch / Lot: ${batch}\n` +
          `• Mfg Date: ${extractedData.mfgDate || 'N/A'}\n` +
          `• Expiry: ${expiry}\n` +
          `• Quantity: ${qty} units\n` +
          `• Price / MRP: ${priceText}\n\n` +
          `Inventory ledger & Inbound balance updated!`,
        [
          {
            text: 'OK',
            onPress: () => {
              setSelectedShipment(null);
            },
          },
        ]
      );
    } catch (err: any) {
      Alert.alert('Save Error', err?.message || 'Failed to update inventory balance.');
    }
  };

  const handleStartScan = (task: TaskInfo) => {
    Alert.alert(
      'Scanner',
      `Ready to scan for:\n${task.title}\nProduct: ${task.expectedItem}\nSKU: ${task.expectedSku}\nTarget Batch: ${task.expectedBatch || 'N/A'}`
    );
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
        selectedTaskType === 'RECEIVING' ? (
          selectedShipment ? (
            <ScannerScreen
              shipment={selectedShipment}
              onBack={() => setSelectedShipment(null)}
              onProceedToValidate={handleProceedToValidate}
            />
          ) : (
            <ReceivingPOScreen
              onBack={() => setSelectedTaskType(null)}
              onSelectPO={(shipment: InboundShipmentWithItems) => {
                setSelectedShipment(shipment);
              }}
            />
          )
        ) : selectedTaskType ? (
          <TaskDetailScreen
            taskType={selectedTaskType}
            onBack={() => setSelectedTaskType(null)}
            onStartScan={handleStartScan}
          />
        ) : (
          <DashboardScreen
            user={currentUser}
            onLogout={handleLogout}
            onSelectTask={(taskId) => setSelectedTaskType(taskId)}
          />
        )
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
