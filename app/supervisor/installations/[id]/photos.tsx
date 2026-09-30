// app/supervisor/installations/[id]/photos.tsx

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../lib/supabase';
import { colors, spacing } from '../../../../constants/theme';
import { INSTALLATION_PHOTOS_BUCKET } from '../../../../lib/photoStorage';

type PhotoRow = {
  id: string;
  installation_id: string;
  organization_id: string;
  category: string;
  file_name: string | null;
  storage_path: string | null;
  uploaded_at: string | null;
};

type PhotoWithUrl = PhotoRow & {
  signedUrl: string | null;
};

type PhotoCategoryProps = {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  photos: PhotoWithUrl[];
  onOpenPhoto: (photo: PhotoWithUrl) => void;
};

export default function SupervisorInstallationPhotosScreen() {
  const params = useLocalSearchParams<{
    id: string | string[];
  }>();

  const { selectedMembership } = useAuth();

  const installationId = Array.isArray(params.id)
    ? params.id[0]
    : params.id;

  const organizationId =
    selectedMembership?.organizationId ?? null;

  const [isLoading, setIsLoading] = useState(true);
  const [photos, setPhotos] = useState<PhotoWithUrl[]>([]);
  const [error, setError] = useState('');
  const [selectedPhoto, setSelectedPhoto] =
    useState<PhotoWithUrl | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPhotos() {
      console.log('========================================');
      console.log('📸 SUPERVISOR FOTOS - STORAGE');
      console.log('📸 installationId:', installationId);
      console.log('📸 organizationId:', organizationId);
      console.log(
        '📸 bucket:',
        INSTALLATION_PHOTOS_BUCKET,
      );
      console.log('========================================');

      if (!installationId || !organizationId) {
        setError(
          'No se encontró la instalación o la organización.',
        );
        setIsLoading(false);
        return;
      }

      if (!supabase) {
        setError('Supabase no está configurado.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError('');

      const { data, error: queryError } = await supabase
        .from('installation_photos')
        .select(
          `
            id,
            installation_id,
            organization_id,
            category,
            file_name,
            storage_path,
            uploaded_at
          `,
        )
        .eq('installation_id', installationId)
        .eq('organization_id', organizationId)
        .order('uploaded_at', {
          ascending: false,
        });

      console.log(
        '📸 Fotos encontradas:',
        data?.length ?? 0,
      );

      console.log(
        '📸 Error PostgreSQL:',
        queryError,
      );

      if (queryError) {
        if (!cancelled) {
          setError(
            `Error al consultar fotografías: ${queryError.message}`,
          );
          setPhotos([]);
          setIsLoading(false);
        }

        return;
      }

      const rows = (data ?? []) as PhotoRow[];

      const photosWithUrls: PhotoWithUrl[] = [];

      for (const photo of rows) {
        if (!photo.storage_path) {
          photosWithUrls.push({
            ...photo,
            signedUrl: null,
          });

          continue;
        }

        console.log(
          '🔐 Generando URL firmada para:',
          photo.file_name,
        );

        const {
          data: signedData,
          error: signedError,
        } = await supabase.storage
          .from(INSTALLATION_PHOTOS_BUCKET)
          .createSignedUrl(
            photo.storage_path,
            60 * 60,
          );

        console.log(
          '🔐 signedUrl creada:',
          !!signedData?.signedUrl,
        );

        console.log(
          '🔐 error Storage:',
          signedError,
        );

        photosWithUrls.push({
          ...photo,
          signedUrl:
            signedData?.signedUrl ?? null,
        });
      }

      if (cancelled) {
        return;
      }

      console.log(
        '📸 Fotos con URL:',
        photosWithUrls.filter(
          (photo) => !!photo.signedUrl,
        ).length,
      );

      setPhotos(photosWithUrls);
      setIsLoading(false);
    }

    loadPhotos();

    return () => {
      cancelled = true;
    };
  }, [installationId, organizationId]);

  const beforePhotos = photos.filter(
    (photo) => photo.category === 'before',
  );

  const duringPhotos = photos.filter(
    (photo) => photo.category === 'during',
  );

  const afterPhotos = photos.filter(
    (photo) => photo.category === 'after',
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Fotografías',
          headerBackTitle: 'Volver',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />

      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ENCABEZADO */}
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons
              name="images-outline"
              size={30}
              color={colors.primary}
            />
          </View>

          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>
              Galería de instalación
            </Text>

            <Text style={styles.heroSubtitle}>
              Evidencia fotográfica de la instalación
            </Text>
          </View>

          <View style={styles.totalBadge}>
            <Text style={styles.totalBadgeNumber}>
              {photos.length}
            </Text>

            <Text style={styles.totalBadgeLabel}>
              fotos
            </Text>
          </View>
        </View>

        {/* ESTADO DE CARGA */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <View style={styles.loadingIcon}>
              <ActivityIndicator
                size="large"
                color={colors.primary}
              />
            </View>

            <Text style={styles.loadingTitle}>
              Cargando galería
            </Text>

            <Text style={styles.loadingText}>
              Estamos preparando las fotografías...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <View style={styles.errorIcon}>
              <Ionicons
                name="alert-circle-outline"
                size={34}
                color={colors.danger}
              />
            </View>

            <Text style={styles.errorTitle}>
              No se pudieron cargar las fotografías
            </Text>

            <Text style={styles.errorText}>
              {error}
            </Text>
          </View>
        ) : (
          <>
            <PhotoCategory
              title="Antes"
              subtitle="Estado previo a la instalación"
              icon="time-outline"
              photos={beforePhotos}
              onOpenPhoto={setSelectedPhoto}
            />

            <PhotoCategory
              title="Durante"
              subtitle="Evidencia del proceso de instalación"
              icon="construct-outline"
              photos={duringPhotos}
              onOpenPhoto={setSelectedPhoto}
            />

            <PhotoCategory
              title="Después"
              subtitle="Resultado final de la instalación"
              icon="checkmark-circle-outline"
              photos={afterPhotos}
              onOpenPhoto={setSelectedPhoto}
            />

            {photos.length === 0 && (
              <View style={styles.emptyGallery}>
                <View style={styles.emptyIcon}>
                  <Ionicons
                    name="images-outline"
                    size={42}
                    color={colors.textSecondary}
                  />
                </View>

                <Text style={styles.emptyTitle}>
                  Sin fotografías
                </Text>

                <Text style={styles.emptyText}>
                  Esta instalación todavía no tiene
                  fotografías registradas.
                </Text>
              </View>
            )}
          </>
        )}

        {/* AVISO DE SOLO LECTURA */}
        <View style={styles.readOnlyNotice}>
          <View style={styles.readOnlyIcon}>
            <Ionicons
              name="eye-outline"
              size={19}
              color={colors.textSecondary}
            />
          </View>

          <View style={styles.readOnlyContent}>
            <Text style={styles.readOnlyTitle}>
              Modo de consulta
            </Text>

            <Text style={styles.readOnlyText}>
              El Supervisor puede consultar la evidencia
              fotográfica, pero no puede modificarla ni
              eliminarla.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* VISOR DE FOTO */}
      <Modal
        visible={!!selectedPhoto}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPhoto(null)}
      >
        <View style={styles.viewerContainer}>
          <Pressable
            style={styles.viewerCloseButton}
            onPress={() => setSelectedPhoto(null)}
          >
            <Ionicons
              name="close"
              size={28}
              color="#FFFFFF"
            />
          </Pressable>

          {selectedPhoto?.signedUrl ? (
            <Image
              source={{
                uri: selectedPhoto.signedUrl,
              }}
              style={styles.viewerImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.viewerError}>
              <Ionicons
                name="image-outline"
                size={52}
                color="#FFFFFF"
              />

              <Text style={styles.viewerErrorText}>
                No se pudo mostrar esta fotografía.
              </Text>
            </View>
          )}

          {selectedPhoto && (
            <View style={styles.viewerInfo}>
              <View style={styles.viewerInfoRow}>
                <Ionicons
                  name="calendar-outline"
                  size={17}
                  color="#FFFFFF"
                />

                <Text style={styles.viewerDate}>
                  {selectedPhoto.uploaded_at
                    ? new Date(
                        selectedPhoto.uploaded_at,
                      ).toLocaleString('es-MX')
                    : 'Fecha no disponible'}
                </Text>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

function PhotoCategory({
  title,
  subtitle,
  icon,
  photos,
  onOpenPhoto,
}: PhotoCategoryProps) {
  return (
    <View style={styles.categoryCard}>
      {/* CABECERA DE CATEGORÍA */}
      <View style={styles.categoryHeader}>
        <View style={styles.categoryIcon}>
          <Ionicons
            name={icon}
            size={21}
            color={colors.primary}
          />
        </View>

        <View style={styles.categoryHeaderText}>
          <Text style={styles.categoryTitle}>
            {title}
          </Text>

          <Text style={styles.categorySubtitle}>
            {subtitle}
          </Text>
        </View>

        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>
            {photos.length}
          </Text>
        </View>
      </View>

      {photos.length === 0 ? (
        <View style={styles.emptyCategory}>
          <Ionicons
            name="image-outline"
            size={25}
            color={colors.textSecondary}
          />

          <Text style={styles.emptyCategoryText}>
            No hay fotografías en esta categoría.
          </Text>
        </View>
      ) : (
        <View style={styles.photoGrid}>
          {photos.map((photo) => (
            <Pressable
              key={photo.id}
              style={({ pressed }) => [
                styles.photoCard,
                pressed && styles.photoCardPressed,
              ]}
              onPress={() => onOpenPhoto(photo)}
            >
              {photo.signedUrl ? (
                <Image
                  source={{
                    uri: photo.signedUrl,
                  }}
                  style={styles.photo}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.imageError}>
                  <Ionicons
                    name="image-outline"
                    size={34}
                    color={colors.textSecondary}
                  />

                  <Text style={styles.imageErrorText}>
                    Imagen no disponible
                  </Text>
                </View>
              )}

              <View style={styles.photoOverlay}>
                <View style={styles.photoViewButton}>
                  <Ionicons
                    name="expand-outline"
                    size={18}
                    color="#FFFFFF"
                  />
                </View>
              </View>

              <View style={styles.photoFooter}>
                <Ionicons
                  name="calendar-outline"
                  size={13}
                  color={colors.textSecondary}
                />

                <Text style={styles.photoDate}>
                  {photo.uploaded_at
                    ? new Date(
                        photo.uploaded_at,
                      ).toLocaleDateString('es-MX')
                    : 'Sin fecha'}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },

  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },

  /* HERO */

  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },

  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '18',
    marginRight: spacing.md,
  },

  heroContent: {
    flex: 1,
  },

  heroTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.text,
  },

  heroSubtitle: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },

  totalBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 54,
    paddingVertical: 8,
    paddingHorizontal: 7,
    borderRadius: 12,
    backgroundColor: colors.background,
  },

  totalBadgeNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
  },

  totalBadgeLabel: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },

  /* LOADING */

  loadingContainer: {
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },

  loadingIcon: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.background,
  },

  loadingTitle: {
    marginTop: spacing.lg,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },

  loadingText: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textSecondary,
  },

  /* ERROR */

  errorContainer: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },

  errorIcon: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.danger + '12',
  },

  errorTitle: {
    marginTop: spacing.lg,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },

  errorText: {
    marginTop: spacing.sm,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },

  /* CATEGORY */

  categoryCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },

  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },

  categoryIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: colors.primary + '18',
    marginRight: spacing.md,
  },

  categoryHeaderText: {
    flex: 1,
  },

  categoryTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },

  categorySubtitle: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
  },

  countBadge: {
    minWidth: 30,
    height: 30,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: colors.background,
  },

  countBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
  },

  /* EMPTY CATEGORY */

  emptyCategory: {
    minHeight: 90,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: colors.background,
    padding: spacing.md,
  },

  emptyCategoryText: {
    marginTop: spacing.sm,
    fontSize: 12,
    textAlign: 'center',
    color: colors.textSecondary,
  },

  /* GRID */

  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  photoCard: {
    width: '48.5%',
    marginBottom: spacing.md,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },

  photoCardPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.985 }],
  },

  photo: {
    width: '100%',
    height: 145,
    backgroundColor: colors.border,
  },

  photoOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
  },

  photoViewButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },

  photoFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 8,
  },

  photoDate: {
    marginLeft: 5,
    fontSize: 10,
    color: colors.textSecondary,
  },

  imageError: {
    height: 145,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: colors.background,
  },

  imageErrorText: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 10,
    color: colors.textSecondary,
  },

  /* EMPTY GALLERY */

  emptyGallery: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },

  emptyIcon: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.background,
  },

  emptyTitle: {
    marginTop: spacing.lg,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },

  emptyText: {
    marginTop: spacing.sm,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },

  /* READ ONLY */

  readOnlyNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    marginTop: spacing.xs,
  },

  readOnlyIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: colors.card,
  },

  readOnlyContent: {
    flex: 1,
    marginLeft: spacing.sm,
  },

  readOnlyTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },

  readOnlyText: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },

  /* FULLSCREEN VIEWER */

  viewerContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  viewerCloseButton: {
    position: 'absolute',
    top: 52,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },

  viewerImage: {
    width: '100%',
    height: '78%',
  },

  viewerInfo: {
    position: 'absolute',
    bottom: 35,
    left: 20,
    right: 20,
    alignItems: 'center',
  },

  viewerInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },

  viewerDate: {
    marginLeft: 7,
    fontSize: 12,
    color: '#FFFFFF',
  },

  viewerError: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },

  viewerErrorText: {
    marginTop: spacing.md,
    textAlign: 'center',
    fontSize: 14,
    color: '#FFFFFF',
  },
});