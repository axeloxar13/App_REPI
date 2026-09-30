import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';

import { colors, radius, spacing } from '../../../constants/theme';
import { useAuth } from '../../../context/AuthContext';
import { useTheme } from '../../../context/ThemeContext';
import { supabase } from '../../../lib/supabase';
import {
  INSTALLATION_PHOTOS_BUCKET,
  SIGNED_URL_EXPIRES_IN_SECONDS,
} from '../../../lib/photoStorage';

type FeatherIconName =
  React.ComponentProps<typeof Feather>['name'];

/* ============================================================
 * TIPOS
 * ============================================================ */

type CollectedPhotoRow = {
  id: string;

  organization_id: string;
  installation_id: string;
  installation_item_id: string | null;

  technician_id: string | null;
  uploader_membership_id: string | null;

  category: string;

  storage_path: string;

  file_name: string;
  mime_type: string;

  file_size_bytes: number | null;

  width: number | null;
  height: number | null;

  source: string;

  comment: string | null;

  captured_at: string | null;

  uploaded_at: string;
  created_at: string;

  uploader_name_snapshot: string | null;
  uploader_email_snapshot: string | null;

  latitud: number | null;
  longitud: number | null;
  tiene_ubicacion: boolean | null;

  collection_service_code: string | null;
  collection_service_name: string | null;

  collection_group_id: string | null;
  collection_group_label: string | null;

  collection_photo_type_id: string | null;
  collection_photo_type_label: string | null;
};

type InstallationLookupRow = {
  id: string;
  project_name: string | null;
  address: string | null;
};

type InstallationItemLookupRow = {
  id: string;
  installation_id: string;
  name: string | null;
  specific_location: string | null;
  position: number | null;
};

type CollectedPhoto = CollectedPhotoRow & {
  signedUrl: string | null;
  installationName: string;
  installationAddress: string | null;
  pmiName: string;
  pmiLocation: string | null;
};


/* ============================================================
 * CONSTANTES
 * ============================================================ */

const PHOTO_COLUMNS = `
  id,
  organization_id,
  installation_id,
  installation_item_id,
  technician_id,
  uploader_membership_id,
  category,
  storage_path,
  file_name,
  mime_type,
  file_size_bytes,
  width,
  height,
  source,
  comment,
  captured_at,
  uploaded_at,
  created_at,
  uploader_name_snapshot,
  uploader_email_snapshot,
  latitud,
  longitud,
  tiene_ubicacion,
  collection_service_code,
  collection_service_name,
  collection_group_id,
  collection_group_label,
  collection_photo_type_id,
  collection_photo_type_label
`;


/* ============================================================
 * HELPERS
 * ============================================================ */

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error
  ) {
    return String(error.message);
  }

  return 'Error desconocido.';
}


function formatDate(value: string | null) {
  if (!value) {
    return 'Sin fecha';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Sin fecha';
  }

  return date.toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}


function formatCoordinates(
  latitude: number | null,
  longitude: number | null,
) {
  if (
    latitude === null ||
    latitude === undefined ||
    longitude === null ||
    longitude === undefined
  ) {
    return null;
  }

  return `${Number(latitude).toFixed(6)}, ${Number(
    longitude,
  ).toFixed(6)}`;
}


function uniqueValues(
  values: Array<string | null | undefined>,
) {
  return Array.from(
    new Set(
      values
        .filter(
          (value): value is string =>
            Boolean(value?.trim()),
        )
        .map((value) => value.trim()),
    ),
  ).sort((a, b) =>
    a.localeCompare(b, 'es'),
  );
}


/* ============================================================
 * PANTALLA
 * ============================================================ */

export default function AdminCollectedPhotosScreen() {
  const {
    selectedMembership,
  } = useAuth();

  const {
    isDark,
    colors: themeColors,
  } = useTheme();

  const [photos, setPhotos] = useState<
    CollectedPhoto[]
  >([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState('');

  const [search, setSearch] =
    useState('');

  const [installationFilter, setInstallationFilter] =
    useState('');

  const [pmiFilter, setPmiFilter] =
    useState('');

  const [serviceFilter, setServiceFilter] =
    useState('');

  const [typeFilter, setTypeFilter] =
    useState('');

  const [technicianFilter, setTechnicianFilter] =
    useState('');

  const [filterModal, setFilterModal] =
    useState<
      | 'installation'
      | 'pmi'
      | 'service'
      | 'type'
      | 'technician'
      | null
    >(null);

  const [selectedPhoto, setSelectedPhoto] =
    useState<CollectedPhoto | null>(null);


  /* ==========================================================
   * CARGAR FOTOGRAFÍAS
   * ========================================================== */

  const loadPhotos = useCallback(
    async (isRefresh = false) => {
      if (!supabase) {
        setError(
          'Supabase no está configurado.',
        );
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (
        !selectedMembership?.organizationId
      ) {
        setPhotos([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError('');

      try {
        /* ------------------------------------------------------
         * 1. FOTOGRAFÍAS RECABADAS
         * ------------------------------------------------------ */

        const {
          data: photoRows,
          error: photoError,
        } = await supabase
          .from('installation_photos')
          .select(PHOTO_COLUMNS)
          .eq(
            'organization_id',
            selectedMembership.organizationId,
          )
          .eq(
            'category',
            'recabacion',
          )
          .order(
            'captured_at',
            {
              ascending: false,
              nullsFirst: false,
            },
          )
          .limit(300)
          .returns<CollectedPhotoRow[]>();

        if (photoError) {
          throw new Error(
            `No se pudieron cargar las fotografías: ${getErrorMessage(
              photoError,
            )}`,
          );
        }

        const rows = photoRows ?? [];

        if (rows.length === 0) {
          setPhotos([]);
          return;
        }


        /* ------------------------------------------------------
         * 2. OBTENER IDS DE INSTALACIONES Y PMI
         * ------------------------------------------------------ */

        const installationIds =
          Array.from(
            new Set(
              rows.map(
                (row) =>
                  row.installation_id,
              ),
            ),
          );

        const itemIds =
          Array.from(
            new Set(
              rows
                .map(
                  (row) =>
                    row.installation_item_id,
                )
                .filter(
                  (
                    value,
                  ): value is string =>
                    Boolean(value),
                ),
            ),
          );


        /* ------------------------------------------------------
         * 3. CARGAR INSTALACIONES
         * ------------------------------------------------------ */

        const {
          data: installationRows,
          error: installationError,
        } = await supabase
          .from('installations')
          .select(
            `
              id,
              project_name,
              address
            `,
          )
          .eq(
            'organization_id',
            selectedMembership.organizationId,
          )
          .in(
            'id',
            installationIds,
          )
          .returns<InstallationLookupRow[]>();

        if (installationError) {
          throw new Error(
            `No se pudieron cargar las instalaciones: ${getErrorMessage(
              installationError,
            )}`,
          );
        }


        /* ------------------------------------------------------
         * 4. CARGAR PMI
         * ------------------------------------------------------ */

        let itemRows: InstallationItemLookupRow[] =
          [];

        if (itemIds.length > 0) {
          const {
            data,
            error: itemError,
          } = await supabase
            .from('installation_items')
            .select(
              `
                id,
                installation_id,
                name,
                specific_location,
                position
              `,
            )
            .eq(
              'organization_id',
              selectedMembership.organizationId,
            )
            .in(
              'id',
              itemIds,
            )
            .returns<InstallationItemLookupRow[]>();

          if (itemError) {
            throw new Error(
              `No se pudieron cargar los PMI: ${getErrorMessage(
                itemError,
              )}`,
            );
          }

          itemRows = data ?? [];
        }


        /* ------------------------------------------------------
         * 5. MAPAS
         * ------------------------------------------------------ */

        const installationMap =
          new Map(
            (
              installationRows ??
              []
            ).map((item) => [
              item.id,
              item,
            ]),
          );

        const itemMap =
          new Map(
            itemRows.map((item) => [
              item.id,
              item,
            ]),
          );


        /* ------------------------------------------------------
         * 6. CREAR URLS FIRMADAS
         * ------------------------------------------------------ */

        const enriched =
          await Promise.all(
            rows.map(
              async (row) => {
                let signedUrl:
                  | string
                  | null = null;

                const {
                  data:
                    signedData,
                } =
                  await supabase.storage
                    .from(
                      INSTALLATION_PHOTOS_BUCKET,
                    )
                    .createSignedUrl(
                      row.storage_path,
                      SIGNED_URL_EXPIRES_IN_SECONDS,
                    );

                if (
                  !signedData?.signedUrl
                ) {
                  console.warn(
                    '[admin-collected-photos] No se pudo generar URL firmada:',
                    row.id,
                  );
                } else {
                  signedUrl =
                    signedData.signedUrl;
                }

                const installation =
                  installationMap.get(
                    row.installation_id,
                  );

                const item =
                  row.installation_item_id
                    ? itemMap.get(
                        row.installation_item_id,
                      )
                    : undefined;

                return {
                  ...row,

                  signedUrl,

                  installationName:
                    installation
                      ?.project_name ||
                    'Instalación sin nombre',

                  installationAddress:
                    installation
                      ?.address ??
                    null,

                  pmiName:
                    item?.name ||
                    'PMI sin nombre',

                  pmiLocation:
                    item?.specific_location ??
                    null,
                };
              },
            ),
          );

        setPhotos(enriched);
      } catch (loadError) {
        console.error(
          '[admin-collected-photos] Error:',
          loadError,
        );

        setError(
          getErrorMessage(
            loadError,
          ),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      selectedMembership?.organizationId,
    ],
  );


  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);


  /* ==========================================================
   * OPCIONES DE FILTROS
   * ========================================================== */

  const installationOptions =
    useMemo(
      () =>
        uniqueValues(
          photos.map(
            (photo) =>
              photo.installationName,
          ),
        ),
      [photos],
    );

  const pmiOptions =
    useMemo(
      () =>
        uniqueValues(
          photos.map(
            (photo) =>
              photo.pmiName,
          ),
        ),
      [photos],
    );

  const serviceOptions =
    useMemo(
      () =>
        uniqueValues(
          photos.map(
            (photo) =>
              photo.collection_service_name,
          ),
        ),
      [photos],
    );

  const typeOptions =
    useMemo(
      () =>
        uniqueValues(
          photos.map(
            (photo) =>
              photo.collection_photo_type_label,
          ),
        ),
      [photos],
    );

  const technicianOptions =
    useMemo(
      () =>
        uniqueValues(
          photos.map(
            (photo) =>
              photo.uploader_name_snapshot,
          ),
        ),
      [photos],
    );


  /* ==========================================================
   * FILTRADO
   * ========================================================== */

  const filteredPhotos =
    useMemo(() => {
      const normalizedSearch =
        search
          .trim()
          .toLocaleLowerCase(
            'es',
          );

      return photos.filter(
        (photo) => {
          if (
            installationFilter &&
            photo.installationName !==
              installationFilter
          ) {
            return false;
          }

          if (
            pmiFilter &&
            photo.pmiName !==
              pmiFilter
          ) {
            return false;
          }

          if (
            serviceFilter &&
            photo.collection_service_name !==
              serviceFilter
          ) {
            return false;
          }

          if (
            typeFilter &&
            photo.collection_photo_type_label !==
              typeFilter
          ) {
            return false;
          }

          if (
            technicianFilter &&
            photo.uploader_name_snapshot !==
              technicianFilter
          ) {
            return false;
          }

          if (!normalizedSearch) {
            return true;
          }

          const haystack = [
            photo.installationName,
            photo.pmiName,
            photo.collection_service_name,
            photo.collection_group_label,
            photo.collection_photo_type_label,
            photo.uploader_name_snapshot,
            photo.uploader_email_snapshot,
            photo.collection_service_code,
          ]
            .filter(Boolean)
            .join(' ')
            .toLocaleLowerCase(
              'es',
            );

          return haystack.includes(
            normalizedSearch,
          );
        },
      );
    }, [
      photos,
      search,
      installationFilter,
      pmiFilter,
      serviceFilter,
      typeFilter,
      technicianFilter,
    ]);


  /* ==========================================================
   * LIMPIAR FILTROS
   * ========================================================== */

  const hasFilters =
    Boolean(
      installationFilter ||
        pmiFilter ||
        serviceFilter ||
        typeFilter ||
        technicianFilter ||
        search.trim(),
    );

  const clearFilters =
    () => {
      setSearch('');
      setInstallationFilter('');
      setPmiFilter('');
      setServiceFilter('');
      setTypeFilter('');
      setTechnicianFilter('');
    };


  /* ==========================================================
   * LOADING
   * ========================================================== */

  if (loading) {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          {
            backgroundColor:
              themeColors.background,
          },
        ]}
      >
        <StatusBar
          style={
            isDark
              ? 'light'
              : 'dark'
          }
        />

        <View
          style={
            styles.centerScreen
          }
        >
          <ActivityIndicator
            size="large"
            color="#2563eb"
          />

          <Text
            style={[
              styles.loadingText,
              {
                color:
                  themeColors.textMuted,
              },
            ]}
          >
            Cargando fotografías recabadas...
          </Text>
        </View>
      </SafeAreaView>
    );
  }


  /* ==========================================================
   * RENDER
   * ========================================================== */

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        {
          backgroundColor:
            themeColors.background,
        },
      ]}
    >
      <StatusBar
        style={
          isDark
            ? 'light'
            : 'dark'
        }
      />

      <ScrollView
        style={
          styles.container
        }
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
        refreshControl={
          <RefreshControl
            refreshing={
              refreshing
            }
            onRefresh={() =>
              loadPhotos(true)
            }
            tintColor="#2563eb"
            colors={[
              '#2563eb',
            ]}
          />
        }
      >

        {/* ==================================================
         * HEADER
         * ================================================== */}

        <View
          style={
            styles.header
          }
        >
          <Pressable
            style={({ pressed }) => [
              styles.backButton,
              {
                backgroundColor:
                  themeColors.surface,
                borderColor:
                  isDark
                    ? 'rgba(255,255,255,0.08)'
                    : '#e2e8f0',
              },
              pressed &&
                styles.pressed,
            ]}
            onPress={() =>
              router.back()
            }
          >
            <Feather
              name="arrow-left"
              size={19}
              color={
                themeColors.text
              }
            />
          </Pressable>

          <View
            style={
              styles.headerText
            }
          >
            <Text
              style={[
                styles.eyebrow,
                {
                  color:
                    themeColors.textMuted,
                },
              ]}
            >
              ADMINISTRACIÓN
            </Text>

            <Text
              style={[
                styles.title,
                {
                  color:
                    themeColors.text,
                },
              ]}
            >
              Fotografías recabadas
            </Text>

            <Text
              style={[
                styles.subtitle,
                {
                  color:
                    themeColors.textMuted,
                },
              ]}
            >
              Consulta de evidencia fotográfica de campo
            </Text>
          </View>
        </View>


        {/* ==================================================
         * RESUMEN
         * ================================================== */}

        <View
          style={[
            styles.summaryCard,
            {
              backgroundColor:
                themeColors.surface,
              borderColor:
                isDark
                  ? 'rgba(255,255,255,0.08)'
                  : '#e2e8f0',
            },
          ]}
        >
          <View
            style={
              styles.summaryIcon
            }
          >
            <Feather
              name="camera"
              size={20}
              color="#ffffff"
            />
          </View>

          <View
            style={
              styles.summaryText
            }
          >
            <Text
              style={[
                styles.summaryValue,
                {
                  color:
                    themeColors.text,
                },
              ]}
            >
              {filteredPhotos.length}
            </Text>

            <Text
              style={[
                styles.summaryLabel,
                {
                  color:
                    themeColors.textMuted,
                },
              ]}
            >
              fotografías encontradas
            </Text>
          </View>

          {hasFilters && (
            <Pressable
              onPress={
                clearFilters
              }
            >
              <Text
                style={
                  styles.clearText
                }
              >
                Limpiar
              </Text>
            </Pressable>
          )}
        </View>


        {/* ==================================================
         * BÚSQUEDA
         * ================================================== */}

        <View
          style={[
            styles.searchContainer,
            {
              backgroundColor:
                themeColors.surface,
              borderColor:
                isDark
                  ? 'rgba(255,255,255,0.08)'
                  : '#e2e8f0',
            },
          ]}
        >
          <Feather
            name="search"
            size={18}
            color={
              themeColors.textMuted
            }
          />

          <TextInput
            value={search}
            onChangeText={
              setSearch
            }
            placeholder="Buscar instalación, PMI, servicio o técnico..."
            placeholderTextColor={
              themeColors.textMuted
            }
            style={[
              styles.searchInput,
              {
                color:
                  themeColors.text,
              },
            ]}
          />

          {search.length > 0 && (
            <Pressable
              onPress={() =>
                setSearch('')
              }
            >
              <Feather
                name="x-circle"
                size={18}
                color={
                  themeColors.textMuted
                }
              />
            </Pressable>
          )}
        </View>


        {/* ==================================================
         * FILTROS
         * ================================================== */}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={
            false
          }
          contentContainerStyle={
            styles.filtersScroll
          }
        >
          <FilterButton
            label="Instalación"
            value={
              installationFilter
            }
            icon="layers"
            onPress={() =>
              setFilterModal(
                'installation',
              )
            }
            themeColors={
              themeColors
            }
            isDark={isDark}
          />

          <FilterButton
            label="PMI"
            value={
              pmiFilter
            }
            icon="map-pin"
            onPress={() =>
              setFilterModal(
                'pmi',
              )
            }
            themeColors={
              themeColors
            }
            isDark={isDark}
          />

          <FilterButton
            label="Servicio"
            value={
              serviceFilter
            }
            icon="tool"
            onPress={() =>
              setFilterModal(
                'service',
              )
            }
            themeColors={
              themeColors
            }
            isDark={isDark}
          />

          <FilterButton
            label="Tipo"
            value={
              typeFilter
            }
            icon="image"
            onPress={() =>
              setFilterModal(
                'type',
              )
            }
            themeColors={
              themeColors
            }
            isDark={isDark}
          />

          <FilterButton
            label="Técnico"
            value={
              technicianFilter
            }
            icon="user"
            onPress={() =>
              setFilterModal(
                'technician',
              )
            }
            themeColors={
              themeColors
            }
            isDark={isDark}
          />
        </ScrollView>


        {/* ==================================================
         * ERROR
         * ================================================== */}

        {error ? (
          <View
            style={
              styles.errorContainer
            }
          >
            <Feather
              name="alert-triangle"
              size={18}
              color="#dc2626"
            />

            <Text
              style={
                styles.errorText
              }
            >
              {error}
            </Text>

            <Pressable
              onPress={() =>
                loadPhotos()
              }
              style={
                styles.retryButton
              }
            >
              <Text
                style={
                  styles.retryText
                }
              >
                Reintentar
              </Text>
            </Pressable>
          </View>
        ) : null}


        {/* ==================================================
         * LISTA
         * ================================================== */}

        {filteredPhotos.length ===
        0 ? (
          <EmptyState
            themeColors={
              themeColors
            }
            hasFilters={
              hasFilters
            }
          />
        ) : (
          <View
            style={
              styles.photoList
            }
          >
            {filteredPhotos.map(
              (photo) => (
                <CollectedPhotoCard
                  key={
                    photo.id
                  }
                  photo={
                    photo
                  }
                  themeColors={
                    themeColors
                  }
                  isDark={
                    isDark
                  }
                  onPress={() =>
                    setSelectedPhoto(
                      photo,
                    )
                  }
                />
              ),
            )}
          </View>
        )}

      </ScrollView>


      {/* ======================================================
       * MODAL DE FILTRO
       * ====================================================== */}

      <FilterModal
        visible={
          filterModal !==
          null
        }
        title={
          filterModal ===
          'installation'
            ? 'Seleccionar instalación'
            : filterModal ===
                'pmi'
              ? 'Seleccionar PMI'
              : filterModal ===
                  'service'
                ? 'Seleccionar servicio'
                : filterModal ===
                    'type'
                  ? 'Seleccionar tipo'
                  : 'Seleccionar técnico'
        }
        options={
          filterModal ===
          'installation'
            ? installationOptions
            : filterModal ===
                'pmi'
              ? pmiOptions
              : filterModal ===
                  'service'
                ? serviceOptions
                : filterModal ===
                    'type'
                  ? typeOptions
                  : technicianOptions
        }
        selectedValue={
          filterModal ===
          'installation'
            ? installationFilter
            : filterModal ===
                'pmi'
              ? pmiFilter
              : filterModal ===
                  'service'
                ? serviceFilter
                : filterModal ===
                    'type'
                  ? typeFilter
                  : technicianFilter
        }
        onSelect={(value) => {
          if (
            filterModal ===
            'installation'
          ) {
            setInstallationFilter(
              value,
            );
          }

          if (
            filterModal ===
            'pmi'
          ) {
            setPmiFilter(
              value,
            );
          }

          if (
            filterModal ===
            'service'
          ) {
            setServiceFilter(
              value,
            );
          }

          if (
            filterModal ===
            'type'
          ) {
            setTypeFilter(
              value,
            );
          }

          if (
            filterModal ===
            'technician'
          ) {
            setTechnicianFilter(
              value,
            );
          }

          setFilterModal(
            null,
          );
        }}
        onClose={() =>
          setFilterModal(
            null,
          )
        }
        themeColors={
          themeColors
        }
        isDark={
          isDark
        }
      />


      {/* ======================================================
       * MODAL FOTOGRAFÍA
       * ====================================================== */}

      <PhotoDetailModal
        photo={
          selectedPhoto
        }
        onClose={() =>
          setSelectedPhoto(
            null,
          )
        }
        themeColors={
          themeColors
        }
        isDark={
          isDark
        }
      />

    </SafeAreaView>
  );
}


/* ============================================================
 * TARJETA DE FOTOGRAFÍA
 * ============================================================ */

function CollectedPhotoCard({
  photo,
  themeColors,
  isDark,
  onPress,
}: {
  photo: CollectedPhoto;
  themeColors: typeof colors;
  isDark: boolean;
  onPress: () => void;
}) {
  const coordinates =
    formatCoordinates(
      photo.latitud,
      photo.longitud,
    );

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.photoCard,
        {
          backgroundColor:
            themeColors.surface,
          borderColor:
            isDark
              ? 'rgba(255,255,255,0.08)'
              : '#e2e8f0',
        },
        pressed &&
          styles.pressed,
      ]}
    >
      <View
        style={
          styles.photoPreview
        }
      >
        {photo.signedUrl ? (
          <Image
            source={{
              uri: photo.signedUrl,
            }}
            style={
              styles.photoImage
            }
            resizeMode="cover"
          />
        ) : (
          <View
            style={[
              styles.imagePlaceholder,
              {
                backgroundColor:
                  themeColors.background,
              },
            ]}
          >
            <Feather
              name="image"
              size={30}
              color={
                themeColors.textMuted
              }
            />

            <Text
              style={[
                styles.placeholderText,
                {
                  color:
                    themeColors.textMuted,
                },
              ]}
            >
              Imagen no disponible
            </Text>
          </View>
        )}

        <View
          style={
            styles.recabacionBadge
          }
        >
          <Feather
            name="camera"
            size={11}
            color="#ffffff"
          />

          <Text
            style={
              styles.recabacionBadgeText
            }
          >
            RECABADA
          </Text>
        </View>
      </View>


      <View
        style={
          styles.photoInfo
        }
      >
        <View
          style={
            styles.photoTitleRow
          }
        >
          <Text
            style={[
              styles.photoType,
              {
                color:
                  themeColors.text,
              },
            ]}
            numberOfLines={2}
          >
            {photo.collection_photo_type_label ||
              'Fotografía'}
          </Text>

          <Feather
            name="chevron-right"
            size={18}
            color={
              themeColors.textMuted
            }
          />
        </View>


        <InfoRow
          icon="layers"
          label="Instalación"
          value={
            photo.installationName
          }
          themeColors={
            themeColors
          }
        />

        <InfoRow
          icon="map-pin"
          label="PMI"
          value={
            photo.pmiName
          }
          themeColors={
            themeColors
          }
        />

        <InfoRow
          icon="tool"
          label="Servicio"
          value={
            photo.collection_service_name ||
            'Sin servicio'
          }
          themeColors={
            themeColors
          }
        />

        <InfoRow
          icon="user"
          label="Técnico"
          value={
            photo.uploader_name_snapshot ||
            'Técnico no identificado'
          }
          themeColors={
            themeColors
          }
        />

        <InfoRow
          icon="calendar"
          label="Fecha"
          value={
            formatDate(
              photo.captured_at,
            )
          }
          themeColors={
            themeColors
          }
        />

        {coordinates ? (
          <InfoRow
            icon="navigation"
            label="GPS"
            value={
              coordinates
            }
            themeColors={
              themeColors
            }
          />
        ) : (
          <InfoRow
            icon="navigation"
            label="GPS"
            value="Sin ubicación"
            themeColors={
              themeColors
            }
          />
        )}
      </View>
    </Pressable>
  );
}


/* ============================================================
 * INFO ROW
 * ============================================================ */

function InfoRow({
  icon,
  label,
  value,
  themeColors,
}: {
  icon: FeatherIconName;
  label: string;
  value: string;
  themeColors: typeof colors;
}) {
  return (
    <View
      style={
        styles.infoRow
      }
    >
      <Feather
        name={icon}
        size={13}
        color={
          themeColors.textMuted
        }
      />

      <Text
        style={[
          styles.infoLabel,
          {
            color:
              themeColors.textMuted,
          },
        ]}
      >
        {label}:
      </Text>

      <Text
        style={[
          styles.infoValue,
          {
            color:
              themeColors.text,
          },
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}


/* ============================================================
 * BOTÓN FILTRO
 * ============================================================ */

function FilterButton({
  label,
  value,
  icon,
  onPress,
  themeColors,
  isDark,
}: {
  label: string;
  value: string;
  icon: FeatherIconName;
  onPress: () => void;
  themeColors: typeof colors;
  isDark: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterButton,
        {
          backgroundColor:
            value
              ? '#eff6ff'
              : themeColors.surface,
          borderColor:
            value
              ? '#93c5fd'
              : isDark
                ? 'rgba(255,255,255,0.08)'
                : '#e2e8f0',
        },
        pressed &&
          styles.pressed,
      ]}
    >
      <Feather
        name={icon}
        size={14}
        color={
          value
            ? '#2563eb'
            : themeColors.textMuted
        }
      />

      <Text
        style={[
          styles.filterLabel,
          {
            color:
              value
                ? '#2563eb'
                : themeColors.text,
          },
        ]}
        numberOfLines={1}
      >
        {value ||
          label}
      </Text>

      <Feather
        name="chevron-down"
        size={14}
        color={
          value
            ? '#2563eb'
            : themeColors.textMuted
        }
      />
    </Pressable>
  );
}


/* ============================================================
 * MODAL DE FILTROS
 * ============================================================ */

function FilterModal({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
  themeColors,
  isDark,
}: {
  visible: boolean;
  title: string;
  options: string[];
  selectedValue: string;
  onSelect: (
    value: string,
  ) => void;
  onClose: () => void;
  themeColors: typeof colors;
  isDark: boolean;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={
        onClose
      }
    >
      <View
        style={
          styles.modalBackdrop
        }
      >
        <Pressable
          style={
            styles.modalBackdropPress
          }
          onPress={
            onClose
          }
        />

        <View
          style={[
            styles.filterModalContainer,
            {
              backgroundColor:
                themeColors.surface,
            },
          ]}
        >
          <View
            style={
              styles.modalHandle
            }
          />

          <View
            style={
              styles.modalHeader
            }
          >
            <Text
              style={[
                styles.modalTitle,
                {
                  color:
                    themeColors.text,
                },
              ]}
            >
              {title}
            </Text>

            <Pressable
              onPress={
                onClose
              }
            >
              <Feather
                name="x"
                size={21}
                color={
                  themeColors.text
                }
              />
            </Pressable>
          </View>

          <ScrollView
            style={
              styles.optionsList
            }
            showsVerticalScrollIndicator={
              false
            }
          >
            <Pressable
              onPress={() =>
                onSelect('')
              }
              style={[
                styles.option,
                {
                  borderBottomColor:
                    isDark
                      ? 'rgba(255,255,255,0.06)'
                      : '#e2e8f0',
                },
              ]}
            >
              <View
                style={[
                  styles.optionIcon,
                  {
                    backgroundColor:
                      selectedValue
                        ? themeColors.background
                        : '#dbeafe',
                  },
                ]}
              >
                <Feather
                  name="list"
                  size={15}
                  color={
                    selectedValue
                      ? themeColors.textMuted
                      : '#2563eb'
                  }
                />
              </View>

              <Text
                style={[
                  styles.optionText,
                  {
                    color:
                      themeColors.text,
                  },
                ]}
              >
                Todos
              </Text>

              {!selectedValue && (
                <Feather
                  name="check"
                  size={18}
                  color="#2563eb"
                />
              )}
            </Pressable>

            {options.map(
              (option) => {
                const selected =
                  selectedValue ===
                  option;

                return (
                  <Pressable
                    key={
                      option
                    }
                    onPress={() =>
                      onSelect(
                        option,
                      )
                    }
                    style={[
                      styles.option,
                      {
                        borderBottomColor:
                          isDark
                            ? 'rgba(255,255,255,0.06)'
                            : '#e2e8f0',
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.optionIcon,
                        {
                          backgroundColor:
                            selected
                              ? '#dbeafe'
                              : themeColors.background,
                        },
                      ]}
                    >
                      <Feather
                        name="circle"
                        size={14}
                        color={
                          selected
                            ? '#2563eb'
                            : themeColors.textMuted
                        }
                      />
                    </View>

                    <Text
                      style={[
                        styles.optionText,
                        {
                          color:
                            themeColors.text,
                        },
                      ]}
                      numberOfLines={
                        2
                      }
                    >
                      {option}
                    </Text>

                    {selected && (
                      <Feather
                        name="check"
                        size={18}
                        color="#2563eb"
                      />
                    )}
                  </Pressable>
                );
              },
            )}

            {options.length ===
              0 && (
              <View
                style={
                  styles.noOptions
                }
              >
                <Feather
                  name="inbox"
                  size={28}
                  color={
                    themeColors.textMuted
                  }
                />

                <Text
                  style={[
                    styles.noOptionsText,
                    {
                      color:
                        themeColors.textMuted,
                    },
                  ]}
                >
                  No hay opciones disponibles.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}


/* ============================================================
 * MODAL DETALLE
 * ============================================================ */

function PhotoDetailModal({
  photo,
  onClose,
  themeColors,
  isDark,
}: {
  photo: CollectedPhoto | null;
  onClose: () => void;
  themeColors: typeof colors;
  isDark: boolean;
}) {
  if (!photo) {
    return null;
  }

  const coordinates =
    formatCoordinates(
      photo.latitud,
      photo.longitud,
    );

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={
        onClose
      }
    >
      <SafeAreaView
        style={[
          styles.detailSafeArea,
          {
            backgroundColor:
              themeColors.background,
          },
        ]}
      >
        <StatusBar
          style={
            isDark
              ? 'light'
              : 'dark'
          }
        />

        <View
          style={
            styles.detailHeader
          }
        >
          <Pressable
            onPress={
              onClose
            }
            style={[
              styles.backButton,
              {
                backgroundColor:
                  themeColors.surface,
                borderColor:
                  isDark
                    ? 'rgba(255,255,255,0.08)'
                    : '#e2e8f0',
              },
            ]}
          >
            <Feather
              name="arrow-left"
              size={19}
              color={
                themeColors.text
              }
            />
          </Pressable>

          <View
            style={
              styles.detailHeaderText
            }
          >
            <Text
              style={[
                styles.detailHeaderTitle,
                {
                  color:
                    themeColors.text,
                },
              ]}
              numberOfLines={1}
            >
              Fotografía recabada
            </Text>

            <Text
              style={[
                styles.detailHeaderSubtitle,
                {
                  color:
                    themeColors.textMuted,
                },
              ]}
            >
              Detalle de evidencia
            </Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={
            false
          }
          contentContainerStyle={
            styles.detailContent
          }
        >
          <View
            style={[
              styles.detailImageContainer,
              {
                backgroundColor:
                  themeColors.surface,
              },
            ]}
          >
            {photo.signedUrl ? (
              <Image
                source={{
                  uri: photo.signedUrl,
                }}
                style={
                  styles.detailImage
                }
                resizeMode="contain"
              />
            ) : (
              <View
                style={
                  styles.detailImagePlaceholder
                }
              >
                <Feather
                  name="image"
                  size={42}
                  color={
                    themeColors.textMuted
                  }
                />

                <Text
                  style={[
                    styles.placeholderText,
                    {
                      color:
                        themeColors.textMuted,
                    },
                  ]}
                >
                  Imagen no disponible
                </Text>
              </View>
            )}
          </View>


          <View
            style={[
              styles.detailCard,
              {
                backgroundColor:
                  themeColors.surface,
                borderColor:
                  isDark
                    ? 'rgba(255,255,255,0.08)'
                    : '#e2e8f0',
              },
            ]}
          >
            <DetailSectionTitle
              icon="layers"
              title="Clasificación"
              themeColors={
                themeColors
              }
            />

            <DetailRow
              label="Instalación"
              value={
                photo.installationName
              }
              themeColors={
                themeColors
              }
            />

            {photo.installationAddress ? (
              <DetailRow
                label="Dirección"
                value={
                  photo.installationAddress
                }
                themeColors={
                  themeColors
                }
              />
            ) : null}

            <DetailRow
              label="PMI"
              value={
                photo.pmiName
              }
              themeColors={
                themeColors
              }
            />

            {photo.pmiLocation ? (
              <DetailRow
                label="Ubicación del PMI"
                value={
                  photo.pmiLocation
                }
                themeColors={
                  themeColors
                }
              />
            ) : null}

            <DetailRow
              label="Servicio"
              value={
                photo.collection_service_name ||
                'Sin servicio'
              }
              themeColors={
                themeColors
              }
            />

            <DetailRow
              label="Grupo"
              value={
                photo.collection_group_label ||
                'Sin grupo'
              }
              themeColors={
                themeColors
              }
            />

            <DetailRow
              label="Tipo de fotografía"
              value={
                photo.collection_photo_type_label ||
                'Sin tipo'
              }
              themeColors={
                themeColors
              }
            />
          </View>


          <View
            style={[
              styles.detailCard,
              {
                backgroundColor:
                  themeColors.surface,
                borderColor:
                  isDark
                    ? 'rgba(255,255,255,0.08)'
                    : '#e2e8f0',
              },
            ]}
          >
            <DetailSectionTitle
              icon="user"
              title="Quién la recabó"
              themeColors={
                themeColors
              }
            />

            <DetailRow
              label="Técnico"
              value={
                photo.uploader_name_snapshot ||
                'No identificado'
              }
              themeColors={
                themeColors
              }
            />

            {photo.uploader_email_snapshot ? (
              <DetailRow
                label="Correo"
                value={
                  photo.uploader_email_snapshot
                }
                themeColors={
                  themeColors
                }
              />
            ) : null}

            <DetailRow
              label="Origen"
              value={
                photo.source ===
                'camera'
                  ? 'Cámara'
                  : photo.source ===
                      'gallery'
                    ? 'Galería'
                    : photo.source
              }
              themeColors={
                themeColors
              }
            />

            <DetailRow
              label="Fecha de captura"
              value={
                formatDate(
                  photo.captured_at,
                )
              }
              themeColors={
                themeColors
              }
            />
          </View>


          <View
            style={[
              styles.detailCard,
              {
                backgroundColor:
                  themeColors.surface,
                borderColor:
                  isDark
                    ? 'rgba(255,255,255,0.08)'
                    : '#e2e8f0',
              },
            ]}
          >
            <DetailSectionTitle
              icon="map-pin"
              title="Ubicación"
              themeColors={
                themeColors
              }
            />

            {coordinates ? (
              <>
                <DetailRow
                  label="Coordenadas"
                  value={
                    coordinates
                  }
                  themeColors={
                    themeColors
                  }
                />

                <View
                  style={
                    styles.locationStatus
                  }
                >
                  <View
                    style={
                      styles.locationDot
                    }
                  />

                  <Text
                    style={
                      styles.locationStatusText
                    }
                  >
                    Ubicación registrada al recabar la fotografía
                  </Text>
                </View>
              </>
            ) : (
              <View
                style={
                  styles.noLocation
                }
              >
                <Feather
                  name="map-pin"
                  size={18}
                  color={
                    themeColors.textMuted
                  }
                />

                <Text
                  style={[
                    styles.noLocationText,
                    {
                      color:
                        themeColors.textMuted,
                    },
                  ]}
                >
                  Esta fotografía no tiene ubicación GPS registrada.
                </Text>
              </View>
            )}
          </View>


          <View
            style={[
              styles.detailCard,
              {
                backgroundColor:
                  themeColors.surface,
                borderColor:
                  isDark
                    ? 'rgba(255,255,255,0.08)'
                    : '#e2e8f0',
              },
            ]}
          >
            <DetailSectionTitle
              icon="file-text"
              title="Información del archivo"
              themeColors={
                themeColors
              }
            />

            <DetailRow
              label="Archivo"
              value={
                photo.file_name
              }
              themeColors={
                themeColors
              }
            />

            <DetailRow
              label="Formato"
              value={
                photo.mime_type
              }
              themeColors={
                themeColors
              }
            />

            <DetailRow
              label="Dimensiones"
              value={`${photo.width ?? '-'} × ${
                photo.height ?? '-'
              } px`}
              themeColors={
                themeColors
              }
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}


/* ============================================================
 * DETAIL SECTION TITLE
 * ============================================================ */

function DetailSectionTitle({
  icon,
  title,
  themeColors,
}: {
  icon: FeatherIconName;
  title: string;
  themeColors: typeof colors;
}) {
  return (
    <View
      style={
        styles.detailSectionTitle
      }
    >
      <View
        style={
          styles.detailSectionIcon
        }
      >
        <Feather
          name={icon}
          size={16}
          color="#2563eb"
        />
      </View>

      <Text
        style={[
          styles.detailSectionTitleText,
          {
            color:
              themeColors.text,
          },
        ]}
      >
        {title}
      </Text>
    </View>
  );
}


/* ============================================================
 * DETAIL ROW
 * ============================================================ */

function DetailRow({
  label,
  value,
  themeColors,
}: {
  label: string;
  value: string;
  themeColors: typeof colors;
}) {
  return (
    <View
      style={
        styles.detailRow
      }
    >
      <Text
        style={[
          styles.detailLabel,
          {
            color:
              themeColors.textMuted,
          },
        ]}
      >
        {label}
      </Text>

      <Text
        style={[
          styles.detailValue,
          {
            color:
              themeColors.text,
          },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}


/* ============================================================
 * EMPTY STATE
 * ============================================================ */

function EmptyState({
  themeColors,
  hasFilters,
}: {
  themeColors: typeof colors;
  hasFilters: boolean;
}) {
  return (
    <View
      style={[
        styles.emptyState,
        {
          backgroundColor:
            themeColors.surface,
          borderColor:
            themeColors.border ||
            '#e2e8f0',
        },
      ]}
    >
      <View
        style={
          styles.emptyIcon
        }
      >
        <Feather
          name={
            hasFilters
              ? 'filter'
              : 'camera'
          }
          size={26}
          color={
            themeColors.textMuted
          }
        />
      </View>

      <Text
        style={[
          styles.emptyTitle,
          {
            color:
              themeColors.text,
          },
        ]}
      >
        {hasFilters
          ? 'No hay resultados'
          : 'No hay fotografías recabadas'}
      </Text>

      <Text
        style={[
          styles.emptyText,
          {
            color:
              themeColors.textMuted,
          },
        ]}
      >
        {hasFilters
          ? 'Prueba quitando alguno de los filtros seleccionados.'
          : 'Las fotografías que los técnicos recaben aparecerán aquí.'}
      </Text>
    </View>
  );
}


/* ============================================================
 * ESTILOS
 * ============================================================ */

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
    },

    detailSafeArea: {
      flex: 1,
    },

    centerScreen: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
    },

    loadingText: {
      marginTop: spacing.md,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
    },

    container: {
      flex: 1,
    },

    content: {
      paddingHorizontal:
        spacing.lg,
      paddingTop:
        spacing.md,
      paddingBottom:
        spacing.xl * 2,
    },

    /* Header */

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom:
        spacing.lg,
    },

    backButton: {
      width: 42,
      height: 42,
      borderRadius: 13,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight:
        spacing.sm,
    },

    headerText: {
      flex: 1,
    },

    eyebrow: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.1,
    },

    title: {
      fontSize: 23,
      fontWeight: '800',
      letterSpacing: -0.5,
    },

    subtitle: {
      fontSize: 12,
      marginTop: 2,
      fontWeight: '500',
    },

    /* Summary */

    summaryCard: {
      minHeight: 76,
      borderRadius:
        radius.lg,
      borderWidth: 1,
      padding:
        spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom:
        spacing.md,
    },

    summaryIcon: {
      width: 44,
      height: 44,
      borderRadius: 13,
      backgroundColor:
        '#2563eb',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight:
        spacing.sm,
    },

    summaryText: {
      flex: 1,
    },

    summaryValue: {
      fontSize: 23,
      fontWeight: '800',
    },

    summaryLabel: {
      fontSize: 12,
      fontWeight: '600',
    },

    clearText: {
      color: '#2563eb',
      fontWeight: '800',
      fontSize: 12,
    },

    /* Search */

    searchContainer: {
      height: 48,
      borderRadius:
        radius.md,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal:
        spacing.md,
      marginBottom:
        spacing.sm,
    },

    searchInput: {
      flex: 1,
      marginHorizontal:
        spacing.sm,
      fontSize: 13,
      fontWeight: '500',
      paddingVertical: 0,
    },

    /* Filters */

    filtersScroll: {
      gap: spacing.sm,
      paddingBottom:
        spacing.md,
    },

    filterButton: {
      minHeight: 38,
      maxWidth: 230,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal:
        spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },

    filterLabel: {
      fontSize: 12,
      fontWeight: '700',
      maxWidth: 170,
    },

    /* Error */

    errorContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      padding:
        spacing.md,
      backgroundColor:
        '#fef2f2',
      borderColor:
        '#fecaca',
      borderWidth: 1,
      borderRadius:
        radius.lg,
      marginBottom:
        spacing.md,
      gap: spacing.sm,
    },

    errorText: {
      flex: 1,
      color: '#991b1b',
      fontSize: 12,
      fontWeight: '600',
    },

    retryButton: {
      backgroundColor:
        '#dc2626',
      borderRadius: 9,
      paddingHorizontal:
        spacing.sm,
      paddingVertical:
        spacing.xs,
    },

    retryText: {
      color: '#ffffff',
      fontSize: 11,
      fontWeight: '800',
    },

    /* Photos */

    photoList: {
      gap: spacing.md,
    },

    photoCard: {
      borderRadius:
        radius.lg,
      borderWidth: 1,
      overflow: 'hidden',
    },

    photoPreview: {
      width: '100%',
      aspectRatio: 1.35,
      backgroundColor:
        '#0f172a',
      position: 'relative',
    },

    photoImage: {
      width: '100%',
      height: '100%',
    },

    imagePlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },

    placeholderText: {
      marginTop: spacing.xs,
      fontSize: 12,
      fontWeight: '600',
    },

    recabacionBadge: {
      position: 'absolute',
      top: spacing.sm,
      left: spacing.sm,
      backgroundColor:
        'rgba(15,23,42,0.78)',
      borderRadius: 8,
      paddingHorizontal:
        8,
      paddingVertical:
        5,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },

    recabacionBadgeText: {
      color: '#ffffff',
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.5,
    },

    photoInfo: {
      padding:
        spacing.md,
    },

    photoTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      marginBottom:
        spacing.sm,
    },

    photoType: {
      flex: 1,
      fontSize: 16,
      fontWeight: '800',
      marginRight:
        spacing.sm,
    },

    infoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginTop: 7,
    },

    infoLabel: {
      width: 72,
      marginLeft: 6,
      fontSize: 11,
      fontWeight: '700',
    },

    infoValue: {
      flex: 1,
      fontSize: 11.5,
      fontWeight: '600',
      lineHeight: 16,
    },

    /* Empty */

    emptyState: {
      minHeight: 220,
      borderRadius:
        radius.lg,
      borderWidth: 1,
      borderStyle:
        'dashed',
      alignItems: 'center',
      justifyContent:
        'center',
      padding:
        spacing.xl,
    },

    emptyIcon: {
      width: 56,
      height: 56,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor:
        '#f1f5f9',
      marginBottom:
        spacing.md,
    },

    emptyTitle: {
      fontSize: 16,
      fontWeight: '800',
      textAlign: 'center',
    },

    emptyText: {
      fontSize: 12,
      fontWeight: '500',
      textAlign: 'center',
      marginTop: spacing.xs,
      lineHeight: 18,
    },

    /* Filter Modal */

    modalBackdrop: {
      flex: 1,
      backgroundColor:
        'rgba(15,23,42,0.55)',
      justifyContent:
        'flex-end',
    },

    modalBackdropPress: {
      flex: 1,
    },

    filterModalContainer: {
      maxHeight: '78%',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop:
        spacing.sm,
      paddingBottom:
        spacing.xl,
    },

    modalHandle: {
      alignSelf: 'center',
      width: 42,
      height: 4,
      borderRadius: 2,
      backgroundColor:
        '#cbd5e1',
      marginBottom:
        spacing.md,
    },

    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      paddingHorizontal:
        spacing.lg,
      marginBottom:
        spacing.sm,
    },

    modalTitle: {
      fontSize: 18,
      fontWeight: '800',
    },

    optionsList: {
      paddingHorizontal:
        spacing.lg,
    },

    option: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1,
      gap: spacing.sm,
    },

    optionIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },

    optionText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
    },

    noOptions: {
      alignItems: 'center',
      paddingVertical:
        spacing.xl,
    },

    noOptionsText: {
      marginTop:
        spacing.sm,
      fontSize: 13,
      fontWeight: '600',
    },

    /* Detail */

    detailHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal:
        spacing.lg,
      paddingTop:
        spacing.sm,
      paddingBottom:
        spacing.md,
    },

    detailHeaderText: {
      flex: 1,
    },

    detailHeaderTitle: {
      fontSize: 18,
      fontWeight: '800',
    },

    detailHeaderSubtitle: {
      fontSize: 11,
      marginTop: 1,
      fontWeight: '500',
    },

    detailContent: {
      paddingHorizontal:
        spacing.lg,
      paddingBottom:
        spacing.xl * 2,
    },

    detailImageContainer: {
      width: '100%',
      aspectRatio: 1,
      borderRadius:
        radius.lg,
      overflow: 'hidden',
      marginBottom:
        spacing.md,
    },

    detailImage: {
      width: '100%',
      height: '100%',
    },

    detailImagePlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    detailCard: {
      borderRadius:
        radius.lg,
      borderWidth: 1,
      padding:
        spacing.md,
      marginBottom:
        spacing.md,
    },

    detailSectionTitle: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom:
        spacing.md,
    },

    detailSectionIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor:
        '#dbeafe',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight:
        spacing.sm,
    },

    detailSectionTitleText: {
      fontSize: 15,
      fontWeight: '800',
    },

    detailRow: {
      paddingVertical:
        spacing.xs,
    },

    detailLabel: {
      fontSize: 10,
      fontWeight: '700',
      textTransform:
        'uppercase',
      letterSpacing: 0.5,
      marginBottom: 2,
    },

    detailValue: {
      fontSize: 13,
      fontWeight: '600',
      lineHeight: 19,
    },

    locationStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop:
        spacing.sm,
      padding:
        spacing.sm,
      borderRadius: 10,
      backgroundColor:
        '#f0fdf4',
    },

    locationDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor:
        '#16a34a',
      marginRight: 7,
    },

    locationStatusText: {
      flex: 1,
      color: '#166534',
      fontSize: 11,
      fontWeight: '700',
    },

    noLocation: {
      flexDirection: 'row',
      alignItems: 'center',
      padding:
        spacing.sm,
      gap: spacing.sm,
    },

    noLocationText: {
      flex: 1,
      fontSize: 12,
      fontWeight: '600',
    },

    pressed: {
      opacity: 0.82,
      transform: [
        {
          scale: 0.985,
        },
      ],
    },
  });