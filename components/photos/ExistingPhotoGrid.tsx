import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../constants/theme';
import { formatDate } from '../../lib/date';
import type { InstallationPhotoWithProfile } from '../../types/photos';
import { LoadingState } from '../LoadingState';
import { PhotoEmptyState } from './PhotoEmptyState';

type ExistingPhotoGridProps = {
  photos: InstallationPhotoWithProfile[];
  isLoading: boolean;
  error: string;
  onRetry: () => void;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function ExistingPhotoGrid({
  photos,
  isLoading,
  error,
  onRetry,
}: ExistingPhotoGridProps) {
  if (isLoading) {
    return <LoadingState text="Cargando fotografías" />;
  }

  if (error) {
    return (
      <View style={styles.errorCard}>
        <Text style={styles.errorTitle}>No pudimos cargar las fotografías</Text>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={onRetry}>
          <Text style={styles.retryText}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  if (photos.length === 0) {
    return <PhotoEmptyState />;
  }

  return (
    <View style={styles.grid}>
      {photos.map((photo) => (
        <Pressable
          key={photo.id}
          style={styles.item}
          onPress={() =>
            router.push({
              pathname: '/installations/photo/[photoId]',
              params: { photoId: photo.id },
            })
          }
          accessibilityRole="imagebutton"
        >
          {photo.signedUrl ? (
            <Image
              source={{ uri: photo.signedUrl }}
              style={styles.image}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={photo.storagePath}
              transition={120}
            />
          ) : (
            <View style={styles.imageFallback}>
              <Text style={styles.imageFallbackText}>Sin vista previa</Text>
            </View>
          )}
          <View style={styles.meta}>
            <Text style={styles.metaText} numberOfLines={1}>
              {formatDateTime(photo.uploadedAt)}
            </Text>
            {photo.comment ? (
              <Text style={styles.commentText} numberOfLines={1}>
                {photo.comment}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  item: {
    width: '47.8%',
    minWidth: 132,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e4edf7',
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.surface,
  },
  imageFallback: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    padding: spacing.sm,
  },
  imageFallbackText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  meta: {
    gap: 2,
    padding: spacing.sm,
  },
  metaText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
  },
  commentText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  errorCard: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.errorSoft,
    padding: spacing.md,
  },
  errorTitle: {
    color: colors.error,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    lineHeight: 18,
  },
  retryButton: {
    alignSelf: 'flex-start',
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  retryText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
});
