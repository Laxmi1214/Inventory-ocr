import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import {
  getMasterDataSummary,
  createProduct,
  createBatch,
  allocateLocation,
  ProductRecord,
  BatchRecord,
  LocationInventoryRecord,
  LocationSummary,
} from '../services/masterDataService';

interface MasterDataScreenProps {
  onBack: () => void;
  userRole?: string;
}

export default function MasterDataScreen({ onBack, userRole }: MasterDataScreenProps) {
  const [activeTab, setActiveTab] = useState<'PRODUCTS' | 'BATCHES' | 'LOCATIONS'>('PRODUCTS');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [inventory, setInventory] = useState<LocationInventoryRecord[]>([]);
  const [locations, setLocations] = useState<LocationSummary[]>([]);

  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New Product Form State
  const [newProdName, setNewProdName] = useState('');
  const [newProdSku, setNewProdSku] = useState('');
  const [newProdBarcode, setNewProdBarcode] = useState('');
  const [newProdUnit, setNewProdUnit] = useState('BOX');
  const [newProdPackSize, setNewProdPackSize] = useState('');

  // New Batch Form State
  const [selectedProductId, setSelectedProductId] = useState('');
  const [newBatchNumber, setNewBatchNumber] = useState('');
  const [newBatchMfgDate, setNewBatchMfgDate] = useState('');
  const [newBatchExpiryDate, setNewBatchExpiryDate] = useState('');

  // New Location Form State
  const [newLocationCode, setNewLocationCode] = useState('');
  const [locProdId, setLocProdId] = useState('');
  const [locQty, setLocQty] = useState('100');

  const loadCatalog = async () => {
    try {
      const summary = await getMasterDataSummary();
      setProducts(summary.products);
      setBatches(summary.batches);
      setInventory(summary.inventory);
      setLocations(summary.locations);
      if (summary.products.length > 0 && !selectedProductId) {
        setSelectedProductId(summary.products[0].id);
        setLocProdId(summary.products[0].id);
      }
    } catch (e) {
      console.warn('Error loading master data:', e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadCatalog();
  };

  // Filtered Products
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const q = searchQuery.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.includes(q))
    );
  }, [products, searchQuery]);

  // Filtered Batches
  const filteredBatches = useMemo(() => {
    if (!searchQuery.trim()) return batches;
    const q = searchQuery.toLowerCase();
    return batches.filter(
      (b) =>
        b.batchNumber.toLowerCase().includes(q) ||
        (b.productName && b.productName.toLowerCase().includes(q)) ||
        (b.productSku && b.productSku.toLowerCase().includes(q))
    );
  }, [batches, searchQuery]);

  // Submit New Product
  const handleCreateProduct = async () => {
    if (!newProdName.trim() || !newProdSku.trim()) {
      Alert.alert('Validation Error', 'Product Name and SKU are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createProduct({
        name: newProdName.trim(),
        sku: newProdSku.trim().toUpperCase(),
        barcode: newProdBarcode.trim() || undefined,
        unit: newProdUnit,
        packSize: newProdPackSize.trim() || undefined,
      });

      if (res.success && res.product) {
        Alert.alert('Product Created', `Product "${res.product.name}" (${res.product.sku}) registered.`);
        setProducts((prev) => [res.product!, ...prev]);
        setIsProductModalOpen(false);
        setNewProdName('');
        setNewProdSku('');
        setNewProdBarcode('');
        setNewProdPackSize('');
      } else {
        Alert.alert('Error', res.error || 'Failed to create product');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to create product');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit New Batch
  const handleCreateBatch = async () => {
    if (!selectedProductId) {
      Alert.alert('Validation Error', 'Please select a parent medicine product.');
      return;
    }
    if (!newBatchNumber.trim()) {
      Alert.alert('Validation Error', 'Batch Number is required.');
      return;
    }
    if (!newBatchExpiryDate.trim()) {
      Alert.alert('Validation Error', 'Expiry Date (YYYY-MM-DD) is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createBatch({
        productId: selectedProductId,
        batchNumber: newBatchNumber.trim().toUpperCase(),
        mfgDate: newBatchMfgDate.trim() || undefined,
        expiryDate: newBatchExpiryDate.trim(),
        status: 'ACTIVE',
      });

      if (res.success && res.batch) {
        const prod = products.find((p) => p.id === selectedProductId);
        const completeBatch: BatchRecord = {
          ...res.batch,
          productName: prod?.name || 'Pharmaceutical Item',
          productSku: prod?.sku || '',
        };
        Alert.alert('Batch Created', `Batch ${res.batch.batchNumber} successfully registered.`);
        setBatches((prev) => [completeBatch, ...prev]);
        setIsBatchModalOpen(false);
        setNewBatchNumber('');
        setNewBatchMfgDate('');
        setNewBatchExpiryDate('');
      } else {
        Alert.alert('Error', res.error || 'Failed to create batch');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to create batch');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit New Location / Bay
  const handleCreateLocation = async () => {
    if (!newLocationCode.trim()) {
      Alert.alert('Validation Error', 'Rack Location Code (e.g. BAY-03) is required.');
      return;
    }
    if (!locProdId) {
      Alert.alert('Validation Error', 'Please select a product for initial bay allocation.');
      return;
    }

    setIsSubmitting(true);
    try {
      const qtyNum = parseInt(locQty, 10) || 0;
      const res = await allocateLocation({
        locationCode: newLocationCode.trim().toUpperCase(),
        productId: locProdId,
        quantity: qtyNum,
      });

      if (res.success) {
        Alert.alert(
          'Location Added',
          `Rack Location "${newLocationCode.trim().toUpperCase()}" allocated with ${qtyNum} units.`
        );
        setIsLocationModalOpen(false);
        setNewLocationCode('');
        await loadCatalog();
      } else {
        Alert.alert('Error', res.error || 'Failed to allocate location');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to allocate location');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalStockUnits = useMemo(() => {
    return inventory.reduce((sum, item) => sum + (item.quantity || 0), 0);
  }, [inventory]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#F8FAFC" />
        </TouchableOpacity>
        <View style={styles.headerTitleGroup}>
          <Text style={styles.headerTitle}>Master Data Catalog</Text>
          <Text style={styles.headerSubtitle}>Inventory & Reference Data Management (BRD 2.2)</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh} activeOpacity={0.7}>
          <Ionicons name="reload" size={18} color="#10B981" />
        </TouchableOpacity>
      </View>

      {/* Overview Metric Pills */}
      <View style={styles.metricsSummaryRow}>
        <View style={styles.summaryPill}>
          <Ionicons name="medkit-outline" size={16} color="#38BDF8" />
          <Text style={styles.summaryValue}>{products.length}</Text>
          <Text style={styles.summaryLabel}>Products</Text>
        </View>
        <View style={styles.summaryPill}>
          <Ionicons name="barcode-outline" size={16} color="#8B5CF6" />
          <Text style={styles.summaryValue}>{batches.length}</Text>
          <Text style={styles.summaryLabel}>Batches</Text>
        </View>
        <View style={styles.summaryPill}>
          <Ionicons name="grid-outline" size={16} color="#F59E0B" />
          <Text style={styles.summaryValue}>{locations.length}</Text>
          <Text style={styles.summaryLabel}>Bays</Text>
        </View>
        <View style={styles.summaryPill}>
          <Ionicons name="cube-outline" size={16} color="#10B981" />
          <Text style={[styles.summaryValue, { color: '#10B981' }]}>{totalStockUnits}</Text>
          <Text style={styles.summaryLabel}>Units</Text>
        </View>
      </View>

      {/* Category Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'PRODUCTS' && styles.activeTabButton]}
          onPress={() => {
            setActiveTab('PRODUCTS');
            setSearchQuery('');
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name="cube-outline"
            size={16}
            color={activeTab === 'PRODUCTS' ? '#10B981' : '#94A3B8'}
          />
          <Text style={[styles.tabText, activeTab === 'PRODUCTS' && styles.activeTabText]}>
            Products ({products.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'BATCHES' && styles.activeTabButton]}
          onPress={() => {
            setActiveTab('BATCHES');
            setSearchQuery('');
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name="file-tray-stacked-outline"
            size={16}
            color={activeTab === 'BATCHES' ? '#10B981' : '#94A3B8'}
          />
          <Text style={[styles.tabText, activeTab === 'BATCHES' && styles.activeTabText]}>
            Batches ({batches.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'LOCATIONS' && styles.activeTabButton]}
          onPress={() => {
            setActiveTab('LOCATIONS');
            setSearchQuery('');
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name="layers-outline"
            size={16}
            color={activeTab === 'LOCATIONS' ? '#10B981' : '#94A3B8'}
          />
          <Text style={[styles.tabText, activeTab === 'LOCATIONS' && styles.activeTabText]}>
            Racks & Stock
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search & Add Action Bar */}
      <View style={styles.actionBar}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder={
              activeTab === 'PRODUCTS'
                ? 'Search product or SKU...'
                : activeTab === 'BATCHES'
                ? 'Search batch number...'
                : 'Filter inventory by Bay...'
            }
            placeholderTextColor="#64748B"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color="#64748B" />
            </TouchableOpacity>
          ) : null}
        </View>

        {activeTab === 'PRODUCTS' && (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setIsProductModalOpen(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        )}

        {activeTab === 'BATCHES' && (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setIsBatchModalOpen(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Batch</Text>
          </TouchableOpacity>
        )}

        {activeTab === 'LOCATIONS' && (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setIsLocationModalOpen(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Bay</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Main Content */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>Loading master data catalog...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#10B981" />
          }
        >
          {/* TAB 1: PRODUCTS */}
          {activeTab === 'PRODUCTS' && (
            filteredProducts.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="cube-outline" size={48} color="#64748B" />
                <Text style={styles.emptyTitle}>No Products Found</Text>
                <Text style={styles.emptySubtitle}>Tap "+ Add" above to register a new medicine.</Text>
              </View>
            ) : (
              filteredProducts.map((p) => (
                <View key={p.id} style={styles.itemCard}>
                  <View style={styles.itemCardHeader}>
                    <View style={styles.itemTitleGroup}>
                      <Text style={styles.itemTitle}>{p.name}</Text>
                      <Text style={styles.itemSubtitle}>SKU: {p.sku}</Text>
                    </View>
                    <View style={styles.statusPillActive}>
                      <Text style={styles.statusPillActiveText}>Active</Text>
                    </View>
                  </View>

                  <View style={styles.itemDetailsGrid}>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Barcode / GTIN</Text>
                      <Text style={styles.detailValue}>{p.barcode || 'N/A'}</Text>
                    </View>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Unit of Issue</Text>
                      <Text style={styles.detailValue}>{p.unit}</Text>
                    </View>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Packaging</Text>
                      <Text style={styles.detailValue}>{p.packSize || 'Standard'}</Text>
                    </View>
                  </View>
                </View>
              ))
            )
          )}

          {/* TAB 2: BATCHES */}
          {activeTab === 'BATCHES' && (
            filteredBatches.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="file-tray-stacked-outline" size={48} color="#64748B" />
                <Text style={styles.emptyTitle}>No Batches Found</Text>
                <Text style={styles.emptySubtitle}>Tap "+ Batch" to register an active batch.</Text>
              </View>
            ) : (
              filteredBatches.map((b) => {
                const isQuarantine = b.status === 'QUARANTINE';
                const expDate = b.expiryDate ? b.expiryDate.split('T')[0] : 'N/A';
                const mfgDate = b.mfgDate ? b.mfgDate.split('T')[0] : 'N/A';
                return (
                  <View key={b.id} style={styles.itemCard}>
                    <View style={styles.itemCardHeader}>
                      <View style={styles.itemTitleGroup}>
                        <Text style={styles.itemTitle}>{b.batchNumber}</Text>
                        <Text style={styles.itemSubtitle}>
                          {b.productName || 'Medicine'} ({b.productSku || 'SKU'})
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.statusPillActive,
                          isQuarantine && { backgroundColor: 'rgba(239, 68, 68, 0.15)' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillActiveText,
                            isQuarantine && { color: '#EF4444' },
                          ]}
                        >
                          {b.status}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.itemDetailsGrid}>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>Manufacturing</Text>
                        <Text style={styles.detailValue}>{mfgDate}</Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>Expiration Date</Text>
                        <Text style={[styles.detailValue, { color: '#F59E0B' }]}>{expDate}</Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )
          )}

          {/* TAB 3: LOCATIONS & INVENTORY */}
          {activeTab === 'LOCATIONS' && (
            <View style={{ gap: 14 }}>
              {/* Rack summary header */}
              <Text style={styles.groupHeading}>Warehouse Bay Inventory</Text>
              {inventory.map((inv) => (
                <View key={inv.id} style={styles.itemCard}>
                  <View style={styles.itemCardHeader}>
                    <View style={styles.itemTitleGroup}>
                      <Text style={styles.itemTitle}>{inv.productName}</Text>
                      <Text style={styles.itemSubtitle}>
                        SKU: {inv.sku} • Batch: {inv.batchNumber || 'N/A'}
                      </Text>
                    </View>
                    <View style={styles.bayPill}>
                      <Ionicons name="location" size={12} color="#10B981" />
                      <Text style={styles.bayPillText}>{inv.locationCode}</Text>
                    </View>
                  </View>

                  <View style={styles.inventoryBalanceRow}>
                    <Text style={styles.invBalLabel}>Recorded Bay Balance:</Text>
                    <Text style={styles.invBalValue}>
                      {inv.quantity} {inv.unit || 'units'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* MODAL 1: ADD PRODUCT */}
      <Modal visible={isProductModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Register New Product</Text>
              <TouchableOpacity onPress={() => setIsProductModalOpen(false)}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 400 }}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Trade / Product Name *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. Cetirizine 10mg Tablets"
                  placeholderTextColor="#64748B"
                  value={newProdName}
                  onChangeText={setNewProdName}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>SKU / Item Code *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. MED-CETI-010"
                  placeholderTextColor="#64748B"
                  autoCapitalize="characters"
                  value={newProdSku}
                  onChangeText={setNewProdSku}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Barcode / GTIN</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. 08901234777666"
                  placeholderTextColor="#64748B"
                  keyboardType="numeric"
                  value={newProdBarcode}
                  onChangeText={setNewProdBarcode}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Unit of Issue</Text>
                <View style={styles.unitSelectorRow}>
                  {['BOX', 'STRIP', 'BOTTLE', 'VIAL'].map((u) => (
                    <TouchableOpacity
                      key={u}
                      style={[
                        styles.unitChip,
                        newProdUnit === u && styles.unitChipSelected,
                      ]}
                      onPress={() => setNewProdUnit(u)}
                    >
                      <Text
                        style={[
                          styles.unitChipText,
                          newProdUnit === u && styles.unitChipTextSelected,
                        ]}
                      >
                        {u}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Packaging / Pack Size</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. Box of 100 Tablets"
                  placeholderTextColor="#64748B"
                  value={newProdPackSize}
                  onChangeText={setNewProdPackSize}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setIsProductModalOpen(false)}
                disabled={isSubmitting}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleCreateProduct}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>Save Product</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: ADD BATCH */}
      <Modal visible={isBatchModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Register New Batch</Text>
              <TouchableOpacity onPress={() => setIsBatchModalOpen(false)}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 400 }}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Select Parent Product *</Text>
                <View style={styles.pickerContainer}>
                  {products.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.productPickItem,
                        selectedProductId === p.id && styles.productPickItemSelected,
                      ]}
                      onPress={() => setSelectedProductId(p.id)}
                    >
                      <Text
                        style={[
                          styles.productPickText,
                          selectedProductId === p.id && styles.productPickTextSelected,
                        ]}
                      >
                        {p.name} ({p.sku})
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Batch / Lot Number *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. BTH-CET-2601"
                  placeholderTextColor="#64748B"
                  autoCapitalize="characters"
                  value={newBatchNumber}
                  onChangeText={setNewBatchNumber}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Expiry Date (YYYY-MM-DD) *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. 2028-12-31"
                  placeholderTextColor="#64748B"
                  value={newBatchExpiryDate}
                  onChangeText={setNewBatchExpiryDate}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Mfg Date (Optional: YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. 2026-01-15"
                  placeholderTextColor="#64748B"
                  value={newBatchMfgDate}
                  onChangeText={setNewBatchMfgDate}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setIsBatchModalOpen(false)}
                disabled={isSubmitting}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleCreateBatch}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>Save Batch</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 3: ADD LOCATION */}
      <Modal visible={isLocationModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Allocate Rack Location</Text>
              <TouchableOpacity onPress={() => setIsLocationModalOpen(false)}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 400 }}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Rack / Bay Code *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. BAY-03 or RACK-C1"
                  placeholderTextColor="#64748B"
                  autoCapitalize="characters"
                  value={newLocationCode}
                  onChangeText={setNewLocationCode}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Select Product for Bay *</Text>
                <View style={styles.pickerContainer}>
                  {products.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.productPickItem,
                        locProdId === p.id && styles.productPickItemSelected,
                      ]}
                      onPress={() => setLocProdId(p.id)}
                    >
                      <Text
                        style={[
                          styles.productPickText,
                          locProdId === p.id && styles.productPickTextSelected,
                        ]}
                      >
                        {p.name} ({p.sku})
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Initial Quantity *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. 100"
                  placeholderTextColor="#64748B"
                  keyboardType="numeric"
                  value={locQty}
                  onChangeText={setLocQty}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setIsLocationModalOpen(false)}
                disabled={isSubmitting}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleCreateLocation}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>Allocate Bay</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTitleGroup: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  metricsSummaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  summaryPill: {
    flex: 1,
    backgroundColor: '#1E293B',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 2,
  },
  summaryLabel: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    paddingVertical: 9,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  activeTabButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  activeTabText: {
    color: '#10B981',
  },
  actionBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  searchInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 13,
    padding: 0,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
  },
  itemCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  itemCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  itemTitleGroup: {
    flex: 1,
    marginRight: 8,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  itemSubtitle: {
    fontSize: 12,
    color: '#38BDF8',
    marginTop: 2,
  },
  statusPillActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillActiveText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
  bayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  bayPillText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
  },
  itemDetailsGrid: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 10,
    gap: 12,
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 10,
    color: '#64748B',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E2E8F0',
  },
  groupHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  inventoryBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 10,
    marginTop: 6,
  },
  invBalLabel: {
    fontSize: 12,
    color: '#94A3B8',
  },
  invBalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#10B981',
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  formGroup: {
    marginBottom: 14,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F8FAFC',
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#F8FAFC',
    fontSize: 13,
  },
  unitSelectorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  unitChip: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  unitChipSelected: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  unitChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  unitChipTextSelected: {
    color: '#10B981',
    fontWeight: '700',
  },
  pickerContainer: {
    maxHeight: 140,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    backgroundColor: '#0F172A',
    padding: 6,
    gap: 4,
  },
  productPickItem: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  productPickItemSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  productPickText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  productPickTextSelected: {
    color: '#10B981',
    fontWeight: '700',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  submitBtn: {
    flex: 1.5,
    backgroundColor: '#10B981',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
