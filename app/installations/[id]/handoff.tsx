// app/installations/[id]/handoff.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import SignatureScreen, { type SignatureViewRef } from 'react-native-signature-canvas';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronIcon } from '../../../components/ChevronIcon';
import { EmptyState } from '../../../components/EmptyState';
import { LoadingState } from '../../../components/LoadingState';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { colors, radius, spacing } from '../../../constants/theme';
import { useAuth } from '../../../context/AuthContext';
import { formatDateTime } from '../../../lib/date';
import { useHandoffSubmission } from '../../../hooks/useInstallationHandoff';
import { fetchInstallationById } from '../../../hooks/useInstallations';
import type { InstallationItem, InstallationWithClient } from '../../../types/database';

const MAX_RECIPIENT_NAME_LENGTH = 140;
const MAX_FINAL_NOTES_LENGTH = 1000;

function normalizeRecipientName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function validateRecipientName(value: string) {
  const normalized = normalizeRecipientName(value);

  if (normalized.length < 3) {
    return 'Captura al menos 3 caracteres.';
  }

  if (/^\d+$/.test(normalized)) {
    return 'El nombre no puede contener únicamente números.';
  }

  return '';
}

function buildItemInstallation(
  installation: InstallationWithClient,
  item: InstallationItem,
): InstallationWithClient {
  return {
    ...installation,
    installationType: item.serviceType,
    assignedDate: item.assignedDate ?? installation.assignedDate,
    startDate: item.startDate,
    startedAt: item.startedAt,
    estimatedCompletionDate:
      item.estimatedCompletionDate ?? installation.estimatedCompletionDate,
    completedAt: item.completedAt,
    status: item.status,
    observations: item.observations,
  };
}

function getPrimaryItem(items: InstallationItem[]) {
  return items.find((item) => item.itemRole === 'primary') ?? items[0] ?? null;
}

function getUnitLabel(item: InstallationItem) {
  if (item.itemRole === 'primary') {
    return 'Instalacion principal';
  }

  return `Particion ${Math.max(1, item.position - 1)}`;
}

export default function InstallationHandoffScreen() {
  const { id, itemId } = useLocalSearchParams<{ id: string; itemId?: string }>();
  const { status, user, selectedMembership } = useAuth();
  const [installation, setInstallation] = useState<InstallationWithClient | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientError, setRecipientError] = useState('');
  const [hasSignature, setHasSignature] = useState(false);
  const [signatureError, setSignatureError] = useState('');
  const [acceptanceConfirmed, setAcceptanceConfirmed] = useState(false);
  const [acceptanceError, setAcceptanceError] = useState('');
  const [finalNotes, setFinalNotes] = useState('');
  const [submitMessage, setSubmitMessage] = useState('');
  const [pendingSignatureRead, setPendingSignatureRead] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const signatureRef = useRef<SignatureViewRef>(null);
  const { submitHandoff, isSubmitting } = useHandoffSubmission();
  const selectedItem =
    installation?.items.find((item) => item.id === itemId) ??
    getPrimaryItem(installation?.items ?? []) ??
    null;
  const activeInstallation = installation && selectedItem
    ? buildItemInstallation(installation, selectedItem)
    : installation;

  const lockScreenScroll = useCallback(() => {
    setIsSigning(true);
  }, []);

  const unlockScreenScroll = useCallback(() => {
    setIsSigning(false);
  }, []);

  const loadInstallation = useCallback(async () => {
    if (!id || !selectedMembership) {
      return;
    }

    setIsLoading(true);
    setLoadError('');

    const result = await fetchInstallationById(id, selectedMembership);

    if (result.error) {
      setInstallation(null);
      setLoadError(result.error);
    } else {
      setInstallation(result.data);
    }

    setIsLoading(false);
  }, [id, selectedMembership]);

  useEffect(() => {
    loadInstallation();
  }, [loadInstallation]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        unlockScreenScroll();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [unlockScreenScroll]);

  function validateForm() {
    const nextRecipientError = validateRecipientName(recipientName);
    const nextSignatureError = hasSignature
      ? ''
      : 'La firma de conformidad es obligatoria.';
    const nextAcceptanceError = acceptanceConfirmed
      ? ''
      : 'Confirma que la instalación fue entregada y explicada.';

    setRecipientError(nextRecipientError);
    setSignatureError(nextSignatureError);
    setAcceptanceError(nextAcceptanceError);

    return !nextRecipientError && !nextSignatureError && !nextAcceptanceError;
  }

  function handleSubmitPress() {
    setSubmitMessage('');

    if (!validateForm()) {
      return;
    }

    Alert.alert(
      'Confirmar entrega',
      'Después de enviar la firma, la instalación pasará a revisión administrativa. Verifica que el nombre y la firma sean correctos.',
      [
        { text: 'Volver y revisar', style: 'cancel' },
        {
          text: 'Sí, enviar para revisión',
          onPress: () => {
            setPendingSignatureRead(true);
            signatureRef.current?.readSignature();
          },
        },
      ],
    );
  }

  async function handleSignatureOk(signatureDataUrl: string) {
    if (!pendingSignatureRead || !installation) {
      return;
    }

    setPendingSignatureRead(false);
    const result = await submitHandoff({
      installationId: installation.id,
      installationItemId: selectedItem?.id ?? null,
      recipientName,
      signatureDataUrl,
      finalNotes,
    });

    if (!result.ok) {
      setSubmitMessage(result.message);
      return;
    }

    Alert.alert('Entrega enviada', result.message, [
      {
        text: 'Aceptar',
        onPress: () => {
          router.replace({
            pathname: '/installations/[id]',
            params: { id: installation.id, itemId: selectedItem?.id ?? '' },
          });
        },
      },
    ]);
  }

  function clearSignature() {
    signatureRef.current?.clearSignature();
    setHasSignature(false);
    setSignatureError('');
  }

  if (status === 'checking') {
    return (
      <View style={styles.centerScreen}>
        <StatusBar style="dark" />
        <LoadingState text="Cargando entrega" />
      </View>
    );
  }

  if (status !== 'authenticated' || !user) {
    return <Redirect href="/login" />;
  }

  if (!selectedMembership) {
    return <Redirect href="/select-company" />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.keyboardArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!isSigning}
          nestedScrollEnabled={false}
        >
          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityRole="button"
            hitSlop={8}
          >
            <ChevronIcon direction="left" size={18} color={colors.primary} />
            <Text style={styles.backText}>Volver</Text>
          </Pressable>

          {isLoading ? (
            <LoadingState text="Cargando entrega" />
          ) : loadError ? (
            <EmptyState
              title="No pudimos cargar la instalación"
              description={loadError}
              actionLabel="Reintentar"
              onAction={loadInstallation}
            />
          ) : activeInstallation?.status !== 'in_progress' ? (
            <EmptyState
              title="Entrega no disponible"
              description="Solo puedes finalizar trabajos que estén en proceso."
            />
          ) : installation && activeInstallation ? (
            <View style={styles.stack}>
              <View style={styles.heading}>
                <Text style={styles.eyebrow}>Entrega de instalación</Text>
                <Text style={styles.title}>Firma de conformidad</Text>
                <Text style={styles.description}>
                  Pide a la persona que recibe la instalación que revise los datos
                  y firme dentro del recuadro.
                </Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Resumen</Text>
                <View style={styles.summaryGrid}>
                  <SummaryRow label="Proyecto" value={installation.projectName} />
                  {selectedItem ? (
                    <SummaryRow
                      label="Unidad"
                      value={`${getUnitLabel(selectedItem)} - ${selectedItem.name}`}
                    />
                  ) : null}
                  <SummaryRow label="Cliente" value={installation.client.name} />
                  <SummaryRow label="Dirección" value={installation.address} />
                  <SummaryRow
                    label="Ubicacion o area"
                    value={selectedItem?.specificLocation ?? installation.address}
                  />
                  <SummaryRow label="Técnico" value={selectedMembership.fullName} />
                  <SummaryRow label="Empresa" value={selectedMembership.organizationName} />
                  <SummaryRow label="Fecha y hora" value={formatDateTime(new Date().toISOString())} />
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Nombre de quien recibe</Text>
                <Text style={styles.label}>Nombre completo de quien recibe</Text>
                <TextInput
                  value={recipientName}
                  onChangeText={(value) => {
                    setRecipientName(value.slice(0, MAX_RECIPIENT_NAME_LENGTH));
                    setRecipientError('');
                  }}
                  placeholder="Nombre completo"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="words"
                  maxLength={MAX_RECIPIENT_NAME_LENGTH}
                  selectionColor={colors.primary}
                  style={[
                    styles.input,
                    recipientError ? styles.inputError : null,
                  ]}
                />
                {recipientError ? (
                  <Text style={styles.errorText}>{recipientError}</Text>
                ) : null}
              </View>

              <View style={styles.card}>
                <View style={styles.signatureHeader}>
                  <View style={styles.signatureTitleBlock}>
                    <Text style={styles.sectionTitle}>Firma de conformidad</Text>
                    <Text style={styles.description}>
                      Pide a la persona que recibe la instalación que firme dentro
                      del recuadro.
                    </Text>
                  </View>
                  <Pressable
                    style={styles.clearButton}
                    onPress={clearSignature}
                    accessibilityRole="button"
                  >
                    <Text style={styles.clearButtonText}>
                      {hasSignature ? 'Volver a firmar' : 'Limpiar firma'}
                    </Text>
                  </Pressable>
                </View>

                <View
                  style={styles.signatureBox}
                  onTouchStart={lockScreenScroll}
                  onTouchEnd={unlockScreenScroll}
                  onTouchCancel={unlockScreenScroll}
                  onResponderRelease={unlockScreenScroll}
                  onResponderTerminate={unlockScreenScroll}
                >
                  <SignatureScreen
                    ref={signatureRef}
                    onOK={handleSignatureOk}
                    onBegin={() => {
                      lockScreenScroll();
                      setHasSignature(true);
                      setSignatureError('');
                    }}
                    onEnd={unlockScreenScroll}
                    onEmpty={() => {
                      unlockScreenScroll();
                      setPendingSignatureRead(false);
                      setSignatureError('La firma de conformidad es obligatoria.');
                    }}
                    descriptionText=""
                    clearText="Limpiar"
                    confirmText="Guardar"
                    webStyle={signatureWebStyle}
                    autoClear={false}
                    backgroundColor={colors.background}
                    penColor="#142033"
                    scrollable={false}
                    nestedScrollEnabled={false}
                    webviewProps={{
                      bounces: false,
                      scrollEnabled: false,
                      nestedScrollEnabled: false,
                      overScrollMode: 'never',
                    }}
                  />
                </View>
                {signatureError ? (
                  <Text style={styles.errorText}>{signatureError}</Text>
                ) : null}
              </View>

              <View style={styles.card}>
                <Pressable
                  style={styles.checkboxRow}
                  onPress={() => {
                    setAcceptanceConfirmed((current) => !current);
                    setAcceptanceError('');
                  }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: acceptanceConfirmed }}
                >
                  <View
                    style={[
                      styles.checkbox,
                      acceptanceConfirmed ? styles.checkboxChecked : null,
                    ]}
                  >
                    {acceptanceConfirmed ? (
                      <MaterialCommunityIcons
                        name="check"
                        size={18}
                        color={colors.background}
                      />
                    ) : null}
                  </View>
                  <Text style={styles.checkboxText}>
                    Confirmo que la instalación fue entregada y explicada a la
                    persona indicada
                  </Text>
                </Pressable>
                {acceptanceError ? (
                  <Text style={styles.errorText}>{acceptanceError}</Text>
                ) : null}
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Observaciones finales</Text>
                <TextInput
                  value={finalNotes}
                  onChangeText={(value) => setFinalNotes(value.slice(0, MAX_FINAL_NOTES_LENGTH))}
                  placeholder="Equipo entregado funcionando, capacitación realizada, pendientes informados..."
                  placeholderTextColor={colors.placeholder}
                  multiline
                  maxLength={MAX_FINAL_NOTES_LENGTH}
                  selectionColor={colors.primary}
                  style={[styles.input, styles.notesInput]}
                />
                <Text style={styles.counter}>
                  {finalNotes.length}/{MAX_FINAL_NOTES_LENGTH}
                </Text>
              </View>

              {submitMessage ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{submitMessage}</Text>
                </View>
              ) : null}

              <PrimaryButton
                title="Enviar para revisión"
                onPress={handleSubmitPress}
                loading={isSubmitting || pendingSignatureRead}
                disabled={isSubmitting || pendingSignatureRead}
              />
            </View>
          ) : (
            <EmptyState
              title="Instalación no disponible"
              description="No existe o no está asignada a tu usuario."
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const signatureWebStyle = `
  .m-signature-pad {
    box-shadow: none;
    border: 0;
    margin: 0;
  }
  .m-signature-pad--body {
    border: 0;
  }
  .m-signature-pad--footer {
    display: none;
    margin: 0;
  }
  body, html {
    width: 100%;
    height: 100%;
    background: #ffffff;
  }
`;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardArea: {
    flex: 1,
  },
  centerScreen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
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
  stack: {
    gap: spacing.md,
  },
  heading: {
    gap: spacing.xs,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 25,
    fontWeight: '700',
    lineHeight: 31,
  },
  description: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  card: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#e4edf7',
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: spacing.md,
    shadowColor: '#12355f',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 7,
    elevation: 1,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
  },
  summaryGrid: {
    gap: spacing.sm,
  },
  summaryRow: {
    gap: 2,
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  summaryValue: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  inputError: {
    borderColor: colors.error,
  },
  notesInput: {
    minHeight: 110,
    maxHeight: 180,
    textAlignVertical: 'top',
  },
  counter: {
    alignSelf: 'flex-end',
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
  },
  signatureHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  signatureTitleBlock: {
    flex: 1,
    minWidth: 220,
    gap: 3,
  },
  clearButton: {
    minHeight: 38,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
  },
  clearButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  signatureBox: {
    height: 240,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
  },
  checkboxRow: {
    minHeight: 48,
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  checkbox: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 7,
    backgroundColor: colors.background,
  },
  checkboxChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  checkboxText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  errorBox: {
    borderWidth: 1,
    borderColor: colors.errorSoft,
    borderRadius: radius.sm,
    backgroundColor: colors.errorSoft,
    padding: spacing.md,
  },
});