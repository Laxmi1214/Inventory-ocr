import React, { useEffect, useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { getAuditTasks, StockAuditTask } from '../services/auditService';

interface StockCountListScreenProps {
  onBack: () => void;
  onSelectTask: (task: StockAuditTask) => void;
}

export default function StockCountListScreen({
  onBack,
  onSelectTask,
}: StockCountListScreenProps) {
  const [tasks, setTasks] = useState<StockAuditTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');
  const [dataSource, setDataSource] = useState<'database' | 'fallback'>('database');

  const loadTasks = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    const result = await getAuditTasks();
    setTasks(result.data);
    setDataSource(result.source);
    setIsLoading(false);
    setIsRefreshing(false);
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const onRefresh = () => {
    setIsRefreshing(true);
    loadTasks(false);
  };

  // Distinct locations for quick filters
  const locationList = useMemo(() => {
    const locs = Array.from(new Set(tasks.map((t) => t.locationCode).filter(Boolean)));
    return ['ALL', ...locs];
  }, [tasks]);

  // Filtered tasks based on search & location
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // 1. Location filter
      if (selectedLocation !== 'ALL' && task.locationCode !== selectedLocation) {
        return false;
      }

      // 2. Search query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const matchName = task.productName?.toLowerCase().includes(q);
      const matchSku = task.sku?.toLowerCase().includes(q);
      const matchBatch = task.batchNumber?.toLowerCase().includes(q);
      const matchLoc = task.locationCode?.toLowerCase().includes(q);

      return matchName || matchSku || matchBatch || matchLoc;
    });
  }, [tasks, selectedLocation, searchQuery]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* Top Navigation Bar */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#F8FAFC" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Stock Counting & Audit</Text>
          <Text style={styles.headerSubtitle}>Workflow 3: Physical Cycle Audit</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh} activeOpacity={0.7}>
          <Ionicons name="refresh" size={20} color="#38BDF8" />
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color="#64748B" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by Medicine, SKU, Batch, or Rack..."
          placeholderTextColor="#64748B"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color="#64748B" />
          </TouchableOpacity>
        )}
      </View>

      {/* Location Filter Pills */}
      <View style={styles.filterScrollContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {locationList.map((loc) => {
            const isSelected = selectedLocation === loc;
            return (
              <TouchableOpacity
                key={loc}
                style={[styles.filterPill, isSelected && styles.filterPillActive]}
                onPress={() => setSelectedLocation(loc)}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterPillText, isSelected && styles.filterPillTextActive]}>
                  {loc === 'ALL' ? 'All Locations' : loc}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Data Source Indicator */}
      <View style={styles.sourceIndicatorRow}>
        <View
          style={[
            styles.sourceDot,
            { backgroundColor: dataSource === 'database' ? '#10B981' : '#F59E0B' },
          ]}
        />
        <Text style={styles.sourceText}>
          {dataSource === 'database'
            ? 'Connected: Live PostgreSQL Inventory Records'
            : 'Offline Cache: Standalone Warehouse Fallback'}
        </Text>
        <Text style={styles.countBadgeText}>{filteredTasks.length} items</Text>
      </View>

      {/* Task List */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Loading warehouse inventory records...</Text>
        </View>
      ) : filteredTasks.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="file-tray-outline" size={48} color="#475569" />
          <Text style={styles.emptyTitle}>No Inventory Items Found</Text>
          <Text style={styles.emptyDesc}>Try adjusting your search query or location filter.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#38BDF8" />
          }
        >
          {filteredTasks.map((task) => {
            const hasRecentAudit = !!task.lastAudit;
            const isMatched = task.lastAudit?.status === 'MATCHED';
            const isVariance = task.lastAudit?.status === 'PENDING_SUPERVISOR_APPROVAL';

            return (
              <TouchableOpacity
                key={task.inventoryId}
                style={styles.card}
                onPress={() => onSelectTask(task)}
                activeOpacity={0.8}
              >
                {/* Card Top Row: Location & Status */}
                <View style={styles.cardHeader}>
                  <View style={styles.locationBadge}>
                    <Ionicons name="location-outline" size={14} color="#38BDF8" style={{ marginRight: 4 }} />
                    <Text style={styles.locationText}>{task.locationCode}</Text>
                  </View>

                  {hasRecentAudit ? (
                    <View
                      style={[
                        styles.auditStatusBadge,
                        {
                          backgroundColor: isMatched
                            ? 'rgba(16, 185, 129, 0.15)'
                            : isVariance
                            ? 'rgba(239, 68, 68, 0.15)'
                            : 'rgba(56, 189, 248, 0.15)',
                        },
                      ]}
                    >
                      <Ionicons
                        name={isMatched ? 'checkmark-circle' : isVariance ? 'alert-circle' : 'time'}
                        size={12}
                        color={isMatched ? '#10B981' : isVariance ? '#EF4444' : '#38BDF8'}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.auditStatusText,
                          { color: isMatched ? '#10B981' : isVariance ? '#EF4444' : '#38BDF8' },
                        ]}
                      >
                        {isMatched ? '100% MATCHED' : isVariance ? 'VARIANCE PENDING' : 'AUDITED'}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingBadgeText}>NEEDS AUDIT</Text>
                    </View>
                  )}
                </View>

                {/* Medicine Name & SKU */}
                <Text style={styles.productName}>{task.productName}</Text>
                <Text style={styles.skuText}>SKU: {task.sku}</Text>

                {/* Batch & System Quantity Row */}
                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>BATCH / LOT</Text>
                    <Text style={styles.metaValueMono}>{task.batchNumber || 'N/A'}</Text>
                  </View>
                  <View style={styles.metaDivider} />
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>SYSTEM RECORD</Text>
                    <Text style={styles.systemQtyText}>{task.systemQty} units</Text>
                  </View>
                  <View style={styles.actionArrow}>
                    <Ionicons name="chevron-forward" size={18} color="#64748B" />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  searchInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 14,
  },
  filterScrollContainer: {
    marginTop: 10,
    paddingBottom: 4,
  },
  filterRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterPill: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterPillActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  filterPillText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  sourceIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  sourceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  sourceText: {
    color: '#94A3B8',
    fontSize: 11,
    flex: 1,
  },
  countBadgeText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 12,
  },
  emptyTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
  emptyDesc: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  locationText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  auditStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  auditStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  pendingBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pendingBadgeText: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '700',
  },
  productName: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  skuText: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 10,
  },
  metaItem: {
    flex: 1,
  },
  metaDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#334155',
    marginHorizontal: 12,
  },
  metaLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metaValueMono: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  systemQtyText: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '700',
  },
  actionArrow: {
    marginLeft: 8,
  },
});
