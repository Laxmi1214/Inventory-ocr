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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface TaskInfo {
  type: 'RECEIVING' | 'PICK_PACK' | 'STOCK_COUNT';
  title: string;
  code: string;
  partnerOrDestination: string;
  expectedItem: string;
  expectedSku: string;
  expectedQty: number;
  expectedBatch?: string;
  location: string;
  notes: string;
}

interface TaskDetailScreenProps {
  taskType: string;
  onBack: () => void;
  onStartScan: (task: TaskInfo) => void;
}

// Sample task data tailored to Congiotech Pharmaceutical inventory BRD
const TASK_DATA: Record<string, TaskInfo> = {
  RECEIVING: {
    type: 'RECEIVING',
    title: 'Goods Reception (Inbound)',
    code: 'PO-2026-0891',
    partnerOrDestination: 'Novartis Healthcare Pvt Ltd',
    expectedItem: 'Paracetamol 500mg Tablets (Box of 100)',
    expectedSku: 'MED-PARA-500',
    expectedQty: 100,
    expectedBatch: 'BATCH123',
    location: 'Dock Bay 3 / Receiving Quarantine',
    notes: 'Verify tamper-evident seal, decode GS1 DataMatrix & check expiry date (min 18 months).',
  },
  PICK_PACK: {
    type: 'PICK_PACK',
    title: 'Pick & Pack (Outbound)',
    code: 'ORD-2026-4412',
    partnerOrDestination: 'Apollo Hospitals - Central Pharmacy',
    expectedItem: 'Amoxicillin 250mg Suspension',
    expectedSku: 'MED-AMOX-250',
    expectedQty: 50,
    expectedBatch: 'AMX-9082',
    location: 'Zone B / Shelf 04 / Bin 12',
    notes: 'Strict FIFO lot picking. Verify batch number matches authorized order pick list.',
  },
  STOCK_COUNT: {
    type: 'STOCK_COUNT',
    title: 'Stock Counting (Audit)',
    code: 'CNT-2026-0108',
    partnerOrDestination: 'Annual GMP Compliance Audit',
    expectedItem: 'Insulin Glargine 100 IU/ml',
    expectedSku: 'MED-INSU-100',
    expectedQty: 300,
    expectedBatch: 'INS-7721',
    location: 'Cold Storage Room 2 (2°C - 8°C)',
    notes: 'Record physical unit count. System will calculate variance against recorded inventory.',
  },
};

export default function TaskDetailScreen({
  taskType,
  onBack,
  onStartScan,
}: TaskDetailScreenProps) {
  const task = TASK_DATA[taskType] || TASK_DATA.RECEIVING;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Navigation Bar */}
        <View style={styles.navBar}>
          <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color="#F8FAFC" />
          </TouchableOpacity>
          <View style={styles.navTitleGroup}>
            <Text style={styles.navTitle}>Task Overview</Text>
            <Text style={styles.navSubtitle}>{task.code}</Text>
          </View>
        </View>

        {/* Task Header Card */}
        <View style={styles.taskCard}>
          <View style={styles.badgeRow}>
            <View style={styles.statusBadge}>
              <View style={styles.statusDot} />
              <Text style={styles.statusBadgeText}>Ready to Scan</Text>
            </View>
            <Text style={styles.timestampText}>Assigned Today</Text>
          </View>

          <Text style={styles.taskCardTitle}>{task.title}</Text>
          <Text style={styles.partnerText}>
            <Ionicons name="business-outline" size={14} color="#94A3B8" /> {task.partnerOrDestination}
          </Text>

          <View style={styles.divider} />

          {/* Target Product Specs */}
          <Text style={styles.sectionHeader}>Expected Item Details</Text>
          <View style={styles.productBox}>
            <Text style={styles.productName}>{task.expectedItem}</Text>
            <View style={styles.tagsRow}>
              <View style={styles.tag}>
                <Text style={styles.tagLabel}>SKU: </Text>
                <Text style={styles.tagValue}>{task.expectedSku}</Text>
              </View>
              {task.expectedBatch ? (
                <View style={styles.tag}>
                  <Text style={styles.tagLabel}>Lot: </Text>
                  <Text style={styles.tagValue}>{task.expectedBatch}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Key Metrics Grid */}
          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <Text style={styles.metricItemLabel}>Expected Qty</Text>
              <Text style={styles.metricItemValue}>{task.expectedQty} units</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricItemLabel}>Storage Location</Text>
              <Text style={styles.metricItemValueSmall}>{task.location}</Text>
            </View>
          </View>

          {/* Standard Operating Procedure (SOP) Note */}
          <View style={styles.noteBox}>
            <Ionicons name="alert-circle-outline" size={18} color="#F59E0B" style={{ marginRight: 8 }} />
            <Text style={styles.noteText}>{task.notes}</Text>
          </View>
        </View>

        {/* 4-Step Process Guide */}
        <View style={styles.processContainer}>
          <Text style={styles.processTitle}>Workflow Process</Text>
          <View style={styles.stepsRow}>
            <View style={styles.stepCol}>
              <View style={[styles.stepCircle, styles.stepActive]}>
                <Ionicons name="scan" size={16} color="#FFFFFF" />
              </View>
              <Text style={styles.stepText}>1. Scan</Text>
            </View>
            <View style={styles.stepLine} />
            <View style={styles.stepCol}>
              <View style={styles.stepCircle}>
                <Ionicons name="git-compare-outline" size={16} color="#64748B" />
              </View>
              <Text style={styles.stepText}>2. Validate</Text>
            </View>
            <View style={styles.stepLine} />
            <View style={styles.stepCol}>
              <View style={styles.stepCircle}>
                <Ionicons name="checkmark-done" size={16} color="#64748B" />
              </View>
              <Text style={styles.stepText}>3. Confirm</Text>
            </View>
          </View>
        </View>

        {/* Scan Action CTA */}
        <TouchableOpacity
          style={styles.scanButton}
          onPress={() => onStartScan(task)}
          activeOpacity={0.85}
        >
          <Ionicons name="barcode-outline" size={24} color="#FFFFFF" style={{ marginRight: 10 }} />
          <Text style={styles.scanButtonText}>Open Scanner (Camera / Barcode)</Text>
        </TouchableOpacity>
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
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  navTitleGroup: {
    flex: 1,
  },
  navTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  navSubtitle: {
    fontSize: 12,
    color: '#38BDF8',
    fontWeight: '600',
    marginTop: 2,
  },
  taskCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  statusBadgeText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
  timestampText: {
    color: '#94A3B8',
    fontSize: 11,
  },
  taskCardTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 6,
  },
  partnerText: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginBottom: 16,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  productBox: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  productName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  tagLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  tagValue: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  metricItem: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  metricItemLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 4,
  },
  metricItemValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  metricItemValueSmall: {
    fontSize: 12,
    fontWeight: '600',
    color: '#CBD5E1',
    lineHeight: 16,
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderRadius: 12,
    padding: 12,
  },
  noteText: {
    flex: 1,
    color: '#FCD34D',
    fontSize: 12,
    lineHeight: 16,
  },
  processContainer: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 24,
  },
  processTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepCol: {
    alignItems: 'center',
  },
  stepCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  stepActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  stepText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#CBD5E1',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#334155',
    marginHorizontal: 8,
    marginBottom: 20,
  },
  scanButton: {
    backgroundColor: '#0284C7',
    borderRadius: 14,
    height: 52,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  scanButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

