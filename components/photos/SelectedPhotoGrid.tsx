import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../constants/theme';
import type { LocalSelectedPhoto } from '../../types/photos';

type SelectedPhotoGridProps = {
  photos: LocalSelectedPhoto[];
  onRemovePhoto: (photoId: string) => void;
  onPreviewPhoto: (photo: LocalSelectedPhoto) => void;
  disabled: boolean;
};

export function SelectedPhotoGrid({
  photos,
  onRemovePhoto,
  onPreviewPhoto,
  disabled,
}: SelectedPhotoGridProps) {
  if (photos.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Selección para subir</Text>
      <View style={styles.grid}>
        {photos.map((photo) => (
          <View key={photo.id} style={styles.item}>
            <Pressable
              onPress={() => onPreviewPhoto(photo)}
              accessibilityRole="imagebutton"
            >
              <Image
                source={{ uri: photo.uri }}
                style={styles.image}
                contentFit="cover"
                cachePolicy="memory"
                recyclingKey={photo.id}
                transition={80}
              />
            </Pressable>

            <View style={styles.sourceBadge}>
              <MaterialCommunityIcons
                name={
                  photo.source === 'camera'
                    ? 'camera-outline'
                    : 'image-multiple-outline'
                }
                size={13}
                color={colors.primary}
              />
            </View>

            <Pressable
              style={styles.removeButton}
              onPress={() => onRemovePhoto(photo.id)}
              disabled={disabled}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="close" size={16} color={colors.text} />
            </Pressable>

            {photo.uploadStatus === 'failed' ? (
              <Text style={styles.errorText}>Reintentar</Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  item: {
    width: '30.5%',
    minWidth: 88,
    aspectRatio: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  sourceBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  removeButton: {
    position: 'absolute',
    right: 5,
    top: 5,
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  errorText: {
    position: 'absolute',
    left: 5,
    right: 5,
    bottom: 5,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.errorSoft,
    color: colors.error,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'center',
  },
});
