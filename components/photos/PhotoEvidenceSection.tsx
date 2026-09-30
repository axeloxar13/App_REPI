import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import {
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../constants/theme';
import {
  PHOTO_LIMIT_PER_CATEGORY,
  photoCategoryConfig,
} from '../../lib/photoCategories';
import { useInstallationPhotos } from '../../hooks/useInstallationPhotos';
import { usePhotoUpload } from '../../hooks/usePhotoUpload';
import type { InstallationStatus } from '../../types/database';
import type { LocalSelectedPhoto, PhotoCategory } from '../../types/photos';
import { ChevronIcon } from '../ChevronIcon';
import { ExistingPhotoGrid } from './ExistingPhotoGrid';
import { PhotoActions } from './PhotoActions';
import { PhotoCategoryTabs } from './PhotoCategoryTabs';
import { SelectedPhotoGrid } from './SelectedPhotoGrid';
import { UploadProgress } from './UploadProgress';

type PermissionTarget = 'camera' | 'gallery' | null;

type PhotoEvidenceSectionProps = {
  organizationId: string;
  installationId: string;
  installationItemId: string | null;
  technicianId: string;
  technicianMembershipId: string;
  status: InstallationStatus;
};

function getPermissionMessage(target: Exclude<PermissionTarget, null>, canAskAgain: boolean) {
  const label = target === 'camera' ? 'cámara' : 'fotografías';

  if (canAskAgain) {
    return `Necesitamos permiso de ${label} para agregar evidencia. Puedes intentarlo nuevamente.`;
  }

  return `El permiso de ${label} está desactivado. Abre Ajustes para permitir el acceso.`;
}

export function PhotoEvidenceSection({
  organizationId,
  installationId,
  installationItemId,
  technicianId,
  technicianMembershipId,
  status,
}: PhotoEvidenceSectionProps) {
  const [selectedCategory, setSelectedCategory] =
    useState<PhotoCategory>('before');
  const [permissionMessage, setPermissionMessage] = useState('');
  const [permissionTarget, setPermissionTarget] = useState<PermissionTarget>(null);
  const [previewPhoto, setPreviewPhoto] = useState<LocalSelectedPhoto | null>(null);

  const {
    photos,
    photoCounts,
    isLoading,
    error,
    refresh,
    retry,
  } = useInstallationPhotos(
    organizationId,
    installationId,
    installationItemId,
    selectedCategory,
  );
  const selectedCategoryLabel = photoCategoryConfig[selectedCategory].label;
  const selectedCategoryCount = photoCounts[selectedCategory] ?? 0;

  const {
    selectedPhotos,
    comment,
    setComment,
    commentLimit,
    addAssets,
    removeSelectedPhoto,
    uploadSelectedPhotos,
    isUploading,
    progress,
    message,
    canUpload,
    remainingSlots: uploadRemainingSlots,
    categoryLimitReached,
  } = usePhotoUpload({
    organizationId,
    installationId,
    installationItemId,
    technicianId,
    technicianMembershipId,
    category: selectedCategory,
    categoryLabel: selectedCategoryLabel,
    existingCategoryCount: selectedCategoryCount,
    onUploaded: refresh,
  });
  const canAddPhotos = status === 'pending' || status === 'in_progress';
  const remainingSlots = uploadRemainingSlots;
  const selectedCategoryLimitReached = categoryLimitReached;

  function getReadOnlyPhotoMessage() {
    if (status === 'completed') {
      return 'Esta instalación está terminada. La evidencia existente permanece visible.';
    }

    if (status === 'cancelled') {
      return 'Esta instalación fue cancelada. No se pueden agregar nuevas fotografías.';
    }

    if (status === 'in_review') {
      return 'Esta instalación está en revisión. No se pueden agregar nuevas fotografías desde la app móvil.';
    }

    return '';
  }

  async function ensureCameraPermission() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      setPermissionTarget('camera');
      setPermissionMessage(getPermissionMessage('camera', permission.canAskAgain));
      return false;
    }

    setPermissionTarget(null);
    setPermissionMessage('');
    return true;
  }

  async function ensureGalleryPermission() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(false);

    if (!permission.granted) {
      setPermissionTarget('gallery');
      setPermissionMessage(getPermissionMessage('gallery', permission.canAskAgain));
      return false;
    }

    setPermissionTarget(null);
    setPermissionMessage('');
    return true;
  }

  async function handleTakePhoto() {
    if (remainingSlots <= 0) {
      return;
    }

    const allowed = await ensureCameraPermission();

    if (!allowed) {
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
      exif: false,
      base64: false,
    });

    if (!result.canceled) {
      addAssets(result.assets, 'camera');
    }
  }

  async function handlePickPhotos() {
    if (remainingSlots <= 0) {
      return;
    }

    const allowed = await ensureGalleryPermission();

    if (!allowed) {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsMultipleSelection: true,
      selectionLimit: remainingSlots,
      exif: false,
      base64: false,
    });

    if (!result.canceled) {
      addAssets(result.assets, 'gallery');
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Evidencia fotográfica</Text>
        <Text style={styles.description}>
          {photoCategoryConfig[selectedCategory].description}
        </Text>
      </View>

      <PhotoCategoryTabs
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        counts={photoCounts}
      />

      {canAddPhotos ? (
        <>
          <PhotoActions
            onTakePhoto={handleTakePhoto}
            onPickPhotos={handlePickPhotos}
            disabled={isUploading || remainingSlots <= 0}
          />
          {selectedCategoryLimitReached ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                Has alcanzado el límite de {PHOTO_LIMIT_PER_CATEGORY} fotografías
                en {selectedCategoryLabel}.
              </Text>
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{getReadOnlyPhotoMessage()}</Text>
        </View>
      )}

      {permissionMessage ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{permissionMessage}</Text>
          {permissionTarget ? (
            <Pressable
              style={styles.noticeButton}
              onPress={() => Linking.openSettings()}
              accessibilityRole="button"
            >
              <Text style={styles.noticeButtonText}>Abrir Ajustes</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {canAddPhotos ? (
        <>
      <SelectedPhotoGrid
        photos={selectedPhotos}
        onRemovePhoto={removeSelectedPhoto}
        onPreviewPhoto={setPreviewPhoto}
        disabled={isUploading}
      />

      <View style={styles.commentBlock}>
        <Text style={styles.commentLabel}>Observación (opcional)</Text>
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder="Escribe una observación sobre estas fotografías…"
          placeholderTextColor={colors.placeholder}
          multiline
          maxLength={commentLimit}
          editable={!isUploading}
          selectionColor={colors.primary}
          style={styles.commentInput}
        />
        <Text style={styles.counter}>
          {comment.length}/{commentLimit}
        </Text>
      </View>

      {progress ? <UploadProgress label={progress.label} /> : null}

      <Pressable
        style={[
          styles.uploadButton,
          !canUpload ? styles.uploadButtonDisabled : null,
        ]}
        onPress={uploadSelectedPhotos}
        disabled={!canUpload}
        accessibilityRole="button"
      >
        <MaterialCommunityIcons
          name="cloud-upload-outline"
          size={18}
          color={colors.background}
        />
        <Text style={styles.uploadButtonText}>
          {isUploading ? 'Subiendo fotografías' : 'Subir fotografías'}
        </Text>
      </Pressable>

      {message ? <Text style={styles.message}>{message}</Text> : null}
        </>
      ) : null}

      <View style={styles.existingBlock}>
        <Text style={styles.subheading}>
          Fotografías cargadas · {selectedCategoryLabel} · {selectedCategoryCount} de{' '}
          {PHOTO_LIMIT_PER_CATEGORY}
        </Text>
        <ExistingPhotoGrid
          photos={photos}
          isLoading={isLoading}
          error={error}
          onRetry={retry}
        />
      </View>

      <Modal
        visible={Boolean(previewPhoto)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewPhoto(null)}
      >
        <View style={styles.previewModal}>
          <Pressable
            style={styles.previewClose}
            onPress={() => setPreviewPhoto(null)}
            accessibilityRole="button"
          >
            <ChevronIcon direction="left" size={18} color={colors.background} />
            <Text style={styles.previewCloseText}>Volver</Text>
          </Pressable>
          {previewPhoto ? (
            <Image
              source={{ uri: previewPhoto.uri }}
              style={styles.previewImage}
              contentFit="contain"
              cachePolicy="memory"
              recyclingKey={previewPhoto.id}
              transition={80}
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
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
  header: {
    gap: 3,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  description: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  notice: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    padding: spacing.sm,
  },
  noticeText: {
    color: colors.primary,
    fontSize: 13,
    lineHeight: 18,
  },
  noticeButton: {
    alignSelf: 'flex-start',
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  noticeButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  commentBlock: {
    gap: spacing.xs,
  },
  commentLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  commentInput: {
    minHeight: 82,
    maxHeight: 140,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    textAlignVertical: 'top',
  },
  counter: {
    alignSelf: 'flex-end',
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
  },
  uploadButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
  },
  uploadButtonDisabled: {
    opacity: 0.5,
  },
  uploadButtonText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  message: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  existingBlock: {
    gap: spacing.sm,
  },
  subheading: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  previewModal: {
    flex: 1,
    backgroundColor: '#05070d',
    padding: spacing.lg,
  },
  previewClose: {
    minHeight: 44,
    alignSelf: 'flex-start',
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingRight: spacing.md,
  },
  previewCloseText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  previewImage: {
    flex: 1,
    width: '100%',
  },
});
