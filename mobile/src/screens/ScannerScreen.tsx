import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  SafeAreaView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { InboundShipmentWithItems } from '../services/receiving';
import {
  decodePharmaBarcode,
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
  const [scanResult, setScanResult] = useState<ExtractedLabelData | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualCode, setManualCode] = useState('');

  // Primary expected medicine in this PO
  const primaryItem = shipment.items[0]?.product;

  // 1. Live Barcode & QR Code Scanning Handler
  const handleBarcodeScanned = ({ data, type }: { data: string; type: string }) => {
    if (showResultModal) return;

    const decoded = decodePharmaBarcode(data, type);
    setScanResult(decoded);
    setShowResultModal(true);
  };

  // 2. Manual Barcode Entry Fallback Handler
  const handleManualSubmit = () => {
    if (!manualCode.trim()) {
      Alert.alert('Input Required', 'Please enter a barcode number or product SKU.');
      return;
    }

    const decoded = decodePharmaBarcode(manualCode.trim(), 'manual');
    decoded.source = 'MANUAL';

    // If matches expected PO product, attach known details
    if (primaryItem && (primaryItem.sku.toLowerCase() === manualCode.trim().toLowerCase() || primaryItem.barcode === manualCode.trim())) {
      decoded.productName = primaryItem.name;
      decoded.sku = primaryItem.sku;
      decoded.batchNumber = shipment.items[0]?.expectedBatch;
    }

    setScanResult(decoded);
    setShowManualModal(false);
    setManualCode('');
    setShowResultModal(true);
  };

  // 3. Reset Scanner for Next Scan
  const handleScanAgain = () => {
    setShowResultModal(false);
    setScanResult(null);
  };

  if (!permission) {
    return (
      <View style={[styles.container, styles.centered]}>
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
            Congiotech Inventory needs camera access to scan pharmaceutical barcodes and QR codes for goods reception.
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

      {/* Live Camera View for Barcode & QR Scanning */}
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
            Position Barcode or QR Code inside frame
          </Text>
        </View>

        {/* Bottom Bar: Manual Entry & Scanner Status */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.manualEntryBtn}
            onPress={() => setShowManualModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="keypad-outline" size={20} color="#CBD5E1" />
            <Text style={styles.manualEntryText}>Manual Entry</Text>
          </TouchableOpacity>

          <View style={styles.modeIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.modeText}>Barcode / QR</Text>
            <Text style={styles.modeTextSub}>Auto-Detect Active</Text>
          </View>
        </View>
      </SafeAreaView>

      {/* Scan Result Modal */}
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
                        scanResult?.source === 'QR_CODE'
                          ? 'rgba(16, 185, 129, 0.15)'
                          : 'rgba(56, 189, 248, 0.15)',
                    },
                  ]}
                >
                  <Ionicons
                    name={scanResult?.source === 'QR_CODE' ? 'qr-code-outline' : 'barcode-outline'}
                    size={14}
                    color={scanResult?.source === 'QR_CODE' ? '#10B981' : '#38BDF8'}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.sourceTagText,
                      {
                        color: scanResult?.source === 'QR_CODE' ? '#10B981' : '#38BDF8',
                      },
                    ]}
                  >
                    {scanResult?.source === 'QR_CODE'
                      ? scanResult.barcodeType || 'QR Code Captured'
                      : scanResult?.source === 'MANUAL'
                      ? 'Manual Entry'
                      : 'Barcode Captured'}
                  </Text>
                </View>
                <Text style={styles.modalTitle}>Scan Result</Text>
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
                  <Text style={styles.detailLabel}>Barcode / Code:</Text>
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
              If barcode is damaged or unreadable, enter Barcode / SKU manually.
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="e.g. 08901234567890 or MED-PARA-500"
              placeholderTextColor="#64748B"
              value={manualCode}
              onChangeText={setManualCode}
              autoCapitalize="characters"
              autoFocus
            />

            {/* Quick Pick from Expected Items in PO */}
            {shipment.items.length > 0 && (
              <View style={styles.quickPickSection}>
                <Text style={styles.quickPickLabel}>Expected in this PO:</Text>
                {shipment.items.map((item) => {
                  const prod = item.product;
                  if (!prod) return null;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.quickPickItem}
                      onPress={() => setManualCode(prod.sku)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="medical" size={14} color="#38BDF8" style={{ marginRight: 6 }} />
                      <Text style={styles.quickPickItemName}>{prod.name}</Text>
                      <Text style={styles.quickPickItemSku}>({prod.sku})</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.retakeButton}
                onPress={() => {
                  setShowManualModal(false);
                  setManualCode('');
                }}
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
    backgroundColor: '#0F172A',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionCard: {
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 28,
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
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 10,
    textAlign: 'center',
  },
  permissionDesc: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#0284C7',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  permissionCancelButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  permissionCancelText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  permissionText: {
    color: '#94A3B8',
    fontSize: 14,
  },
  overlayContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  iconButtonActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  poPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
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
    width: 270,
    height: 270,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: '#38BDF8',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 14,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 14,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 14,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 14,
  },
  laserLine: {
    width: '90%',
    height: 2,
    backgroundColor: '#38BDF8',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 4,
  },
  reticleInstruction: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 20,
    textAlign: 'center',
    paddingHorizontal: 30,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  manualEntryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  manualEntryText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  modeIndicator: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
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
    fontSize: 12,
    fontWeight: '700',
  },
  modeTextSub: {
    color: '#94A3B8',
    fontSize: 9,
    marginTop: 1,
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
    fontWeight: '800',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  retakeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#334155',
    paddingVertical: 14,
    borderRadius: 14,
  },
  retakeButtonText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  validateButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284C7',
    paddingVertical: 14,
    borderRadius: 14,
  },
  validateButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  modalInput: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#F8FAFC',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  quickPickSection: {
    marginBottom: 16,
  },
  quickPickLabel: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
    marginBottom: 8,
  },
  quickPickItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  quickPickItemName: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  quickPickItemSku: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
});
