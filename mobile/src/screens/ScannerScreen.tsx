import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { InboundShipmentWithItems } from '../services/receiving';
import { OutboundOrder } from '../services/dispatch';
import {
  decodePharmaBarcode,
  matchPharmaMasterMedicine,
  REAL_MASTER_MEDICINES,
  ExtractedLabelData,
} from '../services/ocr';
import { sendBase64ToPaddleOcr, sendImageToPaddleOcr } from '../services/inventoryService';

interface ScannerScreenProps {
  shipment?: InboundShipmentWithItems;
  order?: OutboundOrder;
  mode?: 'RECEIVING' | 'PICK_PACK';
  onBack: () => void;
  onProceedToValidate: (
    extractedData: ExtractedLabelData,
    shipment?: InboundShipmentWithItems,
    order?: OutboundOrder
  ) => void;
}

export default function ScannerScreen({
  shipment,
  order,
  mode,
  onBack,
  onProceedToValidate,
}: ScannerScreenProps) {
  const isPickMode = mode === 'PICK_PACK' || Boolean(order);
  const targetCode = order ? order.orderNumber : (shipment?.poNumber || '');
  const partnerName = order ? order.customerName : (shipment?.supplierName || '');
  const orderPrimary = order?.items[0];
  const primaryItem = order
    ? {
        id: orderPrimary?.id || '',
        name: orderPrimary?.productName || '',
        sku: orderPrimary?.sku || '',
        barcode: '',
        packSize: '',
        unit: 'BOX',
      }
    : shipment?.items[0]?.product;

  const defaultExpectedBatch = order ? (orderPrimary?.suggestedBatch || '') : (shipment?.items[0]?.expectedBatch || '');
  const defaultExpectedQty = order ? (orderPrimary?.requiredQty || 10) : (shipment?.items[0]?.expectedQty || 10);
  const expectedItemsList = order
    ? order.items.map((i) => ({
        id: i.id,
        product: { id: i.id, name: i.productName, sku: i.sku, barcode: '', packSize: '', unit: 'BOX' },
        expectedBatch: i.suggestedBatch,
        expectedQty: i.requiredQty,
      }))
    : shipment?.items || [];

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const isBusyRef = useRef<boolean>(false);

  // Auto-request camera permission on screen entry if not determined or can ask again
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission]);

  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualCode, setManualCode] = useState('');

  // Editable Form Fields inside the Modal
  const [poNumber, setPoNumber] = useState(targetCode);
  const [productName, setProductName] = useState('');
  const [sku, setSku] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [mfgDate, setMfgDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [scanSource, setScanSource] = useState<'BARCODE' | 'QR_CODE' | 'OCR' | 'MANUAL'>('OCR');
  const [detectedLines, setDetectedLines] = useState<string[]>([]);
  const [rawCode, setRawCode] = useState('');

  // Helper to match scanned string against products in this PO/Order
  const findMatchingPoItem = (query: string) => {
    const q = query.toLowerCase().trim();
    if (!q) return null;
    return expectedItemsList.find(
      (item) =>
        item.product?.name.toLowerCase().includes(q) ||
        item.product?.sku.toLowerCase().includes(q) ||
        (item.product?.barcode && item.product.barcode.includes(q)) ||
        (item.expectedBatch && item.expectedBatch.toLowerCase().includes(q))
    );
  };

  // 1. Live Barcode & QR Code Scanning Handler (Constant handler to prevent camera rebinding)
  const handleBarcodeScanned = ({ data, type }: { data: string; type: string }) => {
    if (showResultModal || isOcrProcessing || isBusyRef.current) return;

    isBusyRef.current = true;
    const decoded = decodePharmaBarcode(data, type);
    const matchedMaster = matchPharmaMasterMedicine(decoded.barcode || decoded.sku || decoded.productName || data);

    setScanSource(decoded.source === 'QR_CODE' ? 'QR_CODE' : 'BARCODE');
    setRawCode(data);

    // Dynamic resolution: strictly match against scanned physical item, NEVER auto-assume quantity or PO item
    const resolvedName =
      decoded.productName ||
      matchedMaster?.name ||
      (data ? `Scanned (${data.substring(0, 16)})` : '');
    const resolvedSku = decoded.sku || matchedMaster?.sku || '';
    const resolvedBatch = decoded.batchNumber || matchedMaster?.batchNumber || '';
    const resolvedMfg = decoded.mfgDate || matchedMaster?.mfgDate || '';
    const resolvedExpiry = decoded.expiryDate || matchedMaster?.expiryDate || '';
    const resolvedPrice = decoded.price ? decoded.price.toString() : (matchedMaster?.price ? matchedMaster.price.toString() : '');
    const resolvedQty = '';

    setProductName(resolvedName);
    setSku(resolvedSku);
    setBatchNumber(resolvedBatch);
    setMfgDate(resolvedMfg);
    setExpiryDate(resolvedExpiry);
    setQuantity(resolvedQty);
    setPrice(resolvedPrice);
    setDetectedLines([]);
    setShowResultModal(true);
  };

  // 2. Real OCR Text Capture from Live Camera ("Read Text" button)
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
        console.warn('Initial capture notice, retrying with camera sync:', firstErr);
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
          'Could not detect readable text on medicine package. Please position it closer with adequate lighting and try again.'
        );
        return;
      }

      const combinedOcrText = [ocrData.medicineName, ocrData.sku, ocrData.rawText, ...(ocrData.allLines || [])].filter(Boolean).join(' ');
      const matchedMaster = matchPharmaMasterMedicine(combinedOcrText);

      setScanSource('OCR');
      setRawCode('');
      if (ocrData.poNumber) {
        setPoNumber(ocrData.poNumber);
      }

      const detectedName = ocrData.medicineName && ocrData.medicineName !== 'Pharmaceutical Item' && ocrData.medicineName !== 'No text detected' ? ocrData.medicineName : '';
      const finalName = matchedMaster?.name || detectedName || (ocrData.allLines?.[0] || '');
      const finalSku = matchedMaster?.sku || ocrData.sku || '';
      const finalBatch = ocrData.batchNumber || matchedMaster?.batchNumber || '';
      const finalMfg = ocrData.mfgDate || matchedMaster?.mfgDate || '';
      const finalExp = ocrData.expiryDate || matchedMaster?.expiryDate || '';
      const finalPrice = ocrData.mrp ? ocrData.mrp.toString() : (matchedMaster?.price ? matchedMaster.price.toString() : '');
      const finalQty = '';

      setProductName(finalName);
      setSku(finalSku);
      setBatchNumber(finalBatch);
      setMfgDate(finalMfg);
      setExpiryDate(finalExp);
      setQuantity(finalQty);
      setPrice(finalPrice);
      setDetectedLines(ocrData.allLines || []);
      setShowResultModal(true);
    } catch (err: any) {
      console.warn('OCR capture error:', err);
      const isConnectionError =
        err?.message?.includes('ConnectException') ||
        err?.message?.includes('fetch failed') ||
        err?.message?.includes('Network request failed') ||
        err?.message?.includes('Failed to connect');

      Alert.alert(
        'OCR Microservice Notice',
        isConnectionError
          ? `Backend OCR server unreachable (${targetCode ? `Order ${targetCode}` : 'at 192.168.1.56:8001 / 8080'}).\n\nMake sure the OCR backend is running on your PC.\n\nPlease position the camera clearly or enter details manually.`
          : (err.message || 'Failed to process image with OCR microservice.'),
        [
          {
            text: 'Enter Manually',
            onPress: () => {
              setShowManualModal(true);
            },
          },
          {
            text: 'Retry',
            style: 'cancel',
          },
        ]
      );
    } finally {
      setIsOcrProcessing(false);
      setTimeout(() => {
        isBusyRef.current = false;
      }, 300);
    }
  };

  // 3. Manual Entry Fallback Handler
  const handleManualSubmit = () => {
    const cleanManual = manualCode.trim();
    if (!cleanManual) {
      Alert.alert('Input Required', 'Please enter a barcode number or product SKU.');
      return;
    }

    const decoded = decodePharmaBarcode(cleanManual, 'manual');
    const matchedMaster = matchPharmaMasterMedicine(cleanManual);

    setScanSource('MANUAL');
    setRawCode(cleanManual);
    setProductName(decoded.productName || matchedMaster?.name || cleanManual);
    setSku(decoded.sku || matchedMaster?.sku || cleanManual);
    setBatchNumber(decoded.batchNumber || matchedMaster?.batchNumber || '');
    setMfgDate(decoded.mfgDate || matchedMaster?.mfgDate || '');
    setExpiryDate(decoded.expiryDate || matchedMaster?.expiryDate || '');
    setQuantity('');
    setPrice(decoded.price ? decoded.price.toString() : (matchedMaster?.price ? matchedMaster.price.toString() : ''));
    setDetectedLines([]);

    setShowManualModal(false);
    setManualCode('');
    setShowResultModal(true);
  };

  // 4. Confirm Receiving / Picking of This Item
  const handleConfirmReceiving = () => {
    if (!productName.trim()) {
      Alert.alert('Validation Error', 'Product Name is required.');
      return;
    }
    if (!batchNumber.trim()) {
      Alert.alert('Validation Error', 'Batch / Lot Number is required for pharma tracking.');
      return;
    }
    if (!expiryDate.trim() && !isPickMode) {
      Alert.alert('Validation Error', 'Expiry Date is required for pharmaceutical tracking (e.g. MM/YYYY).');
      return;
    }
    const numQty = parseInt(quantity, 10);
    if (!quantity.trim() || isNaN(numQty) || numQty <= 0) {
      Alert.alert(
        'Physical Count Required',
        'Pharma compliance requires the warehouse operator to physically count the delivery packs and enter the verified quantity. Please enter the physical pack count.'
      );
      return;
    }

    setShowResultModal(false);

    const extractedData: ExtractedLabelData = {
      source: scanSource === 'OCR' ? 'MANUAL' : scanSource,
      productName: productName.trim(),
      sku: sku.trim(),
      batchNumber: batchNumber.trim(),
      mfgDate: mfgDate.trim() || undefined,
      expiryDate: expiryDate.trim() || undefined,
      quantity: numQty,
      price: price.trim() || undefined,
      poNumber: poNumber.trim() || targetCode,
      barcode: rawCode || undefined,
      confidence: 0.95,
      rawText: detectedLines.join('\n'),
    };

    onProceedToValidate(extractedData, shipment, order);
  };

  // 5. Reset Scanner for Next Scan
  const handleScanAgain = () => {
    setShowResultModal(false);
  };

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
            {isPickMode
              ? 'Pick & Pack requires camera access to scan medicine packages, barcodes, and verify items for customer dispatch.'
              : 'Goods Reception requires camera access to scan barcodes, QR codes, and extract medicine package text with OCR.'}
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission} activeOpacity={0.8}>
            <Text style={styles.permissionButtonText}>Grant Camera Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.permissionButton, { backgroundColor: '#334155', marginTop: 10 }]}
            onPress={() => setShowManualModal(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="keypad-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.permissionButtonText}>Enter SKU / Barcode Manually</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.permissionCancelButton} onPress={onBack} activeOpacity={0.7}>
            <Text style={styles.permissionCancelText}>Go Back to {isPickMode ? 'Orders' : 'POs'}</Text>
          </TouchableOpacity>
        </View>

        {/* Allow Manual Entry Modal even when camera permission is not yet granted */}
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
                Enter Barcode / SKU manually for {isPickMode ? 'order picking' : 'reception'}.
              </Text>

              <TextInput
                style={styles.modalInput}
                placeholder="e.g. MED-PARA-500 or 08901234567890"
                placeholderTextColor="#64748B"
                value={manualCode}
                onChangeText={setManualCode}
                autoCapitalize="characters"
                autoFocus
              />

              {expectedItemsList.length > 0 && (
                <View style={styles.quickPickSection}>
                  <Text style={styles.quickPickLabel}>Expected in this {isPickMode ? 'Order' : 'PO'}:</Text>
                  {expectedItemsList.map((item) => {
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

        {/* Verification Modal for Manual Input on Permission Screen */}
        <Modal
          visible={showResultModal}
          transparent
          animationType="slide"
          onRequestClose={handleScanAgain}
        >
          <KeyboardAvoidingView
            style={styles.modalBackdrop}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderTitleGroup}>
                  <Text style={styles.modalTitle}>{isPickMode ? 'Verify Item to Pick' : 'Receive Medicine for PO'}</Text>
                </View>
                <TouchableOpacity onPress={handleScanAgain} style={styles.modalCloseButton}>
                  <Ionicons name="close" size={20} color="#94A3B8" />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.inputGroup}>
                  <Text style={styles.fieldLabel}>Product Name *</Text>
                  <TextInput style={styles.fieldInput} value={productName} onChangeText={setProductName} />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.fieldLabel}>SKU *</Text>
                  <TextInput style={styles.fieldInput} value={sku} onChangeText={setSku} />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.fieldLabel}>Batch / Lot *</Text>
                  <TextInput style={styles.fieldInput} value={batchNumber} onChangeText={setBatchNumber} />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.fieldLabel}>Quantity *</Text>
                  <TextInput style={styles.fieldInput} value={quantity} onChangeText={setQuantity} keyboardType="numeric" />
                </View>
              </ScrollView>
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.retakeButton} onPress={handleScanAgain} activeOpacity={0.7}>
                  <Text style={styles.retakeButtonText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.validateButton} onPress={handleConfirmReceiving} activeOpacity={0.85}>
                  <Text style={styles.validateButtonText}>Proceed to Validate</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
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
        onBarcodeScanned={handleBarcodeScanned}
      />

      {/* Viewfinder Overlay */}
      <SafeAreaView style={styles.overlayContainer}>
        {/* Top Control Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconButton} onPress={onBack} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={[styles.poPill, isPickMode && { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#F59E0B' }]}>
            <Ionicons name={isPickMode ? 'cart' : 'document-text'} size={14} color={isPickMode ? '#F59E0B' : '#38BDF8'} style={{ marginRight: 6 }} />
            <Text style={[styles.poPillText, isPickMode && { color: '#F59E0B' }]}>{targetCode}</Text>
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

            {/* Scanning Indicator */}
            {isOcrProcessing ? (
              <View style={styles.reticleSpinner}>
                <ActivityIndicator size="large" color="#38BDF8" />
                <Text style={styles.processingText}>Reading Package Text (OCR)...</Text>
              </View>
            ) : (
              <View style={styles.laserLine} />
            )}
          </View>
          <Text style={styles.reticleInstruction}>
            Auto-scanning Barcode / QR • Or tap Read Text (OCR) below
          </Text>
        </View>

        {/* Bottom Bar: Manual Entry, OCR Shutter Button, and Mode Indicator */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.manualEntryBtn}
            onPress={() => setShowManualModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="keypad-outline" size={20} color="#CBD5E1" />
            <Text style={styles.manualEntryText}>Manual</Text>
          </TouchableOpacity>

          {/* Central "Read Text (OCR)" Shutter Button */}
          <TouchableOpacity
            style={[styles.ocrCaptureBtn, isOcrProcessing && styles.ocrCaptureBtnDisabled]}
            onPress={handleCaptureOcr}
            disabled={isOcrProcessing}
            activeOpacity={0.85}
          >
            {isOcrProcessing ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="camera" size={22} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.ocrCaptureBtnText}>Read Text (OCR)</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.modeIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.modeText}>Active</Text>
            <Text style={styles.modeTextSub}>{isPickMode ? 'Pick & Pack' : 'PO Reception'}</Text>
          </View>
        </View>
      </SafeAreaView>

      {/* Reception Verification Modal with all Required Text Fields */}
      <Modal
        visible={showResultModal}
        transparent
        animationType="slide"
        onRequestClose={handleScanAgain}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleGroup}>
                <View
                  style={[
                    styles.sourceTag,
                    {
                      backgroundColor:
                        scanSource === 'OCR'
                          ? 'rgba(14, 165, 233, 0.15)'
                          : scanSource === 'QR_CODE'
                          ? 'rgba(16, 185, 129, 0.15)'
                          : 'rgba(56, 189, 248, 0.15)',
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      scanSource === 'OCR'
                        ? 'scan-outline'
                        : scanSource === 'QR_CODE'
                        ? 'qr-code-outline'
                        : 'barcode-outline'
                    }
                    size={13}
                    color={
                      scanSource === 'OCR'
                        ? '#38BDF8'
                        : scanSource === 'QR_CODE'
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
                          scanSource === 'OCR'
                            ? '#38BDF8'
                            : scanSource === 'QR_CODE'
                            ? '#10B981'
                            : '#38BDF8',
                      },
                    ]}
                  >
                    {scanSource === 'OCR'
                      ? 'PaddleOCR Real Text'
                      : scanSource === 'QR_CODE'
                      ? 'QR Code Captured'
                      : scanSource === 'MANUAL'
                      ? 'Manual Code'
                      : 'Barcode Captured'}
                  </Text>
                </View>
                <Text style={styles.modalTitle}>{isPickMode ? 'Verify Item to Pick' : 'Receive Medicine for PO'}</Text>
              </View>

              <TouchableOpacity onPress={handleScanAgain} style={styles.modalCloseButton}>
                <Ionicons name="close" size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Scrollable Form Fields */}
            <ScrollView
              style={styles.modalScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Field 1: Reference Code & Partner (Read-Only Context) */}
              <View style={styles.poSummaryCard}>
                <View style={styles.poSummaryRow}>
                  <Text style={styles.poSummaryLabel}>{isPickMode ? 'Order Number:' : 'Purchase Order (PO):'}</Text>
                  <Text style={styles.poSummaryValue}>{poNumber || targetCode}</Text>
                </View>
                <View style={styles.poSummaryRow}>
                  <Text style={styles.poSummaryLabel}>{isPickMode ? 'Customer / Hospital:' : 'Supplier / Vendor:'}</Text>
                  <Text style={styles.poSummaryValueSub}>{partnerName}</Text>
                </View>
              </View>

              {/* Field 2: Product Name */}
              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>Product Name *</Text>
                <View style={styles.fieldInputWrapper}>
                  <Ionicons name="medkit-outline" size={17} color="#64748B" style={styles.fieldIcon} />
                  <TextInput
                    style={styles.fieldInput}
                    value={productName}
                    onChangeText={setProductName}
                    placeholder="e.g. Paracetamol 500mg Tablets"
                    placeholderTextColor="#64748B"
                  />
                </View>
              </View>

              {/* Field 3: SKU */}
              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>SKU / Product Code</Text>
                <View style={styles.fieldInputWrapper}>
                  <Ionicons name="pricetag-outline" size={17} color="#64748B" style={styles.fieldIcon} />
                  <TextInput
                    style={styles.fieldInput}
                    value={sku}
                    onChangeText={setSku}
                    placeholder="e.g. MED-PARA-500"
                    placeholderTextColor="#64748B"
                    autoCapitalize="characters"
                  />
                </View>
              </View>

              {/* Two Column: Batch Number & Price / MRP */}
              <View style={styles.twoColRow}>
                {/* Field 4: Batch Number */}
                <View style={[styles.inputGroup, { flex: 1, marginRight: 6 }]}>
                  <Text style={styles.fieldLabel}>Batch / Lot No *</Text>
                  <View style={styles.fieldInputWrapper}>
                    <Ionicons name="barcode-outline" size={17} color="#64748B" style={styles.fieldIcon} />
                    <TextInput
                      style={styles.fieldInput}
                      value={batchNumber}
                      onChangeText={setBatchNumber}
                      placeholder="e.g. BATCH-99"
                      placeholderTextColor="#64748B"
                      autoCapitalize="characters"
                    />
                  </View>
                </View>

                {/* Field 5: Price / MRP */}
                <View style={[styles.inputGroup, { flex: 1, marginLeft: 6 }]}>
                  <Text style={styles.fieldLabel}>Price / MRP (₹)</Text>
                  <View style={styles.fieldInputWrapper}>
                    <Ionicons name="cash-outline" size={17} color="#64748B" style={styles.fieldIcon} />
                    <TextInput
                      style={styles.fieldInput}
                      value={price}
                      onChangeText={setPrice}
                      placeholder="e.g. 145.50"
                      placeholderTextColor="#64748B"
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>

              {/* Two Column: Manufacture Date & Expiry Date */}
              <View style={styles.twoColRow}>
                {/* Field 6: Manufacture Date */}
                <View style={[styles.inputGroup, { flex: 1, marginRight: 6 }]}>
                  <Text style={styles.fieldLabel}>Manufacture Date</Text>
                  <View style={styles.fieldInputWrapper}>
                    <Ionicons name="calendar-outline" size={17} color="#64748B" style={styles.fieldIcon} />
                    <TextInput
                      style={styles.fieldInput}
                      value={mfgDate}
                      onChangeText={setMfgDate}
                      placeholder="MM/YYYY"
                      placeholderTextColor="#64748B"
                    />
                  </View>
                </View>

                {/* Field 7: Expiry Date */}
                <View style={[styles.inputGroup, { flex: 1, marginLeft: 6 }]}>
                  <Text style={styles.fieldLabel}>Expiry Date *</Text>
                  <View style={styles.fieldInputWrapper}>
                    <Ionicons name="time-outline" size={17} color="#64748B" style={styles.fieldIcon} />
                    <TextInput
                      style={styles.fieldInput}
                      value={expiryDate}
                      onChangeText={setExpiryDate}
                      placeholder="MM/YYYY"
                      placeholderTextColor="#64748B"
                    />
                  </View>
                </View>
              </View>

              {/* Field 8: Quantity (Received Units with Stepper) */}
              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>Received Quantity (Units / Packs) *</Text>
                <View style={styles.stepperContainer}>
                  <TouchableOpacity
                    style={styles.stepperButton}
                    onPress={() => {
                      const val = Math.max(1, (parseInt(quantity, 10) || 1) - 5);
                      setQuantity(val.toString());
                    }}
                  >
                    <Text style={styles.stepperButtonText}>-5</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.stepperButton}
                    onPress={() => {
                      const val = Math.max(1, (parseInt(quantity, 10) || 1) - 1);
                      setQuantity(val.toString());
                    }}
                  >
                    <Ionicons name="remove" size={18} color="#F8FAFC" />
                  </TouchableOpacity>

                  <TextInput
                    style={styles.stepperInput}
                    value={quantity}
                    onChangeText={setQuantity}
                    placeholder="Count"
                    placeholderTextColor="#64748B"
                    keyboardType="numeric"
                  />

                  <TouchableOpacity
                    style={styles.stepperButton}
                    onPress={() => {
                      const val = (parseInt(quantity, 10) || 0) + 1;
                      setQuantity(val.toString());
                    }}
                  >
                    <Ionicons name="add" size={18} color="#F8FAFC" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.stepperButton}
                    onPress={() => {
                      const val = (parseInt(quantity, 10) || 0) + 5;
                      setQuantity(val.toString());
                    }}
                  >
                    <Text style={styles.stepperButtonText}>+5</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>

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
                onPress={handleConfirmReceiving}
                activeOpacity={0.85}
              >
                <Ionicons name="shield-checkmark" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.validateButtonText}>Proceed to PO Validation</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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

            {/* Quick Pick from Expected Items in PO / Order */}
            {expectedItemsList.length > 0 && (
              <View style={styles.quickPickSection}>
                <Text style={styles.quickPickLabel}>Expected in this {isPickMode ? 'Order' : 'PO'}:</Text>
                {expectedItemsList.map((item) => {
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
  reticleSpinner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
  },
  reticleInstruction: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 16,
    textAlign: 'center',
    paddingHorizontal: 24,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  manualEntryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  manualEntryText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  ocrCaptureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284C7',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 5,
    borderWidth: 1.5,
    borderColor: '#38BDF8',
  },
  ocrCaptureBtnDisabled: {
    backgroundColor: '#075985',
    opacity: 0.8,
  },
  ocrCaptureBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  modeIndicator: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
    marginBottom: 2,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    borderWidth: 1,
    borderColor: '#334155',
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  modalHeaderTitleGroup: {
    flex: 1,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
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
    fontSize: 17,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    marginBottom: 16,
  },
  modalScroll: {
    maxHeight: 380,
  },
  poSummaryCard: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  poSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 2,
  },
  poSummaryLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  poSummaryValue: {
    fontSize: 12,
    color: '#38BDF8',
    fontWeight: '800',
  },
  poSummaryValueSub: {
    fontSize: 11,
    color: '#CBD5E1',
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 10,
  },
  twoColRow: {
    flexDirection: 'row',
  },
  fieldLabel: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  fieldInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 10,
    height: 42,
  },
  fieldIcon: {
    marginRight: 6,
  },
  fieldInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 13,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 3,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperButtonText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  stepperInput: {
    flex: 1,
    textAlign: 'center',
    color: '#38BDF8',
    fontSize: 16,
    fontWeight: '800',
  },
  ocrLinesBox: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  ocrLinesTitle: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  ocrLineText: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'monospace',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  retakeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#334155',
    paddingVertical: 13,
    borderRadius: 12,
  },
  retakeButtonText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  validateButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 13,
    borderRadius: 12,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 3,
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
