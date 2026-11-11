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
import {
  getInboundShipments,
  InboundShipmentWithItems,
  ExpectedProductItem,
} from '../services/receiving';

interface ReceivingPOScreenProps {
  onBack: () => void;
  onSelectPO: (shipment: InboundShipmentWithItems) => void;
}

export default function ReceivingPOScreen({ onBack, onSelectPO }: ReceivingPOScreenProps) {
  const [shipments, setShipments] = useState<InboundShipmentWithItems[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'>('ALL');
  const [dataSource, setDataSource] = useState<'database' | 'fallback'>('database');

  const loadShipments = async (showLoadingIndicator = true) => {
    if (showLoadingIndicator) setIsLoading(true);
    const result = await getInboundShipments();
    setShipments(result.data);
    setDataSource(result.source);
    setIsLoading(false);
    setIsRefreshing(false);
  };

  useEffect(() => {
    loadShipments();
  }, []);

  const onRefresh = () => {
    setIsRefreshing(true);
    loadShipments(false);
  };

  // Filter shipments based on search text and status tab
  const filteredShipments = useMemo(() => {
    return shipments.filter((s) => {
      // 1. Status Filter
      if (selectedFilter !== 'ALL' && s.status !== selectedFilter) {
        return false;
      }

      // 2. Search Query (PO Number, Supplier Name, or Product Name/SKU)
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase().trim();
      const matchPO = s.poNumber.toLowerCase().includes(q);
      const matchSupplier = s.supplierName.toLowerCase().includes(q);
      const matchItem = s.items.some(
        (item) =>
          item.product?.name.toLowerCase().includes(q) ||
          item.product?.sku.toLowerCase().includes(q) ||
          (item.expectedBatch && item.expectedBatch.toLowerCase().includes(q))
      );

      return matchPO || matchSupplier || matchItem;
    });
  }, [shipments, searchQuery, selectedFilter]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return { label: 'Completed', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)' };
      case 'IN_PROGRESS':
        return { label: 'In Progress', color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.15)' };
      case 'DISCREPANCY':
        return { label: 'Discrepancy', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)' };
      default:
        return { label: 'Pending', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)' };
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
      return 'Today';
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#F8FAFC" />
        </TouchableOpacity>
        <View style={styles.headerTitleGroup}>
          <Text style={styles.headerTitle}>Goods Reception</Text>
          <Text style={styles.headerSubtitle}>Select Inbound Shipment (PO / ASN)</Text>
        </View>
        <View
          style={[
            styles.sourceBadge,
            { backgroundColor: dataSource === 'database' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)' },
          ]}
        >
          <Ionicons
            name={dataSource === 'database' ? 'cloud-done-outline' : 'cube-outline'}
            size={12}
            color={dataSource === 'database' ? '#10B981' : '#38BDF8'}
            style={{ marginRight: 4 }}
          />
          <Text
            style={[
              styles.sourceBadgeText,
              { color: dataSource === 'database' ? '#10B981' : '#38BDF8' },
            ]}
          >
            {dataSource === 'database' ? 'Live DB' : 'Demo'}
          </Text>
        </View>
      </View>

      {/* Search Input Bar */}
      <View style={styles.searchSection}>
        <View style={styles.searchInputWrapper}>
          <Ionicons name="search-outline" size={18} color="#64748B" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search PO, Supplier, or Medicine..."
            placeholderTextColor="#64748B"
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Filter Tabs */}
        <View style={styles.filterTabsRow}>
          {(['ALL', 'PENDING', 'IN_PROGRESS', 'COMPLETED'] as const).map((filter) => {
            const isSelected = selectedFilter === filter;
            const label =
              filter === 'ALL'
                ? 'All Orders'
                : filter === 'PENDING'
                ? 'Pending'
                : filter === 'IN_PROGRESS'
                ? 'In Progress'
                : 'Completed';

            return (
              <TouchableOpacity
                key={filter}
                style={[styles.filterChip, isSelected && styles.filterChipActive]}
                onPress={() => setSelectedFilter(filter)}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Main Content Area */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#0284C7" />
          <Text style={styles.loadingText}>Loading active inbound shipments...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollList}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#38BDF8" />
          }
        >
          {filteredShipments.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="file-tray-outline" size={38} color="#64748B" />
              </View>
              <Text style={styles.emptyTitle}>No Inbound Shipments Found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? `No orders match "${searchQuery}". Try a different search term.`
                  : 'There are currently no purchase orders matching this filter.'}
              </Text>
            </View>
          ) : (
            filteredShipments.map((shipment) => {
              const statusBadge = getStatusBadge(shipment.status);
              const totalItems = shipment.items.length;
              const totalExpectedUnits = shipment.items.reduce(
                (sum, item) => sum + (item.expectedQty || 0),
                0
              );
              const totalReceivedUnits = shipment.items.reduce(
                (sum, item) => sum + (item.receivedQty || 0),
                0
              );
              const progressPct =
                totalExpectedUnits > 0
                  ? Math.min(100, Math.round((totalReceivedUnits / totalExpectedUnits) * 100))
                  : 0;

              return (
                <View key={shipment.id} style={styles.shipmentCard}>
                  {/* Card Header */}
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.poNumberGroup}>
                      <View style={styles.poIconBox}>
                        <Ionicons name="document-text-outline" size={18} color="#38BDF8" />
                      </View>
                      <Text style={styles.poNumberText}>{shipment.poNumber}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: statusBadge.color }]}>
                        {statusBadge.label}
                      </Text>
                    </View>
                  </View>

                  {/* Supplier & Delivery Details */}
                  <View style={styles.supplierRow}>
                    <Ionicons name="business-outline" size={15} color="#94A3B8" style={{ marginRight: 6 }} />
                    <Text style={styles.supplierText} numberOfLines={1}>
                      {shipment.supplierName}
                    </Text>
                  </View>

                  <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                      <Ionicons name="calendar-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                      <Text style={styles.metaText}>Expected: {formatDate(shipment.expectedDeliveryDate)}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons name="layers-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                      <Text style={styles.metaText}>
                        {totalItems} {totalItems === 1 ? 'Product' : 'Products'} ({totalExpectedUnits} units)
                      </Text>
                    </View>
                  </View>

                  {shipment.notes ? (
                    <View style={styles.notesBox}>
                      <Ionicons name="information-circle-outline" size={14} color="#38BDF8" style={{ marginRight: 6 }} />
                      <Text style={styles.notesText}>{shipment.notes}</Text>
                    </View>
                  ) : null}

                  {/* Divider */}
                  <View style={styles.divider} />

                  {/* Expected Medicines List */}
                  <View style={styles.itemsSection}>
                    <View style={styles.itemsHeaderRow}>
                      <Text style={styles.itemsSectionTitle}>EXPECTED MEDICINES</Text>
                      <Text style={styles.itemsCountText}>
                        {totalReceivedUnits} / {totalExpectedUnits} units received
                      </Text>
                    </View>

                    {/* Overall Progress Bar */}
                    <View style={styles.progressBarBackground}>
                      <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
                    </View>

                    {/* List of Products inside this PO */}
                    <View style={styles.itemsList}>
                      {shipment.items.map((item: ExpectedProductItem) => {
                        const productName = item.product?.name || 'Pharmaceutical Item';
                        const sku = item.product?.sku || 'SKU-UNKNOWN';
                        const packSize = item.product?.packSize;
                        const itemReceived = item.receivedQty || 0;
                        const itemExpected = item.expectedQty || 0;
                        const isVerified = itemReceived >= itemExpected && itemExpected > 0;

                        return (
                          <View key={item.id} style={styles.itemRow}>
                            <View style={styles.itemBulletCircle}>
                              <Ionicons
                                name={isVerified ? 'checkmark' : 'medkit-outline'}
                                size={14}
                                color={isVerified ? '#10B981' : '#38BDF8'}
                              />
                            </View>
                            <View style={styles.itemInfo}>
                              <Text style={styles.itemTitle}>{productName}</Text>
                              <View style={styles.itemTagRow}>
                                <View style={styles.itemTag}>
                                  <Text style={styles.itemTagText}>SKU: {sku}</Text>
                                </View>
                                {item.expectedBatch && (
                                  <View style={styles.itemTag}>
                                    <Text style={styles.itemTagText}>Lot: {item.expectedBatch}</Text>
                                  </View>
                                )}
                                {packSize && (
                                  <View style={styles.itemTag}>
                                    <Text style={styles.itemTagText}>{packSize}</Text>
                                  </View>
                                )}
                              </View>
                            </View>
                            <View style={styles.itemQtyCol}>
                              <Text style={styles.itemQtyVal}>
                                {itemReceived} / <Text style={styles.itemQtyTotal}>{itemExpected}</Text>
                              </Text>
                              <Text style={styles.itemQtyUnit}>{item.product?.unit || 'Units'}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  {/* Action CTA Button */}
                  <TouchableOpacity
                    style={styles.selectPOButton}
                    onPress={() => onSelectPO(shipment)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="scan-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={styles.selectPOButtonText}>Select PO for Receiving</Text>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 'auto' }} />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTitleGroup: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sourceBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 10,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 14,
  },
  filterTabsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterChipActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  centerContainer: {
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
  scrollList: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
  },
  shipmentCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  poNumberGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  poIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  poNumberText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  supplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  supplierText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#CBD5E1',
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  notesBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
  },
  notesText: {
    fontSize: 12,
    color: '#38BDF8',
    flex: 1,
    lineHeight: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 10,
  },
  itemsSection: {
    marginBottom: 16,
  },
  itemsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  itemsSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.8,
  },
  itemsCountText: {
    fontSize: 11,
    color: '#38BDF8',
    fontWeight: '600',
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: '#0F172A',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 2,
  },
  itemsList: {
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  itemBulletCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  itemInfo: {
    flex: 1,
    marginRight: 8,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  itemTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  itemTag: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  itemTagText: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  itemQtyCol: {
    alignItems: 'flex-end',
  },
  itemQtyVal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  itemQtyTotal: {
    color: '#94A3B8',
    fontSize: 12,
  },
  itemQtyUnit: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  selectPOButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284C7',
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 14,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 3,
  },
  selectPOButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});

