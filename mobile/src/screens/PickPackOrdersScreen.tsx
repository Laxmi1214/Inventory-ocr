import React, { useEffect, useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Platform,
  StatusBar as RNStatusBar,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getOutboundOrders, OutboundOrder } from '../services/dispatch';

interface PickPackOrdersScreenProps {
  onBack: () => void;
  onSelectOrder: (order: OutboundOrder) => void;
}

export default function PickPackOrdersScreen({
  onBack,
  onSelectOrder,
}: PickPackOrdersScreenProps) {
  const [orders, setOrders] = useState<OutboundOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'PENDING' | 'DISPATCHED'>('ALL');
  const [dataSource, setDataSource] = useState<'database' | 'local_cache' | 'seed'>('database');

  const loadOrders = async (showLoadingIndicator = true) => {
    if (showLoadingIndicator) setIsLoading(true);
    const result = await getOutboundOrders();
    setOrders(result.data);
    setDataSource(result.source);
    setIsLoading(false);
    setIsRefreshing(false);
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const onRefresh = () => {
    setIsRefreshing(true);
    loadOrders(false);
  };

  // Filter orders based on status and search query
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // 1. Status Filter
      if (selectedFilter === 'PENDING' && order.status === 'DISPATCHED') {
        return false;
      }
      if (selectedFilter === 'DISPATCHED' && order.status !== 'DISPATCHED') {
        return false;
      }

      // 2. Search Query (Order Number, Customer, Medicine Name, or SKU)
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const matchOrder = order.orderNumber.toLowerCase().includes(q);
      const matchCustomer = order.customerName.toLowerCase().includes(q);
      const matchItem = order.items.some(
        (i) =>
          i.productName.toLowerCase().includes(q) ||
          i.sku.toLowerCase().includes(q) ||
          (i.suggestedBatch && i.suggestedBatch.toLowerCase().includes(q))
      );

      return matchOrder || matchCustomer || matchItem;
    });
  }, [orders, searchQuery, selectedFilter]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DISPATCHED':
      case 'COMPLETED':
        return { label: 'Dispatched', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)' };
      case 'IN_PROGRESS':
        return { label: 'In Progress', color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.15)' };
      default:
        return { label: 'Ready to Pick', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)' };
    }
  };

  const getPriorityBadge = (priority?: string) => {
    switch (priority) {
      case 'URGENT':
        return { label: 'URGENT', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)' };
      case 'COLD_CHAIN':
        return { label: 'COLD CHAIN 2-8°C', color: '#06B6D4', bg: 'rgba(6, 182, 212, 0.15)' };
      default:
        return { label: 'STANDARD FIFO', color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.12)' };
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Today / ASAP';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Top App Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color="#F8FAFC" />
          </TouchableOpacity>
          <View style={styles.titleContainer}>
            <Text style={styles.screenTitle}>Pick & Pack (Go)</Text>
            <Text style={styles.screenSubtitle}>Select Outbound Order to Fulfill</Text>
          </View>
          <TouchableOpacity style={styles.refreshIconBtn} onPress={onRefresh} activeOpacity={0.7}>
            <Ionicons name="refresh" size={20} color="#38BDF8" />
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#64748B" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search order #, hospital, drug, or SKU..."
              placeholderTextColor="#64748B"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close-circle" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Status Filter Tabs */}
        <View style={styles.filterTabs}>
          {(['ALL', 'PENDING', 'DISPATCHED'] as const).map((tab) => {
            const count =
              tab === 'ALL'
                ? orders.length
                : tab === 'PENDING'
                ? orders.filter((o) => o.status !== 'DISPATCHED').length
                : orders.filter((o) => o.status === 'DISPATCHED').length;

            const isSelected = selectedFilter === tab;

            return (
              <TouchableOpacity
                key={tab}
                style={[styles.filterTab, isSelected && styles.filterTabActive]}
                onPress={() => setSelectedFilter(tab)}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterTabText, isSelected && styles.filterTabTextActive]}>
                  {tab === 'ALL' ? 'All Orders' : tab === 'PENDING' ? 'Pending' : 'Dispatched'}
                </Text>
                <View style={[styles.tabCountBadge, isSelected && styles.tabCountBadgeActive]}>
                  <Text style={[styles.tabCountText, isSelected && styles.tabCountTextActive]}>
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Orders Scroll List */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#F59E0B" />
            <Text style={styles.loadingText}>Loading Outbound Orders...</Text>
          </View>
        ) : filteredOrders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="cart-outline" size={38} color="#64748B" />
            </View>
            <Text style={styles.emptyTitle}>No Orders Found</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? `No orders match "${searchQuery}".\n\n👉 Tip: Search by Hospital/Pharmacy name (e.g. "Apollo", "Fortis") or Order Number (e.g. "ORD-2026-4412").`
                : 'All outbound customer orders have been fulfilled and dispatched.'}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#F59E0B" />
            }
          >
            {filteredOrders.map((order) => {
              const statusBadge = getStatusBadge(order.status);
              const priorityBadge = getPriorityBadge(order.priority);
              const primaryItem = order.items[0];
              const isDispatched = order.status === 'DISPATCHED';

              return (
                <View key={order.id} style={styles.orderCard}>
                  {/* Card Header: Order Number, Priority, Status */}
                  <View style={styles.cardHeader}>
                    <View style={styles.orderNumberGroup}>
                      <View style={styles.orderIconSquare}>
                        <Ionicons name="cart" size={18} color="#F59E0B" />
                      </View>
                      <View>
                        <Text style={styles.orderNumber}>{order.orderNumber}</Text>
                        <View style={[styles.priorityBadge, { backgroundColor: priorityBadge.bg }]}>
                          <Text style={[styles.priorityText, { color: priorityBadge.color }]}>
                            {priorityBadge.label}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg }]}>
                      <Text style={[styles.statusText, { color: statusBadge.color }]}>
                        {statusBadge.label}
                      </Text>
                    </View>
                  </View>

                  {/* Customer / Hospital */}
                  <View style={styles.customerRow}>
                    <Ionicons name="business-outline" size={16} color="#94A3B8" />
                    <Text style={styles.customerName}>{order.customerName}</Text>
                  </View>

                  {/* Item Details Box */}
                  {primaryItem && (
                    <View style={styles.itemBox}>
                      <View style={styles.itemHeaderRow}>
                        <Text style={styles.itemName} numberOfLines={1}>
                          {primaryItem.productName}
                        </Text>
                        <View style={styles.qtyBadge}>
                          <Text style={styles.qtyBadgeText}>
                            {primaryItem.requiredQty} units
                          </Text>
                        </View>
                      </View>

                      <View style={styles.itemSubRow}>
                        <Text style={styles.itemSku}>SKU: {primaryItem.sku}</Text>
                        {primaryItem.suggestedBatch && (
                          <Text style={styles.batchTag}>
                            FIFO Batch: {primaryItem.suggestedBatch}
                          </Text>
                        )}
                      </View>

                      {order.items.length > 1 && (
                        <Text style={styles.moreItemsText}>
                          +{order.items.length - 1} more item(s) in this order
                        </Text>
                      )}
                    </View>
                  )}

                  {/* Notes / Special Instructions */}
                  {order.notes && (
                    <View style={styles.notesRow}>
                      <Ionicons name="information-circle-outline" size={14} color="#64748B" />
                      <Text style={styles.notesText} numberOfLines={1}>
                        {order.notes}
                      </Text>
                    </View>
                  )}

                  {/* Card Footer: Due Date & Action Button */}
                  <View style={styles.cardFooter}>
                    <View style={styles.dueDateGroup}>
                      <Text style={styles.dueDateLabel}>Dispatch Target</Text>
                      <Text style={styles.dueDateVal}>{formatDate(order.deliveryDate)}</Text>
                    </View>

                    <TouchableOpacity
                      style={[styles.pickButton, isDispatched && styles.pickButtonDone]}
                      onPress={() => onSelectOrder(order)}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={isDispatched ? 'checkmark-circle-outline' : 'barcode-outline'}
                        size={18}
                        color="#FFFFFF"
                      />
                      <Text style={styles.pickButtonText}>
                        {isDispatched ? 'Review Pack' : 'Scan & Pick'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0,
  },
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
    marginLeft: 12,
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  screenSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  refreshIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#F8FAFC',
    paddingVertical: 0,
  },
  filterTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 6,
  },
  filterTabActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#F59E0B',
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  filterTabTextActive: {
    color: '#F59E0B',
  },
  tabCountBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tabCountBadgeActive: {
    backgroundColor: '#F59E0B',
  },
  tabCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
  },
  tabCountTextActive: {
    color: '#0F172A',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#94A3B8',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  orderCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderNumberGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  orderIconSquare: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  priorityText: {
    fontSize: 9,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  customerName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#CBD5E1',
  },
  itemBox: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 6,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
    marginRight: 8,
  },
  qtyBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  qtyBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F59E0B',
  },
  itemSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemSku: {
    fontSize: 11,
    color: '#64748B',
  },
  batchTag: {
    fontSize: 11,
    fontWeight: '600',
    color: '#38BDF8',
  },
  moreItemsText: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  notesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  notesText: {
    fontSize: 11,
    color: '#64748B',
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 12,
    marginTop: 4,
  },
  dueDateGroup: {
    gap: 2,
  },
  dueDateLabel: {
    fontSize: 10,
    color: '#64748B',
    textTransform: 'uppercase',
  },
  dueDateVal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E2E8F0',
  },
  pickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F59E0B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  pickButtonDone: {
    backgroundColor: '#10B981',
  },
  pickButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
