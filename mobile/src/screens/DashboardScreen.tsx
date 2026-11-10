import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Platform,
  StatusBar as RNStatusBar,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface UserSession {
  email: string;
  fullName?: string;
  role?: string;
}

interface DashboardScreenProps {
  user: UserSession;
  onLogout: () => void;
  onSelectTask?: (taskType: string) => void;
}

const getRoleBadge = (role?: string) => {
  switch (role) {
    case 'SUPERVISOR':
      return { label: 'Supervisor', color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.15)' };
    case 'INVENTORY_ADMIN':
      return { label: 'Inventory Admin', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)' };
    case 'SYSTEM_ADMIN':
      return { label: 'System Admin', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)' };
    default:
      return { label: 'Warehouse Operator', color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.15)' };
  }
};

export default function DashboardScreen({ user, onLogout, onSelectTask }: DashboardScreenProps) {
  const roleBadge = getRoleBadge(user.role);
  const displayName = user.fullName || user.email.split('@')[0] || 'Warehouse Staff';

  const handleTaskPress = (taskId: string, title: string) => {
    if (onSelectTask) {
      onSelectTask(taskId);
    } else {
      Alert.alert(title, `Selected: ${title}\n(Workflow screens will be implemented in the next steps)`);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Top App Bar */}
        <View style={styles.topBar}>
          <View style={styles.userInfoContainer}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={20} color="#38BDF8" />
            </View>
            <View>
              <Text style={styles.greetingText}>Hello, {displayName}</Text>
              <View style={[styles.roleBadge, { backgroundColor: roleBadge.bg }]}>
                <Text style={[styles.roleBadgeText, { color: roleBadge.color }]}>
                  {roleBadge.label}
                </Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={onLogout}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={20} color="#F43F5E" />
          </TouchableOpacity>
        </View>

        {/* Brand Banner */}
        <View style={styles.bannerContainer}>
          <View style={styles.bannerTextGroup}>
            <Text style={styles.bannerCompany}>CONGIOTECH</Text>
            <Text style={styles.bannerTitle}>Label Verification & Batch Tracking</Text>
            <Text style={styles.bannerSubtitle}>
              Select a warehouse workflow to start scanning & inventory validation
            </Text>
          </View>
          <View style={styles.bannerIconBadge}>
            <Ionicons name="shield-checkmark" size={26} color="#0284C7" />
          </View>
        </View>

        {/* Quick Operational Metrics */}
        <Text style={styles.sectionTitle}>Today's Operational Summary</Text>
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <View style={[styles.metricIconCircle, { backgroundColor: 'rgba(56, 189, 248, 0.15)' }]}>
              <Ionicons name="cube-outline" size={18} color="#38BDF8" />
            </View>
            <Text style={styles.metricValue}>12</Text>
            <Text style={styles.metricLabel}>Pending Shipments</Text>
          </View>

          <View style={styles.metricCard}>
            <View style={[styles.metricIconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <Ionicons name="checkmark-done-outline" size={18} color="#10B981" />
            </View>
            <Text style={styles.metricValue}>84</Text>
            <Text style={styles.metricLabel}>Batches Verified</Text>
          </View>

          <View style={styles.metricCard}>
            <View style={[styles.metricIconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
              <Ionicons name="alert-circle-outline" size={18} color="#EF4444" />
            </View>
            <Text style={styles.metricValue}>2</Text>
            <Text style={styles.metricLabel}>Open Exceptions</Text>
          </View>
        </View>

        {/* Primary Warehouse Workflows */}
        <Text style={styles.sectionTitle}>Main Warehouse Tasks</Text>
        <View style={styles.tasksContainer}>
          {/* Task 1: Goods Reception */}
          <TouchableOpacity
            style={styles.taskCard}
            onPress={() => handleTaskPress('RECEIVING', 'Goods Reception')}
            activeOpacity={0.8}
          >
            <View style={[styles.taskIconCircle, { backgroundColor: '#0284C7' }]}>
              <Ionicons name="download-outline" size={24} color="#FFFFFF" />
            </View>
            <View style={styles.taskInfo}>
              <View style={styles.taskTitleRow}>
                <Text style={styles.taskTitle}>Goods Reception</Text>
                <View style={styles.taskBadge}>
                  <Text style={styles.taskBadgeText}>Inbound</Text>
                </View>
              </View>
              <Text style={styles.taskDesc}>
                Verify incoming packages against PO / ASN. Scan label, decode barcode & match expiry.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          {/* Task 2: Pick & Pack */}
          <TouchableOpacity
            style={styles.taskCard}
            onPress={() => handleTaskPress('PICK_PACK', 'Pick & Pack')}
            activeOpacity={0.8}
          >
            <View style={[styles.taskIconCircle, { backgroundColor: '#8B5CF6' }]}>
              <Ionicons name="cart-outline" size={24} color="#FFFFFF" />
            </View>
            <View style={styles.taskInfo}>
              <View style={styles.taskTitleRow}>
                <Text style={styles.taskTitle}>Pick & Pack</Text>
                <View style={[styles.taskBadge, { backgroundColor: 'rgba(139, 92, 246, 0.2)' }]}>
                  <Text style={[styles.taskBadgeText, { color: '#C4B5FD' }]}>Outbound</Text>
                </View>
              </View>
              <Text style={styles.taskDesc}>
                Fulfil customer pick lists. Validate correct product SKU, authorized batch & stock deduct.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          {/* Task 3: Stock Counting */}
          <TouchableOpacity
            style={styles.taskCard}
            onPress={() => handleTaskPress('STOCK_COUNT', 'Stock Counting')}
            activeOpacity={0.8}
          >
            <View style={[styles.taskIconCircle, { backgroundColor: '#10B981' }]}>
              <Ionicons name="layers-outline" size={24} color="#FFFFFF" />
            </View>
            <View style={styles.taskInfo}>
              <View style={styles.taskTitleRow}>
                <Text style={styles.taskTitle}>Stock Counting</Text>
                <View style={[styles.taskBadge, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                  <Text style={[styles.taskBadgeText, { color: '#6EE7B7' }]}>Audit</Text>
                </View>
              </View>
              <Text style={styles.taskDesc}>
                Physical count vs recorded stock. Detect discrepancies & calculate warehouse variance.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>
        </View>

        {/* Secondary / Operational Section */}
        <Text style={styles.sectionTitle}>Operational Control</Text>
        <View style={styles.quickActionsRow}>
          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => Alert.alert('Exceptions', 'Exceptions & supervisor override review will be connected here.')}
            activeOpacity={0.7}
          >
            <Ionicons name="warning-outline" size={22} color="#F59E0B" />
            <Text style={styles.quickActionText}>Exceptions</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => Alert.alert('History', 'Audit log & transaction history will be connected here.')}
            activeOpacity={0.7}
          >
            <Ionicons name="time-outline" size={22} color="#38BDF8" />
            <Text style={styles.quickActionText}>Audit Logs</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => Alert.alert('Inventory Master', 'Product & batch records list.')}
            activeOpacity={0.7}
          >
            <Ionicons name="file-tray-full-outline" size={22} color="#A78BFA" />
            <Text style={styles.quickActionText}>Inventory</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 8,
  },
  userInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    borderColor: '#38BDF8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  greetingText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerContainer: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  bannerTextGroup: {
    flex: 1,
    marginRight: 12,
  },
  bannerCompany: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#38BDF8',
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 2,
  },
  bannerSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    lineHeight: 16,
  },
  bannerIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  metricIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  metricLabel: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
    textAlign: 'center',
    fontWeight: '500',
  },
  tasksContainer: {
    gap: 12,
    marginBottom: 24,
  },
  taskCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  taskInfo: {
    flex: 1,
    marginRight: 8,
  },
  taskTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  taskBadge: {
    backgroundColor: 'rgba(2, 132, 199, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  taskBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#38BDF8',
  },
  taskDesc: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 16,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quickActionCard: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    gap: 6,
  },
  quickActionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#CBD5E1',
  },
});

