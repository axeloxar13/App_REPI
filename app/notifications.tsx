import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ChevronIcon } from '../components/ChevronIcon';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { colors, radius, spacing } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import type { TechnicianNotification } from '../types/database';

function formatNotificationDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const time = new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

  if (isToday) {
    return `Hoy, ${time}`;
  }

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function PermissionNotice({
  kind,
  onOpenSettings,
}: {
  kind: 'denied' | 'unavailable' | 'missing-project-id';
  onOpenSettings: () => void;
}) {
  const textByKind = {
    denied: 'Las notificaciones del teléfono están desactivadas',
    unavailable:
      'Las push reales requieren un dispositivo físico compatible.',
    'missing-project-id':
      'El registro push queda pendiente de configurar con el projectId de EAS.',
  } as const;

  return (
    <View style={styles.notice}>
      <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
      <Text style={styles.noticeText}>{textByKind[kind]}</Text>
      {kind === 'denied' ? (
        <Pressable onPress={onOpenSettings} accessibilityRole="button">
          <Text style={styles.noticeAction}>Abrir configuración</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function NotificationCard({
  notification,
  onPress,
}: {
  notification: TechnicianNotification;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.card,
        notification.isRead ? null : styles.cardUnread,
      ]}
      onPress={onPress}
      accessibilityRole="button"
    >
      {notification.isRead ? null : <View style={styles.unreadDot} />}

      <View style={styles.cardIcon}>
        <Ionicons name="construct-outline" size={20} color={colors.primary} />
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{notification.title}</Text>
        <Text style={styles.projectName}>{notification.projectNameSnapshot}</Text>
        {notification.clientNameSnapshot ? (
          <Text style={styles.metaText}>
            Cliente: {notification.clientNameSnapshot}
          </Text>
        ) : null}
        <Text style={styles.footerText}>
          {notification.organizationNameSnapshot} ·{' '}
          {formatNotificationDate(notification.createdAt)}
        </Text>
      </View>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const { message } = useLocalSearchParams<{ message?: string }>();
  const { status, selectedMembership } = useAuth();
  const {
    notifications,
    unreadCount,
    isLoading,
    isRefreshing,
    error,
    permissionState,
    refreshNotifications,
    markAllAsRead,
    openNotification,
    openSettings,
  } = useNotifications();

  const permissionNoticeKind = useMemo(() => {
    if (permissionState === 'denied') {
      return 'denied';
    }

    if (permissionState === 'unavailable') {
      return 'unavailable';
    }

    if (permissionState === 'missing-project-id') {
      return 'missing-project-id';
    }

    return null;
  }, [permissionState]);

  const renderNotification = useCallback(
    ({ item }: { item: TechnicianNotification }) => (
      <NotificationCard
        notification={item}
        onPress={() => openNotification(item)}
      />
    ),
    [openNotification],
  );

  if (status === 'checking') {
    return (
      <View style={styles.centerScreen}>
        <StatusBar style="dark" />
        <LoadingState text="Cargando notificaciones" />
      </View>
    );
  }

  if (status !== 'authenticated') {
    return <Redirect href="/login" />;
  }

  if (!selectedMembership) {
    return <Redirect href="/select-company" />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderNotification}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={40}
        windowSize={7}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => refreshNotifications('refresh')}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Pressable
              style={styles.backButton}
              onPress={() => router.replace('/home')}
              accessibilityRole="button"
              hitSlop={8}
            >
              <ChevronIcon direction="left" size={18} color={colors.primary} />
              <Text style={styles.backText}>Mis instalaciones</Text>
            </Pressable>

            <View style={styles.headingBlock}>
              <Text style={styles.title}>Notificaciones</Text>

              <View style={styles.headingMetaRow}>
                <Text style={styles.subtitle}>
                  {selectedMembership.organizationName}
                </Text>
                {unreadCount > 0 ? (
                  <Pressable
                    style={styles.markAllButton}
                    onPress={markAllAsRead}
                    accessibilityRole="button"
                  >
                    <Text style={styles.markAllText}>Marcar todas como leídas</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {message === 'unavailable' ? (
              <View style={styles.warningNotice}>
                <Text style={styles.warningText}>
                  Esta instalación ya no está disponible
                </Text>
              </View>
            ) : null}

            {permissionNoticeKind ? (
              <PermissionNotice
                kind={permissionNoticeKind}
                onOpenSettings={openSettings}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            {isLoading ? (
              <LoadingState text="Cargando notificaciones" />
            ) : error ? (
              <EmptyState
                title="No pudimos cargar tus notificaciones"
                description={error}
                actionLabel="Reintentar"
                onAction={() => refreshNotifications('loading')}
              />
            ) : (
              <EmptyState
                title="No tienes notificaciones"
                description="Cuando te asignen una instalación, aparecerá aquí"
              />
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerScreen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  separator: {
    height: spacing.sm,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  backButton: {
    minHeight: 44,
    alignSelf: 'flex-start',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingRight: spacing.sm,
    paddingVertical: spacing.xs,
  },
  backText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  headingBlock: {
    gap: spacing.xs,
  },
  headingMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    alignSelf: 'stretch',
    color: colors.text,
    fontSize: 27,
    fontWeight: '700',
    lineHeight: 32,
  },
  subtitle: {
    flex: 1,
    minWidth: 120,
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  markAllButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingVertical: spacing.xs / 2,
  },
  markAllText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
    textAlign: 'right',
  },
  notice: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  noticeText: {
    flex: 1,
    minWidth: 180,
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  noticeAction: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  warningNotice: {
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: radius.sm,
    backgroundColor: colors.errorSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  warningText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  card: {
    position: 'relative',
    flexDirection: 'row',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#e4edf7',
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: spacing.md,
    paddingRight: spacing.lg,
    shadowColor: '#12355f',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 7,
    elevation: 1,
  },
  cardUnread: {
    borderColor: '#b7dcff',
    backgroundColor: '#f4f9ff',
  },
  cardIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    paddingRight: spacing.xs,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  unreadDot: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: '#dc2626',
  },
  projectName: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
  },
  metaText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  footerText: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  emptyWrap: {
    marginTop: spacing.md,
  },
});
