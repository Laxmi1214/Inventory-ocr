import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getInventoryMetrics, InventoryMetrics } from '../services/inventoryService';

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
}: DashboardScreenProps) {
  const roleBadge = getRoleBadge(user.role);
  const displayName = user.fullName || user.username || user.email.split('@')[0] || 'Staff';

  const [metrics, setMetrics] = useState<InventoryMetrics>({
    totalInStock: 950,
    totalIncome: 650,
    totalGo: 20,
    medicineCount: 3,
  });

  const loadMetrics = async () => {
    try {
      const data = await getInventoryMetrics();
      setMetrics(data);
    } catch (e) {
      console.warn('Failed to load metrics:', e);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  const handleTaskPress = (taskId: string, title: string) => {
    if (onSelectTask) {
      onSelectTask(taskId);
    } else {
      Alert.alert(title, `Selected: ${title}\n(Workflow screens active)`);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
});
