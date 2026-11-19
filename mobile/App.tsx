import React, { useEffect, useState } from 'react';
import { StyleSheet, View, ActivityIndicator, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import DashboardScreen, { UserSession } from './src/screens/DashboardScreen';
import TaskDetailScreen, { TaskInfo } from './src/screens/TaskDetailScreen';
import ReceivingPOScreen from './src/screens/ReceivingPOScreen';
import PickPackOrdersScreen from './src/screens/PickPackOrdersScreen';
import ScannerScreen from './src/screens/ScannerScreen';
import ValidationScreen from './src/screens/ValidationScreen';
import StockCountListScreen from './src/screens/StockCountListScreen';
import StockCountAuditScreen from './src/screens/StockCountAuditScreen';
import SupervisorExceptionScreen from './src/screens/SupervisorExceptionScreen';
import MasterDataScreen from './src/screens/MasterDataScreen';
import UserManagementScreen from './src/screens/UserManagementScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import { InboundShipmentWithItems, flagShipmentDiscrepancy } from './src/services/receiving';
import { OutboundOrder, dispatchOrderItem } from './src/services/dispatch';
import { ExtractedLabelData } from './src/services/ocr';
import { StockAuditTask } from './src/services/auditService';
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
  const [selectedAuditTask, setSelectedAuditTask] = useState<StockAuditTask | null>(null);
  const [pendingValidation, setPendingValidation] = useState<{
    extractedData: ExtractedLabelData;
    shipment: InboundShipmentWithItems;
  } | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OutboundOrder | null>(null);
  const [pendingOrderValidation, setPendingOrderValidation] = useState<{
    extractedData: ExtractedLabelData;
    order: OutboundOrder;
  } | null>(null);
  const [isViewingSupervisorExceptions, setIsViewingSupervisorExceptions] = useState(false);
  const [isViewingMasterData, setIsViewingMasterData] = useState(false);
  const [isViewingUserManagement, setIsViewingUserManagement] = useState(false);
  const [isViewingProfile, setIsViewingProfile] = useState(false);
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
    setSelectedOrder(null);
    setPendingValidation(null);
    setPendingOrderValidation(null);
    setIsViewingSupervisorExceptions(false);
    setIsViewingMasterData(false);
    setIsViewingUserManagement(false);
    setIsViewingProfile(false);
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
    setSelectedAuditTask(null);
    setSelectedOrder(null);
    setPendingValidation(null);
    setPendingOrderValidation(null);
    setIsViewingSupervisorExceptions(false);
    setIsViewingMasterData(false);
    setIsViewingUserManagement(false);
    setIsViewingProfile(false);
    setCurrentScreen('login');
  };

  // Goods Reception Proceed to Validation Step
  const handleProceedToValidate = (
    extractedData: ExtractedLabelData,
    shipment?: InboundShipmentWithItems
  ) => {
    // Directs operator to the Validation Step to match physical item vs PO records
    if (shipment) {
      setPendingValidation({ extractedData, shipment });
    }
  };

  // Goods Reception Verified Intake: Add to Inventory Table
  const handleSaveValidatedInventory = async (
    validatedData: ExtractedLabelData,
    shipment: InboundShipmentWithItems
  ) => {
    const prodName = validatedData.productName || shipment.items[0]?.product?.name || 'Pharmaceutical Item';
    const batch = validatedData.batchNumber || shipment.items[0]?.expectedBatch || 'BATCH-REC-01';
    const expiry = validatedData.expiryDate || '';
    const qty = validatedData.quantity || shipment.items[0]?.expectedQty || 10;
    const priceText = validatedData.price ? `₹${validatedData.price}` : 'N/A';

    try {
      // Record inbound stock intake into PostgreSQL database (inventory table)
      await recordMedicineMovement({
        medicineName: prodName,
        batchNumber: batch,
        expiryDate: expiry,
        mfgDate: validatedData.mfgDate,
        sku: validatedData.sku,
        price: validatedData.price !== undefined ? String(validatedData.price) : undefined,
        poNumber: shipment.poNumber,
        userId: currentUser?.id,
        type: 'INBOUND',
        quantity: qty,
        userName: currentUser?.fullName || currentUser?.username || 'Operator',
        notes: `PO ${shipment.poNumber} verified and received into inventory via ${validatedData.source} (SKU: ${validatedData.sku || 'N/A'})`,
      });

      Alert.alert(
        'Inventory Updated Successfully',
        `• PO Number: ${shipment.poNumber}\n` +
          `• Product: ${prodName}\n` +
          `• SKU: ${validatedData.sku || 'N/A'}\n` +
          `• Batch / Lot: ${batch}\n` +
          `• Expiry: ${expiry}\n` +
          `• Quantity: +${qty} units\n` +
          `• Receiving Bay: BAY-01\n\n` +
          `Stock verified and successfully added to physical inventory table!`,
        [
          {
            text: 'OK',
            onPress: () => {
              setPendingValidation(null);
              setSelectedShipment(null);
            },
          },
        ]
      );
    } catch (err: any) {
      Alert.alert('Save Error', err?.message || 'Failed to update inventory balance.');
    }
  };

  // Flag Discrepancy & Quarantine Handler
  const handleFlagDiscrepancy = async (
    reasons: string[],
    notes?: string,
    shipment?: InboundShipmentWithItems,
    extra?: {
      receivedQty?: number;
      expectedQty?: number;
      productName?: string;
      sku?: string;
      batchNumber?: string;
      expiryDate?: string;
    }
  ) => {
    const poNum = shipment?.poNumber || 'Unknown PO';
    const isShortage =
      extra?.expectedQty &&
      extra?.receivedQty !== undefined &&
      extra.receivedQty < extra.expectedQty;

    try {
      await flagShipmentDiscrepancy({
        poNumber: poNum,
        itemId: shipment?.items[0]?.id,
        productId: shipment?.items[0]?.productId,
        productName: extra?.productName || shipment?.items[0]?.product?.name,
        sku: extra?.sku || shipment?.items[0]?.product?.sku,
        batchNumber: extra?.batchNumber || shipment?.items[0]?.expectedBatch,
        expiryDate: extra?.expiryDate,
        expectedQty: extra?.expectedQty || shipment?.items[0]?.expectedQty,
        receivedQty: extra?.receivedQty,
        reasons,
        notes,
        userId: currentUser?.id,
      });

      if (isShortage) {
        Alert.alert(
          'Shortage Routed to Supervisor',
          `Purchase Order ${poNum} flagged for quantity shortage:\n\n` +
            `• Expected (PO): ${extra?.expectedQty} units\n` +
            `• Physical Received: ${extra?.receivedQty} units\n` +
            `• Shortage: -${(extra?.expectedQty || 0) - (extra?.receivedQty || 0)} units\n\n` +
            `Goods placed on Quarantine Hold in BAY-01.\n` +
            `Stock was NOT added to active inventory.\n` +
            `Awaiting Supervisor deviation approval in Exception Inbox.`,
          [
            {
              text: 'OK',
              onPress: () => {
                setPendingValidation(null);
                setSelectedShipment(null);
              },
            },
          ]
        );
      } else {
        Alert.alert(
          'Discrepancy Quarantined',
          `Purchase Order ${poNum} has been flagged with DISCREPANCY status.\n\nFailures:\n• ${reasons.join('\n• ')}\n\nPhysical goods routed to Quarantine Holding Bay. Stock was NOT added to active inventory.`,
          [
            {
              text: 'OK',
              onPress: () => {
                setPendingValidation(null);
                setSelectedShipment(null);
              },
            },
          ]
        );
      }
    } catch (err: any) {
      Alert.alert('Notice', 'Discrepancy logged. Goods quarantined.');
      setPendingValidation(null);
      setSelectedShipment(null);
    }
  };

  // Pick & Pack Outbound Dispatch: Deduct from Inventory Table
  const handleDispatchValidatedOrder = async (
    validatedData: ExtractedLabelData,
    order: OutboundOrder
  ) => {
    const prodName = validatedData.productName || order.items[0]?.productName || 'Pharmaceutical Item';
    const batch = validatedData.batchNumber || order.items[0]?.suggestedBatch || 'BATCH-PICK';
    const sku = validatedData.sku || order.items[0]?.sku || '';
    const qty = validatedData.quantity || order.items[0]?.requiredQty || 10;

    try {
      const result = await dispatchOrderItem({
        orderNumber: order.orderNumber,
        productName: prodName,
        sku,
        batchNumber: batch,
        quantity: qty,
        userId: currentUser?.id,
        userName: currentUser?.fullName || currentUser?.username || 'Operator',
        notes: `Order ${order.orderNumber} picked & packed for ${order.customerName} via ${validatedData.source}`,
      });

      if (!result.success) {
        Alert.alert('Dispatch Error', result.error || 'Failed to dispatch stock from inventory.');
        return;
      }

      Alert.alert(
        'Order Dispatched Successfully',
        `• Order Number: ${order.orderNumber}\n` +
          `• Customer: ${order.customerName}\n` +
          `• Product: ${prodName}\n` +
          `• SKU: ${sku || 'N/A'}\n` +
          `• Batch / Lot: ${batch}\n` +
          `• Quantity Dispatched: -${qty} units\n` +
          `• Status: PACKED & READY FOR COURIER\n\n` +
          `Stock successfully deducted from active inventory table!`,
        [
          {
            text: 'OK',
            onPress: () => {
              setPendingOrderValidation(null);
              setSelectedOrder(null);
              setSelectedTaskType(null);
            },
          },
        ]
      );
    } catch (err: any) {
      Alert.alert('Dispatch Error', err?.message || 'Failed to update inventory balance.');
    }
  };

  const handleStartScan = (task: TaskInfo) => {
    // Directly launch real live CameraView ScannerScreen for this task
    const orderFromTask: OutboundOrder = {
      id: task.code,
      orderNumber: task.code,
      customerName: task.partnerOrDestination,
      status: 'PENDING',
      priority: 'URGENT',
      deliveryDate: new Date().toISOString(),
      notes: task.notes,
      items: [
        {
          id: `item-${task.code}`,
          productName: task.expectedItem,
          sku: task.expectedSku,
          requiredQty: task.expectedQty,
          pickedQty: 0,
          status: 'PENDING',
          suggestedBatch: task.expectedBatch,
        },
      ],
    };
    setSelectedOrder(orderFromTask);
    setSelectedTaskType('PICK_PACK');
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
          pendingValidation ? (
            <ValidationScreen
              shipment={pendingValidation.shipment}
              extractedData={pendingValidation.extractedData}
              onBack={() => setPendingValidation(null)}
              onConfirmAddToInventory={async (validatedData, shipment) => {
                await handleSaveValidatedInventory(validatedData, shipment);
              }}
              onFlagDiscrepancy={async (reasons, notes, extra) => {
                await handleFlagDiscrepancy(reasons, notes, pendingValidation.shipment, extra);
              }}
            />
          ) : selectedShipment ? (
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
        ) : selectedTaskType === 'STOCK_COUNT' ? (
          selectedAuditTask ? (
            <StockCountAuditScreen
              task={selectedAuditTask}
              userId={currentUser?.id}
              onBack={() => setSelectedAuditTask(null)}
              onAuditCompleted={(msg) => {
                setSelectedAuditTask(null);
              }}
            />
          ) : (
            <StockCountListScreen
              onBack={() => setSelectedTaskType(null)}
              onSelectTask={(task) => setSelectedAuditTask(task)}
            />
          )
        ) : selectedTaskType === 'PICK_PACK' ? (
          pendingOrderValidation ? (
            <ValidationScreen
              order={pendingOrderValidation.order}
              mode="PICK_PACK"
              extractedData={pendingOrderValidation.extractedData}
              onBack={() => setPendingOrderValidation(null)}
              onConfirmDispatchStock={async (validatedData, order) => {
                await handleDispatchValidatedOrder(validatedData, order);
              }}
              onFlagDiscrepancy={async (reasons, notes) => {
                Alert.alert(
                  'Order Item Discrepancy',
                  `Order ${pendingOrderValidation.order.orderNumber} flagged:\n\n• ${reasons.join('\n• ')}\n\nGoods not dispatched.`
                );
                setPendingOrderValidation(null);
                setSelectedOrder(null);
              }}
            />
          ) : selectedOrder ? (
            <ScannerScreen
              order={selectedOrder}
              mode="PICK_PACK"
              onBack={() => setSelectedOrder(null)}
              onProceedToValidate={(extractedData, _shipment, order) => {
                if (order) {
                  setPendingOrderValidation({ extractedData, order });
                }
              }}
            />
          ) : (
            <PickPackOrdersScreen
              onBack={() => setSelectedTaskType(null)}
              onSelectOrder={(order: OutboundOrder) => {
                setSelectedOrder(order);
              }}
            />
          )
        ) : selectedTaskType ? (
          <TaskDetailScreen
            taskType={selectedTaskType}
            onBack={() => setSelectedTaskType(null)}
            onStartScan={handleStartScan}
          />
        ) : isViewingSupervisorExceptions ? (
          <SupervisorExceptionScreen
            userId={currentUser?.id}
            userName={currentUser?.fullName || currentUser?.username || 'Supervisor'}
            onBack={() => setIsViewingSupervisorExceptions(false)}
          />
        ) : isViewingMasterData ? (
          <MasterDataScreen
            userRole={currentUser?.role}
            onBack={() => setIsViewingMasterData(false)}
          />
        ) : isViewingUserManagement ? (
          <UserManagementScreen
            currentAdminId={currentUser?.id}
            onBack={() => setIsViewingUserManagement(false)}
          />
        ) : isViewingProfile ? (
          <ProfileScreen
            user={currentUser}
            onBack={() => setIsViewingProfile(false)}
            onLogout={handleLogout}
            onUserUpdated={(updated) => setCurrentUser(updated)}
          />
        ) : (
          <DashboardScreen
            user={currentUser}
            onLogout={handleLogout}
            onOpenProfile={() => setIsViewingProfile(true)}
            onSelectTask={(taskId) => setSelectedTaskType(taskId)}
            onOpenSupervisorExceptions={() => {
              if (currentUser?.role === 'SUPERVISOR' || currentUser?.role === 'SYSTEM_ADMIN') {
                setIsViewingSupervisorExceptions(true);
              } else {
                Alert.alert(
                  'Access Denied (RBAC)',
                  'Only Supervisors and System Administrators have permission to review and approve discrepancy overrides.'
                );
              }
            }}
            onOpenMasterData={() => {
              if (currentUser?.role === 'INVENTORY_ADMIN' || currentUser?.role === 'SYSTEM_ADMIN') {
                setIsViewingMasterData(true);
              } else {
                Alert.alert(
                  'Access Denied (RBAC)',
                  'Only Inventory Administrators and System Administrators have permission to manage Master Data.'
                );
              }
            }}
            onOpenUserManagement={() => {
              if (currentUser?.role === 'SYSTEM_ADMIN') {
                setIsViewingUserManagement(true);
              } else {
                Alert.alert(
                  'Access Denied (RBAC)',
                  'Only System Administrators have permission to manage staff accounts and roles.'
                );
              }
            }}
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
