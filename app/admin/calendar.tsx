// app/admin/calendar.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { radius, spacing } from '../../constants/theme';

type Installation = {
  id: string;
  project_name: string | null;
  address: string | null;
  technician_id: string | null;
  client_id: string | null;
  assigned_date: string | null;
  installation_type: string | null;
  status: string | null;
  created_at?: string | null;
};

type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

type Technician = {
  id: string;
  full_name: string;
};

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function dateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDbDate(value: string | null) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatLongDate(value: string | null) {
  const date = parseDbDate(value);
  if (!date) return 'Fecha no disponible';
  return date.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function statusLabel(status: string | null) {
  switch (status) {
    case 'completed':
      return 'Terminada';
    case 'in_progress':
      return 'En progreso';
    case 'pending':
      return 'Pendiente';
    case 'cancelled':
      return 'Cancelada';
    default:
      return status || 'Sin estado';
  }
}

export default function AdminCalendarScreen() {
  const { selectedMembership } = useAuth();
  const organizationId = selectedMembership?.organizationId;

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [selectedDay, setSelectedDay] = useState(dateKey(today));
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!organizationId) return;

    try {
      setError(null);

      const [installationsResult, clientsResult, techniciansResult] =
        await Promise.all([
          supabase
            .from('installations')
            .select(
              'id, project_name, address, technician_id, client_id, assigned_date, installation_type, status, created_at'
            )
            .eq('organization_id', organizationId)
            .order('assigned_date', { ascending: true }),
          supabase
            .from('clients')
            .select('id, name, phone, email')
            .eq('organization_id', organizationId)
            .order('name'),
          supabase
            .from('profiles')
            .select('id, full_name')
            .eq('role', 'technician')
            .eq('active', true)
            .order('full_name'),
        ]);

      if (installationsResult.error) throw installationsResult.error;
      if (clientsResult.error) throw clientsResult.error;
      if (techniciansResult.error) throw techniciansResult.error;

      setInstallations(installationsResult.data || []);
      setClients(clientsResult.data || []);
      setTechnicians(techniciansResult.data || []);
    } catch (err) {
      console.error('Error loading installation calendar:', err);
      setError((err as Error).message || 'No se pudo cargar el calendario.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const clientMap = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients]
  );

  const technicianMap = useMemo(
    () => new Map(technicians.map((tech) => [tech.id, tech])),
    [technicians]
  );

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Convertimos domingo=0 a lunes=0.
    const leadingEmptyDays = (firstDay.getDay() + 6) % 7;
    const cells: Array<{ day: number | null; key: string }> = [];

    for (let i = 0; i < leadingEmptyDays; i++) {
      cells.push({ day: null, key: `empty-${i}` });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      cells.push({ day, key: dateKey(date) });
    }

    while (cells.length % 7 !== 0) {
      cells.push({ day: null, key: `empty-end-${cells.length}` });
    }

    return cells;
  }, [currentMonth]);

  const installationsByDay = useMemo(() => {
    const map = new Map<string, Installation[]>();

    for (const installation of installations) {
      if (!installation.assigned_date) continue;
      const key = installation.assigned_date.slice(0, 10);
      const current = map.get(key) || [];
      current.push(installation);
      map.set(key, current);
    }

    return map;
  }, [installations]);

  const selectedInstallations = installationsByDay.get(selectedDay) || [];

  const changeMonth = (delta: number) => {
    const next = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + delta,
      1
    );
    setCurrentMonth(next);

    // Seleccionar el primer día del nuevo mes.
    setSelectedDay(dateKey(next));
  };

  const selectCalendarDay = (key: string) => {
    setSelectedDay(key);
  };

  const selectedDate = parseDbDate(selectedDay);
  const selectedDateLabel = selectedDate
    ? selectedDate.toLocaleDateString('es-MX', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : '';

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Cargando calendario...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      <Stack.Screen
        options={{
          title: 'Calendario de instalaciones',
          headerShown: true,
          headerBackTitle: 'Volver',
        }}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadData();
            }}
            tintColor="#2563eb"
            colors={['#2563eb']}
          />
        }
      >

        {error ? (
          <View style={styles.errorCard}>
            <Feather name="alert-triangle" size={18} color="#dc2626" />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={loadData}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.calendarCard}>
          <View style={styles.monthHeader}>
            <Pressable style={styles.monthButton} onPress={() => changeMonth(-1)}>
              <Feather name="chevron-left" size={20} color="#0f172a" />
            </Pressable>

            <Text style={styles.monthTitle}>
              {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </Text>

            <Pressable style={styles.monthButton} onPress={() => changeMonth(1)}>
              <Feather name="chevron-right" size={20} color="#0f172a" />
            </Pressable>
          </View>

          <View style={styles.weekHeader}>
            {WEEKDAYS.map((day) => (
              <Text key={day} style={styles.weekday}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {calendarDays.map((cell) => {
              if (!cell.day) {
                return <View key={cell.key} style={styles.dayCell} />;
              }

              const key = cell.key;
              const hasInstallations = (installationsByDay.get(key) || []).length > 0;
              const isSelected = key === selectedDay;
              const isToday = key === dateKey(today);

              return (
                <Pressable
                  key={key}
                  style={[
                    styles.dayCell,
                    isSelected && styles.dayCellSelected,
                  ]}
                  onPress={() => selectCalendarDay(key)}
                >
                  <View
                    style={[
                      styles.dayNumberWrap,
                      isToday && !isSelected && styles.todayWrap,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNumber,
                        isSelected && styles.dayNumberSelected,
                        isToday && !isSelected && styles.todayNumber,
                      ]}
                    >
                      {cell.day}
                    </Text>
                  </View>

                  {hasInstallations ? (
                    <View style={styles.installationDots}>
                      <View style={styles.installationDot} />
                      {(installationsByDay.get(key) || []).length > 1 ? (
                        <Text
                          style={[
                            styles.installationCount,
                            isSelected && styles.installationCountSelected,
                          ]}
                        >
                          {(installationsByDay.get(key) || []).length}
                        </Text>
                      ) : null}
                    </View>
                  ) : (
                    <View style={styles.installationDotsPlaceholder} />
                  )}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.legend}>
            <View style={styles.legendDot} />
            <Text style={styles.legendText}>Hay instalación(es) asignada(s)</Text>
          </View>
        </View>

        <View style={styles.selectedHeader}>
          <View>
            <Text style={styles.selectedEyebrow}>DÍA SELECCIONADO</Text>
            <Text style={styles.selectedTitle}>{selectedDateLabel}</Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{selectedInstallations.length}</Text>
          </View>
        </View>

        {selectedInstallations.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Feather name="calendar" size={24} color="#64748b" />
            </View>
            <Text style={styles.emptyTitle}>Sin instalaciones</Text>
            <Text style={styles.emptyText}>
              No hay instalaciones asignadas para este día.
            </Text>
          </View>
        ) : (
          <View style={styles.installationList}>
            {selectedInstallations.map((installation) => {
              const client = installation.client_id
                ? clientMap.get(installation.client_id)
                : undefined;
              const technician = installation.technician_id
                ? technicianMap.get(installation.technician_id)
                : undefined;

              return (
                <Pressable
                  key={installation.id}
                  style={({ pressed }) => [
                    styles.installationCard,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => router.push(`/installations/${installation.id}`)}
                >
                  <View style={styles.installationTop}>
                    <View style={styles.installationIcon}>
                      <Feather name="layers" size={17} color="#ffffff" />
                    </View>
                    <View style={styles.installationTitleWrap}>
                      <Text style={styles.installationTitle} numberOfLines={2}>
                        {installation.project_name || 'Instalación'}
                      </Text>
                      <Text style={styles.status}>
                        {statusLabel(installation.status)}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={20} color="#64748b" />
                  </View>

                  <View style={styles.detailRows}>
                    <DetailRow
                      icon="user"
                      label="Cliente"
                      value={client?.name || 'Sin cliente'}
                    />
                    <DetailRow
                      icon="users"
                      label="Técnico"
                      value={technician?.full_name || 'Sin técnico'}
                    />
                    <DetailRow
                      icon="map-pin"
                      label="Dónde"
                      value={installation.address || 'Sin dirección'}
                    />
                    <DetailRow
                      icon="calendar"
                      label="Cuándo"
                      value={formatLongDate(installation.assigned_date)}
                    />
                    <DetailRow
                      icon="tool"
                      label="Qué se hará"
                      value={installation.installation_type || 'No especificado'}
                    />
                  </View>

                  <View style={styles.moreInfo}>
                    <Text style={styles.moreInfoText}>
                      Toca para ver todos los detalles de la instalación
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Feather name={icon} size={15} color="#64748b" />
      <View style={styles.detailTextWrap}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue} numberOfLines={3}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    color: '#64748b',
    fontSize: 14,
  },
  introCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  introIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  introText: {
    flex: 1,
  },
  title: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 3,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    flex: 1,
    color: '#991b1b',
    fontSize: 12,
  },
  retryText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '800',
  },
  calendarCard: {
    backgroundColor: '#ffffff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: spacing.md,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  monthTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
  },
  monthButton: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekHeader: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  weekday: {
    width: '14.2857%',
    textAlign: 'center',
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.2857%',
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 6,
    borderRadius: 10,
  },
  dayCellSelected: {
    backgroundColor: '#2563eb',
  },
  dayNumberWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayWrap: {
    backgroundColor: '#dbeafe',
  },
  dayNumber: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '600',
  },
  dayNumberSelected: {
    color: '#ffffff',
    fontWeight: '800',
  },
  todayNumber: {
    color: '#2563eb',
    fontWeight: '800',
  },
  installationDots: {
    height: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  installationDotsPlaceholder: {
    height: 17,
  },
  installationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2563eb',
  },
  installationCount: {
    color: '#2563eb',
    fontSize: 9,
    fontWeight: '800',
  },
  installationCountSelected: {
    color: '#ffffff',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#2563eb',
    marginRight: 6,
  },
  legendText: {
    color: '#64748b',
    fontSize: 11,
  },
  selectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  selectedEyebrow: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  selectedTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
    textTransform: 'capitalize',
    marginTop: 2,
  },
  countBadge: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: 8,
    borderRadius: 17,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '800',
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: spacing.xl,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  installationList: {
    gap: spacing.md,
  },
  installationCard: {
    backgroundColor: '#ffffff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: spacing.md,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  installationTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  installationIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  installationTitleWrap: {
    flex: 1,
    marginRight: spacing.sm,
  },
  installationTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
  status: {
    color: '#2563eb',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  detailRows: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  detailTextWrap: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  detailLabel: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  detailValue: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 1,
  },
  moreInfo: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  moreInfoText: {
    color: '#2563eb',
    fontSize: 11,
    fontWeight: '700',
  },
});
