// app/admin/index.tsx
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
  FadeInUp,
  ZoomIn,
} from 'react-native-reanimated';
import { radius, spacing } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { useDashboard } from '../../hooks/useDashboard';
import { StatusChip } from '../../components/admin/StatusChip';
// MODO OSCURO TEMPORALMENTE DESACTIVADO EN ESTE DASHBOARD
// import { useTheme } from '../../context/ThemeContext';

type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

const { width } = Dimensions.get('window');

// ------------------------------------------------------------------
// Configuración estática
// ------------------------------------------------------------------

const METRIC_ITEMS: {
  key:
    | 'active_installations'
    | 'completed_installations'
    | 'pending_installations'
    | 'photos_uploaded_today'
    | 'active_technicians';
  label: string;
  icon: FeatherIconName;
  gradient: [string, string];
  tint: string;
}[] = [
  {
    key: 'active_installations',
    label: 'Instalaciones activas',
    icon: 'activity',
    gradient: ['#3b82f6', '#1d4ed8'],
    tint: '#3b82f6',
  },
  {
    key: 'completed_installations',
    label: 'Terminadas',
    icon: 'check-circle',
    gradient: ['#10b981', '#047857'],
    tint: '#10b981',
  },
  {
    key: 'pending_installations',
    label: 'Pendientes',
    icon: 'clock',
    gradient: ['#f59e0b', '#b45309'],
    tint: '#f59e0b',
  },
  {
    key: 'photos_uploaded_today',
    label: 'Fotos hoy',
    icon: 'camera',
    gradient: ['#8b5cf6', '#6d28d9'],
    tint: '#8b5cf6',
  },
  {
    key: 'active_technicians',
    label: 'Técnicos activos',
    icon: 'users',
    gradient: ['#06b6d4', '#0e7490'],
    tint: '#06b6d4',
  },
];

const QUICK_ACTIONS: {
  title: string;
  subtitle: string;
  icon: FeatherIconName;
  route: string;
  gradient: [string, string];
}[] = [
  {
    title: 'Instalaciones',
    subtitle: 'Gestión y seguimiento',
    icon: 'layers',
    route: '/installations',
    gradient: ['#4f46e5', '#3730a3'],
  },
  {
    title: 'Dispositivos',
    subtitle: 'Inventario de equipos',
    icon: 'smartphone',
    route: '/admin/devices',
    gradient: ['#0284c7', '#0369a1'],
  },
  {
    title: 'Técnicos',
    subtitle: 'Personal de campo',
    icon: 'users',
    route: '/technicians',
    gradient: ['#0d9488', '#0f766e'],
  },
  {
    title: 'Administradores',
    subtitle: 'Permisos y accesos',
    icon: 'shield',
    route: '/administrators',
    gradient: ['#7c3aed', '#5b21b6'],
  },
  {
    title: 'Fotos',
    subtitle: 'Galería de evidencias',
    icon: 'image',
    route: '/photos',
    gradient: ['#db2777', '#9d174d'],
  },
  {
    title: 'Fotos recabadas',
    subtitle: 'Consulta y seguimiento',
    icon: 'camera',
    route: '/admin/collected-photos',
    gradient: ['#ea580c', '#c2410c'],
  },
];

// ------------------------------------------------------------------
// Traducción de categorías de fotografías
// ------------------------------------------------------------------

function translatePhotoCategory(category?: string | null) {
  if (!category?.trim()) {
    return 'Sin categoría';
  }

  const normalized = category
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ');

  const translations: Record<string, string> = {
    before: 'Antes',
    during: 'Durante',
    after: 'Después',
    'before installation': 'Antes de la instalación',
    'during installation': 'Durante la instalación',
    'after installation': 'Después de la instalación',
    'pre installation': 'Antes de la instalación',
    'during the installation': 'Durante la instalación',
    'post installation': 'Después de la instalación',
    preinstallation: 'Antes de la instalación',
    postinstallation: 'Después de la instalación',
    'evidence before': 'Evidencia antes',
    'evidence during': 'Evidencia durante',
    'evidence after': 'Evidencia después',
  };

  return translations[normalized] || category.trim();
}

// ------------------------------------------------------------------
// Pantalla principal
// ------------------------------------------------------------------

export default function AdminHomeScreen() {
  const { selectedMembership, signOut, profile } = useAuth();

  const {
    metrics,
    recentInstallations,
    recentPhotos,
    loading,
    error,
    refresh,
  } = useDashboard();

  // MODO OSCURO TEMPORALMENTE DESACTIVADO
  // const { isDark, toggleTheme, colors: themeColors } = useTheme();

  const displayName =
    profile?.fullName || selectedMembership?.fullName || 'Administrador';

  async function handleSignOut() {
    await signOut();
    router.replace('/login');
  }

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: '#f8fafc' }]}
      >
        <View style={styles.centerScreen}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text
            style={[styles.loadingText, { color: '#64748b' }]}
          >
            Cargando experiencia REPI...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: '#f8fafc' }]}
    >
      {/* MODO OSCURO TEMPORALMENTE DESACTIVADO: StatusBar fijo en modo claro. */}
      <StatusBar style="dark" />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.containerContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refresh}
            tintColor="#2563eb"
            colors={['#2563eb']}
          />
        }
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(600).springify()}>
          <Header
            organizationName={selectedMembership?.organizationName}
            displayName={displayName}
            onSignOut={handleSignOut}
          />
        </Animated.View>

        {/* Error */}
        {error && (
          <Animated.View entering={FadeInDown.delay(100).springify()}>
            <ErrorBanner message={error.message} onRetry={refresh} />
          </Animated.View>
        )}

        {/* Métricas */}
        <Animated.View
          entering={FadeInDown.delay(200).duration(600).springify()}
          style={styles.metricsContainer}
        >
          <Text
            style={[styles.sectionTitleHeader, { color: '#0f172a' }]}
          >
            Métricas clave
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.metricsScroll}
          >
            {METRIC_ITEMS.map((item, index) => (
              <Animated.View
                key={item.key}
                entering={FadeInDown.delay(300 + index * 100)
                  .duration(600)
                  .springify()}
              >
                <MetricCard
                  icon={item.icon}
                  label={item.label}
                  value={metrics?.[item.key]}
                  gradient={item.gradient}
                  tint={item.tint}
                      />
              </Animated.View>
            ))}
          </ScrollView>
        </Animated.View>

        {/* Quick Actions */}
        <Animated.View
          entering={FadeInDown.delay(500).duration(600).springify()}
        >
          <Section title="Accesos Rápidos">
            <View style={styles.menuGrid}>
              {QUICK_ACTIONS.map((action, index) => (
                <Animated.View
                  key={action.route}
                  entering={ZoomIn.delay(600 + index * 100)
                    .duration(500)
                    .springify()}
                  style={styles.menuButtonWrapper}
                >
                  <MenuButtonGradient
                    title={action.title}
                    subtitle={action.subtitle}
                    icon={action.icon}
                    gradient={action.gradient}
                    onPress={() => router.push(action.route)}
                  />
                </Animated.View>
              ))}
            </View>
          </Section>
        </Animated.View>

        {/* Instalaciones Recientes */}
        <Animated.View
          entering={FadeInUp.delay(900).duration(600).springify()}
        >
          <Section
            title="Instalaciones Recientes"
            onSeeAll={() => router.push('/installations')}
          >
            {recentInstallations.length === 0 ? (
              <EmptyState
                icon="layers"
                text="No hay instalaciones recientes"
                  />
            ) : (
              <View style={styles.cardList}>
                {recentInstallations.map((installation, index) => (
                  <Animated.View
                    key={installation.id}
                    entering={FadeInDown.delay(1000 + index * 80)
                      .duration(500)
                      .springify()}
                  >
                    <Pressable
                      style={({ pressed }) => [
                        styles.installationCard,
                        {
                          backgroundColor: '#ffffff',
                          borderColor: '#e2e8f0',
                        },
                        pressed && styles.cardPressed,
                      ]}
                      onPress={() =>
                        router.push(`/installations/${installation.id}`)
                      }
                    >
                      <View style={styles.installationTopRow}>
                        <View style={styles.installationTitleContainer}>
                          <LinearGradient
                            colors={['#2563eb', '#1d4ed8']}
                            style={styles.installationIconGradient}
                          >
                            <Feather
                              name="layers"
                              size={15}
                              color="#ffffff"
                            />
                          </LinearGradient>

                          <Text
                            style={[
                              styles.installationName,
                              { color: '#0f172a' },
                            ]}
                            numberOfLines={1}
                          >
                            {installation.project_name || 'Instalación'}
                          </Text>
                        </View>

                        <StatusChip status={installation.status} />
                      </View>

                      <View style={styles.installationInfo}>
                        <View style={styles.installationMetaRow}>
                          <Feather
                            name="user"
                            size={13}
                            color="#64748b"
                            style={styles.metaIcon}
                          />
                          <Text
                            style={[
                              styles.installationClient,
                              { color: '#0f172a' },
                            ]}
                            numberOfLines={1}
                          >
                            {installation.client?.name || 'Sin cliente'}
                          </Text>
                        </View>

                        <View style={styles.installationMetaRow}>
                          <Feather
                            name="map-pin"
                            size={13}
                            color="#64748b"
                            style={styles.metaIcon}
                          />
                          <Text
                            style={[
                              styles.installationAddress,
                              { color: '#64748b' },
                            ]}
                            numberOfLines={1}
                          >
                            {installation.address || 'Sin dirección'}
                          </Text>
                        </View>
                      </View>

                      <View
                        style={[
                          styles.installationChevron,
                          {
                            backgroundColor: '#f1f5f9',
                          },
                        ]}
                      >
                        <Feather
                          name="chevron-right"
                          size={16}
                          color="#0f172a"
                        />
                      </View>
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            )}
          </Section>
        </Animated.View>

        {/* Fotos Recientes */}
        <Animated.View
          entering={FadeInUp.delay(1200).duration(600).springify()}
        >
          <Section
            title="Fotos Recientes"
            onSeeAll={() => router.push('/photos')}
            last
          >
            {recentPhotos.length === 0 ? (
              <EmptyState
                icon="camera"
                text="No hay fotos recientes"
                  />
            ) : (
              <View style={styles.photosGrid}>
                {recentPhotos.map((photo, index) => (
                  <Animated.View
                    key={photo.id}
                    entering={ZoomIn.delay(1300 + index * 80)
                      .duration(500)
                      .springify()}
                    style={styles.photoCardContainer}
                  >
                    <Pressable
                      style={({ pressed }) => [
                        styles.photoCard,
                        pressed && styles.cardPressed,
                      ]}
                      onPress={() =>
                        router.push(`/installations/photo/${photo.id}`)
                      }
                    >
                      {photo.signedUrl ? (
                        <Image
                          source={{ uri: photo.signedUrl }}
                          style={styles.photoImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View
                          style={[
                            styles.photoPlaceholder,
                            { backgroundColor: '#ffffff' },
                          ]}
                        >
                          <Feather
                            name="image"
                            size={26}
                            color="#64748b"
                          />
                        </View>
                      )}

                      <LinearGradient
                        colors={[
                          'transparent',
                          'rgba(15, 23, 42, 0.85)',
                        ]}
                        style={styles.photoOverlayGradient}
                      >
                        <Text
                          style={styles.photoCategory}
                          numberOfLines={1}
                        >
                          {translatePhotoCategory(photo.category)}
                        </Text>
                      </LinearGradient>
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            )}
          </Section>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ------------------------------------------------------------------
// Header
// ------------------------------------------------------------------

function Header({
  organizationName,
  displayName,
  onSignOut,
}: {
  organizationName?: string;
  displayName: string;
  onSignOut: () => void;
}) {
  const initial = (displayName?.trim()?.[0] || 'A').toUpperCase();

  return (
    <View style={styles.headerContainer}>
      <View style={styles.headerLeft}>
        <Animated.View entering={ZoomIn.duration(800).springify()}>
          <LinearGradient
            colors={['#2563eb', '#1d4ed8', '#1e40af']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatarGradient}
          >
            <Text style={styles.avatarText}>{initial}</Text>
          </LinearGradient>
        </Animated.View>

        <View style={styles.headerTextGroup}>
          <Text
            style={[styles.eyebrow, { color: '#64748b' }]}
          >
            PANEL DE CONTROL
          </Text>

          <Text style={[styles.title, { color: '#0f172a' }]}>
            Dashboard
          </Text>

          <View style={styles.badgeNameContainer}>
            <Text
              style={[styles.subtitle, { color: '#2563eb' }]}
              numberOfLines={1}
            >
              {displayName}
            </Text>

            {organizationName && (
              <Text
                style={[
                  styles.companyText,
                  { color: '#64748b' },
                ]}
                numberOfLines={1}
              >
                • {organizationName}
              </Text>
            )}
          </View>
        </View>
      </View>

      <View style={styles.headerActions}>
        {/* Calendario de instalaciones */}
        <Pressable
          style={({ pressed }) => [
            styles.calendarButton,
            pressed && styles.cardPressed,
          ]}
          onPress={() => router.push('/admin/calendar')}
          hitSlop={8}
          accessibilityLabel="Calendario de instalaciones"
        >
          <Feather name="calendar" size={17} color="#2563eb" />
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.logoutButton,
            pressed && styles.cardPressed,
          ]}
          onPress={onSignOut}
          hitSlop={6}
        >
          <LinearGradient
            colors={['#ef4444', '#dc2626']}
            style={styles.logoutGradient}
          >
            <Feather name="log-out" size={14} color="#ffffff" />
            <Text style={styles.logoutText}>Salir</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

// ------------------------------------------------------------------
// Metric Card
// ------------------------------------------------------------------

function MetricCard({
  icon,
  label,
  value,
  gradient,
  tint,
}: {
  icon: FeatherIconName;
  label: string;
  value: number;
  gradient: [string, string];
  tint: string;
}) {
  return (
    <View
      style={[
        styles.metricCard,
        {
          backgroundColor: '#ffffff',
          borderColor: `${tint}30`,
        },
      ]}
    >
      <View style={styles.metricCardTop}>
        <LinearGradient colors={gradient} style={styles.metricIconWrap}>
          <Feather name={icon} size={16} color="#ffffff" />
        </LinearGradient>

        <Text style={[styles.metricValue, { color: '#0f172a' }]}>
          {value ?? 0}
        </Text>
      </View>

      <Text
        style={[styles.metricLabel, { color: '#64748b' }]}
        numberOfLines={1}
      >
        {label}
      </Text>

      <LinearGradient colors={gradient} style={styles.metricBottomBar} />
    </View>
  );
}

// ------------------------------------------------------------------
// Quick Action
// ------------------------------------------------------------------

function MenuButtonGradient({
  title,
  subtitle,
  icon,
  gradient,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: FeatherIconName;
  gradient: [string, string];
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.96, {
      damping: 15,
      stiffness: 300,
    });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, {
      damping: 15,
      stiffness: 300,
    });
  };

  return (
    <Animated.View
      style={[styles.menuButtonContainer, animatedStyle]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.menuButtonPressable}
      >
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.menuButtonGradient}
        >
          <View style={styles.menuButtonCircle} />

          <View style={styles.menuIconFloat}>
            <Feather name={icon} size={22} color="#ffffff" />
          </View>

          <View style={styles.menuButtonTextWrap}>
            <Text style={styles.menuButtonTitle} numberOfLines={1}>
              {title}
            </Text>

            <Text
              style={styles.menuButtonSubtitle}
              numberOfLines={2}
            >
              {subtitle}
            </Text>
          </View>

          <View style={styles.menuChevronWrap}>
            <Feather
              name="arrow-up-right"
              size={14}
              color="rgba(255,255,255,0.85)"
            />
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

// ------------------------------------------------------------------
// Section
// ------------------------------------------------------------------

function Section({
  title,
  onSeeAll,
  last,
  children,
}: {
  title: string;
  onSeeAll?: () => void;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, last && styles.lastSection]}>
      <View style={styles.sectionHeader}>
        <Text
          style={[
            styles.sectionTitle,
            { color: '#0f172a' },
          ]}
        >
          {title}
        </Text>

        {onSeeAll ? (
          <Pressable
            style={styles.seeAllButton}
            onPress={onSeeAll}
            hitSlop={8}
          >
            <Text style={styles.seeAll}>Ver todas</Text>
            <Feather
              name="chevron-right"
              size={14}
              color="#2563eb"
            />
          </Pressable>
        ) : null}
      </View>

      {children}
    </View>
  );
}

// ------------------------------------------------------------------
// Error Banner
// ------------------------------------------------------------------

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.errorContainer}>
      <View style={styles.errorIconWrap}>
        <Feather
          name="alert-triangle"
          size={18}
          color="#dc2626"
        />
      </View>

      <View style={styles.errorTextGroup}>
        <Text style={styles.errorText}>
          Error al cargar el dashboard
        </Text>

        <Text style={styles.errorDetail} numberOfLines={2}>
          {message}
        </Text>
      </View>

      <Pressable
        style={styles.retryButton}
        onPress={onRetry}
      >
        <Text style={styles.retryText}>Reintentar</Text>
      </Pressable>
    </View>
  );
}

// ------------------------------------------------------------------
// Empty State
// ------------------------------------------------------------------

function EmptyState({
  icon,
  text,
}: {
  icon: FeatherIconName;
  text: string;
}) {
  return (
    <View
      style={[
        styles.emptyState,
        {
          backgroundColor: '#ffffff',
          borderColor: '#e2e8f0',
        },
      ]}
    >
      <View style={styles.emptyIconWrap}>
        <Feather
          name={icon}
          size={22}
          color="#64748b"
        />
      </View>

      <Text
        style={[
          styles.emptyText,
          { color: '#64748b' },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

// ------------------------------------------------------------------
// Estilos
// ------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },

  centerScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    marginTop: spacing.md,
    fontSize: 14,
    fontWeight: '600',
  },

  container: {
    flex: 1,
  },

  containerContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl * 2,
  },

  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },

  avatarGradient: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },

  avatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },

  headerTextGroup: {
    flexShrink: 1,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },

  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },

  badgeNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  subtitle: {
    fontSize: 12.5,
    fontWeight: '700',
  },

  companyText: {
    fontSize: 12,
    fontWeight: '500',
  },

  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },

  calendarButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },

  logoutButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },

  logoutGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    height: 40,
    gap: 6,
  },

  logoutText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },

  metricsContainer: {
    marginBottom: spacing.xl,
  },

  sectionTitleHeader: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: spacing.sm,
    letterSpacing: -0.2,
  },

  metricsScroll: {
    gap: spacing.md,
    paddingRight: spacing.md,
  },

  metricCard: {
    width: width * 0.38,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },

  metricCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },

  metricIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  metricValue: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },

  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },

  metricBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },

  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.md,
  },

  menuButtonWrapper: {
    width: (width - spacing.lg * 2 - spacing.md) / 2,
  },

  menuButtonContainer: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },

  menuButtonPressable: {
    width: '100%',
  },

  menuButtonGradient: {
    padding: spacing.md,
    minHeight: 130,
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
  },

  menuButtonCircle: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.1)',
    top: -40,
    right: -40,
  },

  menuIconFloat: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },

  menuChevronWrap: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  menuButtonTextWrap: {
    gap: 2,
    marginTop: spacing.sm,
  },

  menuButtonTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 19,
  },

  menuButtonSubtitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 15,
  },

  section: {
    marginBottom: spacing.xl,
  },

  lastSection: {
    marginBottom: 0,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },

  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },

  seeAll: {
    color: '#2563eb',
    fontWeight: '700',
    fontSize: 13,
  },

  cardList: {
    gap: spacing.sm,
  },

  installationCard: {
    padding: spacing.md,
    paddingRight: spacing.xl + spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },

  installationTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  installationTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },

  installationIconGradient: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },

  installationName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },

  installationInfo: {
    marginTop: spacing.xs,
    gap: 4,
  },

  installationMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  metaIcon: {
    marginRight: 6,
  },

  installationClient: {
    fontSize: 13,
    fontWeight: '600',
  },

  installationAddress: {
    fontSize: 12,
    fontWeight: '400',
  },

  installationChevron: {
    position: 'absolute',
    top: '50%',
    right: spacing.md,
    marginTop: -14,
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },

  photoCardContainer: {
    width: '48.5%',
  },

  photoCard: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
  },

  photoImage: {
    width: '100%',
    height: '100%',
  },

  photoPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  photoOverlayGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 16,
    paddingBottom: 8,
    paddingHorizontal: spacing.sm,
  },

  photoCategory: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },

  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
  },

  errorIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },

  errorTextGroup: {
    flex: 1,
  },

  errorText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#991b1b',
  },

  errorDetail: {
    fontSize: 12,
    color: '#b91c1c',
  },

  retryButton: {
    backgroundColor: '#dc2626',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },

  retryText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },

  emptyState: {
    paddingVertical: spacing.xl,
    borderRadius: radius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
  },

  emptyIconWrap: {
    marginBottom: spacing.xs,
  },

  emptyText: {
    fontSize: 13,
    fontWeight: '500',
  },

  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});