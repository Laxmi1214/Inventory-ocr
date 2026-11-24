import React, { useState, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { StockAuditTask, submitStockAudit } from '../services/auditService';
import { decodePharmaBarcode, matchPharmaMasterMedicine, ExtractedLabelData } from '../services/ocr';
import { sendBase64ToPaddleOcr, sendImageToPaddleOcr } from '../services/inventoryService';

interface StockCountAuditScreenProps {
  task: StockAuditTask;
  userId?: string;
  onBack: () => void;
  onAuditCompleted: (message: string) => void;
}

export default function StockCountAuditScreen({
  task,
  userId,
  onBack,
  onAuditCompleted,
}: StockCountAuditScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const isBusyRef = useRef<boolean>(false);

  // Camera States
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);

  // Modals & User Entry
  const [showResultModal, setShowResultModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualBatch, setManualBatch] = useState('');

  // Scanned Details
  const [scanSource, setScanSource] = useState<'BARCODE' | 'QR_CODE' | 'OCR' | 'MANUAL'>('OCR');
  const [scannedProductName, setScannedProductName] = useState('');
  const [scannedSku, setScannedSku] = useState('');
  const [scannedBatch, setScannedBatch] = useState('');
  const [scannedExpiry, setScannedExpiry] = useState('');

  // Count & Variance States
  const [physicalCount, setPhysicalCount] = useState<number>(task.systemQty);
  const [countInputText, setCountInputText] = useState<string>(String(task.systemQty));
  const [operatorNotes, setOperatorNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // -------------------------------------------------------------
  // Matching Engine: Scanned vs Target Shelf Item
  // -------------------------------------------------------------
  const isProductMatch = useMemo(() => {
    if (!scannedProductName && !scannedSku) return true; // manual fallback default
    const cleanScanSku = scannedSku.trim().toUpperCase();
    const cleanTargetSku = task.sku.trim().toUpperCase();
    if (cleanScanSku && cleanTargetSku && cleanScanSku === cleanTargetSku) {
      return true;
    }
    const cleanScanName = scannedProductName.trim().toLowerCase();
    const cleanTargetName = task.productName.trim().toLowerCase();
    const firstWord = cleanTargetName.split(/\s+/)[0];
    return firstWord.length > 3 && cleanScanName.includes(firstWord);
  }, [scannedProductName, scannedSku, task]);

  const isBatchMatch = useMemo(() => {
    if (!scannedBatch) return true;
    const cleanScan = scannedBatch.trim().toUpperCase();
    const cleanTarget = (task.batchNumber || '').trim().toUpperCase();
    if (!cleanTarget || cleanTarget === 'ANY') return true;
    return cleanScan === cleanTarget;
  }, [scannedBatch, task.batchNumber]);

  // Variance calculation
  const variance = physicalCount - task.systemQty;
  const isVarianceZero = variance === 0;
  const isOverallMatch = isProductMatch && isBatchMatch && isVarianceZero;
  const variancePercent =
    task.systemQty > 0 ? ((variance / task.systemQty) * 100).toFixed(1) : '0';

  // -------------------------------------------------------------
  // 1. Live Barcode & QR Code Scanning Handler
  // -------------------------------------------------------------
  const handleBarcodeScanned = ({ data, type }: { data: string; type: string }) => {
    if (showResultModal || isOcrProcessing || isBusyRef.current) return;
    isBusyRef.current = true;

    const decoded = decodePharmaBarcode(data, type);
    const matchedMaster = matchPharmaMasterMedicine(decoded.barcode || decoded.sku || decoded.productName || data);

    setScanSource(decoded.source === 'QR_CODE' ? 'QR_CODE' : 'BARCODE');
    setScannedProductName(decoded.productName || matchedMaster?.name || (data ? `Scanned (${data.substring(0, 16)})` : ''));
    setScannedSku(decoded.sku || matchedMaster?.sku || '');
    setScannedBatch(decoded.batchNumber || matchedMaster?.batchNumber || '');
    setScannedExpiry(decoded.expiryDate || matchedMaster?.expiryDate || '');

    // Default physical count to system quantity or scanned quantity
    const defaultQty = decoded.quantity || task.systemQty;
    setPhysicalCount(defaultQty);
    setCountInputText(String(defaultQty));

    setShowResultModal(true);
  };

  // -------------------------------------------------------------
  // 2. Camera Capture & OCR Text Extraction (Read Text Button)
  // -------------------------------------------------------------
  const handleCaptureOcr = async () => {
    if (!cameraRef.current || isOcrProcessing || isBusyRef.current) return;
    isBusyRef.current = true;
    setIsOcrProcessing(true);

    try {
      let photo: any = null;
      try {
        photo = await cameraRef.current.takePictureAsync({
          quality: 0.5,
          base64: true,
          shutterSound: false,
          skipProcessing: true,
        });
      } catch (firstErr) {
        console.warn('Initial capture sync retry:', firstErr);
        await new Promise((r) => setTimeout(r, 300));
        if (cameraRef.current) {
          photo = await cameraRef.current.takePictureAsync({
            quality: 0.5,
            base64: true,
            shutterSound: false,
            skipProcessing: true,
          });
        }
      }

      let ocrData;
      if (photo?.base64) {
        ocrData = await sendBase64ToPaddleOcr(photo.base64);
      } else if (photo?.uri) {
        ocrData = await sendImageToPaddleOcr(photo.uri);
      } else {
        Alert.alert('Camera Notice', 'Please hold camera steady and tap Read Text again.');
        return;
      }

      if (!ocrData || (!ocrData.allLines?.length && !ocrData.rawText?.trim())) {
        Alert.alert(
          'No Text Detected',
          'Could not detect readable text on medicine packaging. Please hold closer with adequate light, or use Manual Entry.'
        );
        return;
      }

      const combinedOcrText = [ocrData.medicineName, ocrData.sku, ocrData.rawText, ...(ocrData.allLines || [])].filter(Boolean).join(' ');
      const matchedMaster = matchPharmaMasterMedicine(combinedOcrText);

      setScanSource('OCR');
      const detectedName = ocrData.medicineName && ocrData.medicineName !== 'Pharmaceutical Item' && ocrData.medicineName !== 'No text detected' ? ocrData.medicineName : '';
      setScannedProductName(matchedMaster?.name || detectedName || (ocrData.allLines?.[0] || 'Unknown Scanned Item'));
      setScannedSku(matchedMaster?.sku || ocrData.sku || '');
      setScannedBatch(ocrData.batchNumber || matchedMaster?.batchNumber || '');
      setScannedExpiry(ocrData.expiryDate || matchedMaster?.expiryDate || '');

      setPhysicalCount(task.systemQty);
      setCountInputText(String(task.systemQty));
      setShowResultModal(true);
    } catch (err: any) {
      console.warn('OCR capture error:', err);
      Alert.alert(
        'OCR Service Notice',
        err.message || 'Failed to process image with OCR service. Check backend connection.'
      );
    } finally {
      setIsOcrProcessing(false);
      setTimeout(() => {
        isBusyRef.current = false;
      }, 400);
    }
  };

  // -------------------------------------------------------------
  // 3. Manual Entry Fallback (Used ONLY if label is damaged)
  // -------------------------------------------------------------
  const handleManualSubmit = () => {
    if (!manualCode.trim() && !manualBatch.trim()) {
      Alert.alert('Input Required', 'Please enter a barcode number, SKU, or batch number.');
      return;
    }

    const matched = matchPharmaMasterMedicine(manualCode);
    setScanSource('MANUAL');
    setScannedProductName(matched?.name || manualCode.trim());
    setScannedSku(matched?.sku || manualCode.trim());
    setScannedBatch(manualBatch.trim() || matched?.batchNumber || '');
    setScannedExpiry(matched?.expiryDate || '');

    setPhysicalCount(task.systemQty);
    setCountInputText(String(task.systemQty));

    setShowManualModal(false);
    setManualCode('');
    setManualBatch('');
    setShowResultModal(true);
  };

  // Quick count adjusters
  const adjustCount = (delta: number) => {
    const nextVal = Math.max(0, physicalCount + delta);
    setPhysicalCount(nextVal);
    setCountInputText(String(nextVal));
  };

  const handleCountTextChange = (val: string) => {
    setCountInputText(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      setPhysicalCount(parsed);
    }
  };

  // -------------------------------------------------------------
  // 4. Submit Audit Decision (Match vs Supervisor Routing)
  // -------------------------------------------------------------
  const handleSubmitAudit = async () => {
    setIsSubmitting(true);
    try {
      const discrepancyReasons: string[] = [];
      if (!isProductMatch) {
        discrepancyReasons.push(`Product mismatch: Expected "${task.productName}" (${task.sku}), Scanned "${scannedProductName}" (${scannedSku})`);
      }
      if (!isBatchMatch) {
        discrepancyReasons.push(`Batch mismatch: Expected "${task.batchNumber}", Scanned "${scannedBatch}"`);
      }
      if (!isVarianceZero) {
        discrepancyReasons.push(`Stock variance of ${variance > 0 ? '+' : ''}${variance} units (${variancePercent}%)`);
      }

      const noteContent =
        operatorNotes.trim() ||
        (isOverallMatch
          ? `Physical stock verified via ${scanSource} - 100% match`
          : discrepancyReasons.join('; '));

      const result = await submitStockAudit({
        inventoryId: task.inventoryId,
        productId: task.productId,
        batchId: task.batchId,
        locationCode: task.locationCode,
        systemQty: task.systemQty,
        physicalQty: physicalCount,
        notes: noteContent,
        userId,
      });

      if (result.success) {
        setShowResultModal(false);
        if (result.matched && isOverallMatch) {
          Alert.alert(
            'Stock Audit Confirmed',
            `• Location: ${task.locationCode}\n` +
              `• Medicine: ${task.productName}\n` +
              `• Batch: ${task.batchNumber || 'N/A'}\n` +
              `• Verified Count: ${physicalCount} units\n` +
              `• Source: ${scanSource}\n` +
              `• Variance: 0 (100% Accurate)\n\n` +
              `Audit status recorded successfully!`,
            [
              {
                text: 'OK',
                onPress: () => onAuditCompleted('Audit confirmed: 100% match'),
              },
            ]
          );
        } else {
          Alert.alert(
            'Discrepancy Routed to Supervisor',
            `• Location: ${task.locationCode}\n` +
              `• Medicine: ${task.productName}\n` +
              `• System Stock: ${task.systemQty}\n` +
              `• Physical Count: ${physicalCount}\n` +
              `• Variance: ${variance > 0 ? '+' : ''}${variance} units (${variancePercent}%)\n` +
              (!isBatchMatch ? `• Batch Discrepancy: Expected "${task.batchNumber}", Found "${scannedBatch}"\n` : '') +
              `\nDiscrepancy report routed to Supervisor for investigation. Inventory stock was NOT altered.`,
            [
              {
                text: 'OK',
                onPress: () => onAuditCompleted(`Variance routed to supervisor`),
              },
            ]
          );
        }
      } else {
        Alert.alert('Notice', result.error || 'Failed to submit audit record.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to submit audit');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Permission handling
  if (!permission) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#38BDF8" />
        <Text style={styles.permissionText}>Checking camera permissions...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <View style={styles.permissionCard}>
          <Ionicons name="camera-outline" size={48} color="#38BDF8" style={{ marginBottom: 12 }} />
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionDesc}>
            Camera access is required to scan medicine barcodes, QR codes, and packaging labels for physical stock counting.
          </Text>
          <TouchableOpacity style={styles.grantButton} onPress={requestPermission} activeOpacity={0.8}>
            <Text style={styles.grantButtonText}>Grant Camera Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.goBackButton} onPress={onBack} activeOpacity={0.7}>
            <Text style={styles.goBackText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Live Camera View for Barcode, QR Scanning & OCR Text Extraction */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={isTorchOn}
        onCameraReady={() => setIsCameraReady(true)}
        barcodeScannerSettings={{
          barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8', 'datamatrix'],
        }}
        onBarcodeScanned={showResultModal ? undefined : handleBarcodeScanned}
      />

      {/* Viewfinder Overlay */}
      <SafeAreaView style={styles.overlayContainer}>
        {/* Top Target Pill Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconButton} onPress={onBack} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.targetPill}>
            <View style={styles.targetPillRow}>
              <View style={styles.targetLocBadge}>
                <Ionicons name="location" size={11} color="#38BDF8" style={{ marginRight: 3 }} />
                <Text style={styles.targetLocText}>{task.locationCode}</Text>
              </View>
              <Text style={styles.targetStockText}>System: {task.systemQty} units</Text>
            </View>
            <Text style={styles.targetMedicineText} numberOfLines={1}>
              {task.productName}
            </Text>
            <Text style={styles.targetBatchText} numberOfLines={1}>
              Batch: {task.batchNumber || 'N/A'} • SKU: {task.sku}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.iconButton, isTorchOn && styles.iconButtonActive]}
            onPress={() => setIsTorchOn(!isTorchOn)}
            activeOpacity={0.7}
          >
            <Ionicons name={isTorchOn ? 'flash' : 'flash-off'} size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Center Scanner Reticle */}
        <View style={styles.centerSection}>
          <View style={styles.scanReticle}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
            <View style={styles.laserLine} />
          </View>
          <Text style={styles.reticleInstruction}>
            Align Barcode, QR Code, or Medicine Label
          </Text>
          <Text style={styles.reticleSubInstruction}>
            Auto-detects Barcode/QR • Tap Shutter for OCR Text
          </Text>
        </View>

        {/* Bottom Control Bar */}
        <View style={styles.bottomBar}>
          {/* Manual Entry Fallback Button */}
          <TouchableOpacity
            style={styles.manualEntryBtn}
            onPress={() => setShowManualModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="keypad-outline" size={20} color="#CBD5E1" />
            <Text style={styles.manualEntryText}>Manual</Text>
            <Text style={styles.manualEntrySub}>Fallback</Text>
          </TouchableOpacity>

          {/* Center OCR Camera Shutter Button */}
          <TouchableOpacity
            style={[styles.shutterButton, isOcrProcessing && styles.shutterButtonProcessing]}
            onPress={handleCaptureOcr}
            disabled={isOcrProcessing}
            activeOpacity={0.8}
          >
            {isOcrProcessing ? (
              <ActivityIndicator color="#0F172A" size="small" />
            ) : (
              <View style={styles.shutterInnerCircle}>
                <Ionicons name="camera" size={26} color="#FFFFFF" />
              </View>
            )}
          </TouchableOpacity>

          {/* Mode Indicator */}
          <View style={styles.modeIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.modeText}>Barcode / QR</Text>
            <Text style={styles.modeTextSub}>Tap for OCR</Text>
          </View>
        </View>
      </SafeAreaView>

      {/* Comparison & Decision Modal (Triggered by Scan or OCR) */}
      <Modal
        visible={showResultModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowResultModal(false);
          isBusyRef.current = false;
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <View style={styles.modalTagRow}>
                  <View
                    style={[
                      styles.sourceTag,
                      {
                        backgroundColor:
                          scanSource === 'OCR'
                            ? 'rgba(168, 85, 247, 0.15)'
                            : scanSource === 'QR_CODE'
                            ? 'rgba(16, 185, 129, 0.15)'
                            : scanSource === 'BARCODE'
                            ? 'rgba(56, 189, 248, 0.15)'
                            : 'rgba(148, 163, 184, 0.15)',
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        scanSource === 'OCR'
                          ? 'document-text-outline'
                          : scanSource === 'QR_CODE'
                          ? 'qr-code-outline'
                          : scanSource === 'BARCODE'
                          ? 'barcode-outline'
                          : 'keypad-outline'
                      }
                      size={12}
                      color={
                        scanSource === 'OCR'
                          ? '#C084FC'
                          : scanSource === 'QR_CODE'
                          ? '#10B981'
                          : scanSource === 'BARCODE'
                          ? '#38BDF8'
                          : '#CBD5E1'
                      }
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={[
                        styles.sourceTagText,
                        {
                          color:
                            scanSource === 'OCR'
                              ? '#C084FC'
                              : scanSource === 'QR_CODE'
                              ? '#10B981'
                              : scanSource === 'BARCODE'
                              ? '#38BDF8'
                              : '#CBD5E1',
                        },
                      ]}
                    >
                      {scanSource === 'OCR'
                        ? 'PaddleOCR Captured'
                        : scanSource === 'QR_CODE'
                        ? 'QR Code Scanned'
                        : scanSource === 'BARCODE'
                        ? 'Barcode Scanned'
                        : 'Manual Fallback'}
                    </Text>
                  </View>
                  <Text style={styles.modalLocationBadge}>{task.locationCode}</Text>
                </View>

                <Text style={styles.modalTitle}>Stock Count Matching</Text>
              </View>

              <TouchableOpacity
                onPress={() => {
                  setShowResultModal(false);
                  isBusyRef.current = false;
                }}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              {/* Checklist Card: Product & Batch Match */}
              <View style={styles.checklistCard}>
                {/* Product Match Row */}
                <View style={styles.checkRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.checkHeader}>PRODUCT VERIFICATION</Text>
                    <Text style={styles.checkValueTarget}>Target: {task.productName}</Text>
                    <Text style={styles.checkValueScanned}>Scanned: {scannedProductName || 'Verified'}</Text>
                  </View>
                  <View
                    style={[
                      styles.matchBadge,
                      isProductMatch ? styles.matchBadgePass : styles.matchBadgeFail,
                    ]}
                  >
                    <Text
                      style={[
                        styles.matchBadgeText,
                        { color: isProductMatch ? '#10B981' : '#EF4444' },
                      ]}
                    >
                      {isProductMatch ? 'MATCH' : 'MISMATCH'}
                    </Text>
                  </View>
                </View>

                <View style={styles.checklistDivider} />

                {/* Batch Match Row */}
                <View style={styles.checkRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.checkHeader}>BATCH NUMBER VERIFICATION</Text>
                    <Text style={styles.checkValueTargetMono}>Target: {task.batchNumber || 'ANY'}</Text>
                    <Text
                      style={[
                        styles.checkValueScannedMono,
                        !isBatchMatch && { color: '#EF4444' },
                      ]}
                    >
                      Scanned: {scannedBatch || 'Not Detected'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.matchBadge,
                      isBatchMatch ? styles.matchBadgePass : styles.matchBadgeFail,
                    ]}
                  >
                    <Text
                      style={[
                        styles.matchBadgeText,
                        { color: isBatchMatch ? '#10B981' : '#EF4444' },
                      ]}
                    >
                      {isBatchMatch ? 'MATCH' : 'MISMATCH'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Physical Count Stepper & Input */}
              <View style={styles.countCard}>
                <Text style={styles.countCardHeader}>PHYSICAL QUANTITY COUNTED ON RACK</Text>
                <View style={styles.counterRow}>
                  <TouchableOpacity
                    style={styles.stepBtnSmall}
                    onPress={() => adjustCount(-10)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.stepBtnText}>-10</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.stepBtnLarge}
                    onPress={() => adjustCount(-1)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="remove" size={20} color="#FFFFFF" />
                  </TouchableOpacity>

                  <TextInput
                    style={styles.countInput}
                    keyboardType="number-pad"
                    value={countInputText}
                    onChangeText={handleCountTextChange}
                    maxLength={6}
                    selectTextOnFocus
                  />

                  <TouchableOpacity
                    style={styles.stepBtnLarge}
                    onPress={() => adjustCount(1)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add" size={20} color="#FFFFFF" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.stepBtnSmall}
                    onPress={() => adjustCount(10)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.stepBtnText}>+10</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Real-time Dynamic Comparison Banner */}
              <View
                style={[
                  styles.compareBanner,
                  isOverallMatch
                    ? styles.compareBannerPass
                    : variance < 0
                    ? styles.compareBannerShortage
                    : styles.compareBannerExcess,
                ]}
              >
                <View style={styles.compareBannerHeader}>
                  <Ionicons
                    name={isOverallMatch ? 'checkmark-circle' : 'alert-circle'}
                    size={22}
                    color={isOverallMatch ? '#10B981' : variance < 0 ? '#EF4444' : '#F59E0B'}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={[
                      styles.compareBannerTitle,
                      { color: isOverallMatch ? '#10B981' : variance < 0 ? '#EF4444' : '#F59E0B' },
                    ]}
                  >
                    {isOverallMatch
                      ? 'PERFECT MATCH (100% ACCURATE)'
                      : variance < 0
                      ? `SHORTAGE: ${Math.abs(variance)} UNITS MISSING`
                      : !isBatchMatch
                      ? 'BATCH MISMATCH DETECTED'
                      : `EXCESS: +${variance} EXTRA UNITS FOUND`}
                  </Text>
                </View>

                {/* Values Comparison Strip */}
                <View style={styles.valuesStrip}>
                  <View style={styles.valueItem}>
                    <Text style={styles.valueLabel}>SYSTEM RECORD</Text>
                    <Text style={styles.valueNum}>{task.systemQty} units</Text>
                  </View>
                  <View style={styles.valueItemDivider} />
                  <View style={styles.valueItem}>
                    <Text style={styles.valueLabel}>PHYSICAL COUNT</Text>
                    <Text
                      style={[
                        styles.valueNum,
                        !isVarianceZero && { color: variance < 0 ? '#EF4444' : '#F59E0B' },
                      ]}
                    >
                      {physicalCount} units
                    </Text>
                  </View>
                  <View style={styles.valueItemDivider} />
                  <View style={styles.valueItem}>
                    <Text style={styles.valueLabel}>VARIANCE (DIFF)</Text>
                    <Text
                      style={[
                        styles.valueNum,
                        { color: isVarianceZero ? '#10B981' : variance < 0 ? '#EF4444' : '#F59E0B' },
                      ]}
                    >
                      {variance > 0 ? `+${variance}` : variance} ({variancePercent}%)
                    </Text>
                  </View>
                </View>
              </View>

              {/* Operator Notes Input (Important if variance exists) */}
              <View style={styles.modalNotesBox}>
                <Text style={styles.modalNotesLabel}>
                  AUDIT NOTES {isOverallMatch ? '(OPTIONAL)' : '(SUPERVISOR EXPLANATION REQUIRED)'}
                </Text>
                <TextInput
                  style={styles.modalNotesInput}
                  placeholder={
                    isOverallMatch
                      ? 'e.g. Scanned and verified on shelf'
                      : 'State root cause (e.g. 5 units missing from carton, inspected entire Bay-01)'
                  }
                  placeholderTextColor="#64748B"
                  value={operatorNotes}
                  onChangeText={setOperatorNotes}
                  multiline
                />
              </View>
            </ScrollView>

            {/* Decision Action Button */}
            <View style={styles.modalActions}>
              {isOverallMatch ? (
                <TouchableOpacity
                  style={styles.confirmMatchBtn}
                  onPress={handleSubmitAudit}
                  disabled={isSubmitting}
                  activeOpacity={0.85}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-done" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.actionBtnText}>Confirm Audit (100% Match)</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.routeSupervisorBtn}
                  onPress={handleSubmitAudit}
                  disabled={isSubmitting}
                  activeOpacity={0.85}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Ionicons name="paper-plane" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.actionBtnText}>
                        Route Discrepancy to Supervisor ({variance > 0 ? '+' : ''}{variance} Units)
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.rescanBtn}
                onPress={() => {
                  setShowResultModal(false);
                  isBusyRef.current = false;
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.rescanBtnText}>Rescan Medicine Label</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Manual Entry Fallback Modal */}
      <Modal visible={showManualModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Manual Label Fallback</Text>
                <Text style={styles.manualNoticeText}>
                  Use ONLY if physical barcode or label is torn, faded, or unreadable.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowManualModal(false)}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Barcode / SKU</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. MED-PARA-500 or Barcode"
              placeholderTextColor="#64748B"
              value={manualCode}
              onChangeText={setManualCode}
              autoCapitalize="characters"
            />

            <Text style={styles.inputLabel}>Batch / Lot Number</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. BTH-PAR-26045"
              placeholderTextColor="#64748B"
              value={manualBatch}
              onChangeText={setManualBatch}
              autoCapitalize="characters"
            />

            <TouchableOpacity style={styles.manualSubmitBtn} onPress={handleManualSubmit}>
              <Text style={styles.manualSubmitBtnText}>Proceed to Matching</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionText: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 12,
  },
  permissionCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    width: '90%',
  },
  permissionTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  permissionDesc: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  grantButton: {
    backgroundColor: '#38BDF8',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  grantButtonText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  goBackButton: {
    paddingVertical: 10,
  },
  goBackText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  overlayContainer: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 36 : 10,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  iconButtonActive: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  targetPill: {
    flex: 1,
    marginHorizontal: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  targetPillRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  targetLocBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  targetLocText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  targetStockText: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '700',
  },
  targetMedicineText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  targetBatchText: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 1,
  },
  centerSection: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanReticle: {
    width: 260,
    height: 260,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: '#38BDF8',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3.5,
    borderLeftWidth: 3.5,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3.5,
    borderRightWidth: 3.5,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3.5,
    borderLeftWidth: 3.5,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3.5,
    borderRightWidth: 3.5,
  },
  laserLine: {
    position: 'absolute',
    width: '90%',
    height: 2,
    backgroundColor: '#38BDF8',
    shadowColor: '#38BDF8',
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  reticleInstruction: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  reticleSubInstruction: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'android' ? 24 : 16,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 14,
  },
  manualEntryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 68,
  },
  manualEntryText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  manualEntrySub: {
    color: '#64748B',
    fontSize: 9,
  },
  shutterButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#38BDF8',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  shutterButtonProcessing: {
    backgroundColor: '#94A3B8',
  },
  shutterInnerCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#0284C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeIndicator: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 68,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginBottom: 4,
  },
  modeText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '700',
  },
  modeTextSub: {
    color: '#38BDF8',
    fontSize: 9,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  modalTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sourceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sourceTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  modalLocationBadge: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
  },
  closeBtn: {
    padding: 4,
  },
  checklistCard: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  checkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkHeader: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  checkValueTarget: {
    color: '#94A3B8',
    fontSize: 12,
  },
  checkValueScanned: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  checkValueTargetMono: {
    color: '#94A3B8',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  checkValueScannedMono: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  matchBadge: {
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
  matchBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  checklistDivider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 10,
  },
  countCard: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  countCardHeader: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepBtnSmall: {
    backgroundColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  stepBtnText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
  },
  stepBtnLarge: {
    backgroundColor: '#38BDF8',
    width: 38,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countInput: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38BDF8',
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    minWidth: 80,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  compareBanner: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  compareBannerPass: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: '#10B981',
  },
  compareBannerShortage: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: '#EF4444',
  },
  compareBannerExcess: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderColor: '#F59E0B',
  },
  compareBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  compareBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  valuesStrip: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 8,
  },
  valueItem: {
    flex: 1,
    alignItems: 'center',
  },
  valueItemDivider: {
    width: 1,
    backgroundColor: '#334155',
    marginHorizontal: 4,
  },
  valueLabel: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '700',
  },
  valueNum: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  modalNotesBox: {
    marginBottom: 14,
  },
  modalNotesLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
  },
  modalNotesInput: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#F8FAFC',
    padding: 10,
    fontSize: 13,
    height: 56,
    textAlignVertical: 'top',
  },
  modalActions: {
    gap: 8,
  },
  confirmMatchBtn: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  routeSupervisorBtn: {
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  rescanBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  rescanBtnText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  manualNoticeText: {
    color: '#F59E0B',
    fontSize: 12,
    marginTop: 2,
  },
  inputLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    color: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  manualSubmitBtn: {
    backgroundColor: '#38BDF8',
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 10,
    marginTop: 16,
  },
  manualSubmitBtnText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
  },
});
