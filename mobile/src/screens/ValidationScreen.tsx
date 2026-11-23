import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Platform,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { InboundShipmentWithItems, ExpectedProductItem } from '../services/receiving';
import { OutboundOrder } from '../services/dispatch';
import { ExtractedLabelData } from '../services/ocr';

interface ValidationScreenProps {
  shipment?: InboundShipmentWithItems;
  order?: OutboundOrder;
  mode?: 'RECEIVING' | 'PICK_PACK';
  extractedData: ExtractedLabelData;
  onBack: () => void;
  onConfirmAddToInventory?: (
    validatedData: ExtractedLabelData,
    shipment: InboundShipmentWithItems
  ) => Promise<void>;
  onConfirmDispatchStock?: (
    validatedData: ExtractedLabelData,
    order: OutboundOrder
  ) => Promise<void>;
  onFlagDiscrepancy: (
    reasons: string[],
    notes?: string,
    extra?: {
      receivedQty?: number;
      expectedQty?: number;
      productName?: string;
      sku?: string;
      batchNumber?: string;
      expiryDate?: string;
    }
  ) => Promise<void>;
}

export default function ValidationScreen({
  shipment,
  order,
  mode,
  extractedData,
  onBack,
  onConfirmAddToInventory,
  onConfirmDispatchStock,
  onFlagDiscrepancy,
}: ValidationScreenProps) {
  const isPickMode = mode === 'PICK_PACK' || Boolean(order);
  const targetCode = order ? order.orderNumber : (shipment?.poNumber || '');
  const partnerName = order ? order.customerName : (shipment?.supplierName || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDiscrepancyModal, setShowDiscrepancyModal] = useState(false);
  const [discrepancyNote, setDiscrepancyNote] = useState('');

  // Editable values for manual corrections by warehouse operator
  const [editProductName, setEditProductName] = useState(extractedData.productName || '');
  const [editSku, setEditSku] = useState(extractedData.sku || '');
  const [editBatch, setEditBatch] = useState(extractedData.batchNumber || '');
  const [editExpiry, setEditExpiry] = useState(extractedData.expiryDate || '');
  const [editMfg, setEditMfg] = useState(extractedData.mfgDate || '');
  const [editQuantity, setEditQuantity] = useState(String(extractedData.quantity || 10));

  // Determine the target expected PO line item or Order line item
  const expectedItem: ExpectedProductItem | undefined = useMemo(() => {
    if (order) {
      if (!order.items || order.items.length === 0) return undefined;
      const cleanSku = editSku.trim().toUpperCase();
      const cleanName = editProductName.trim().toLowerCase();
      const bySku = order.items.find((i) => i.sku && i.sku.toUpperCase() === cleanSku);
      if (bySku) {
        return {
          id: bySku.id,
          shipmentId: order.id,
          productId: bySku.productId || bySku.id,
          expectedBatch: bySku.suggestedBatch,
          expectedQty: bySku.requiredQty,
          receivedQty: bySku.pickedQty,
          status: bySku.status,
          product: { id: bySku.id, sku: bySku.sku, name: bySku.productName, unit: 'BOX' },
        };
      }
      const byName = order.items.find((i) => i.productName && i.productName.toLowerCase().includes(cleanName));
      if (byName) {
        return {
          id: byName.id,
          shipmentId: order.id,
          productId: byName.productId || byName.id,
          expectedBatch: byName.suggestedBatch,
          expectedQty: byName.requiredQty,
          receivedQty: byName.pickedQty,
          status: byName.status,
          product: { id: byName.id, sku: byName.sku, name: byName.productName, unit: 'BOX' },
        };
      }
      const first = order.items[0];
      return {
        id: first.id,
        shipmentId: order.id,
        productId: first.productId || first.id,
        expectedBatch: first.suggestedBatch,
        expectedQty: first.requiredQty,
        receivedQty: first.pickedQty,
        status: first.status,
        product: { id: first.id, sku: first.sku, name: first.productName, unit: 'BOX' },
      };
    }

    if (!shipment?.items || shipment.items.length === 0) return undefined;

    // Try finding exact SKU match first
    const cleanSku = editSku.trim().toUpperCase();
    if (cleanSku) {
      const bySku = shipment.items.find(
        (i) => i.product?.sku && i.product.sku.toUpperCase() === cleanSku
      );
      if (bySku) return bySku;
    }

    // Try matching by Product Name
    const cleanName = editProductName.trim().toLowerCase();
    if (cleanName) {
      const byName = shipment.items.find(
        (i) => i.product?.name && i.product.name.toLowerCase().includes(cleanName)
      );
      if (byName) return byName;
    }

    // Try matching by expected batch
    const cleanBatch = editBatch.trim().toUpperCase();
    if (cleanBatch) {
      const byBatch = shipment.items.find(
        (i) => i.expectedBatch && i.expectedBatch.toUpperCase() === cleanBatch
      );
      if (byBatch) return byBatch;
    }

    // Fallback to first line item
    return shipment.items[0];
  }, [shipment?.items, order?.items, editSku, editProductName, editBatch]);

  // -------------------------------------------------------------
  // Validation Engine: Compares Physical Item vs PO Record
  // -------------------------------------------------------------
  const validationResults = useMemo(() => {
    const reasons: string[] = [];

    // 1. Product Match Check
    const expectedName = expectedItem?.product?.name || 'Unknown Medicine';
    const expectedSku = expectedItem?.product?.sku || '';
    const cleanScanName = editProductName.trim().toLowerCase();
    const cleanScanSku = editSku.trim().toUpperCase();

    let isProductMatch = false;
    if (cleanScanSku && expectedSku && cleanScanSku === expectedSku.toUpperCase()) {
      isProductMatch = true;
    } else if (cleanScanName && expectedName) {
      // Check if primary medicine keywords match (e.g. Paracetamol, Amoxicillin)
      const scanWords = cleanScanName.split(/\s+/).filter((w) => w.length > 3);
      const expectedWords = expectedName.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      const hasCommon = scanWords.some((w) => expectedWords.includes(w));
      if (hasCommon) {
        isProductMatch = true;
      }
    }

    if (!isProductMatch) {
      reasons.push(`Product Mismatch: Expected "${expectedName}" (${expectedSku}), but scanned "${editProductName}"`);
    }

    // 2. Batch Number Check
    const expectedBatch = (expectedItem?.expectedBatch || '').trim().toUpperCase();
    const scannedBatch = editBatch.trim().toUpperCase();
    let isBatchMatch = false;

    if (!isPickMode) {
      // Inbound Receiving: Suppliers deliver newly manufactured batches; accept any valid batch if PO is open
      if (!expectedBatch || expectedBatch === 'ANY' || expectedBatch.startsWith('BATCH-REC')) {
        isBatchMatch = scannedBatch.length > 0;
      } else {
        isBatchMatch = scannedBatch === expectedBatch;
      }
    } else {
      // Outbound Pick & Pack: Strict batch verification for FEFO (First Expiry First Out) compliance
      if (!expectedBatch || expectedBatch === 'ANY') {
        isBatchMatch = scannedBatch.length > 0;
      } else {
        isBatchMatch = scannedBatch === expectedBatch;
      }
    }

    if (!isBatchMatch) {
      reasons.push(`Batch Mismatch: Expected batch "${expectedBatch || 'N/A'}", but scanned "${scannedBatch || 'Missing'}"`);
    }

    // 3. Expiry Date Check & Shelf-Life Calculation
    let isExpiryValid = false;
    let isExpired = false;
    let shelfLifeMessage = '';

    if (editExpiry.trim()) {
      const cleanExp = editExpiry.trim();
      let expDate: Date | null = null;

      // Match MM/YYYY or MM-YYYY
      const mmyyyy = cleanExp.match(/^(\d{1,2})[\/\-](\d{4})$/);
      if (mmyyyy) {
        const month = parseInt(mmyyyy[1], 10);
        const year = parseInt(mmyyyy[2], 10);
        expDate = new Date(year, month, 0); // Last day of that month
      } else if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(cleanExp)) {
        expDate = new Date(cleanExp);
      } else {
        const parsed = new Date(cleanExp);
        if (!isNaN(parsed.getTime())) expDate = parsed;
      }

      if (expDate && !isNaN(expDate.getTime())) {
        const now = new Date();
        const diffMs = expDate.getTime() - now.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffMonths = Math.floor(diffDays / 30);

        if (diffDays < 0) {
          isExpired = true;
          isExpiryValid = false;
          shelfLifeMessage = `EXPIRED on ${expDate.toLocaleDateString()}`;
          reasons.push(`Medicine Expired: Expiry date "${editExpiry}" is in the past!`);
        } else if (diffMonths < 6) {
          isExpired = false;
          isExpiryValid = true;
          shelfLifeMessage = `Near Expiry: Only ${diffMonths} months remaining (< 6m)`;
          reasons.push(`Warning: Short shelf life (${diffMonths} months remaining)`);
        } else {
          isExpired = false;
          isExpiryValid = true;
          shelfLifeMessage = `Healthy: ~${diffMonths} months shelf life remaining`;
        }
      } else {
        shelfLifeMessage = 'Format Unverified';
        isExpiryValid = true; // Allow with note if unparseable but present
      }
    } else {
      reasons.push('Expiry Date Missing on label');
    }

    // 4. Quantity Check
    const parsedQty = parseInt(editQuantity, 10);
    const expectedQty = expectedItem ? expectedItem.expectedQty - (expectedItem.receivedQty || 0) : 10;
    const isQtyValid = !isNaN(parsedQty) && parsedQty > 0;
    let qtyMatchStatus: 'EXACT' | 'PARTIAL' | 'OVER' = 'EXACT';
    let isShortage = false;

    if (parsedQty < expectedQty) {
      qtyMatchStatus = 'PARTIAL';
      isShortage = true;
      if (!isPickMode) {
        reasons.push(
          `Quantity Shortage: Expected ${expectedQty} units on PO, but only ${parsedQty} units physically received (-${expectedQty - parsedQty} units shortage). Supervisor deviation approval required.`
        );
      }
    } else if (parsedQty > expectedQty) {
      qtyMatchStatus = 'OVER';
      reasons.push(`Over-delivery: Received ${parsedQty} exceeds expected ${expectedQty}`);
    }

    // Overall Match Status (All critical pharma checks must pass; for inbound receiving, shortage locks direct intake)
    const isOverallPass = isProductMatch && isBatchMatch && !isExpired && isQtyValid && (!isShortage || isPickMode);

    return {
      isOverallPass,
      isShortage,
      isProductMatch,
      isBatchMatch,
      isExpiryValid,
      isExpired,
      shelfLifeMessage,
      isQtyValid,
      qtyMatchStatus,
      expectedName,
      expectedSku,
      expectedBatch,
      expectedQty,
      parsedQty: isQtyValid ? parsedQty : 0,
      reasons,
    };
  }, [expectedItem, editProductName, editSku, editBatch, editExpiry, editQuantity, isPickMode]);

  // -------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------
  const handleConfirmIntake = async () => {
    if (!validationResults.isOverallPass) {
      Alert.alert(
        'Validation Blocked',
        `Cannot ${isPickMode ? 'dispatch stock' : 'add to inventory'} because verification check(s) failed:\n\n• ` +
          validationResults.reasons.join('\n• ') +
          '\n\nPlease resolve the discrepancy or route to Quarantine.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const validatedPayload: ExtractedLabelData = {
        source: extractedData.source,
        productName: editProductName.trim(),
        sku: editSku.trim() || expectedItem?.product?.sku,
        batchNumber: editBatch.trim().toUpperCase() || 'BATCH-PICK',
        mfgDate: editMfg.trim() || undefined,
        expiryDate: editExpiry.trim() || undefined,
        quantity: validationResults.parsedQty,
        price: extractedData.price,
        poNumber: targetCode,
        rawText: extractedData.rawText,
        confidence: extractedData.confidence,
      };

      if (isPickMode) {
        if (onConfirmDispatchStock && order) {
          await onConfirmDispatchStock(validatedPayload, order);
        }
      } else {
        if (onConfirmAddToInventory && shipment) {
          await onConfirmAddToInventory(validatedPayload, shipment);
        }
      }
    } catch (err: any) {
      Alert.alert(isPickMode ? 'Dispatch Error' : 'Intake Error', err?.message || 'Transaction failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFlagDiscrepancySubmit = async () => {
    setShowDiscrepancyModal(false);
    setIsSubmitting(true);
    try {
      await onFlagDiscrepancy(
        validationResults.reasons,
        discrepancyNote.trim(),
        {
          receivedQty: validationResults.parsedQty,
          expectedQty: validationResults.expectedQty,
          productName: editProductName.trim(),
          sku: editSku.trim() || expectedItem?.product?.sku,
          batchNumber: editBatch.trim().toUpperCase(),
          expiryDate: editExpiry.trim(),
        }
      );
    } catch (err: any) {
      Alert.alert('Discrepancy Error', err?.message || 'Failed to flag discrepancy.');
    } finally {
      setIsSubmitting(false);
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
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{isPickMode ? 'Outbound Pick Verification' : 'PO Goods Verification'}</Text>
          <Text style={styles.headerSubtitle}>{isPickMode ? 'Workflow 2: Pick & Pack (Go)' : 'Workflow 1: Inbound Reception'}</Text>
        </View>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => setShowEditModal(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="create-outline" size={20} color="#38BDF8" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Reference & Partner Banner */}
        <View style={styles.poCard}>
          <View style={styles.poRow}>
            <View style={[styles.poBadge, isPickMode && { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#F59E0B' }]}>
              <Ionicons name={isPickMode ? 'cart' : 'document-text'} size={14} color={isPickMode ? '#F59E0B' : '#38BDF8'} style={{ marginRight: 6 }} />
              <Text style={[styles.poBadgeText, isPickMode && { color: '#F59E0B' }]}>{targetCode}</Text>
            </View>
            <View
              style={[
                styles.sourceBadge,
                {
                  backgroundColor:
                    extractedData.source === 'OCR'
                      ? 'rgba(168, 85, 247, 0.15)'
                      : 'rgba(56, 189, 248, 0.15)',
                },
              ]}
            >
              <Text
                style={[
                  styles.sourceBadgeText,
                  {
                    color: extractedData.source === 'OCR' ? '#C084FC' : '#38BDF8',
                  },
                ]}
              >
                {extractedData.source === 'OCR' ? 'PaddleOCR' : extractedData.source}
              </Text>
            </View>
          </View>
          <Text style={styles.supplierText}>{partnerName}</Text>
        </View>

        {/* Overall Verification Status Card */}
        <View
          style={[
            styles.statusBanner,
            validationResults.isOverallPass
              ? styles.statusBannerSuccess
              : validationResults.isShortage && !isPickMode
              ? { backgroundColor: 'rgba(245, 158, 11, 0.1)', borderColor: '#F59E0B' }
              : styles.statusBannerError,
          ]}
        >
          <View
            style={[
              styles.statusIconCircle,
              {
                backgroundColor: validationResults.isOverallPass
                  ? 'rgba(16, 185, 129, 0.2)'
                  : validationResults.isShortage && !isPickMode
                  ? 'rgba(245, 158, 11, 0.2)'
                  : 'rgba(239, 68, 68, 0.2)',
              },
            ]}
          >
            <Ionicons
              name={
                validationResults.isOverallPass
                  ? 'checkmark-circle'
                  : validationResults.isShortage && !isPickMode
                  ? 'alert-circle'
                  : 'alert-circle'
              }
              size={32}
              color={
                validationResults.isOverallPass
                  ? '#10B981'
                  : validationResults.isShortage && !isPickMode
                  ? '#F59E0B'
                  : '#EF4444'
              }
            />
          </View>
          <View style={styles.statusTextContainer}>
            <Text
              style={[
                styles.statusTitle,
                {
                  color: validationResults.isOverallPass
                    ? '#10B981'
                    : validationResults.isShortage && !isPickMode
                    ? '#F59E0B'
                    : '#EF4444',
                },
              ]}
            >
              {validationResults.isOverallPass
                ? 'PO Verification PASSED'
                : validationResults.isShortage && !isPickMode
                ? 'Quantity Shortage DETECTED'
                : 'Discrepancy DETECTED'}
            </Text>
            <Text style={styles.statusDescription}>
              {validationResults.isOverallPass
                ? 'All medicine details match the authorized Purchase Order. Ready to add to inventory table.'
                : validationResults.isShortage && !isPickMode
                ? `PO requested ${validationResults.expectedQty} units, but physical count is ${validationResults.parsedQty} units (-${validationResults.expectedQty - validationResults.parsedQty} units). Direct inventory intake is locked. Route to Supervisor for deviation review.`
                : 'Physical medicine does NOT match Purchase Order records. Direct inventory addition is locked.'}
            </Text>
          </View>
        </View>

        {/* Discrepancy Alert Box (if any mismatches) */}
        {!validationResults.isOverallPass && validationResults.reasons.length > 0 && (
          <View style={styles.reasonsBox}>
            <View style={styles.reasonsHeader}>
              <Ionicons name="warning" size={16} color="#F59E0B" style={{ marginRight: 6 }} />
              <Text style={styles.reasonsTitle}>Verification Failures ({validationResults.reasons.length})</Text>
            </View>
            {validationResults.reasons.map((reason, index) => (
              <View key={index} style={styles.reasonItem}>
                <Text style={styles.reasonBullet}>•</Text>
                <Text style={styles.reasonText}>{reason}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Comparison Checklist Grid */}
        <Text style={styles.sectionHeading}>PO MATCHING CHECKLIST</Text>

        {/* 1. Product Name & SKU Match */}
        <View style={styles.checkCard}>
          <View style={styles.checkCardHeader}>
            <View style={styles.checkLabelGroup}>
              <Ionicons name="medkit-outline" size={18} color="#38BDF8" style={{ marginRight: 8 }} />
              <Text style={styles.checkLabel}>Product & SKU</Text>
            </View>
            <View
              style={[
                styles.matchBadge,
                validationResults.isProductMatch ? styles.matchBadgePass : styles.matchBadgeFail,
              ]}
            >
              <Ionicons
                name={validationResults.isProductMatch ? 'checkmark' : 'close'}
                size={14}
                color={validationResults.isProductMatch ? '#10B981' : '#EF4444'}
              />
              <Text
                style={[
                  styles.matchBadgeText,
                  { color: validationResults.isProductMatch ? '#10B981' : '#EF4444' },
                ]}
              >
                {validationResults.isProductMatch ? 'MATCH' : 'MISMATCH'}
              </Text>
            </View>
          </View>

          <View style={styles.compareGrid}>
            <View style={styles.compareCol}>
              <Text style={styles.compareHeader}>EXPECTED (PO)</Text>
              <Text style={styles.compareValuePrimary}>{validationResults.expectedName}</Text>
              <Text style={styles.compareValueSecondary}>
                SKU: {validationResults.expectedSku || 'N/A'}
              </Text>
            </View>
            <View style={styles.compareDivider} />
            <View style={styles.compareCol}>
              <Text style={styles.compareHeader}>RECEIVED (SCANNED)</Text>
              <Text
                style={[
                  styles.compareValuePrimary,
                  !validationResults.isProductMatch && styles.valueMismatch,
                ]}
              >
                {editProductName || 'Not Detected'}
              </Text>
              <Text style={styles.compareValueSecondary}>SKU: {editSku || 'N/A'}</Text>
            </View>
          </View>
        </View>

        {/* 2. Batch / Lot Number Match */}
        <View style={styles.checkCard}>
          <View style={styles.checkCardHeader}>
            <View style={styles.checkLabelGroup}>
              <Ionicons name="barcode-outline" size={18} color="#38BDF8" style={{ marginRight: 8 }} />
              <Text style={styles.checkLabel}>Batch / Lot Number</Text>
            </View>
            <View
              style={[
                styles.matchBadge,
                validationResults.isBatchMatch ? styles.matchBadgePass : styles.matchBadgeFail,
              ]}
            >
              <Ionicons
                name={validationResults.isBatchMatch ? 'checkmark' : 'close'}
                size={14}
                color={validationResults.isBatchMatch ? '#10B981' : '#EF4444'}
              />
              <Text
                style={[
                  styles.matchBadgeText,
                  { color: validationResults.isBatchMatch ? '#10B981' : '#EF4444' },
                ]}
              >
                {validationResults.isBatchMatch ? 'MATCH' : 'MISMATCH'}
              </Text>
            </View>
          </View>

          <View style={styles.compareGrid}>
            <View style={styles.compareCol}>
              <Text style={styles.compareHeader}>EXPECTED (PO)</Text>
              <Text style={styles.compareValuePrimaryMono}>
                {validationResults.expectedBatch || 'ANY'}
              </Text>
            </View>
            <View style={styles.compareDivider} />
            <View style={styles.compareCol}>
              <Text style={styles.compareHeader}>RECEIVED (SCANNED)</Text>
              <Text
                style={[
                  styles.compareValuePrimaryMono,
                  !validationResults.isBatchMatch && styles.valueMismatch,
                ]}
              >
                {editBatch || 'Not Detected'}
              </Text>
            </View>
          </View>
        </View>

        {/* 3. Expiry Date & Shelf Life */}
        <View style={styles.checkCard}>
          <View style={styles.checkCardHeader}>
            <View style={styles.checkLabelGroup}>
              <Ionicons name="calendar-outline" size={18} color="#38BDF8" style={{ marginRight: 8 }} />
              <Text style={styles.checkLabel}>Expiry Date & Shelf Life</Text>
            </View>
            <View
              style={[
                styles.matchBadge,
                !validationResults.isExpired && validationResults.isExpiryValid
                  ? styles.matchBadgePass
                  : styles.matchBadgeFail,
              ]}
            >
              <Ionicons
                name={!validationResults.isExpired ? 'shield-checkmark-outline' : 'close'}
                size={14}
                color={!validationResults.isExpired ? '#10B981' : '#EF4444'}
              />
              <Text
                style={[
                  styles.matchBadgeText,
                  { color: !validationResults.isExpired ? '#10B981' : '#EF4444' },
                ]}
              >
                {!validationResults.isExpired ? 'VALID' : 'EXPIRED'}
              </Text>
            </View>
          </View>

          <View style={styles.compareGrid}>
            <View style={styles.compareCol}>
              <Text style={styles.compareHeader}>SCANNED EXPIRY</Text>
              <Text
                style={[
                  styles.compareValuePrimaryMono,
                  validationResults.isExpired && styles.valueMismatch,
                ]}
              >
                {editExpiry || 'Not Detected'}
              </Text>
              {editMfg ? (
                <Text style={styles.compareValueSecondary}>Mfg: {editMfg}</Text>
              ) : null}
            </View>
            <View style={styles.compareDivider} />
            <View style={styles.compareCol}>
              <Text style={styles.compareHeader}>REGULATORY STATUS</Text>
              <Text
                style={[
                  styles.shelfLifeText,
                  { color: validationResults.isExpired ? '#EF4444' : '#10B981' },
                ]}
              >
                {validationResults.shelfLifeMessage}
              </Text>
            </View>
          </View>
        </View>

        {/* 4. Intake / Dispatch Quantity */}
        <View style={styles.checkCard}>
          <View style={styles.checkCardHeader}>
            <View style={styles.checkLabelGroup}>
              <Ionicons name="cube-outline" size={18} color={isPickMode ? '#F59E0B' : '#38BDF8'} style={{ marginRight: 8 }} />
              <Text style={styles.checkLabel}>{isPickMode ? 'Dispatch Quantity' : 'Intake Quantity'}</Text>
            </View>
            <View
              style={[
                styles.matchBadge,
                validationResults.qtyMatchStatus === 'EXACT'
                  ? styles.matchBadgePass
                  : validationResults.isShortage && !isPickMode
                  ? { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#F59E0B' }
                  : validationResults.qtyMatchStatus === 'PARTIAL'
                  ? styles.matchBadgeWarning
                  : styles.matchBadgeFail,
              ]}
            >
              <Text
                style={[
                  styles.matchBadgeText,
                  {
                    color:
                      validationResults.qtyMatchStatus === 'EXACT'
                        ? '#10B981'
                        : validationResults.isShortage && !isPickMode
                        ? '#F59E0B'
                        : validationResults.qtyMatchStatus === 'PARTIAL'
                        ? '#38BDF8'
                        : '#F59E0B',
                  },
                ]}
              >
                {validationResults.qtyMatchStatus === 'EXACT'
                  ? isPickMode ? 'FULL ORDER' : 'FULL PO'
                  : validationResults.isShortage && !isPickMode
                  ? `SHORTAGE (-${validationResults.expectedQty - validationResults.parsedQty})`
                  : validationResults.qtyMatchStatus === 'PARTIAL'
                  ? 'PARTIAL'
                  : 'OVER-QTY'}
              </Text>
            </View>
          </View>

          <View style={styles.compareGrid}>
            <View style={styles.compareCol}>
              <Text style={styles.compareHeader}>{isPickMode ? 'ORDER REQUIREMENT' : 'EXPECTED REMAINING'}</Text>
              <Text style={styles.compareValuePrimary}>
                {validationResults.expectedQty} units
              </Text>
            </View>
            <View style={styles.compareDivider} />
            <View style={styles.compareCol}>
              <Text style={styles.compareHeader}>{isPickMode ? 'PICKING NOW' : 'RECEIVING NOW'}</Text>
              <Text style={[styles.compareValuePrimary, isPickMode && { color: '#F59E0B' }]}>
                {validationResults.parsedQty} units
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          {/* 1. Primary: Route to Supervisor if Shortage; Confirm & Add if Overall Pass */}
          {validationResults.isShortage && !isPickMode ? (
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: '#F59E0B' }]}
              onPress={() => {
                setDiscrepancyNote(
                  `Quantity Shortage: Physical count of ${validationResults.parsedQty} units is less than PO requirement of ${validationResults.expectedQty} units (-${validationResults.expectedQty - validationResults.parsedQty} units shortage). Routing to Supervisor Exception Inbox.`
                );
                setShowDiscrepancyModal(true);
              }}
              disabled={isSubmitting}
              activeOpacity={0.85}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="paper-plane" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.primaryButtonText}>
                    Route Shortage to Supervisor ({validationResults.parsedQty} / {validationResults.expectedQty} units)
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.primaryButton,
                isPickMode && { backgroundColor: '#F59E0B' },
                !validationResults.isOverallPass && styles.buttonDisabled,
              ]}
              onPress={handleConfirmIntake}
              disabled={!validationResults.isOverallPass || isSubmitting}
              activeOpacity={0.85}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name={isPickMode ? 'open-outline' : 'checkmark-done-circle'} size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.primaryButtonText}>
                    {isPickMode
                      ? `Confirm & Dispatch (-${validationResults.parsedQty} units)`
                      : `Confirm & Add to Inventory (+${validationResults.parsedQty} units)`}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* 2. Secondary: Flag Discrepancy & Quarantine (for other verification failures) */}
          {!validationResults.isOverallPass && (!validationResults.isShortage || isPickMode) && (
            <TouchableOpacity
              style={styles.discrepancyButton}
              onPress={() => setShowDiscrepancyModal(true)}
              disabled={isSubmitting}
              activeOpacity={0.8}
            >
              <Ionicons name="alert-circle" size={18} color="#EF4444" style={{ marginRight: 6 }} />
              <Text style={styles.discrepancyButtonText}>Flag Discrepancy & Quarantine</Text>
            </TouchableOpacity>
          )}

          {/* 3. Tertiary: Rescan Medicine */}
          <TouchableOpacity
            style={styles.rescanButton}
            onPress={onBack}
            disabled={isSubmitting}
            activeOpacity={0.7}
          >
            <Ionicons name="camera-reverse-outline" size={18} color="#94A3B8" style={{ marginRight: 6 }} />
            <Text style={styles.rescanButtonText}>Rescan Medicine Label</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Manual Edit Modal */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Adjust Scanned Values</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 400 }}>
              <Text style={styles.inputLabel}>Product Name</Text>
              <TextInput
                style={styles.input}
                value={editProductName}
                onChangeText={setEditProductName}
                placeholder="Medicine Name"
                placeholderTextColor="#64748B"
              />

              <Text style={styles.inputLabel}>SKU / Product Code</Text>
              <TextInput
                style={styles.input}
                value={editSku}
                onChangeText={setEditSku}
                placeholder="e.g. MED-PARA-500"
                placeholderTextColor="#64748B"
                autoCapitalize="characters"
              />

              <Text style={styles.inputLabel}>Batch / Lot Number</Text>
              <TextInput
                style={styles.input}
                value={editBatch}
                onChangeText={setEditBatch}
                placeholder="e.g. BATCH123"
                placeholderTextColor="#64748B"
                autoCapitalize="characters"
              />

              <Text style={styles.inputLabel}>Expiry Date (MM/YYYY or YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={editExpiry}
                onChangeText={setEditExpiry}
                placeholder="e.g. 12/2027"
                placeholderTextColor="#64748B"
              />

              <Text style={styles.inputLabel}>Mfg Date (Optional)</Text>
              <TextInput
                style={styles.input}
                value={editMfg}
                onChangeText={setEditMfg}
                placeholder="e.g. 01/2025"
                placeholderTextColor="#64748B"
              />

              <Text style={styles.inputLabel}>Received Quantity</Text>
              <TextInput
                style={styles.input}
                value={editQuantity}
                onChangeText={setEditQuantity}
                placeholder="10"
                keyboardType="numeric"
                placeholderTextColor="#64748B"
              />
            </ScrollView>

            <TouchableOpacity
              style={styles.saveModalButton}
              onPress={() => setShowEditModal(false)}
            >
              <Text style={styles.saveModalButtonText}>Apply & Re-validate</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Discrepancy Quarantine Modal */}
      <Modal visible={showDiscrepancyModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="warning" size={22} color="#EF4444" style={{ marginRight: 8 }} />
                <Text style={styles.modalTitle}>Quarantine & Discrepancy</Text>
              </View>
              <TouchableOpacity onPress={() => setShowDiscrepancyModal(false)}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.discrepancySubtitle}>
              Flagging {isPickMode ? 'Order' : 'PO'} {targetCode} will mark the item as DISCREPANCY and route
              the physical goods to the Quarantine Holding Area. Stock will NOT be dispatched or added to active
              inventory.
            </Text>

            <Text style={styles.inputLabel}>Supervisor Audit Notes</Text>
            <TextInput
              style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
              value={discrepancyNote}
              onChangeText={setDiscrepancyNote}
              placeholder="Explain root cause (e.g. Supplier sent incorrect batch; box label damaged)"
              placeholderTextColor="#64748B"
              multiline
            />

            <TouchableOpacity
              style={styles.confirmDiscrepancyButton}
              onPress={handleFlagDiscrepancySubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.confirmDiscrepancyButtonText}>
                  Confirm Quarantine & Flag Discrepancy
                </Text>
              )}
            </TouchableOpacity>
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
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  poCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  poRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  poBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  poBadgeText: {
    color: '#38BDF8',
    fontWeight: '700',
    fontSize: 13,
  },
  sourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sourceBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  supplierText: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '600',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1.5,
  },
  statusBannerSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: '#10B981',
  },
  statusBannerError: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: '#EF4444',
  },
  statusIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  statusTextContainer: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  statusDescription: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 18,
  },
  reasonsBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  reasonsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  reasonsTitle: {
    color: '#F59E0B',
    fontWeight: '700',
    fontSize: 13,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
  },
  reasonBullet: {
    color: '#F59E0B',
    fontSize: 14,
    marginRight: 6,
  },
  reasonText: {
    color: '#CBD5E1',
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  sectionHeading: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  checkCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  checkCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  checkLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkLabel: {
    color: '#F1F5F9',
    fontSize: 14,
    fontWeight: '600',
  },
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  matchBadgePass: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  matchBadgeFail: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  matchBadgeWarning: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  matchBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 3,
  },
  compareGrid: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 10,
  },
  compareCol: {
    flex: 1,
  },
  compareDivider: {
    width: 1,
    backgroundColor: '#334155',
    marginHorizontal: 10,
  },
  compareHeader: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  compareValuePrimary: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },
  compareValuePrimaryMono: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  compareValueSecondary: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  valueMismatch: {
    color: '#EF4444',
  },
  shelfLifeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionContainer: {
    marginTop: 20,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 12,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    backgroundColor: '#334155',
    shadowOpacity: 0,
    elevation: 0,
  },
  discrepancyButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
  },
  discrepancyButtonText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
  rescanButton: {
    backgroundColor: '#1E293B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  rescanButtonText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700',
  },
  discrepancySubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  inputLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    color: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  saveModalButton: {
    backgroundColor: '#38BDF8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 10,
    marginTop: 16,
  },
  saveModalButtonText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 15,
  },
  confirmDiscrepancyButton: {
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 10,
    marginTop: 16,
  },
  confirmDiscrepancyButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
});
