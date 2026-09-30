import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { colors } from '../constants/theme';
import { supabase } from './supabase';

export const INSTALLATION_NOTIFICATION_CHANNEL_ID =
  'installation-events-default-v1';
export const INSTALLATION_NOTIFICATION_SOUND = 'default';

export type PushPermissionState =
  | 'unknown'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'missing-project-id'
  | 'error';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getProjectId() {
  return (
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId ??
    ''
  );
}

async function configureAndroidChannel() {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(
    INSTALLATION_NOTIFICATION_CHANNEL_ID,
    {
      name: 'Nuevas instalaciones',
      description:
        'Alertas cuando administraci\u00f3n asigna una nueva instalaci\u00f3n',
      importance: Notifications.AndroidImportance.HIGH,
      sound: INSTALLATION_NOTIFICATION_SOUND,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: colors.primary,
    },
  );
}

async function buildDeviceIdentifier(expoPushToken: string) {
  const source = [
    Platform.OS,
    Device.osName ?? 'unknown-os',
    Device.osVersion ?? 'unknown-version',
    Device.modelName ?? 'unknown-model',
    expoPushToken,
  ].join(':');

  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, source);
}

export async function getCurrentPushPermissionState(): Promise<PushPermissionState> {
  if (!Device.isDevice) {
    return 'unavailable';
  }

  const permissions = await Notifications.getPermissionsAsync();

  if (permissions.granted) {
    return 'granted';
  }

  if (permissions.status === 'denied') {
    return 'denied';
  }

  return 'unknown';
}

export async function registerPushDevice(
  userId: string,
): Promise<PushPermissionState> {
  if (!userId) {
    return 'error';
  }

  if (!supabase) {
    return 'error';
  }

  if (!Device.isDevice) {
    return 'unavailable';
  }

  const projectId = getProjectId();

  if (!projectId) {
    return 'missing-project-id';
  }

  await configureAndroidChannel();

  const currentPermissions = await Notifications.getPermissionsAsync();
  const finalPermissions = currentPermissions.granted
    ? currentPermissions
    : await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });

  if (!finalPermissions.granted) {
    return 'denied';
  }

  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  const deviceIdentifier = await buildDeviceIdentifier(data);

  const { error } = await supabase.rpc('register_user_push_device', {
    p_expo_push_token: data,
    p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
    p_device_identifier: deviceIdentifier,
  });

  return error ? 'error' : 'granted';
}

export async function deactivateCurrentPushDevice(userId: string | null) {
  if (!supabase || !userId || !Device.isDevice) {
    return;
  }

  const projectId = getProjectId();

  if (!projectId) {
    return;
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase
      .from('user_push_devices')
      .update({
        is_active: false,
        last_seen_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('expo_push_token', data);
  } catch {
    // No bloquea el cierre de sesion.
  }
}

export async function syncApplicationBadge(unreadCount: number) {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, unreadCount));
  } catch {
    // El badge puede no estar disponible en Expo Go o en algunos dispositivos.
  }
}
