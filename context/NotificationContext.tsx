import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
  AppState,
  Linking,
  type AppStateStatus,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import {
  getCurrentPushPermissionState,
  registerPushDevice,
  syncApplicationBadge,
  type PushPermissionState,
} from '../lib/pushNotifications';
import type {
  TechnicianNotification,
  TechnicianNotificationRow,
} from '../types/database';

type NotificationContextValue = {
  notifications: TechnicianNotification[];
  unreadCount: number;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string;
  permissionState: PushPermissionState;
  refreshNotifications: (mode?: 'loading' | 'refresh') => Promise<void>;
  markNotificationRead: (notification: TechnicianNotification) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  openNotification: (notification: TechnicianNotification) => Promise<void>;
  requestPushPermission: () => Promise<void>;
  openSettings: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

function mapNotificationRow(row: TechnicianNotificationRow): TechnicianNotification {
  return {
    id: row.id,
    organizationId: row.organization_id,
    recipientMembershipId: row.recipient_membership_id,
    recipientUserId: row.recipient_user_id,
    installationId: row.installation_id,
    installationItemId: row.installation_item_id,
    type: row.type,
    title: row.title,
    body: row.body,
    projectNameSnapshot: row.project_name_snapshot,
    clientNameSnapshot: row.client_name_snapshot,
    organizationNameSnapshot: row.organization_name_snapshot,
    isRead: row.is_read,
    readAt: row.read_at,
    createdAt: row.created_at,
    pushStatus: row.push_status,
  };
}

function promptStorageKey(userId: string) {
  return `tamin:push-permission-prompted:${userId}`;
}

export function NotificationProvider({ children }: PropsWithChildren) {
  const {
    status,
    user,
    selectedMembership,
    memberships,
    selectMembership,
  } = useAuth();
  const [notifications, setNotifications] = useState<TechnicianNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [permissionState, setPermissionState] =
    useState<PushPermissionState>('unknown');
  const loadedKeyRef = useRef('');

  const loadPermissionState = useCallback(async () => {
    const nextState = await getCurrentPushPermissionState();
    setPermissionState(nextState);
  }, []);

  const refreshNotifications = useCallback(
    async (mode: 'loading' | 'refresh' = 'loading') => {
      if (status !== 'authenticated' || !selectedMembership || !supabase) {
        loadedKeyRef.current = '';
        setNotifications([]);
        setUnreadCount(0);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      const currentKey = `${selectedMembership.organizationId}:${selectedMembership.id}`;
      const hasLoadedCurrentKey = loadedKeyRef.current === currentKey;

      if (!hasLoadedCurrentKey) {
        setNotifications([]);
        setUnreadCount(0);
      }

      if (mode === 'refresh') {
        setIsRefreshing(true);
      } else if (hasLoadedCurrentKey) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setError('');

      const [{ data, error: queryError }, { count, error: countError }] =
        await Promise.all([
          supabase
            .from('technician_notifications')
            .select(
              `
              id,
              organization_id,
              recipient_membership_id,
              recipient_user_id,
              installation_id,
              installation_item_id,
              type,
              title,
              body,
              project_name_snapshot,
              client_name_snapshot,
              organization_name_snapshot,
              is_read,
              read_at,
              created_at,
              push_status
            `,
            )
            .eq('organization_id', selectedMembership.organizationId)
            .eq('recipient_membership_id', selectedMembership.id)
            .order('created_at', { ascending: false })
            .returns<TechnicianNotificationRow[]>(),
          supabase
            .from('technician_notifications')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', selectedMembership.organizationId)
            .eq('recipient_membership_id', selectedMembership.id)
            .eq('is_read', false),
        ]);

      if (queryError || countError) {
        setError('No pudimos cargar tus notificaciones. Intenta nuevamente.');
        if (!hasLoadedCurrentKey) {
          loadedKeyRef.current = '';
          setNotifications([]);
          setUnreadCount(0);
        }
      } else {
        setNotifications((data ?? []).map(mapNotificationRow));
        setUnreadCount(count ?? 0);
        loadedKeyRef.current = currentKey;
        await syncApplicationBadge(count ?? 0);
      }

      setIsLoading(false);
      setIsRefreshing(false);
    },
    [selectedMembership, status],
  );

  const requestPushPermission = useCallback(async () => {
    if (!user || !selectedMembership?.isActive) {
      return;
    }

    const nextState = await registerPushDevice(user.id);
    setPermissionState(nextState);
  }, [selectedMembership?.isActive, user]);

  const markNotificationReadFor = useCallback(
    async (notificationId: string, organizationId: string, membershipId: string) => {
      if (!supabase) {
        return;
      }

      await supabase.rpc('mark_technician_notification_read', {
        p_notification_id: notificationId,
        p_organization_id: organizationId,
        p_membership_id: membershipId,
      });
    },
    [],
  );

  const markNotificationRead = useCallback(
    async (notification: TechnicianNotification) => {
      await markNotificationReadFor(
        notification.id,
        notification.organizationId,
        notification.recipientMembershipId,
      );
      await refreshNotifications('refresh');
    },
    [markNotificationReadFor, refreshNotifications],
  );

  const installationIsAvailable = useCallback(
    async (notification: TechnicianNotification) => {
      if (!supabase) {
        return false;
      }

      const { data, error: installationError } = await supabase
        .from('installations')
        .select('id')
        .eq('id', notification.installationId)
        .eq('organization_id', notification.organizationId)
        .eq('technician_membership_id', notification.recipientMembershipId)
        .maybeSingle();

      return Boolean(data && !installationError);
    },
    [],
  );

  const markAllAsRead = useCallback(async () => {
    if (!supabase || !selectedMembership) {
      return;
    }

    await supabase.rpc('mark_all_technician_notifications_read', {
      p_organization_id: selectedMembership.organizationId,
      p_membership_id: selectedMembership.id,
    });
    await refreshNotifications('refresh');
  }, [refreshNotifications, selectedMembership]);

  const openNotification = useCallback(
    async (notification: TechnicianNotification) => {
      const targetMembership = memberships.find(
        (membership) =>
          membership.id === notification.recipientMembershipId &&
          membership.organizationId === notification.organizationId &&
          membership.isActive,
      );

      if (!targetMembership) {
        router.push('/notifications?message=unavailable');
        return;
      }

      if (selectedMembership?.id !== targetMembership.id) {
        const selected = await selectMembership(targetMembership.id);
        if (!selected) {
          router.push('/notifications?message=unavailable');
          return;
        }
      }

      await markNotificationReadFor(
        notification.id,
        notification.organizationId,
        notification.recipientMembershipId,
      );

      const isAvailable = await installationIsAvailable(notification);

      if (!isAvailable) {
        await refreshNotifications('refresh');
        router.push('/notifications?message=unavailable');
        return;
      }

      await refreshNotifications('refresh');
      router.push({
        pathname: '/installations/[id]',
        params: notification.installationItemId
          ? { id: notification.installationId, itemId: notification.installationItemId }
          : { id: notification.installationId },
      });
    },
    [
      installationIsAvailable,
      markNotificationReadFor,
      memberships,
      refreshNotifications,
      selectMembership,
      selectedMembership?.id,
    ],
  );

  const openNotificationById = useCallback(
    async (notificationId: string) => {
      if (!supabase) {
        router.push('/notifications');
        return;
      }

      const { data, error: notificationError } = await supabase
        .from('technician_notifications')
        .select(
          `
          id,
          organization_id,
          recipient_membership_id,
          recipient_user_id,
          installation_id,
          installation_item_id,
          type,
          title,
          body,
          project_name_snapshot,
          client_name_snapshot,
          organization_name_snapshot,
          is_read,
          read_at,
          created_at,
          push_status
        `,
        )
        .eq('id', notificationId)
        .maybeSingle<TechnicianNotificationRow>();

      if (notificationError || !data) {
        router.push('/notifications?message=unavailable');
        return;
      }

      await openNotification(mapNotificationRow(data));
    },
    [openNotification],
  );

  useEffect(() => {
    loadPermissionState();
  }, [loadPermissionState]);

  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  useEffect(() => {
    if (
      status !== 'authenticated' ||
      !user ||
      !selectedMembership?.isActive
    ) {
      return;
    }

    const currentUser = user;
    let cancelled = false;

    async function maybePromptForPermission() {
      const storageKey = promptStorageKey(currentUser.id);
      const alreadyPrompted = await AsyncStorage.getItem(storageKey);
      const currentPermissionState = await getCurrentPushPermissionState();

      if (cancelled) {
        return;
      }

      if (currentPermissionState === 'granted') {
        const nextState = await registerPushDevice(currentUser.id);
        setPermissionState(nextState);
        return;
      }

      if (alreadyPrompted || currentPermissionState === 'denied') {
        setPermissionState(currentPermissionState);
        return;
      }

      await AsyncStorage.setItem(storageKey, '1');
      Alert.alert(
        'Activa las notificaciones',
        'Activa las notificaciones para enterarte cuando te asignen una nueva instalación.',
        [
          { text: 'Después', style: 'cancel' },
          {
            text: 'Activar',
            onPress: () => {
              requestPushPermission();
            },
          },
        ],
      );
    }

    maybePromptForPermission();

    return () => {
      cancelled = true;
    };
  }, [requestPushPermission, selectedMembership?.isActive, status, user]);

  useEffect(() => {
    if (!supabase || status !== 'authenticated' || !selectedMembership) {
      return undefined;
    }

    const client = supabase;
    const channel = client
      .channel(`technician-notifications:${selectedMembership.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'technician_notifications',
          filter: `recipient_membership_id=eq.${selectedMembership.id}`,
        },
        () => {
          refreshNotifications('refresh');
        },
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [refreshNotifications, selectedMembership, status]);

  useEffect(() => {
    function handleAppStateChange(nextState: AppStateStatus) {
      if (nextState === 'active') {
        loadPermissionState();
        refreshNotifications('refresh');
      }
    }

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [loadPermissionState, refreshNotifications]);

  useEffect(() => {
    const receivedSubscription = Notifications.addNotificationReceivedListener(() => {
      refreshNotifications('refresh');
    });

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        const notificationId =
          typeof data.notificationId === 'string' ? data.notificationId : '';

        if (!notificationId) {
          router.push('/notifications');
          return;
        }

        openNotificationById(notificationId);
      });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [openNotificationById, refreshNotifications]);

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadCount,
      isLoading,
      isRefreshing,
      error,
      permissionState,
      refreshNotifications,
      markNotificationRead,
      markAllAsRead,
      openNotification,
      requestPushPermission,
      openSettings: () => Linking.openSettings(),
    }),
    [
      error,
      isLoading,
      isRefreshing,
      markAllAsRead,
      markNotificationRead,
      notifications,
      openNotification,
      permissionState,
      refreshNotifications,
      requestPushPermission,
      unreadCount,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const value = useContext(NotificationContext);

  if (!value) {
    throw new Error('useNotifications must be used inside NotificationProvider');
  }

  return value;
}
