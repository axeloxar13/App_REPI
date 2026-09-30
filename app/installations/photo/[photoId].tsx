import { useCallback, useEffect, useState } from 'react';
import { Image } from 'expo-image';
import {
  Redirect,
  router,
  useLocalSearchParams,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChevronIcon } from '../../../components/ChevronIcon';
import { EmptyState } from '../../../components/EmptyState';
import { LoadingState } from '../../../components/LoadingState';

import {
  colors,
  radius,
  spacing,
} from '../../../constants/theme';

import { useAuth } from '../../../context/AuthContext';

import {
  fetchInstallationPhotoById,
} from '../../../hooks/useInstallationPhotos';

import {
  getPhotoCategoryLabel,
} from '../../../lib/photoCategories';

import type {
  InstallationPhotoWithProfile,
} from '../../../types/photos';


/* ============================================================
 * FECHA / HORA
 * ============================================================ */

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Fecha no disponible';
  }

  return new Intl.DateTimeFormat(
    'es-MX',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
  ).format(date);
}


/* ============================================================
 * PANTALLA
 * ============================================================ */

export default function PhotoViewerScreen() {
  const {
    photoId,
  } = useLocalSearchParams<{
    photoId: string;
  }>();

  const {
    status,
    selectedMembership,
  } = useAuth();

  const [
    photo,
    setPhoto,
  ] = useState<
    InstallationPhotoWithProfile | null
  >(null);

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState('');


  /* ==========================================================
   * CARGAR FOTO
   * ========================================================== */

  const loadPhoto =
    useCallback(async () => {
      if (
        !photoId ||
        !selectedMembership
      ) {
        return;
      }

      if (
        !selectedMembership.isActive
      ) {
        setPhoto(null);
        setError('');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError('');

      const result =
        await fetchInstallationPhotoById(
          photoId,
          selectedMembership.organizationId,
        );

      if (result.error) {
        setError(
          result.error,
        );
        setPhoto(null);
      } else {
        setPhoto(
          result.data,
        );
      }

      setIsLoading(false);
    }, [
      photoId,
      selectedMembership,
    ]);


  /* ==========================================================
   * EFECTO
   * ========================================================== */

  useEffect(() => {
    loadPhoto();
  }, [
    loadPhoto,
  ]);


  /* ==========================================================
   * AUTH CHECKING
   * ========================================================== */

  if (
    status === 'checking'
  ) {
    return (
      <View
        style={
          styles.centerScreen
        }
      >
        <StatusBar
          style="light"
        />

        <LoadingState
          text="Cargando fotografía"
        />
      </View>
    );
  }


  /* ==========================================================
   * NO AUTENTICADO
   * ========================================================== */

  if (
    status !== 'authenticated'
  ) {
    return (
      <Redirect
        href="/login"
      />
    );
  }


  /* ==========================================================
   * SIN EMPRESA
   * ========================================================== */

  if (
    !selectedMembership
  ) {
    return (
      <Redirect
        href="/select-company"
      />
    );
  }


  /* ==========================================================
   * ACCESO DESACTIVADO
   * ========================================================== */

  if (
    !selectedMembership.isActive
  ) {
    return (
      <SafeAreaView
        style={
          styles.safeArea
        }
      >
        <StatusBar
          style="light"
        />

        <Pressable
          style={
            styles.closeButton
          }
          onPress={() =>
            router.replace(
              '/home',
            )
          }
          accessibilityRole="button"
        >
          <ChevronIcon
            direction="left"
            size={18}
            color={
              colors.background
            }
          />

          <Text
            style={
              styles.closeText
            }
          >
            Mis instalaciones
          </Text>
        </Pressable>

        <View
          style={
            styles.errorWrap
          }
        >
          <EmptyState
            title="Acceso desactivado"
            description="Tu acceso a esta empresa esta desactivado. Contacta al administrador"
          />
        </View>
      </SafeAreaView>
    );
  }


  /* ==========================================================
   * RENDER PRINCIPAL
   * ========================================================== */

  return (
    <SafeAreaView
      style={
        styles.safeArea
      }
    >
      <StatusBar
        style="light"
      />

      <Pressable
        style={
          styles.closeButton
        }
        onPress={() =>
          router.back()
        }
        accessibilityRole="button"
      >
        <ChevronIcon
          direction="left"
          size={18}
          color={
            colors.background
          }
        />

        <Text
          style={
            styles.closeText
          }
        >
          Volver
        </Text>
      </Pressable>


      {/* ======================================================
       * CARGANDO
       * ====================================================== */}

      {isLoading ? (
        <View
          style={
            styles.centerContent
          }
        >
          <LoadingState
            text="Cargando fotografía"
          />
        </View>
      ) : error ? (

        /* ====================================================
         * ERROR
         * ==================================================== */

        <View
          style={
            styles.errorWrap
          }
        >
          <EmptyState
            title="No pudimos cargar la fotografía"
            description={
              error
            }
            actionLabel="Reintentar"
            onAction={
              loadPhoto
            }
          />
        </View>

      ) : photo?.signedUrl ? (

        /* ====================================================
         * FOTO
         * ==================================================== */

        <>
          <Image
            source={{
              uri:
                photo.signedUrl,
            }}
            style={
              styles.image
            }
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={
              photo.storagePath
            }
            transition={120}
          />

          <View
            style={
              styles.metaPanel
            }
          >

            {/* ----------------------------------------------
             * CATEGORÍA
             * ---------------------------------------------- */}

            <Text
              style={
                styles.metaTitle
              }
            >
              {getPhotoCategoryLabel(
                photo.category,
              )}
            </Text>


            {/* ----------------------------------------------
             * FECHA
             * ---------------------------------------------- */}

            <Text
              style={
                styles.metaText
              }
            >
              {formatDateTime(
                photo.uploadedAt,
              )}
            </Text>


            {/* ----------------------------------------------
             * TÉCNICO
             * ---------------------------------------------- */}

            <Text
              style={
                styles.metaText
              }
            >
              {photo.technicianName ??
                'Técnico'}
            </Text>


            {/* ----------------------------------------------
             * COMENTARIO
             * ---------------------------------------------- */}

            {photo.comment ? (
              <Text
                style={
                  styles.commentText
                }
              >
                {photo.comment}
              </Text>
            ) : null}

          </View>

        </>

      ) : (

        /* ====================================================
         * SIN URL
         * ==================================================== */

        <View
          style={
            styles.errorWrap
          }
        >
          <EmptyState
            title="Fotografía no disponible"
            description="La vista privada expiró. Intenta abrirla nuevamente."
            actionLabel="Reintentar"
            onAction={
              loadPhoto
            }
          />
        </View>
      )}

    </SafeAreaView>
  );
}


/* ============================================================
 * ESTILOS
 * ============================================================ */

const styles =
  StyleSheet.create({

    safeArea: {
      flex: 1,
      backgroundColor:
        '#05070d',
    },

    centerScreen: {
      flex: 1,
      backgroundColor:
        '#05070d',
    },

    closeButton: {
      minHeight: 44,
      alignSelf:
        'flex-start',
      alignItems:
        'center',
      flexDirection:
        'row',
      gap:
        spacing.xs,
      marginHorizontal:
        spacing.lg,
      marginTop:
        spacing.sm,
      paddingRight:
        spacing.md,
    },

    closeText: {
      color:
        colors.background,
      fontSize: 14,
      fontWeight: '700',
      lineHeight: 19,
    },

    centerContent: {
      flex: 1,
      justifyContent:
        'center',
    },

    image: {
      flex: 1,
      width: '100%',
    },

    metaPanel: {
      gap: 2,
      margin:
        spacing.lg,
      borderRadius:
        radius.md,
      backgroundColor:
        'rgba(255,255,255,0.1)',
      padding:
        spacing.md,
    },

    metaTitle: {
      color:
        colors.background,
      fontSize: 15,
      fontWeight: '700',
      lineHeight: 20,
    },

    metaText: {
      color:
        '#d7e5f5',
      fontSize: 13,
      lineHeight: 18,
    },

    commentText: {
      marginTop:
        spacing.xs,
      color:
        colors.background,
      fontSize: 14,
      lineHeight: 20,
    },

    errorWrap: {
      flex: 1,
      justifyContent:
        'center',
      padding:
        spacing.lg,
    },
  });