import { useState } from 'react';
import { Modal, View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { X } from 'lucide-react-native';

interface QrSlipScannerProps {
  visible: boolean;
  onClose: () => void;
  /** Called once per successful scan — the caller closes the scanner itself
   * (e.g. after the verify-slip-qr request resolves), so a slow network
   * doesn't let the camera fire the same QR code twice in a row. */
  onScanned: (qrData: string) => void;
}

/** Full-screen camera modal that scans a bank slip's QR code once, then waits
 * to be re-opened — no auto re-arm, since the caller is still verifying the
 * previous scan against Slip2Go. */
export function QrSlipScanner({ visible, onClose, onScanned }: QrSlipScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);

  function handleScanned(data: string) {
    if (locked) return;
    setLocked(true);
    onScanned(data);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} onShow={() => setLocked(false)}>
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-black">
          <View className="flex-row items-center justify-between px-4 py-3">
            <Text className="text-[16px] font-bold text-white">สแกน QR บนสลิปโอนเงิน</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <X size={22} color="#FFFFFF" />
            </Pressable>
          </View>

          {!permission ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color="#FFFFFF" />
            </View>
          ) : !permission.granted ? (
            <View className="flex-1 items-center justify-center gap-4 px-8">
              <Text className="text-center text-[14px] text-white">แอปต้องขอสิทธิ์ใช้กล้องเพื่อสแกน QR บนสลิป</Text>
              <Pressable onPress={requestPermission} className="h-11 px-6 items-center justify-center rounded-lg bg-primary">
                <Text className="text-[14px] font-semibold text-white">อนุญาตใช้กล้อง</Text>
              </Pressable>
            </View>
          ) : (
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={(result) => handleScanned(result.data)}
            />
          )}

          <Text className="text-center text-[12px] text-white/70 py-4 px-8">
            วาง QR บนสลิปให้อยู่ในกรอบกล้อง
          </Text>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
