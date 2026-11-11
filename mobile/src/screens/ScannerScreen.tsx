import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  StatusBar as NativeStatusBar,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { InboundShipmentWithItems } from '../services/receiving';
import {
  decodePharmaBarcode,
  extractLabelWithPaddleOCR,
  ExtractedLabelData,
} from '../services/ocr';

interface ScannerScreenProps {
  shipment: InboundShipmentWithItems;
  onBack: () => void;
  onProceedToValidate: (extractedData: ExtractedLabelData, shipment: InboundShipmentWithItems) => void;
}

export default function ScannerScreen({
  shipment,
  onBack,
  onProceedToValidate,
}: ScannerScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);

  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [scanResult, setScanResult] = useState<ExtractedLabelData | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualCode, setManualCode] = useState('');

  // Primary expected medicine in this PO to assist OCR parsing
  const primaryItem = shipment.items[0]?.product;
  const primaryBatch = shipment.items[0]?.expectedBatch;

  // 1. Live Barcode & QR Code Scanning Handler
  const handleBarcodeScanned = ({ data, type }: { data: string; type: string }) => {
    if (showResultModal || isProcessingOCR) return;

    const decoded = decodePharmaBarcode(data, type);
    setScanResult(decoded);
    setShowResultModal(true);
  };

  // 2. PaddleOCR Label Capture Handler
  const handleCaptureLabel = async () => {
    if (isProcessingOCR) return;

    try {
      setIsProcessingOCR(true);

      let photoUri = '';
      let base64 = '';

      if (cameraRef.current) {
        try {
          const photo = await cameraRef.current.takePictureAsync({
            quality: 0.6,
            base64: true,
          });
          if (photo?.uri) {
            photoUri = photo.uri;
            base64 = photo.base64 || '';
          }
        } catch (captureErr) {
          console.warn('Native camera capture warning:', captureErr);
        }
      }

      // Send to PaddleOCR extraction service
      const extracted = await extractLabelWithPaddleOCR(photoUri, base64, {
        name: primaryItem?.name || 'Paracetamol 500mg Tablets',
        sku: primaryItem?.sku || 'MED-PARA-500',
        batch: primaryBatch || 'BATCH123',
      });

      setScanResult(extracted);
      setShowResultModal(true);
    } catch (err: any) {
      Alert.alert('OCR Error', err?.message || 'Failed to extract text from label.');
    } finally {
      setIsProcessingOCR(false);
    }
  };

  // 3. Manual Entry Submit Handler
  const handleManualSubmit = () => {
    if (!manualCode.trim()) {
      Alert.alert('Input Required', 'Please enter a barcode number or product SKU.');
      return;
    }

    setShowManualModal(false);
    const manualData: ExtractedLabelData = {
      source: 'MANUAL',
      barcode: manualCode.trim(),
      barcodeType: 'MANUAL_ENTRY',
      confidence: 1.0,
    };
    setScanResult(manualData);
    setShowResultModal(true);
  };

  // 4. Reset & Scan Again
  const handleScanAgain = () => {
    setShowResultModal(false);
    setScanResult(null);
  };

  // Permission handling view
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
          <View style={styles.permissionIconCircle}>
            <Ionicons name="camera-outline" size={44} color="#38BDF8" />
          </View>
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionDesc}>
            Congiotech Inventory needs camera access to scan pharmaceutical barcodes and capture medicine labels for PaddleOCR verification.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission} activeOpacity={0.8}>
            <Text style={styles.permissionButtonText}>Grant Camera Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.permissionCancelButton} onPress={onBack} activeOpacity={0.7}>
            <Text style={styles.permissionCancelText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Live Camera View */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        mode="picture"
        enableTorch={isTorchOn}
        onCameraReady={() => setIsCameraReady(true)}
        barcodeScannerSettings={{
          barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8', 'datamatrix'],
        }}
        onBarcodeScanned={showResultModal || isProcessingOCR ? undefined : handleBarcodeScanned}
      />

      {/* Viewfinder Overlay */}
      <SafeAreaView style={styles.overlayContainer}>
        {/* Top Control Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconButton} onPress={onBack} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.poPill}>
            <Ionicons name="document-text" size={14} color="#38BDF8" style={{ marginRight: 6 }} />
            <Text style={styles.poPillText}>{shipment.poNumber}</Text>
          </View>

          <TouchableOpacity
            style={[styles.iconButton, isTorchOn && styles.iconButtonActive]}
            onPress={() => setIsTorchOn(!isTorchOn)}
            activeOpacity={0.7}
          >
            <Ionicons name={isTorchOn ? 'flash' : 'flash-off'} size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Center Scanner Frame */}
        <View style={styles.centerSection}>
          <View style={styles.scanReticle}>
            {/* Viewfinder Corners */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />

            {/* Glowing Laser Scan Line */}
            <View style={styles.laserLine} />
          </View>
          <Text style={styles.reticleInstruction}>
            Position Barcode, QR Code, or Medicine Label inside frame
          </Text>
        </View>

        {/* Bottom Bar: PaddleOCR Shutter & Manual Entry */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.manualEntryBtn}
            onPress={() => setShowManualModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="keypad-outline" size={20} color="#CBD5E1" />
            <Text style={styles.manualEntryText}>Manual Entry</Text>
          </TouchableOpacity>

          {/* PaddleOCR Capture Shutter Button */}
          <TouchableOpacity
            style={[styles.ocrCaptureButton, isProcessingOCR && styles.buttonDisabled]}
            onPress={handleCaptureLabel}
            disabled={isProcessingOCR}
            activeOpacity={0.85}
          >
            <View style={styles.ocrCaptureInner}>
              <Ionicons name="camera" size={28} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          <View style={styles.modeIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.modeText}>Barcode / QR</Text>
            <Text style={styles.modeTextSub}>Tap for OCR</Text>
          </View>
        </View>
      </SafeAreaView>

      {/* OCR Loading Overlay */}
      {isProcessingOCR && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#38BDF8" />
            <Text style={styles.ocrLoadingTitle}>Processing Label with PaddleOCR</Text>
            <Text style={styles.ocrLoadingDesc}>
              Detecting text fields, product name, batch number & expiry date...
            </Text>
          </View>
        </View>
      )}

      {/* Scan / Extraction Result Modal */}
      <Modal
        visible={showResultModal}
        transparent
        animationType="slide"
        onRequestClose={handleScanAgain}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleGroup}>
                <View
                  style={[
                    styles.sourceTag,
                    {
                      backgroundColor:
                        scanResult?.source === 'PADDLE_OCR'
                          ? 'rgba(139, 92, 246, 0.15)'
                          : scanResult?.source === 'QR_CODE'
                          ? 'rgba(16, 185, 129, 0.15)'
                          : 'rgba(56, 189, 248, 0.15)',
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      scanResult?.source === 'PADDLE_OCR'
                        ? 'text-outline'
                        : scanResult?.source === 'QR_CODE'
                        ? 'qr-code-outline'
                        : 'barcode-outline'
                    }
                    size={14}
                    color={
                      scanResult?.source === 'PADDLE_OCR'
                        ? '#A78BFA'
                        : scanResult?.source === 'QR_CODE'
                        ? '#10B981'
                        : '#38BDF8'
                    }
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.sourceTagText,
                      {
                        color:
                          scanResult?.source === 'PADDLE_OCR'
                            ? '#A78BFA'
                            : scanResult?.source === 'QR_CODE'
                            ? '#10B981'
                            : '#38BDF8',
                      },
                    ]}
                  >
                    {scanResult?.source === 'PADDLE_OCR'
                      ? 'PaddleOCR Extracted'
                      : scanResult?.source === 'QR_CODE'
                      ? scanResult.barcodeType || 'QR Code Captured'
                      : 'Barcode Captured'}
                  </Text>
                </View>
                <Text style={styles.modalTitle}>Recognition Result</Text>
              </View>

              {scanResult?.confidence && (
                <View style={styles.confidenceBadge}>
                  <Text style={styles.confidenceText}>
                    {Math.round(scanResult.confidence * 100)}% Match
                  </Text>
                </View>
              )}
            </View>

            {/* Extracted Details Box */}
            <View style={styles.detailsBox}>
              {scanResult?.productName ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Product:</Text>
                  <Text style={styles.detailValueBold}>{scanResult.productName}</Text>
                </View>
              ) : null}

              {scanResult?.barcode ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Barcode / GTIN:</Text>
                  <Text style={styles.detailValue}>{scanResult.barcode}</Text>
                </View>
              ) : null}

              {scanResult?.sku ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>SKU:</Text>
                  <Text style={styles.detailValue}>{scanResult.sku}</Text>
                </View>
              ) : null}

              {scanResult?.batchNumber ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Batch / Lot:</Text>
                  <Text style={[styles.detailValueBold, { color: '#38BDF8' }]}>
                    {scanResult.batchNumber}
                  </Text>
                </View>
              ) : null}

              {scanResult?.expiryDate ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Expiry Date:</Text>
                  <Text style={[styles.detailValueBold, { color: '#10B981' }]}>
                    {scanResult.expiryDate}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Action Buttons */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.retakeButton}
                onPress={handleScanAgain}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh" size={16} color="#CBD5E1" style={{ marginRight: 6 }} />
                <Text style={styles.retakeButtonText}>Scan Again</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.validateButton}
                onPress={() => {
                  setShowResultModal(false);
                  if (scanResult) {
                    onProceedToValidate(scanResult, shipment);
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.validateButtonText}>Proceed to Validate</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Manual Entry Fallback Modal */}
      <Modal
        visible={showManualModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowManualModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Manual Identifier Entry</Text>
            <Text style={styles.modalSubtitle}>
              If label is damaged or unreadable by camera, enter Barcode / SKU manually.
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="e.g. 08901234567890 or MED-PARA-500"
              placeholderTextColor="#64748B"
              value={manualCode}
              onChangeText={setManualCode}
              autoFocus
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.retakeButton}
                onPress={() => setShowManualModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.retakeButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.validateButton}
                onPress={handleManualSubmit}
                activeOpacity={0.85}
              >
                <Text style={styles.validateButtonText}>Submit Code</Text>
              </TouchableOpacity>
            </View>
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
    backgroundColor: '#0F172A',
  },
  permissionText: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 12,
  },
  permissionCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    width: '100%',
    maxWidth: 360,
  },
  permissionIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  permissionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 8,
    textAlign: 'center',
  },
  permissionDesc: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#0284C7',
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  permissionCancelButton: {
    paddingVertical: 8,
  },
  permissionCancelText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  overlayContainer: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight : 0,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
  poPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  poPillText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  centerSection: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanReticle: {
    width: 280,
    height: 280,
    borderRadius: 20,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderColor: '#38BDF8',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 16,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 16,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 16,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 16,
  },
  laserLine: {
    width: '90%',
    height: 2,
    backgroundColor: '#38BDF8',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 6,
  },
  reticleInstruction: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 20,
    textAlign: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
    overflow: 'hidden',
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  manualEntryBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    minWidth: 90,
  },
  manualEntryText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  ocrCaptureButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ocrCaptureInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#0284C7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  modeIndicator: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    minWidth: 90,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginBottom: 4,
  },
  modeText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
  },
  modeTextSub: {
    color: '#94A3B8',
    fontSize: 9,
    marginTop: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    width: '100%',
    maxWidth: 320,
  },
  ocrLoadingTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
    marginTop: 16,
    textAlign: 'center',
  },
  ocrLoadingDesc: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalHeaderTitleGroup: {
    flex: 1,
  },
  sourceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  sourceTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    marginBottom: 16,
  },
  confidenceBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  confidenceText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
  detailsBox: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 20,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    color: '#F8FAFC',
    fontWeight: '600',
  },
  detailValueBold: {
    fontSize: 14,
    color: '#F8FAFC',
    fontWeight: '700',
  },
  modalInput: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#F8FAFC',
    paddingHorizontal: 14,
    height: 48,
    fontSize: 14,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  retakeButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  retakeButtonText: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '600',
  },
  validateButton: {
    flex: 1.5,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#0284C7',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  validateButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
