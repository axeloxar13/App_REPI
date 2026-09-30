// hooks/usePushNotifications.ts
import { useEffect, useRef, useState } from 'react';
import { Platform, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { router } from 'expo-router';

// Configurar el comportamiento de las notificaciones cuando la app está en primer plano
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Tipos
type PushNotification = {
  title: string;
  body: string;
  data?: {
    installationId?: string;
    type?: 'status_change' | 'handoff' | 'photo' | 'installation';
  };
};

type UsePushNotificationsReturn = {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
  error: Error | null;
  registerForPushNotificationsAsync: () => Promise<string | null>;
  sendNotification: (token: string, notification: PushNotification) => Promise<void>;
  scheduleLocalNotification: (notification: PushNotification, seconds?: number) => Promise<void>;
};

export function usePushNotifications(): UsePushNotificationsReturn {
  const { user, selectedMembership } = useAuth();
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  const registerForPushNotificationsAsync = async (): Promise<string | null> => {
    let token: string | null = null;

    try {
      if (!Device.isDevice) {
        Alert.alert('Aviso', 'Las notificaciones push solo funcionan en dispositivos físicos');
        return null;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        Alert.alert('Error', 'No se otorgaron permisos para notificaciones');
        return null;
      }

      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      
      if (!projectId) {
        setError(new Error('Project ID no encontrado'));
        return null;
      }

      token = (await Notifications.getExpoPushTokenAsync({
        projectId,
      })).data;

      setExpoPushToken(token);
      console.log('📱 Expo Push Token:', token);

      if (user && selectedMembership) {
        const { error: upsertError } = await supabase
          .from('push_devices')
          .upsert({
            user_id: user.id,
            organization_id: selectedMembership.organizationId,
            device_token: token,
            platform: Platform.OS,
            device_name: Device.deviceName || 'Dispositivo móvil',
            last_active_at: new Date().toISOString(),
          }, {
            onConflict: 'device_token',
          });

        if (upsertError) {
          console.error('Error guardando token:', upsertError);
          setError(upsertError);
        }
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#0f5fb8',
        });
      }

    } catch (err) {
      console.error('Error registrando notificaciones:', err);
      setError(err as Error);
      token = null;
    }

    return token;
  };

  const sendNotification = async (token: string, notification: PushNotification) => {
    try {
      const message = {
        to: token,
        sound: 'default',
        title: notification.title,
        body: notification.body,
        data: notification.data,
      };

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      const result = await response.json();

      if (result.data?.status === 'error') {
        console.error('Error enviando notificación:', result.data.message);
      }

    } catch (err) {
      console.error('Error send notification:', err);
      throw err;
    }
  };

  const scheduleLocalNotification = async (notification: PushNotification, seconds: number = 1) => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: notification.data,
          sound: 'default',
        },
        trigger: {
          seconds: seconds,
        },
      });
    } catch (err) {
      console.error('Error scheduling notification:', err);
    }
  };

  const sendToOrganizationAdmins = async (
    organizationId: string,
    notification: PushNotification,
    excludeUserId?: string
  ) => {
    try {
      const { data: devices, error: devicesError } = await supabase
        .from('push_devices')
        .select('device_token, user_id')
        .eq('organization_id', organizationId)
        .neq('user_id', excludeUserId || '');

      if (devicesError) throw devicesError;

      const tokens = devices.map(d => d.device_token).filter(Boolean);

      await Promise.all(
        tokens.map(token => sendNotification(token, notification))
      );

      console.log(`✅ Notificaciones enviadas a ${tokens.length} dispositivos`);

    } catch (err) {
      console.error('Error sending to organization admins:', err);
    }
  };

  useEffect(() => {
    if (user && selectedMembership) {
      registerForPushNotificationsAsync();
    }

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      
      if (data?.installationId) {
        router.push(`/installations/${data.installationId}`);
      }
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [user, selectedMembership]);

  return {
    expoPushToken,
    notification,
    error,
    registerForPushNotificationsAsync,
    sendNotification,
    scheduleLocalNotification,
  };
}