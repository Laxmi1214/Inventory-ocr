import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getInventoryMetrics, InventoryMetrics } from '../services/inventoryService';
import { getPendingDiscrepancies } from '../services/supervisorService';

export interface UserSession {
  email: string;
  fullName?: string;
  role?: string;
  username?: string;
  id?: string;
}

interface DashboardScreenProps {
  user: UserSession;
  onLogout: () => void;
  onSelectTask?: (taskType: string) => void;
  onOpenOcrScanner?: () => void;
  onOpenSupervisorExceptions?: () => void;
  onOpenMasterData?: () => void;
  onOpenUserManagement?: () => void;
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

export default function DashboardScreen({
  user,
  onLogout,
  onSelectTask,
  onOpenOcrScanner,
  onOpenSupervisorExceptions,
  onOpenMasterData,
  onOpenUserManagement,
}: DashboardScreenProps) {
  const roleBadge = getRoleBadge(user.role);
  const displayName = user.fullName || user.username || user.email.split('@')[0] || 'Staff';
  const isSupervisorOrAdmin = user.role === 'SUPERVISOR' || user.role === 'SYSTEM_ADMIN';
  const isInventoryAdmin = user.role === 'INVENTORY_ADMIN' || user.role === 'SYSTEM_ADMIN';
  const isSystemAdmin = user.role === 'SYSTEM_ADMIN';
  const isOperatorOnly = !isSupervisorOrAdmin && !isInventoryAdmin && !isSystemAdmin;

  const [metrics, setMetrics] = useState<InventoryMetrics>({
    totalInStock: 250,
    totalIncome: 250,
    totalGo: 0,
    medicineCount: 5,
  });

  const [pendingExceptionsCount, setPendingExceptionsCount] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadMetrics = async () => {
    try {
      const data = await getInventoryMetrics();
      setMetrics(data);

      if (isSupervisorOrAdmin) {
        const discSummary = await getPendingDiscrepancies();
        setPendingExceptionsCount(discSummary.totalPending || 0);
      }
    } catch (e) {
      console.warn('Failed to load metrics:', e);
    }
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadMetrics();
    setIsRefreshing(false);
  };

  useEffect(() => {
    loadMetrics();
  }, [user.role]);

  const handleTaskPress = (taskId: string, title: string) => {
    if (onSelectTask) {
      onSelectTask(taskId);
    } else {
      Alert.alert(title, `Selected: ${title}\n(Workflow screens active)`);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#38BDF8" />
        }
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

          <TouchableOpacity style={styles.logoutButton} onPress={onLogout} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={20} color="#F43F5E" />
          </TouchableOpacity>
        </View>

        {/* Brand Banner */}
        <View style={styles.bannerContainer}>
          <View style={styles.bannerTextGroup}>
            <Text style={styles.bannerCompany}>CONGIOTECH</Text>
            <Text style={styles.bannerTitle}>Medicine Stock & OCR Verification</Text>
            <Text style={styles.bannerSubtitle}>
              Real-time balance of inventory, inbound intake, and outbound dispatch
            </Text>
          </View>
          <View style={styles.bannerIconBadge}>
            <Ionicons name="shield-checkmark" size={26} color="#0284C7" />
          </View>
        </View>

        {/* Live Medicine Inventory Metrics: In Stock, Income, Go */}
        <Text style={styles.sectionTitle}>Medicine Inventory Balance</Text>
        <View style={styles.metricsRow}>
          {/* Card 1: In Stock */}
          <View style={[styles.metricCard, styles.metricCardStock]}>
            <View style={[styles.metricIconCircle, { backgroundColor: 'rgba(56, 189, 248, 0.15)' }]}>
              <Ionicons name="cube" size={18} color="#38BDF8" />
            </View>
            <Text style={styles.metricValue}>{metrics.totalInStock.toLocaleString()}</Text>
            <Text style={styles.metricLabel}>In Stock</Text>
            <Text style={styles.metricSubLabel}>{metrics.medicineCount} Product Lines</Text>
          </View>

          {/* Card 2: Income (Inbound) */}
          <View style={[styles.metricCard, styles.metricCardIncome]}>
            <View style={[styles.metricIconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <Ionicons name="arrow-down-circle" size={18} color="#10B981" />
            </View>
            <Text style={[styles.metricValue, { color: '#10B981' }]}>
              +{metrics.totalIncome.toLocaleString()}
            </Text>
            <Text style={styles.metricLabel}>Total Income</Text>
            <Text style={styles.metricSubLabel}>Goods Received</Text>
          </View>

          {/* Card 3: Go (Outbound) */}
          <View style={[styles.metricCard, styles.metricCardGo]}>
            <View style={[styles.metricIconCircle, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
              <Ionicons name="arrow-up-circle" size={18} color="#F59E0B" />
            </View>
            <Text style={[styles.metricValue, { color: '#F59E0B' }]}>
              -{metrics.totalGo.toLocaleString()}
            </Text>
            <Text style={styles.metricLabel}>Total Go</Text>
            <Text style={styles.metricSubLabel}>Dispatched / Sold</Text>
          </View>
        </View>

        {/* Supervisor Discrepancy & Override Section (FR-11 / AC-07) */}
        {isSupervisorOrAdmin && (
          <View style={styles.supervisorSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Supervisor Authorization</Text>
              <View
                style={[
                  styles.priorityPill,
                  {
                    backgroundColor:
                      pendingExceptionsCount > 0
                        ? 'rgba(239, 68, 68, 0.15)'
                        : 'rgba(16, 185, 129, 0.15)',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.priorityPillText,
                    { color: pendingExceptionsCount > 0 ? '#EF4444' : '#10B981' },
                  ]}
                >
                  {pendingExceptionsCount > 0
                    ? `${pendingExceptionsCount} Discrepancies Pending`
                    : 'All Exceptions Reconciled'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.supervisorCard}
              onPress={onOpenSupervisorExceptions}
              activeOpacity={0.8}
            >
              <View style={styles.supervisorIconBox}>
                <Ionicons name="shield-checkmark" size={24} color="#8B5CF6" />
              </View>
              <View style={styles.supervisorCardInfo}>
                <View style={styles.supervisorTitleRow}>
                  <Text style={styles.supervisorCardTitle}>Exception & Override Inbox</Text>
                  <View style={styles.rbacTag}>
                    <Text style={styles.rbacTagText}>FR-11</Text>
                  </View>
                </View>
                <Text style={styles.supervisorCardDesc}>
                  Review quarantined PO goods and approve/reject stock count variances with audit notes.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#8B5CF6" />
            </TouchableOpacity>
          </View>
        )}

        {/* Inventory Admin Master Data Section (BRD 2.2 / FR-01) */}
        {isInventoryAdmin && (
          <View style={styles.masterDataSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Master Data Administration</Text>
              <View style={[styles.priorityPill, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <Text style={[styles.priorityPillText, { color: '#10B981' }]}>Admin Access</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.masterDataCard}
              onPress={onOpenMasterData}
              activeOpacity={0.8}
            >
              <View style={styles.masterDataIconBox}>
                <Ionicons name="server" size={24} color="#10B981" />
              </View>
              <View style={styles.masterDataCardInfo}>
                <View style={styles.supervisorTitleRow}>
                  <Text style={styles.masterDataCardTitle}>Master Data Catalog</Text>
                  <View style={[styles.rbacTag, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                    <Text style={[styles.rbacTagText, { color: '#6EE7B7' }]}>BRD 2.2</Text>
                  </View>
                </View>
                <Text style={styles.supervisorCardDesc}>
                  Maintain products catalog, register batches, and allocate warehouse rack locations.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#10B981" />
            </TouchableOpacity>
          </View>
        )}

        {/* System Admin User Management Section (BRD 2.2 / FR-01) */}
        {isSystemAdmin && (
          <View style={styles.systemAdminSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>System Administration</Text>
              <View style={[styles.priorityPill, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                <Text style={[styles.priorityPillText, { color: '#F59E0B' }]}>System Admin</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.systemAdminCard}
              onPress={onOpenUserManagement}
              activeOpacity={0.8}
            >
              <View style={styles.systemAdminIconBox}>
                <Ionicons name="people" size={24} color="#F59E0B" />
              </View>
              <View style={styles.masterDataCardInfo}>
                <View style={styles.supervisorTitleRow}>
                  <Text style={styles.masterDataCardTitle}>Staff & Role Management</Text>
                  <View style={[styles.rbacTag, { backgroundColor: 'rgba(245, 158, 11, 0.2)' }]}>
                    <Text style={[styles.rbacTagText, { color: '#FCD34D' }]}>RBAC</Text>
                  </View>
                </View>
                <Text style={styles.supervisorCardDesc}>
                  Manage staff accounts, assign warehouse roles, and configure system access permissions.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#F59E0B" />
            </TouchableOpacity>
          </View>
        )}

        {/* Operator Role Floor Notice */}
        {isOperatorOnly && (
          <View style={styles.operatorNoticeBox}>
            <Ionicons name="information-circle-outline" size={18} color="#38BDF8" />
            <Text style={styles.operatorNoticeText}>
              Operator Access: Scan barcodes, OCR labels & flag discrepancies. Override approvals require Supervisor authorization.
            </Text>
          </View>
        )}

        {/* Warehouse Workflows */}
        <Text style={styles.sectionTitle}>Standard Warehouse Tasks</Text>
        <View style={styles.tasksContainer}>
          {/* Task 1: Goods Reception (Income) */}
          <TouchableOpacity
            style={styles.taskCard}
            onPress={() => handleTaskPress('RECEIVING', 'Goods Reception (Inbound)')}
            activeOpacity={0.8}
          >
            <View style={[styles.taskIconCircle, { backgroundColor: '#10B981' }]}>
              <Ionicons name="download-outline" size={22} color="#FFFFFF" />
            </View>
            <View style={styles.taskInfo}>
              <View style={styles.taskTitleRow}>
                <Text style={styles.taskTitle}>Goods Reception (Income)</Text>
                <View style={[styles.taskBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  <Text style={[styles.taskBadgeText, { color: '#10B981' }]}>Inbound</Text>
                </View>
              </View>
              <Text style={styles.taskDesc}>
                Verify incoming deliveries against PO. Scan labels and record stock income.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          {/* Task 2: Pick & Pack (Go) */}
          <TouchableOpacity
            style={styles.taskCard}
            onPress={() => handleTaskPress('PICK_PACK', 'Pick & Pack (Outbound)')}
            activeOpacity={0.8}
          >
            <View style={[styles.taskIconCircle, { backgroundColor: '#F59E0B' }]}>
              <Ionicons name="open-outline" size={22} color="#FFFFFF" />
            </View>
            <View style={styles.taskInfo}>
              <View style={styles.taskTitleRow}>
                <Text style={styles.taskTitle}>Pick & Pack (Go / Outbound)</Text>
                <View style={[styles.taskBadge, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                  <Text style={[styles.taskBadgeText, { color: '#F59E0B' }]}>Outbound</Text>
                </View>
              </View>
              <Text style={styles.taskDesc}>
                Strict FIFO batch dispatch. Fulfill hospital orders and record outgoing inventory.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          {/* Task 3: Stock Counting */}
          <TouchableOpacity
            style={styles.taskCard}
            onPress={() => handleTaskPress('STOCK_COUNT', 'Stock Counting (Audit)')}
            activeOpacity={0.8}
          >
            <View style={[styles.taskIconCircle, { backgroundColor: '#8B5CF6' }]}>
              <Ionicons name="list-outline" size={22} color="#FFFFFF" />
            </View>
            <View style={styles.taskInfo}>
              <View style={styles.taskTitleRow}>
                <Text style={styles.taskTitle}>Stock Counting & Audit</Text>
                <View style={[styles.taskBadge, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
                  <Text style={[styles.taskBadgeText, { color: '#A78BFA' }]}>Audit</Text>
                </View>
              </View>
              <Text style={styles.taskDesc}>
                Physical cycle count and variance checking against recorded stock.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
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
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
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
    marginTop: 2,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  bannerContainer: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 24,
  },
  bannerTextGroup: {
    flex: 1,
    paddingRight: 12,
  },
  bannerCompany: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 2,
  },
  bannerTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
  },
  bannerSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 4,
  },
  bannerIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(2, 132, 199, 0.3)',
  },
  sectionTitle: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 4,
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
    alignItems: 'flex-start',
  },
  metricCardStock: {
    borderLeftWidth: 3,
    borderLeftColor: '#38BDF8',
  },
  metricCardIncome: {
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
  },
  metricCardGo: {
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  metricIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  metricValue: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
  },
  metricLabel: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  metricSubLabel: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 2,
  },
  ocrHeroButton: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#0284C7',
    marginBottom: 24,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  ocrHeroIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#0284C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ocrBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ocrHeroTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  privatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  privatePillText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '700',
  },
  ocrHeroDesc: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 3,
  },
  tasksContainer: {
    gap: 12,
  },
  taskCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  taskIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  taskTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  taskBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  taskBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  taskDesc: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 16,
  },
  // Supervisor Section
  supervisorSection: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  priorityPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  priorityPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  supervisorCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#8B5CF6',
  },
  supervisorIconBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  supervisorCardInfo: {
    flex: 1,
    marginRight: 8,
  },
  supervisorTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  supervisorCardTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  rbacTag: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  rbacTagText: {
    color: '#C4B5FD',
    fontSize: 10,
    fontWeight: '700',
  },
  supervisorCardDesc: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 17,
  },
  // Master Data Section
  masterDataSection: {
    marginBottom: 20,
  },
  masterDataCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#10B981',
  },
  masterDataIconBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  masterDataCardInfo: {
    flex: 1,
    marginRight: 8,
  },
  masterDataCardTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  // System Admin Section
  systemAdminSection: {
    marginBottom: 20,
  },
  systemAdminCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
  },
  systemAdminIconBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  // Operator Floor Notice
  operatorNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderRadius: 10,
    padding: 12,
    gap: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
  },
  operatorNoticeText: {
    color: '#BAE6FD',
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
  },
});
