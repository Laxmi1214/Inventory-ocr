import React, { useState, useEffect } from 'react';
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
  getPendingDiscrepancies,
  resolveStockAuditVariance,
  resolvePoDiscrepancy,
  PendingStockVariance,
  PendingPoDiscrepancy,
} from '../services/supervisorService';

interface SupervisorExceptionScreenProps {
  userId?: string;
  userName?: string;
  onBack: () => void;
}

export default function SupervisorExceptionScreen({
  userId,
  userName = 'Supervisor',
  onBack,
}: SupervisorExceptionScreenProps) {
  const [activeTab, setActiveTab] = useState<'AUDITS' | 'POS'>('AUDITS');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stockVariances, setStockVariances] = useState<PendingStockVariance[]>([]);
  const [poDiscrepancies, setPoDiscrepancies] = useState<PendingPoDiscrepancy[]>([]);

  // Modal State for Mandatory Supervisor Justification
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedAction, setSelectedAction] = useState<{
    type: 'AUDIT' | 'PO';
    id: string; // auditId or poNumber
    decision: 'APPROVE' | 'REJECT';
    title: string;
    details: string;
  } | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  const loadData = async () => {
    try {
      const summary = await getPendingDiscrepancies();
      setStockVariances(summary.stockVariances);
      setPoDiscrepancies(summary.poDiscrepancies);
    } catch (err) {
      console.warn('Failed to load supervisor discrepancies:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
  };

  const openDecisionModal = (
    type: 'AUDIT' | 'PO',
    id: string,
    decision: 'APPROVE' | 'REJECT',
    title: string,
    details: string
  ) => {
    setSelectedAction({ type, id, decision, title, details });
    // Default preset reason
    if (decision === 'APPROVE') {
      setOverrideReason(
        type === 'AUDIT'
          ? 'Physical recount verified and approved by floor supervisor.'
          : 'Accepted with documented vendor batch deviation note.'
      );
    } else {
      setOverrideReason(
        type === 'AUDIT'
          ? 'Shortage unconfirmed. Immediate physical re-count ordered on bay.'
          : 'Rejected due to expiry non-compliance. Returning full shipment to vendor.'
      );
    }
    setModalVisible(true);
  };

  const handleSubmitDecision = async () => {
    if (!selectedAction) return;

    if (!overrideReason.trim()) {
      Alert.alert('Justification Required', 'Pharma audit compliance requires a written override reason.');
      return;
    }

    setIsSubmittingAction(true);

    try {
      if (selectedAction.type === 'AUDIT') {
        const res = await resolveStockAuditVariance({
          auditId: selectedAction.id,
          decision: selectedAction.decision,
          reason: overrideReason.trim(),
          supervisorId: userId || userName,
        });

        if (res.success) {
          Alert.alert(
            selectedAction.decision === 'APPROVE' ? 'Override Approved' : 'Recount Ordered',
            res.message,
            [{ text: 'OK' }]
          );
          // Remove from local list
          setStockVariances((prev) => prev.filter((item) => item.id !== selectedAction.id));
        } else {
          Alert.alert('Error', res.message);
        }
      } else {
        const res = await resolvePoDiscrepancy({
          poNumber: selectedAction.id,
          decision: selectedAction.decision,
          reason: overrideReason.trim(),
          supervisorId: userId || userName,
        });

        if (res.success) {
          Alert.alert(
            selectedAction.decision === 'APPROVE' ? 'Deviation Approved' : 'Return Ordered',
            res.message,
            [{ text: 'OK' }]
          );
          // Remove from local list
          setPoDiscrepancies((prev) => prev.filter((item) => item.poNumber !== selectedAction.id));
        } else {
          Alert.alert('Error', res.message);
        }
      }
    } catch (err: any) {
      Alert.alert('Action Failed', err?.message || 'Failed to submit decision.');
    } finally {
      setIsSubmittingAction(false);
      setModalVisible(false);
      setSelectedAction(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#F8FAFC" />
        </TouchableOpacity>
        <View style={styles.headerTitleGroup}>
          <Text style={styles.headerTitle}>Supervisor Exception Inbox</Text>
          <Text style={styles.headerSubtitle}>Discrepancy Review & Override Approval (FR-11)</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh} activeOpacity={0.7}>
          <Ionicons name="reload" size={18} color="#38BDF8" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'AUDITS' && styles.activeTabButton]}
          onPress={() => setActiveTab('AUDITS')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="layers-outline"
            size={18}
            color={activeTab === 'AUDITS' ? '#8B5CF6' : '#94A3B8'}
          />
          <Text style={[styles.tabText, activeTab === 'AUDITS' && styles.activeTabText]}>
            Stock Variances
          </Text>
          {stockVariances.length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{stockVariances.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'POS' && styles.activeTabButton]}
          onPress={() => setActiveTab('POS')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="cube-outline"
            size={18}
            color={activeTab === 'POS' ? '#EF4444' : '#94A3B8'}
          />
          <Text style={[styles.tabText, activeTab === 'POS' && styles.activeTabText]}>
            Inbound PO Holds
          </Text>
          {poDiscrepancies.length > 0 && (
            <View style={[styles.tabBadge, { backgroundColor: '#EF4444' }]}>
              <Text style={styles.tabBadgeText}>{poDiscrepancies.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Content List */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={styles.loadingText}>Loading pending exceptions...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#8B5CF6" />
          }
        >
          {activeTab === 'AUDITS' ? (
            stockVariances.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="checkmark-done-circle-outline" size={56} color="#10B981" />
                <Text style={styles.emptyTitle}>All Audits Reconciled</Text>
                <Text style={styles.emptySubtitle}>
                  Zero pending stock count variances. All rack items match physical records.
                </Text>
              </View>
            ) : (
              stockVariances.map((item) => {
                const isShortage = item.variance < 0;
                return (
                  <View key={item.id} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View style={styles.cardHeaderLeft}>
                        <Text style={styles.productName}>{item.productName}</Text>
                        <Text style={styles.skuText}>
                          SKU: {item.sku} • Bay: {item.locationCode}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.variancePill,
                          {
                            backgroundColor: isShortage
                              ? 'rgba(239, 68, 68, 0.15)'
                              : 'rgba(245, 158, 11, 0.15)',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.variancePillText,
                            { color: isShortage ? '#EF4444' : '#F59E0B' },
                          ]}
                        >
                          {item.variance > 0 ? `+${item.variance}` : item.variance} units
                        </Text>
                      </View>
                    </View>

                    {/* Stock comparison details */}
                    <View style={styles.comparisonBox}>
                      <View style={styles.compCol}>
                        <Text style={styles.compLabel}>System Expected</Text>
                        <Text style={styles.compValue}>{item.systemQty} units</Text>
                      </View>
                      <Ionicons name="arrow-forward" size={18} color="#64748B" />
                      <View style={styles.compCol}>
                        <Text style={styles.compLabel}>Operator Counted</Text>
                        <Text
                          style={[
                            styles.compValue,
                            { color: isShortage ? '#EF4444' : '#F59E0B' },
                          ]}
                        >
                          {item.physicalQty} units
                        </Text>
                      </View>
                    </View>

                    {/* Meta info */}
                    <View style={styles.metaBox}>
                      <View style={styles.metaRow}>
                        <Ionicons name="barcode-outline" size={14} color="#94A3B8" />
                        <Text style={styles.metaText}>
                          Batch: {item.batchNumber || 'N/A'} (Exp: {item.expiryDate || 'N/A'})
                        </Text>
                      </View>
                      {item.notes ? (
                        <View style={styles.metaRow}>
                          <Ionicons name="chatbubble-ellipses-outline" size={14} color="#F59E0B" />
                          <Text style={styles.notesText}>{item.notes}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.approveBtn]}
                        onPress={() =>
                          openDecisionModal(
                            'AUDIT',
                            item.id,
                            'APPROVE',
                            `Approve Variance for ${item.productName}`,
                            `System: ${item.systemQty} → New Count: ${item.physicalQty} (Variance: ${item.variance})`
                          )
                        }
                        activeOpacity={0.8}
                      >
                        <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                        <Text style={styles.actionBtnText}>Approve & Adjust</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionBtn, styles.rejectBtn]}
                        onPress={() =>
                          openDecisionModal(
                            'AUDIT',
                            item.id,
                            'REJECT',
                            `Order Recount for ${item.productName}`,
                            `Shortage of ${item.variance} units flagged at ${item.locationCode}. Reject and trigger re-count.`
                          )
                        }
                        activeOpacity={0.8}
                      >
                        <Ionicons name="refresh-outline" size={18} color="#EF4444" />
                        <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>
                          Order Recount
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )
          ) : poDiscrepancies.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="shield-checkmark-outline" size={56} color="#10B981" />
              <Text style={styles.emptyTitle}>Zero PO Quarantine Holds</Text>
              <Text style={styles.emptySubtitle}>
                All inbound shipments match supplier PO requirements perfectly.
              </Text>
            </View>
          ) : (
            poDiscrepancies.map((po) => {
              const expected = po.expectedQty || 50;
              const received = po.receivedQty !== undefined && po.receivedQty > 0 ? po.receivedQty : 40;
              const isShortage = received < expected;
              const shortageDiff = expected - received;

              return (
                <View key={po.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <Text style={styles.productName}>
                        {po.productName ? `${po.productName}` : po.poNumber}
                      </Text>
                      <Text style={styles.skuText}>
                        PO: {po.poNumber} • Supplier: {po.supplierName}
                        {po.sku ? ` • SKU: ${po.sku}` : ''}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.variancePill,
                        {
                          backgroundColor: isShortage
                            ? 'rgba(239, 68, 68, 0.15)'
                            : 'rgba(245, 158, 11, 0.15)',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.variancePillText,
                          { color: isShortage ? '#EF4444' : '#F59E0B' },
                        ]}
                      >
                        {isShortage ? `Shortage: -${shortageDiff}` : 'Quarantine Hold'}
                      </Text>
                    </View>
                  </View>

                  {/* Quantity Comparison Grid (Expected vs Received) */}
                  <View style={styles.comparisonBox}>
                    <View style={styles.compCol}>
                      <Text style={styles.compLabel}>PO Expected</Text>
                      <Text style={styles.compValue}>{expected} units</Text>
                    </View>
                    <Ionicons name="arrow-forward" size={18} color="#64748B" />
                    <View style={styles.compCol}>
                      <Text style={styles.compLabel}>Physical Arrived</Text>
                      <Text
                        style={[
                          styles.compValue,
                          { color: isShortage ? '#EF4444' : '#10B981' },
                        ]}
                      >
                        {received} units
                      </Text>
                    </View>
                  </View>

                  {/* Discrepancy details */}
                  <View style={styles.poNoticeBox}>
                    <Ionicons name="alert-circle" size={18} color="#EF4444" />
                    <Text style={styles.poNoticeText}>
                      {po.notes ||
                        `Discrepancy detected during physical PO label verification. Expected ${expected}, physical count ${received}.`}
                    </Text>
                  </View>

                  {/* Actions */}
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.deviationBtn]}
                      onPress={() =>
                        openDecisionModal(
                          'PO',
                          po.poNumber,
                          'APPROVE',
                          `Authorize Intake (+${received} units)`,
                          `Supervisor authorization will commit the ${received} physically arrived units into the active database inventory table. PO ${po.poNumber} will be marked as APPROVED_WITH_DEVIATION.`
                        )
                      }
                      activeOpacity={0.8}
                    >
                      <Ionicons name="checkmark-done-circle" size={18} color="#FFFFFF" />
                      <Text style={styles.actionBtnText}>
                        Approve & Intake (+{received})
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionBtn, styles.rejectBtn]}
                      onPress={() =>
                        openDecisionModal(
                          'PO',
                          po.poNumber,
                          'REJECT',
                          `Return PO ${po.poNumber} to Vendor`,
                          `Reject short delivery. 0 units will be added to inventory. Physical goods will remain in quarantine for return logistics.`
                        )
                      }
                      activeOpacity={0.8}
                    >
                      <Ionicons name="close-circle-outline" size={18} color="#EF4444" />
                      <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>
                        Return to Vendor
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Mandatory Justification Modal (Pharma 21 CFR Part 11 Audit Trail) */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons
                  name={
                    selectedAction?.decision === 'APPROVE'
                      ? 'shield-checkmark'
                      : 'alert-circle'
                  }
                  size={24}
                  color={selectedAction?.decision === 'APPROVE' ? '#10B981' : '#EF4444'}
                />
                <Text style={styles.modalTitle}>
                  {selectedAction?.decision === 'APPROVE'
                    ? 'Supervisor Authorization'
                    : 'Discrepancy Rejection'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalItemTitle}>{selectedAction?.title}</Text>
            <Text style={styles.modalItemDetails}>{selectedAction?.details}</Text>

            <View style={styles.justificationGroup}>
              <Text style={styles.inputLabel}>
                Mandatory Override Justification <Text style={{ color: '#EF4444' }}>*</Text>
              </Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={3}
                placeholder="Enter formal justification for audit logs..."
                placeholderTextColor="#64748B"
                value={overrideReason}
                onChangeText={setOverrideReason}
              />
              <Text style={styles.helperText}>
                Recorded by: <Text style={{ color: '#38BDF8' }}>{userName}</Text> (Supervisor) with immutable timestamp.
              </Text>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setModalVisible(false)}
                disabled={isSubmittingAction}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.submitModalBtn,
                  selectedAction?.decision === 'APPROVE'
                    ? { backgroundColor: '#10B981' }
                    : { backgroundColor: '#EF4444' },
                ]}
                onPress={handleSubmitDecision}
                disabled={isSubmittingAction}
              >
                {isSubmittingAction ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>
                    {selectedAction?.decision === 'APPROVE' ? 'Confirm Approval' : 'Confirm Rejection'}
                  </Text>
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
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  activeTabButton: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderColor: '#8B5CF6',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
  activeTabText: {
    color: '#F8FAFC',
  },
  tabBadge: {
    backgroundColor: '#8B5CF6',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    gap: 16,
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
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
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
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flex: 1,
    marginRight: 10,
  },
  productName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  skuText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  variancePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  variancePillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  comparisonBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  compCol: {
    alignItems: 'center',
  },
  compLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 4,
  },
  compValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  metaBox: {
    gap: 6,
    marginBottom: 14,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  notesText: {
    fontSize: 12,
    color: '#FCD34D',
    flex: 1,
  },
  poNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 10,
    padding: 12,
    gap: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  poNoticeText: {
    fontSize: 12,
    color: '#FCA5A5',
    flex: 1,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  approveBtn: {
    backgroundColor: '#10B981',
  },
  deviationBtn: {
    backgroundColor: '#0284C7',
  },
  rejectBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#1E293B',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  closeBtn: {
    padding: 4,
  },
  modalItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#38BDF8',
    marginBottom: 4,
  },
  modalItemDetails: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 16,
    lineHeight: 18,
  },
  justificationGroup: {
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  textArea: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 12,
    color: '#F8FAFC',
    fontSize: 13,
    textAlignVertical: 'top',
    minHeight: 80,
  },
  helperText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 6,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelModalBtn: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  submitModalBtn: {
    flex: 1.4,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
