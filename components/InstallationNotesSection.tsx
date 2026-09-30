import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing } from '../constants/theme';
import { supabase } from '../lib/supabase';

type NoteType =
  | 'visit_anticipada'
  | 'nota_traslado'
  | 'observacion'
  | 'nota'
  | 'levantamiento';

type InstallationNote = {
  id: string;
  organization_id: string;
  installation_id: string;
  technician_user_id: string;
  technician_membership_id: string;
  note_type: NoteType;
  content: string;
  created_at: string;
  updated_at: string;
};

type InstallationNotesSectionProps = {
  organizationId: string;
  installationId: string;
  technicianUserId: string;
  technicianMembershipId: string;
};

const MAX_LENGTH = 5000;

const NOTE_TYPES: {
  value: NoteType;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    value: 'visit_anticipada',
    label: 'Visita anticipada',
    description: 'Registrar una visita realizada antes de iniciar la instalación.',
    icon: 'location-outline',
  },
  {
    value: 'nota_traslado',
    label: 'Nota de traslado',
    description: 'Registrar información relacionada con el traslado.',
    icon: 'car-outline',
  },
  {
    value: 'observacion',
    label: 'Observación',
    description: 'Registrar algo importante observado en la instalación.',
    icon: 'eye-outline',
  },
  {
    value: 'nota',
    label: 'Nota',
    description: 'Agregar una nota general relacionada con la instalación.',
    icon: 'create-outline',
  },
  {
    value: 'levantamiento',
    label: 'Levantamiento',
    description: 'Registrar información obtenida durante un levantamiento.',
    icon: 'clipboard-outline',
  },
];

function getNoteType(type: NoteType) {
  return NOTE_TYPES.find((item) => item.value === type);
}

function getNoteTypeLabel(type: NoteType) {
  return getNoteType(type)?.label ?? 'Nota';
}

function formatNoteDate(value: string) {
  try {
    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function InstallationNotesSection({
  organizationId,
  installationId,
  technicianUserId,
  technicianMembershipId,
}: InstallationNotesSectionProps) {
  const [notes, setNotes] = useState<InstallationNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);

  const [selectedType, setSelectedType] = useState<NoteType | null>(null);
  const [content, setContent] = useState('');
  const [editingNote, setEditingNote] = useState<InstallationNote | null>(null);

  const canSave = content.trim().length > 0 && !isSaving && !isDeleting;

  const loadNotes = useCallback(async () => {
    if (!supabase || !installationId) {
      setNotes([]);
      setHasError(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setHasError(false);

    const { data, error } = await supabase
      .from('installation_notes')
      .select(
        `
          id,
          organization_id,
          installation_id,
          technician_user_id,
          technician_membership_id,
          note_type,
          content,
          created_at,
          updated_at
        `,
      )
      .eq('installation_id', installationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error cargando apuntes:', error);
      setNotes([]);
      setHasError(true);
      setIsLoading(false);
      return;
    }

    setNotes((data ?? []) as InstallationNote[]);
    setIsLoading(false);
  }, [installationId]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  function openTypeSelector() {
    setEditingNote(null);
    setSelectedType(null);
    setContent('');
    setIsTypeModalOpen(true);
  }

  function openEditNote(note: InstallationNote) {
    if (isSaving || isDeleting) {
      return;
    }

    Keyboard.dismiss();
    setEditingNote(note);
    setSelectedType(note.note_type);
    setContent(note.content);
    setIsEditorModalOpen(true);
  }

  function selectNoteType(type: NoteType) {
    setSelectedType(type);
    setIsTypeModalOpen(false);
    setContent('');
    setIsEditorModalOpen(true);
  }

  function resetEditor() {
    Keyboard.dismiss();
    setIsEditorModalOpen(false);
    setSelectedType(null);
    setContent('');
    setEditingNote(null);
  }

  function closeEditor() {
    if (isSaving) {
      return;
    }

    // Evita perder texto por un toque accidental fuera del recuadro.
    if (content.trim().length > 0) {
      Alert.alert(
        '¿Descartar apunte?',
        'Tienes texto sin guardar. Si sales ahora, se perderá.',
        [
          { text: 'Seguir editando', style: 'cancel' },
          { text: 'Descartar', style: 'destructive', onPress: resetEditor },
        ],
      );
      return;
    }

    resetEditor();
  }

  async function handleSave() {
    if (!supabase || !selectedType || isSaving) {
      return;
    }

    const trimmedContent = content.trim();

    if (!trimmedContent) {
      Alert.alert(
        'Falta el contenido',
        'Escribe el apunte antes de guardarlo.',
      );
      return;
    }

    setIsSaving(true);

    let error;

    if (editingNote) {
      const result = await supabase
        .from('installation_notes')
        .update({
          content: trimmedContent,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingNote.id)
        .eq('installation_id', installationId)
        .eq('technician_user_id', technicianUserId);

      error = result.error;
    } else {
      const result = await supabase.from('installation_notes').insert({
        organization_id: organizationId,
        installation_id: installationId,
        technician_user_id: technicianUserId,
        technician_membership_id: technicianMembershipId,
        note_type: selectedType,
        content: trimmedContent,
      });

      error = result.error;
    }

    setIsSaving(false);

    if (error) {
      console.error(
        editingNote ? 'Error actualizando apunte:' : 'Error guardando apunte:',
        error,
      );

      Alert.alert(
        editingNote ? 'No se pudo actualizar' : 'No se pudo guardar',
        error.message ||
          (editingNote
            ? 'Ocurrió un error al actualizar el apunte.'
            : 'Ocurrió un error al guardar el apunte.'),
      );

      return;
    }

    resetEditor();
    await loadNotes();
  }

  async function handleDelete() {
    if (!supabase || !editingNote || isSaving || isDeleting) {
      return;
    }

    Keyboard.dismiss();

    Alert.alert(
      'Eliminar apunte',
      '¿Seguro que deseas eliminar este apunte? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);

            const { error } = await supabase
              .from('installation_notes')
              .delete()
              .eq('id', editingNote.id)
              .eq('installation_id', installationId)
              .eq('organization_id', organizationId)
              .eq('technician_user_id', technicianUserId);

            setIsDeleting(false);

            if (error) {
              console.error('Error eliminando apunte:', error);

              Alert.alert(
                'No se pudo eliminar',
                error.message || 'Ocurrió un error al eliminar el apunte.',
              );

              return;
            }

            resetEditor();
            await loadNotes();
          },
        },
      ],
    );
  }

  const selectedTypeData = selectedType ? getNoteType(selectedType) : null;

  return (
    <>
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderContent}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              Apuntes
            </Text>

            <Text style={styles.sectionDescription}>
              Registra visitas, traslados, observaciones, notas o levantamientos.
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.addButton,
              pressed && styles.addButtonPressed,
            ]}
            onPress={openTypeSelector}
            accessibilityRole="button"
            accessibilityLabel="Agregar apunte"
            accessibilityHint="Abre la lista de tipos de apunte"
          >
            <Ionicons name="add" size={24} color="#fff" />
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>Cargando apuntes...</Text>
          </View>
        ) : hasError ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Ionicons
                name="cloud-offline-outline"
                size={24}
                color={colors.muted}
              />
            </View>

            <Text style={styles.emptyTitle}>No se pudieron cargar</Text>

            <Text style={styles.emptyText}>
              Revisa tu conexión e inténtalo de nuevo.
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.retryButton,
                pressed && styles.addButtonPressed,
              ]}
              onPress={loadNotes}
              accessibilityRole="button"
              accessibilityLabel="Reintentar carga de apuntes"
            >
              <Ionicons name="refresh" size={16} color={colors.primary} />
              <Text style={styles.retryButtonText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : notes.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Ionicons
                name="document-text-outline"
                size={24}
                color={colors.muted}
              />
            </View>

            <Text style={styles.emptyTitle}>Sin apuntes</Text>

            <Text style={styles.emptyText}>
              Todavía no hay apuntes registrados para esta instalación.
            </Text>
          </View>
        ) : (
          <View style={styles.notesList}>
            {notes.map((item) => (
              <Pressable
                key={item.id}
                style={({ pressed }) => [
                  styles.noteCard,
                  pressed && styles.noteCardPressed,
                ]}
                onPress={() => openEditNote(item)}
                disabled={isSaving}
                accessibilityRole="button"
                accessibilityLabel={`Editar ${getNoteTypeLabel(item.note_type)}`}
                accessibilityHint="Abre este apunte para modificarlo"
              >
                <View style={styles.noteHeader}>
                  <View style={styles.noteTypeContainer}>
                    <Ionicons
                      name={
                        getNoteType(item.note_type)?.icon ??
                        'document-text-outline'
                      }
                      size={18}
                      color={colors.primary}
                    />

                    <Text style={styles.noteType}>
                      {getNoteTypeLabel(item.note_type)}
                    </Text>
                  </View>

                  <View style={styles.noteHeaderRight}>
                    <Text style={styles.noteDate}>
                      {formatNoteDate(item.updated_at || item.created_at)}
                    </Text>

                    <Ionicons
                      name="create-outline"
                      size={17}
                      color={colors.muted}
                    />
                  </View>
                </View>

                <Text style={styles.noteContent} selectable>
                  {item.content}
                </Text>

                <Text style={styles.editHint}>
                  Toca para modificar
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* =========================================================
          MODAL: SELECCIONAR TIPO DE APUNTE
          ========================================================= */}

      <Modal
        visible={isTypeModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsTypeModalOpen(false)}
      >
        <View style={styles.centeredOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setIsTypeModalOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar selector"
          />

          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.headerTextContainer}>
                <Text style={styles.modalTitle} accessibilityRole="header">
                  Nuevo apunte
                </Text>

                <Text style={styles.modalSubtitle}>¿Qué deseas registrar?</Text>
              </View>

              <Pressable
                style={styles.closeButton}
                onPress={() => setIsTypeModalOpen(false)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
              >
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.typeList}
              showsVerticalScrollIndicator={false}
            >
              {NOTE_TYPES.map((type) => (
                <Pressable
                  key={type.value}
                  style={({ pressed }) => [
                    styles.typeOption,
                    pressed && styles.typeOptionPressed,
                  ]}
                  onPress={() => selectNoteType(type.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`${type.label}. ${type.description}`}
                >
                  <View style={styles.typeIcon}>
                    <Ionicons
                      name={type.icon}
                      size={23}
                      color={colors.primary}
                    />
                  </View>

                  <View style={styles.typeContent}>
                    <Text style={styles.typeLabel}>{type.label}</Text>

                    <Text style={styles.typeDescription}>
                      {type.description}
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={colors.muted}
                  />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* =========================================================
          MODAL: CAPTURAR APUNTE (centrado y sin tapar por teclado)
          ========================================================= */}

      <Modal
        visible={isEditorModalOpen}
        transparent
        animationType="fade"
        onRequestClose={closeEditor}
      >
        <KeyboardAvoidingView
          style={styles.keyboardAvoider}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.centeredOverlay}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={closeEditor}
              accessibilityRole="button"
              accessibilityLabel="Cerrar editor"
            />

            <View style={styles.editorSheet}>
              <View style={styles.modalHeader}>
                <View style={styles.editorTitleRow}>
                  {selectedTypeData ? (
                    <View style={styles.editorTypeIcon}>
                      <Ionicons
                        name={selectedTypeData.icon}
                        size={22}
                        color={colors.primary}
                      />
                    </View>
                  ) : null}

                  <View style={styles.headerTextContainer}>
                    <Text style={styles.modalTitle} accessibilityRole="header">
                      {editingNote
                        ? `Editar ${selectedTypeData?.label ?? 'apunte'}`
                        : selectedTypeData?.label ?? 'Nuevo apunte'}
                    </Text>

                    <Text style={styles.modalSubtitle}>
                      {editingNote
                        ? 'Modifica la información de este apunte.'
                        : 'Escribe la información que deseas registrar.'}
                    </Text>
                  </View>
                </View>

                <Pressable
                  style={styles.closeButton}
                  onPress={closeEditor}
                  disabled={isSaving || isDeleting}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar"
                >
                  <Ionicons name="close" size={22} color={colors.text} />
                </Pressable>
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.editorScrollContent}
              >
                <TextInput
                  value={content}
                  onChangeText={setContent}
                  placeholder="Escribe aquí el apunte..."
                  placeholderTextColor={colors.muted}
                  multiline
                  textAlignVertical="top"
                  editable={!isSaving && !isDeleting}
                  style={styles.textInput}
                  maxLength={MAX_LENGTH}
                  autoFocus
                  accessibilityLabel="Contenido del apunte"
                />

                <Text
                  style={styles.characterCount}
                  accessibilityLabel={`${content.length} de ${MAX_LENGTH} caracteres`}
                >
                  {content.length}/{MAX_LENGTH}
                </Text>
              </ScrollView>

              <View style={styles.actionsRow}>
                {editingNote ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.deleteButton,
                      pressed && styles.deleteButtonPressed,
                      (isSaving || isDeleting) && styles.deleteButtonDisabled,
                    ]}
                    onPress={handleDelete}
                    disabled={isSaving || isDeleting}
                    accessibilityRole="button"
                    accessibilityLabel="Eliminar apunte"
                  >
                    {isDeleting ? (
                      <ActivityIndicator size="small" color="#dc2626" />
                    ) : (
                      <Ionicons
                        name="trash-outline"
                        size={20}
                        color="#dc2626"
                      />
                    )}
                  </Pressable>
                ) : null}

                <Pressable
                  style={({ pressed }) => [
                    styles.cancelButton,
                    pressed && styles.cancelButtonPressed,
                  ]}
                  onPress={closeEditor}
                  disabled={isSaving || isDeleting}
                  accessibilityRole="button"
                  accessibilityLabel="Cancelar"
                >
                  <Text style={styles.cancelButtonText}>Cancelar</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.saveButton,
                    !canSave && styles.saveButtonDisabled,
                    pressed && canSave && styles.saveButtonPressed,
                  ]}
                  onPress={handleSave}
                  disabled={!canSave}
                  accessibilityRole="button"
                  accessibilityLabel="Guardar apunte"
                  accessibilityState={{ disabled: !canSave, busy: isSaving }}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={21}
                      color="#fff"
                    />
                  )}

                  <Text style={styles.saveButtonText}>
                    {isSaving
                      ? 'Guardando...'
                      : editingNote
                        ? 'Guardar cambios'
                        : 'Guardar'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  sectionCard: {
    gap: spacing.md,
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

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },

  sectionHeaderContent: {
    flex: 1,
    gap: 3,
  },

  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
  },

  sectionDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },

  addButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },

  addButtonPressed: {
    opacity: 0.75,
  },

  loadingContainer: {
    minHeight: 70,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },

  loadingText: {
    color: colors.muted,
    fontSize: 13,
  },

  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },

  emptyIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: colors.surface,
    marginBottom: spacing.xs,
  },

  emptyTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },

  emptyText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },

  retryButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
  },

  retryButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },

  notesList: {
    gap: spacing.sm,
  },

  noteCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    padding: spacing.sm,
  },

  noteCardPressed: {
    opacity: 0.75,
  },

  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },

  noteHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },

  noteTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },

  noteType: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },

  noteDate: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
  },

  noteContent: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
  },

  editHint: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'right',
  },

  /* ---------- Modales (centrados) ---------- */

  keyboardAvoider: {
    flex: 1,
  },

  centeredOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 32, 51, 0.5)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },

  modalSheet: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '82%',
    gap: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 10,
  },

  editorSheet: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    gap: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 10,
  },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },

  headerTextContainer: {
    flex: 1,
  },

  editorTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },

  editorTypeIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
  },

  modalTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 25,
  },

  modalSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },

  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.surface,
  },

  typeList: {
    gap: spacing.sm,
  },

  typeOption: {
    minHeight: 72,
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },

  typeOptionPressed: {
    opacity: 0.7,
  },

  typeIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
  },

  typeContent: {
    flex: 1,
    gap: 2,
  },

  typeLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
  },

  typeDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },

  editorScrollContent: {
    gap: spacing.xs,
  },

  textInput: {
    minHeight: 150,
    maxHeight: 260,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },

  characterCount: {
    color: colors.muted,
    fontSize: 11,
    textAlign: 'right',
  },

  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },

  deleteButton: {
    width: 50,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: radius.sm,
    backgroundColor: '#fff5f5',
  },

  deleteButtonPressed: {
    opacity: 0.7,
  },

  deleteButtonDisabled: {
    opacity: 0.5,
  },

  cancelButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },

  cancelButtonPressed: {
    opacity: 0.7,
  },

  cancelButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },

  saveButton: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
  },

  saveButtonDisabled: {
    opacity: 0.5,
  },

  saveButtonPressed: {
    opacity: 0.8,
  },

  saveButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});