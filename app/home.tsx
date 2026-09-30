// app/home.tsx
import React, { useMemo, useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  Dimensions,
} from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown,
  FadeInUp,
  ZoomIn,
} from 'react-native-reanimated';
import { EmptyState } from '../components/EmptyState';
import { InstallationCard } from '../components/InstallationCard';
import { LoadingState } from '../components/LoadingState';
import { LogoHeader } from '../components/LogoHeader';
import { NotificationBell } from '../components/NotificationBell';
import { SearchInput } from '../components/SearchInput';
import { colors, radius, spacing } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { useInstallations } from '../hooks/useInstallations';
import type { InstallationWithClient } from '../types/database';

const { width } = Dimensions.get('window');

function normalizeSearch(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('es-MX')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function MembershipStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <View
      style={[
        styles.statusBadge,
        isActive ? styles.statusBadgeActive : styles.statusBadgeInactive,
      ]}
    >
      <View
        style={[
          styles.statusDot,
          isActive ? styles.statusDotActive : styles.statusDotInactive,
        ]}
      />
      <Text
        style={[
          styles.statusText,
          isActive ? styles.statusTextActive : styles.statusTextInactive,
        ]}
      >
        {isActive ? 'Activado' : 'Desactivado'}
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const {
    status,
    profile,
    selectedMembership,
    memberships,
    signOut,
    refreshSession,
  } = useAuth();

  const { installations, isLoading, isRefreshing, error, retry } =
    useInstallations();
  const [search, setSearch] = useState('');
  const [isAccessRefreshing, setIsAccessRefreshing] = useState(false);

  const displayName =
    profile?.fullName || selectedMembership?.fullName || 'Técnico';
  const membershipIsActive = selectedMembership?.isActive ?? false;
  const isAdmin = selectedMembership?.role === 'admin';

  useFocusEffect(
    useCallback(() => {
      if (status === 'authenticated') {
        refreshSession({ silent: true });
      }
    }, [refreshSession, status]),
  );

  const handleRefresh = useCallback(async () => {
    setIsAccessRefreshing(true);
    try {
      await refreshSession({ silent: true });
    } finally {
      setIsAccessRefreshing(false);
    }
  }, [refreshSession]);

  const filteredInstallations = useMemo(() => {
    const normalizedSearch = normalizeSearch(search);

    if (!normalizedSearch) {
      return installations;
    }

    return installations.filter((installation) =>
      normalizeSearch(installation.projectName).includes(normalizedSearch),
    );
  }, [installations, search]);

  const handleOpenInstallation = useCallback(
    (installationId: string) => {
      if (!selectedMembership?.isActive) {
        return;
      }

      router.push({
        pathname: '/technician/installations/[id]',
        params: { id: installationId },
      });
    },
    [selectedMembership?.isActive],
  );

  async function handleSignOut() {
    await signOut();
    router.replace('/login');
  }

  const handleGoToPhotos = useCallback(() => {
    router.push('/admin/photos');
  }, []);

  const renderInstallation = useCallback(
    ({ item, index }: { item: InstallationWithClient; index: number }) => (
      <Animated.View
        entering={FadeInDown.delay(200 + index * 80).duration(500).springify()}
      >
        <InstallationCard
          installation={item}
          onPress={() => handleOpenInstallation(item.id)}
        />
      </Animated.View>
    ),
    [handleOpenInstallation],
  );

  if (status === 'checking') {
    return (
      <View style={styles.centerScreen}>
        <StatusBar style="dark" />
        <LoadingState text="Comprobando sesión" />
      </View>
    );
  }

  if (status !== 'authenticated') {
    return <Redirect href="/login" />;
  }

  if (!selectedMembership) {
    return <Redirect href="/select-company" />;
  }

  if (isAdmin) {
    return <Redirect href="/admin" />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <FlatList
        data={membershipIsActive ? filteredInstallations : []}
        keyExtractor={(item) => item.id}
        renderItem={renderInstallation}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={40}
        windowSize={7}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing || isAccessRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {/* Brand Row */}
            <Animated.View entering={FadeInDown.duration(600).springify()}>
              <View style={styles.brandRow}>
                <View style={styles.logoWrap}>
                  <LogoHeader logoSize="compact" />
                </View>
                <Pressable style={styles.logoutButton} onPress={handleSignOut}>
                  <Feather name="log-out" size={14} color={colors.primary} />
                  <Text style={styles.logoutText}>Salir</Text>
                </Pressable>
              </View>
            </Animated.View>

            {/* Title Block */}
            <Animated.View
              entering={FadeInDown.delay(100).duration(600).springify()}
            >
              <View style={styles.titleBlock}>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>Mis instalaciones</Text>
                  <NotificationBell />
                </View>
                {displayName ? (
                  <View style={styles.technicianLine}>
                    <Text style={styles.subtitle}>{displayName}</Text>
                    <MembershipStatusBadge isActive={membershipIsActive} />
                  </View>
                ) : null}
                <Text style={styles.companyText}>
                  {selectedMembership.organizationName}
                </Text>
                {memberships.length > 1 ? (
                  <Pressable onPress={() => router.push('/select-company')}>
                    <Text style={styles.switchCompanyText}>
                      Cambiar empresa
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </Animated.View>

            {/* Quick Access (solo admin) */}
            {isAdmin && (
              <Animated.View entering={FadeInDown.delay(200).springify()}>
                <Pressable
                  style={styles.quickAccessCard}
                  onPress={handleGoToPhotos}
                >
                  <LinearGradient
                    colors={['#EFF6FF', '#DBEAFE']}
                    style={styles.quickAccessGradient}
                  >
                    <View style={styles.quickAccessLeft}>
                      <View style={styles.quickAccessIcon}>
                        <Feather
                          name="image"
                          size={20}
                          color="#2563EB"
                        />
                      </View>
                      <View>
                        <Text style={styles.quickAccessTitle}>
                          Fotos con Ubicación
                        </Text>
                        <Text style={styles.quickAccessSubtitle}>
                          Ver todas las fotos tomadas
                        </Text>
                      </View>
                    </View>
                    <Feather
                      name="chevron-right"
                      size={18}
                      color="#2563EB"
                    />
                  </LinearGradient>
                </Pressable>
              </Animated.View>
            )}

            {/* Search */}
            <Animated.View
              entering={FadeInDown.delay(300).duration(600).springify()}
            >
              {membershipIsActive ? (
                <SearchInput value={search} onChangeText={setSearch} />
              ) : (
                <View style={styles.accessNotice}>
                  <Text style={styles.accessNoticeText}>
                    Tu acceso a esta empresa está desactivado. Contacta al
                    administrador
                  </Text>
                </View>
              )}
            </Animated.View>

            {/* Section Title */}
            {membershipIsActive && filteredInstallations.length > 0 ? (
              <Animated.View
                entering={FadeInDown.delay(400).springify()}
                style={styles.sectionHeader}
              >
                <Text style={styles.sectionTitle}>
                  Instalaciones asignadas
                </Text>
                <View style={styles.sectionCount}>
                  <Text style={styles.sectionCountText}>
                    {filteredInstallations.length}
                  </Text>
                </View>
              </Animated.View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !membershipIsActive ? null : (
            <View style={styles.emptyWrap}>
              {isLoading ? (
                <LoadingState text="Cargando instalaciones" />
              ) : error ? (
                <EmptyState
                  title="No pudimos cargar tus instalaciones"
                  description={error}
                  actionLabel="Reintentar"
                  onAction={() => retry()}
                />
              ) : search.trim() ? (
                <EmptyState
                  title="No encontramos instalaciones"
                  description="Prueba con otro nombre de proyecto."
                  actionLabel="Limpiar búsqueda"
                  onAction={() => setSearch('')}
                />
              ) : (
                <EmptyState
                  title="No tienes instalaciones asignadas"
                  description="Cuando administración te asigne proyectos, aparecerán aquí."
                />
              )}
            </View>
          )
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
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  separator: {
    height: spacing.sm + 2,
  },

  // Header
  header: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  logoWrap: {
    width: 158,
    overflow: 'hidden',
    borderRadius: radius.sm,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    backgroundColor: '#fff',
  },
  logoutText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },

  // Title block
  titleBlock: {
    gap: 4,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  technicianLine: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  subtitle: {
    flexShrink: 1,
    minWidth: 0,
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },

  // Status Badge
  statusBadge: {
    minHeight: 24,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 3,
  },
  statusBadgeActive: {
    backgroundColor: '#ecfdf3',
  },
  statusBadgeInactive: {
    backgroundColor: colors.errorSoft,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  statusDotActive: {
    backgroundColor: '#12b76a',
  },
  statusDotInactive: {
    backgroundColor: '#f04438',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  statusTextActive: {
    color: '#027a48',
  },
  statusTextInactive: {
    color: colors.error,
  },
  companyText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  switchCompanyText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },

  // Quick Access
  quickAccessCard: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  quickAccessGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 16,
  },
  quickAccessLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  quickAccessIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAccessTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  quickAccessSubtitle: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },

  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.2,
  },
  sectionCount: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    minWidth: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  sectionCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },

  // Empty & Access notice
  emptyWrap: {
    marginTop: spacing.md,
  },
  accessNotice: {
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: radius.sm,
    backgroundColor: colors.errorSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  accessNoticeText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
});