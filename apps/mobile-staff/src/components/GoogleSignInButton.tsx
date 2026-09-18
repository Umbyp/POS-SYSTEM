import { useEffect } from 'react';
import { Alert } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { Button } from './Button';

WebBrowser.maybeCompleteAuthSession();

const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

interface GoogleSignInButtonProps {
  onIdToken: (idToken: string) => void;
  disabled?: boolean;
}

// Requires an iOS OAuth client from Google Cloud Console (EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID)
// and a custom dev client / EAS build — the native Google flow doesn't run in Expo Go.
export function GoogleSignInButton({ onIdToken, disabled }: GoogleSignInButtonProps) {
  const [request, response, promptAsync] = Google.useAuthRequest(
    iosClientId ? { iosClientId } : { clientId: 'unconfigured' }
  );

  useEffect(() => {
    if (response?.type === 'success' && response.authentication?.idToken) {
      onIdToken(response.authentication.idToken);
    }
  }, [response, onIdToken]);

  return (
    <Button
      label="เข้าสู่ระบบด้วย Google"
      variant="secondary"
      disabled={disabled || !iosClientId || !request}
      onPress={() => {
        if (!iosClientId) {
          Alert.alert('ยังไม่ได้ตั้งค่า Google Sign-In', 'ต้องตั้งค่า EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ก่อนใช้งาน');
          return;
        }
        promptAsync();
      }}
    />
  );
}
