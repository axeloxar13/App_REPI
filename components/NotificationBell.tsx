import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../constants/theme';
import { useNotifications } from '../context/NotificationContext';

export function NotificationBell() {
  const { unreadCount } = useNotifications();
  const hasUnread = unreadCount > 0;
  const badgeText = unreadCount > 99 ? '99+' : String(unreadCount);
  const accessibilityLabel = hasUnread
    ? `Notificaciones, ${unreadCount} sin leer`
    : 'Notificaciones, sin notificaciones sin leer';

  return (
    <Pressable
      style={styles.button}
      onPress={() => router.push('/notifications')}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
    >
      <Ionicons
        name={hasUnread ? 'notifications' : 'notifications-outline'}
        size={24}
        color={hasUnread ? '#15803d' : colors.muted}
      />
      {hasUnread ? (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>{badgeText}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -spacing.xs,
  },
  badge: {
    position: 'absolute',
    top: 5,
    right: 3,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
    borderRadius: 999,
    backgroundColor: '#dc2626',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
});
