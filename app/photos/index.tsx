import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Image,
  Modal,
  ScrollView,
  Dimensions,
  Platform,
  UIManager,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { colors, radius, spacing } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width, height } = Dimensions.get('window');

const GRID_GAP = spacing.xs * 2;
const PHOTO_SIZE = (width - spacing.lg * 2 - GRID_GAP * 2) / 3;

type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

type PhotoCategory = 'before' | 'during' | 'after';

type Photo = {
  id: string;
  category: PhotoCategory;
  file_name: string;
  storage_path: string;
  comment: string | null;
  uploaded_at: string;
  installation_id: string;

  latitud: number | null;
  longitud: number | null;
  tiene_ubicacion: boolean | null;

  installation: {
    id: string;
    project_name: string;
    status: string;
    client: {
      name: string;
    } | null;
  } | null;

  technician: {
    full_name: string;
  } | null;

  signedUrl?: string | null;
};

type FilterType = 'all' | PhotoCategory;

type LocationFilterType =
  | 'all'
  | 'with_location'
  | 'without_location';

const CATEGORY_LABELS: Record<PhotoCategory, string> = {
  before: 'Antes',
  during: 'Durante',
  after: 'Después',
};

const CATEGORY_COLORS: Record<PhotoCategory, string> = {
  before: '#d97706',
  during: '#2563eb',
  after: '#059669',
};

const CATEGORY_GRADIENTS: Record<
  PhotoCategory,
  [string, string]
> = {
  before: ['#f59e0b', '#d97706'],
  during: ['#3b82f6', '#2563eb'],
  after: ['#10b981', '#059669'],
};

const LOCATION_FILTER_OPTIONS: {
  value: LocationFilterType;
  label: string;
  icon: FeatherIconName;
}[] = [
  {
    value: 'all',
    label: 'Todas',
    icon: 'layers',
  },
  {
    value: 'with_location',
    label: 'Con ubicación',
    icon: 'map-pin',
  },
  {
    value: 'without_location',
    label: 'Sin ubicación',
    icon: 'map-pin-off',
  },
];

export default function PhotosScreen() {
  const { selectedMembership } = useAuth();

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [filteredPhotos, setFilteredPhotos] = useState<Photo[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');

  const [selectedFilter, setSelectedFilter] =
    useState<FilterType>('all');

  const [locationFilter, setLocationFilter] =
    useState<LocationFilterType>('all');

  const [selectedTechnician, setSelectedTechnician] =
    useState<string>('all');

  const [filtersVisible, setFiltersVisible] =
    useState(false);

  const [photoModalVisible, setPhotoModalVisible] =
    useState(false);

  const [selectedPhoto, setSelectedPhoto] =
    useState<Photo | null>(null);

  const organizationId =
    selectedMembership?.organizationId;

  // ------------------------------------------------------------
  // MAPA
  // ------------------------------------------------------------

  const openMap = async (
    latitude: number,
    longitude: number
  ) => {
    try {
      const url =
        `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

      const supported =
        await Linking.canOpenURL(url);

      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert(
          'Error',
          'No se puede abrir el mapa'
        );
      }
    } catch {
      Alert.alert(
        'Error',
        'No se pudo abrir la ubicación'
      );
    }
  };

  // ------------------------------------------------------------
  // TÉCNICOS
  // ------------------------------------------------------------

  const uniqueTechnicians = useMemo(() => {
    const techSet = new Set<string>();

    photos.forEach((photo) => {
      if (photo.technician?.full_name) {
        techSet.add(
          photo.technician.full_name
        );
      }
    });

    return Array.from(techSet).sort((a, b) =>
      a.localeCompare(b, 'es')
    );
  }, [photos]);

  // ------------------------------------------------------------
  // FILTROS ACTIVOS
  // ------------------------------------------------------------

  const activeFiltersCount = useMemo(() => {
    let count = 0;

    if (selectedFilter !== 'all') {
      count++;
    }

    if (locationFilter !== 'all') {
      count++;
    }

    if (selectedTechnician !== 'all') {
      count++;
    }

    return count;
  }, [
    selectedFilter,
    locationFilter,
    selectedTechnician,
  ]);

  // ------------------------------------------------------------
  // CARGAR FOTOS
  // ------------------------------------------------------------

  const loadPhotos = useCallback(async () => {
    if (!organizationId || !supabase) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      /*
       * IMPORTANTE:
       *
       * Esta pantalla es exclusivamente para la evidencia
       * fotográfica normal:
       *
       *   before
       *   during
       *   after
       *
       * NO se cargan fotografías "recabacion".
       *
       * Las fotografías recabadas tienen su propia pantalla:
       *
       *   /admin/collected-photos
       */

      const {
        data,
        error: fetchError,
      } = await supabase
        .from('installation_photos')
        .select(`
          *,
          installation:installation_id (
            id,
            project_name,
            status,
            client:client_id (
              name
            )
          ),
          technician:technician_id (
            full_name
          )
        `)
        .eq(
          'organization_id',
          organizationId
        )
        .in('category', [
          'before',
          'during',
          'after',
        ])
        .order('uploaded_at', {
          ascending: false,
        });

      if (fetchError) {
        throw fetchError;
      }

      const photosWithUrls =
        await Promise.all(
          (data || []).map(
            async (photo) => {
              try {
                const {
                  data: signedData,
                } = await supabase.storage
                  .from(
                    'installation-photos'
                  )
                  .createSignedUrl(
                    photo.storage_path,
                    300
                  );

                return {
                  ...photo,
                  signedUrl:
                    signedData?.signedUrl ||
                    null,
                } as Photo;
              } catch {
                return {
                  ...photo,
                  signedUrl: null,
                } as Photo;
              }
            }
          )
        );

      setPhotos(photosWithUrls);
      setFilteredPhotos(photosWithUrls);
    } catch (err) {
      console.error(
        'Error loading photos:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'No se pudieron cargar las fotos.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  // ------------------------------------------------------------
  // APLICAR FILTROS
  // ------------------------------------------------------------

  useEffect(() => {
    let result = [...photos];

    // Categoría
    if (selectedFilter !== 'all') {
      result = result.filter(
        (photo) =>
          photo.category === selectedFilter
      );
    }

    // Ubicación
    if (
      locationFilter ===
      'with_location'
    ) {
      result = result.filter(
        (photo) =>
          photo.tiene_ubicacion === true ||
          (
            photo.latitud !== null &&
            photo.latitud !== undefined &&
            photo.longitud !== null &&
            photo.longitud !== undefined
          )
      );
    }

    if (
      locationFilter ===
      'without_location'
    ) {
      result = result.filter(
        (photo) =>
          photo.tiene_ubicacion === false ||
          photo.tiene_ubicacion === null ||
          photo.latitud === null ||
          photo.latitud === undefined ||
          photo.longitud === null ||
          photo.longitud === undefined
      );
    }

    // Técnico
    if (
      selectedTechnician !== 'all'
    ) {
      result = result.filter(
        (photo) =>
          photo.technician?.full_name ===
          selectedTechnician
      );
    }

    // Búsqueda
    if (searchQuery.trim()) {
      const query =
        searchQuery
          .toLowerCase()
          .trim();

      result = result.filter(
        (photo) =>
          photo.installation?.project_name
            ?.toLowerCase()
            .includes(query) ||
          photo.installation?.client?.name
            ?.toLowerCase()
            .includes(query) ||
          photo.file_name
            ?.toLowerCase()
            .includes(query)
      );
    }

    setFilteredPhotos(result);
  }, [
    photos,
    selectedFilter,
    locationFilter,
    selectedTechnician,
    searchQuery,
  ]);

  // ------------------------------------------------------------
  // REFRESH
  // ------------------------------------------------------------

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadPhotos();
  }, [loadPhotos]);

  // ------------------------------------------------------------
  // MODAL
  // ------------------------------------------------------------

  const handlePhotoPress = (
    photo: Photo
  ) => {
    setSelectedPhoto(photo);
    setPhotoModalVisible(true);
  };

  const closeModal = () => {
    setPhotoModalVisible(false);
    setSelectedPhoto(null);
  };

  // ------------------------------------------------------------
  // CONTADORES
  // ------------------------------------------------------------

  const getStatusCount = (
    category: FilterType
  ) => {
    if (category === 'all') {
      return photos.length;
    }

    return photos.filter(
      (photo) =>
        photo.category === category
    ).length;
  };

  const getLocationCount = (
    type: LocationFilterType
  ) => {
    if (type === 'all') {
      return photos.length;
    }

    if (
      type === 'with_location'
    ) {
      return photos.filter(
        (photo) =>
          photo.tiene_ubicacion === true ||
          (
            photo.latitud !== null &&
            photo.latitud !== undefined &&
            photo.longitud !== null &&
            photo.longitud !== undefined
          )
      ).length;
    }

    return photos.filter(
      (photo) =>
        photo.tiene_ubicacion === false ||
        photo.tiene_ubicacion === null ||
        photo.latitud === null ||
        photo.latitud === undefined ||
        photo.longitud === null ||
        photo.longitud === undefined
    ).length;
  };

  const photosWithLocation =
    photos.filter(
      (photo) =>
        photo.tiene_ubicacion === true ||
        (
          photo.latitud !== null &&
          photo.latitud !== undefined &&
          photo.longitud !== null &&
          photo.longitud !== undefined
        )
    ).length;

  const resetFilters = () => {
    setSelectedFilter('all');
    setLocationFilter('all');
    setSelectedTechnician('all');
  };

  // ------------------------------------------------------------
  // ESTADÍSTICAS
  // ------------------------------------------------------------

  const stats = useMemo(() => {
    return {
      total: photos.length,

      before: photos.filter(
        (photo) =>
          photo.category === 'before'
      ).length,

      during: photos.filter(
        (photo) =>
          photo.category === 'during'
      ).length,

      after: photos.filter(
        (photo) =>
          photo.category === 'after'
      ).length,

      withLocation:
        photosWithLocation,
    };
  }, [
    photos,
    photosWithLocation,
  ]);

  // ------------------------------------------------------------
  // LOADING
  // ------------------------------------------------------------

  if (loading && !refreshing) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <View
          style={styles.centerScreen}
        >
          <ActivityIndicator
            size="large"
            color={colors.primary}
          />

          <Text
            style={styles.loadingText}
          >
            Cargando fotos...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------

  return (
    <SafeAreaView
      style={styles.safeArea}
    >
      <StatusBar style="dark" />

      {/* ======================================================
          HEADER
      ====================================================== */}

      <Animated.View
        entering={FadeInDown
          .duration(600)
          .springify()}
        style={styles.header}
      >
        <View
          style={styles.headerTopRow}
        >
          <Pressable
            style={({ pressed }) => [
              styles.backButton,
              pressed &&
                styles.pressedOpacity,
            ]}
            onPress={() =>
              router.back()
            }
            hitSlop={8}
          >
            <Feather
              name="arrow-left"
              size={20}
              color={colors.text}
            />
          </Pressable>

          <View
            style={styles.headerTitleGroup}
          >
            <Text
              style={styles.headerEyebrow}
            >
              GALERÍA
            </Text>

            <Text
              style={styles.headerTitle}
            >
              Fotos
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.filterButton,
              pressed &&
                styles.pressedOpacity,
              activeFiltersCount > 0 &&
                styles.filterButtonActive,
            ]}
            onPress={() =>
              setFiltersVisible(
                (value) => !value
              )
            }
          >
            <Feather
              name="sliders"
              size={20}
              color={
                activeFiltersCount > 0
                  ? '#fff'
                  : colors.text
              }
            />

            {activeFiltersCount > 0 && (
              <View
                style={
                  styles.filterBadge
                }
              >
                <Text
                  style={
                    styles.filterBadgeText
                  }
                >
                  {activeFiltersCount}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Estadísticas */}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={
            false
          }
          contentContainerStyle={
            styles.statsScroll
          }
        >
          <MiniStat
            icon="image"
            label="Total"
            value={stats.total}
            color="#2563eb"
          />

          <MiniStat
            icon="clock"
            label="Antes"
            value={stats.before}
            color="#d97706"
          />

          <MiniStat
            icon="play"
            label="Durante"
            value={stats.during}
            color="#8b5cf6"
          />

          <MiniStat
            icon="check-circle"
            label="Después"
            value={stats.after}
            color="#059669"
          />

          <MiniStat
            icon="map-pin"
            label="GPS"
            value={stats.withLocation}
            color="#0891b2"
          />
        </ScrollView>
      </Animated.View>

      {/* ======================================================
          SEARCH
      ====================================================== */}

      <Animated.View
        entering={FadeInDown
          .delay(100)
          .duration(600)
          .springify()}
        style={
          styles.searchContainer
        }
      >
        <View
          style={styles.searchInputWrap}
        >
          <Feather
            name="search"
            size={18}
            color={colors.muted}
            style={
              styles.searchIcon
            }
          />

          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por proyecto o cliente..."
            placeholderTextColor={
              colors.muted
            }
            value={searchQuery}
            onChangeText={
              setSearchQuery
            }
            returnKeyType="search"
          />

          {searchQuery.length > 0 && (
            <Pressable
              onPress={() =>
                setSearchQuery('')
              }
              hitSlop={8}
            >
              <Feather
                name="x"
                size={18}
                color={colors.muted}
              />
            </Pressable>
          )}
        </View>
      </Animated.View>

      {/* ======================================================
          FILTROS
      ====================================================== */}

      {filtersVisible && (
        <Animated.View
          entering={FadeInDown
            .duration(400)
            .springify()}
          style={
            styles.filtersPanel
          }
        >
          <ScrollView
            showsVerticalScrollIndicator={
              false
            }
          >
            {/* Categoría */}

            <View
              style={styles.filterSection}
            >
              <Text
                style={
                  styles.filterSectionTitle
                }
              >
                Categoría
              </Text>

              <View
                style={
                  styles.filterChipsRow
                }
              >
                <FilterChip
                  label="Todas"
                  count={getStatusCount(
                    'all'
                  )}
                  active={
                    selectedFilter ===
                    'all'
                  }
                  onPress={() =>
                    setSelectedFilter(
                      'all'
                    )
                  }
                />

                {(
                  [
                    'before',
                    'during',
                    'after',
                  ] as const
                ).map((category) => (
                  <FilterChip
                    key={category}
                    label={
                      CATEGORY_LABELS[
                        category
                      ]
                    }
                    count={getStatusCount(
                      category
                    )}
                    active={
                      selectedFilter ===
                      category
                    }
                    dotColor={
                      CATEGORY_COLORS[
                        category
                      ]
                    }
                    onPress={() =>
                      setSelectedFilter(
                        category
                      )
                    }
                  />
                ))}
              </View>
            </View>

            <View
              style={
                styles.filterDivider
              }
            />

            {/* Ubicación */}

            <View
              style={styles.filterSection}
            >
              <Text
                style={
                  styles.filterSectionTitle
                }
              >
                Ubicación
              </Text>

              <View
                style={
                  styles.filterChipsRow
                }
              >
                {LOCATION_FILTER_OPTIONS.map(
                  (option) => (
                    <FilterChip
                      key={option.value}
                      label={option.label}
                      count={getLocationCount(
                        option.value
                      )}
                      active={
                        locationFilter ===
                        option.value
                      }
                      icon={option.icon}
                      onPress={() =>
                        setLocationFilter(
                          option.value
                        )
                      }
                      color={
                        option.value ===
                        'with_location'
                          ? '#4CAF50'
                          : option.value ===
                            'without_location'
                          ? '#EF4444'
                          : undefined
                      }
                    />
                  )
                )}
              </View>
            </View>

            <View
              style={
                styles.filterDivider
              }
            />

            {/* Técnico */}

            <View
              style={styles.filterSection}
            >
              <Text
                style={
                  styles.filterSectionTitle
                }
              >
                Técnico
              </Text>

              <View
                style={
                  styles.filterChipsRow
                }
              >
                <FilterChip
                  label="Todos"
                  count={photos.length}
                  active={
                    selectedTechnician ===
                    'all'
                  }
                  onPress={() =>
                    setSelectedTechnician(
                      'all'
                    )
                  }
                />

                {uniqueTechnicians.map(
                  (techName) => (
                    <FilterChip
                      key={techName}
                      label={techName}
                      count={
                        photos.filter(
                          (photo) =>
                            photo
                              .technician
                              ?.full_name ===
                            techName
                        ).length
                      }
                      active={
                        selectedTechnician ===
                        techName
                      }
                      onPress={() =>
                        setSelectedTechnician(
                          techName
                        )
                      }
                    />
                  )
                )}
              </View>
            </View>

            {activeFiltersCount >
              0 && (
              <Pressable
                style={
                  styles.clearFiltersButton
                }
                onPress={
                  resetFilters
                }
              >
                <Feather
                  name="x-circle"
                  size={16}
                  color={colors.primary}
                />

                <Text
                  style={
                    styles.clearFiltersText
                  }
                >
                  Limpiar filtros (
                  {activeFiltersCount})
                </Text>
              </Pressable>
            )}
          </ScrollView>
        </Animated.View>
      )}

      {/* ======================================================
          ERROR
      ====================================================== */}

      {error && (
        <View
          style={
            styles.errorContainer
          }
        >
          <View
            style={
              styles.errorIconWrap
            }
          >
            <Feather
              name="alert-triangle"
              size={16}
              color="#b91c1c"
            />
          </View>

          <Text
            style={styles.errorText}
            numberOfLines={2}
          >
            {error}
          </Text>

          <Pressable
            style={
              styles.retryButton
            }
            onPress={loadPhotos}
          >
            <Text
              style={styles.retryText}
            >
              Reintentar
            </Text>
          </Pressable>
        </View>
      )}

      {/* ======================================================
          GRID
      ====================================================== */}

      <FlatList
        data={filteredPhotos}
        keyExtractor={(item) =>
          item.id
        }
        numColumns={3}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={
              colors.primary
            }
            colors={[
              colors.primary,
            ]}
          />
        }
        renderItem={({
          item,
          index,
        }) => (
          <Animated.View
            entering={ZoomIn
              .delay(index * 40)
              .duration(400)
              .springify()}
          >
            <PhotoGridItem
              photo={item}
              onPress={() =>
                handlePhotoPress(
                  item
                )
              }
            />
          </Animated.View>
        )}
        ListEmptyComponent={
          <View
            style={styles.emptyState}
          >
            <View
              style={
                styles.emptyIconWrap
              }
            >
              <Feather
                name="camera-off"
                size={28}
                color={colors.muted}
              />
            </View>

            <Text
              style={styles.emptyTitle}
            >
              No hay fotos
            </Text>

            <Text
              style={styles.emptyText}
            >
              {searchQuery
                ? 'No se encontraron fotos con esa búsqueda'
                : activeFiltersCount >
                  0
                ? 'No hay fotos que coincidan con los filtros'
                : 'Los técnicos subirán fotos de las instalaciones'}
            </Text>

            {activeFiltersCount >
              0 && (
              <Pressable
                style={
                  styles.resetEmptyButton
                }
                onPress={
                  resetFilters
                }
              >
                <Text
                  style={
                    styles.resetEmptyButtonText
                  }
                >
                  Limpiar filtros
                </Text>
              </Pressable>
            )}
          </View>
        }
        contentContainerStyle={
          styles.listContent
        }
      />

      {/* ======================================================
          MODAL DE FOTO
      ====================================================== */}

      <Modal
        visible={photoModalVisible}
        transparent
        animationType="slide"
        onRequestClose={
          closeModal
        }
      >
        <View
          style={
            styles.photoModalOverlay
          }
        >
          <SafeAreaView
            style={
              styles.photoModalSafeArea
            }
          >
            <View
              style={
                styles.photoModalHeader
              }
            >
              <Pressable
                style={
                  styles.photoModalCloseButton
                }
                onPress={
                  closeModal
                }
                hitSlop={20}
              >
                <Feather
                  name="x"
                  size={26}
                  color="white"
                />
              </Pressable>

              <Text
                style={
                  styles.photoModalHeaderTitle
                }
                numberOfLines={1}
              >
                {selectedPhoto
                  ?.installation
                  ?.project_name ||
                  'Foto'}
              </Text>

              <View
                style={{
                  width: 44,
                }}
              />
            </View>
          </SafeAreaView>

          <ScrollView
            contentContainerStyle={
              styles.photoModalContent
            }
            showsVerticalScrollIndicator={
              false
            }
          >
            {/* Imagen */}

            <View
              style={
                styles.photoModalImageContainer
              }
            >
              {selectedPhoto?.signedUrl ? (
                <Image
                  source={{
                    uri: selectedPhoto.signedUrl,
                  }}
                  style={
                    styles.photoModalImage
                  }
                  resizeMode="contain"
                />
              ) : (
                <View
                  style={
                    styles.photoModalPlaceholder
                  }
                >
                  <Feather
                    name="image"
                    size={48}
                    color="#475569"
                  />
                </View>
              )}
            </View>

            {/* Información */}

            <View
              style={
                styles.photoModalInfo
              }
            >
              <View
                style={
                  styles.photoModalHeaderInfo
                }
              >
                <Text
                  style={
                    styles.photoModalProject
                  }
                  numberOfLines={1}
                >
                  {selectedPhoto
                    ?.installation
                    ?.project_name ||
                    'Sin proyecto'}
                </Text>

                {selectedPhoto && (
                  <View
                    style={[
                      styles.photoModalCategoryBadge,
                      {
                        backgroundColor:
                          CATEGORY_COLORS[
                            selectedPhoto
                              .category
                          ] ||
                          CATEGORY_COLORS.during,
                      },
                    ]}
                  >
                    <Text
                      style={
                        styles.photoModalCategoryText
                      }
                    >
                      {CATEGORY_LABELS[
                        selectedPhoto
                          .category
                      ] ||
                        'Evidencia'}
                    </Text>
                  </View>
                )}
              </View>

              {/* Ubicación */}

              <Pressable
                style={({ pressed }) => [
                  styles.locationInfoRow,

                  selectedPhoto?.tiene_ubicacion &&
                    styles.locationInfoRowClickable,

                  pressed &&
                    styles.pressedOpacity,
                ]}
                onPress={() => {
                  if (
                    selectedPhoto?.tiene_ubicacion &&
                    selectedPhoto?.latitud !==
                      null &&
                    selectedPhoto?.latitud !==
                      undefined &&
                    selectedPhoto?.longitud !==
                      null &&
                    selectedPhoto?.longitud !==
                      undefined
                  ) {
                    openMap(
                      Number(
                        selectedPhoto.latitud
                      ),
                      Number(
                        selectedPhoto.longitud
                      )
                    );
                  } else {
                    Alert.alert(
                      'Sin ubicación',
                      'Esta foto no tiene ubicación registrada.'
                    );
                  }
                }}
                disabled={
                  !selectedPhoto?.tiene_ubicacion
                }
              >
                <View
                  style={[
                    styles.locationIconWrapper,
                    {
                      backgroundColor:
                        selectedPhoto?.tiene_ubicacion
                          ? 'rgba(76, 175, 80, 0.2)'
                          : 'rgba(239, 68, 68, 0.2)',
                    },
                  ]}
                >
                  <Feather
                    name={
                      selectedPhoto?.tiene_ubicacion
                        ? 'map-pin'
                        : 'map-pin-off'
                    }
                    size={14}
                    color={
                      selectedPhoto?.tiene_ubicacion
                        ? '#4CAF50'
                        : '#EF4444'
                    }
                  />
                </View>

                <Text
                  style={[
                    styles.locationInfoText,

                    selectedPhoto?.tiene_ubicacion
                      ? styles.locationInfoTextWith
                      : styles.locationInfoTextWithout,
                  ]}
                >
                  {selectedPhoto?.tiene_ubicacion &&
                  selectedPhoto?.latitud !==
                    null &&
                  selectedPhoto?.latitud !==
                    undefined &&
                  selectedPhoto?.longitud !==
                    null &&
                  selectedPhoto?.longitud !==
                    undefined
                    ? `${Number(
                        selectedPhoto.latitud
                      ).toFixed(
                        6
                      )}, ${Number(
                        selectedPhoto.longitud
                      ).toFixed(
                        6
                      )}`
                    : 'Sin ubicación'}
                </Text>

                {selectedPhoto?.tiene_ubicacion && (
                  <Feather
                    name="chevron-right"
                    size={14}
                    color="#4CAF50"
                    style={
                      styles.locationChevron
                    }
                  />
                )}
              </Pressable>

              {/* Cliente */}

              {selectedPhoto
                ?.installation
                ?.client?.name && (
                <InfoRow
                  icon="user"
                  text={
                    selectedPhoto
                      .installation
                      .client
                      .name
                  }
                />
              )}

              {/* Técnico */}

              {selectedPhoto
                ?.technician
                ?.full_name && (
                <InfoRow
                  icon="tool"
                  text={
                    selectedPhoto
                      .technician
                      .full_name
                  }
                />
              )}

              {/* Comentario */}

              {selectedPhoto?.comment && (
                <Text
                  style={
                    styles.photoModalComment
                  }
                  numberOfLines={3}
                >
                  "{selectedPhoto.comment}"
                </Text>
              )}

              {/* Fecha */}

              <Text
                style={
                  styles.photoModalDate
                }
              >
                {selectedPhoto
                  ? new Date(
                      selectedPhoto.uploaded_at
                    ).toLocaleString(
                      'es-MX',
                      {
                        dateStyle:
                          'long',
                        timeStyle:
                          'short',
                      }
                    )
                  : ''}
              </Text>

              {/* Abrir mapa */}

              {selectedPhoto?.tiene_ubicacion &&
                selectedPhoto?.latitud !==
                  null &&
                selectedPhoto?.latitud !==
                  undefined &&
                selectedPhoto?.longitud !==
                  null &&
                selectedPhoto?.longitud !==
                  undefined && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.photoModalOpenMap,
                      pressed &&
                        styles.pressedOpacity,
                    ]}
                    onPress={() =>
                      openMap(
                        Number(
                          selectedPhoto.latitud
                        ),
                        Number(
                          selectedPhoto.longitud
                        )
                      )
                    }
                  >
                    <LinearGradient
                      colors={[
                        '#10b981',
                        '#059669',
                      ]}
                      style={
                        styles.photoModalOpenMapGradient
                      }
                    >
                      <Feather
                        name="map"
                        size={18}
                        color="white"
                      />

                      <Text
                        style={
                          styles.photoModalOpenMapText
                        }
                      >
                        Abrir en Google Maps
                      </Text>
                    </LinearGradient>
                  </Pressable>
                )}

              {/* Ver instalación */}

              {selectedPhoto?.installation_id && (
                <Pressable
                  style={({ pressed }) => [
                    styles.photoModalViewInstallation,
                    pressed &&
                      styles.pressedOpacity,
                  ]}
                  onPress={() => {
                    const installationId =
                      selectedPhoto.installation_id;

                    closeModal();

                    router.push(
                      `/installations/${installationId}`
                    );
                  }}
                >
                  <LinearGradient
                    colors={[
                      '#3b82f6',
                      '#2563eb',
                    ]}
                    style={
                      styles.photoModalViewInstallationGradient
                    }
                  >
                    <Text
                      style={
                        styles.photoModalViewInstallationText
                      }
                    >
                      Ver instalación
                    </Text>

                    <Feather
                      name="arrow-right"
                      size={15}
                      color="white"
                    />
                  </LinearGradient>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ==================================================================
// MINI STAT
// ==================================================================

function MiniStat({
  icon,
  label,
  value,
  color,
}: {
  icon: FeatherIconName;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View
      style={styles.miniStat}
    >
      <View
        style={[
          styles.miniStatIcon,
          {
            backgroundColor:
              `${color}15`,
          },
        ]}
      >
        <Feather
          name={icon}
          size={14}
          color={color}
        />
      </View>

      <View
        style={
          styles.miniStatContent
        }
      >
        <Text
          style={[
            styles.miniStatValue,
            { color },
          ]}
        >
          {value}
        </Text>

        <Text
          style={
            styles.miniStatLabel
          }
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

// ==================================================================
// FILTER CHIP
// ==================================================================

function FilterChip({
  label,
  count,
  active,
  dotColor,
  icon,
  color,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  dotColor?: string;
  icon?: FeatherIconName;
  color?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.filterChip,

        active &&
          styles.filterChipActive,

        pressed &&
          styles.pressedOpacity,
      ]}
      onPress={onPress}
    >
      {dotColor && (
        <View
          style={[
            styles.filterDot,
            {
              backgroundColor:
                dotColor,
            },
          ]}
        />
      )}

      {icon && (
        <Feather
          name={icon}
          size={12}
          color={
            active
              ? 'white'
              : color || colors.muted
          }
        />
      )}

      <Text
        style={[
          styles.filterChipText,
          active &&
            styles.filterChipTextActive,
        ]}
      >
        {label}
      </Text>

      <View
        style={[
          styles.filterChipCount,
          active &&
            styles.filterChipCountActive,
        ]}
      >
        <Text
          style={[
            styles.filterChipCountText,
            active &&
              styles.filterChipCountTextActive,
          ]}
        >
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

// ==================================================================
// INFO ROW
// ==================================================================

function InfoRow({
  icon,
  text,
}: {
  icon: FeatherIconName;
  text: string;
}) {
  return (
    <View
      style={styles.infoRow}
    >
      <Feather
        name={icon}
        size={13}
        color="#94a3b8"
        style={
          styles.infoRowIcon
        }
      />

      <Text
        style={styles.infoRowText}
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
}

// ==================================================================
// PHOTO GRID ITEM
// ==================================================================

function PhotoGridItem({
  photo,
  onPress,
}: {
  photo: Photo;
  onPress: () => void;
}) {
  const hasLocation =
    photo.tiene_ubicacion === true ||
    (
      photo.latitud !== null &&
      photo.latitud !== undefined &&
      photo.longitud !== null &&
      photo.longitud !== undefined
    );

  /*
   * DEFENSA IMPORTANTE
   *
   * Aunque TypeScript dice que category solamente puede ser
   * before/during/after, los datos de Supabase son runtime.
   *
   * Por eso nunca pasamos directamente:
   *
   * CATEGORY_GRADIENTS[photo.category]
   *
   * sin un fallback.
   *
   * Esto evita:
   *
   * Cannot read property 'map' of undefined
   *
   * si por cualquier motivo llega una categoría inesperada.
   */

  const categoryGradient =
    CATEGORY_GRADIENTS[
      photo.category
    ] ||
    CATEGORY_GRADIENTS.during;

  const categoryLabel =
    CATEGORY_LABELS[
      photo.category
    ] || 'Evidencia';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.photoItem,
        pressed &&
          styles.pressedOpacity,
      ]}
      onPress={onPress}
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
          style={
            styles.photoPlaceholder
          }
        >
          <Feather
            name="image"
            size={20}
            color={colors.border}
          />
        </View>
      )}

      {/* Overlay */}

      <LinearGradient
        colors={[
          'transparent',
          'rgba(15,23,42,0.85)',
        ]}
        style={
          styles.photoOverlay
        }
      >
        <Text
          style={
            styles.photoProjectText
          }
          numberOfLines={1}
        >
          {photo.installation
            ?.project_name ||
            'Sin proyecto'}
        </Text>
      </LinearGradient>

      {/* GPS */}

      <View
        style={[
          styles.locationBadge,
          {
            backgroundColor:
              hasLocation
                ? '#4CAF50'
                : '#EF4444',
          },
        ]}
      >
        <Feather
          name={
            hasLocation
              ? 'map-pin'
              : 'map-pin-off'
          }
          size={10}
          color="white"
        />
      </View>

      {/* Categoría */}

      <LinearGradient
        colors={categoryGradient}
        style={
          styles.photoCategoryBadge
        }
      >
        <Text
          style={
            styles.photoCategoryBadgeText
          }
        >
          {categoryLabel}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

// ==================================================================
// ESTILOS
// ==================================================================

const CARD_SHADOW = {
  shadowColor: '#0f172a',
  shadowOffset: {
    width: 0,
    height: 3,
  },
  shadowOpacity: 0.08,
  shadowRadius: 10,
  elevation: 3,
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  centerScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },

  loadingText: {
    marginTop: spacing.md,
    color: colors.muted,
    fontSize: 14.5,
    fontWeight: '500',
  },

  pressedOpacity: {
    opacity: 0.75,
  },

  // --------------------------------------------------------------
  // HEADER
  // --------------------------------------------------------------

  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },

  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    ...CARD_SHADOW,
  },

  headerTitleGroup: {
    flex: 1,
    alignItems: 'center',
  },

  headerEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 1.2,
    marginBottom: 2,
  },

  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },

  filterButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...CARD_SHADOW,
  },

  filterButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },

  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },

  filterBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
  },

  // --------------------------------------------------------------
  // STATS
  // --------------------------------------------------------------

  statsScroll: {
    gap: 8,
    paddingRight: spacing.md,
  },

  miniStat: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
    ...CARD_SHADOW,
    shadowOpacity: 0.04,
  },

  miniStatIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  miniStatContent: {
    alignItems: 'flex-start',
  },

  miniStatValue: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 18,
  },

  miniStatLabel: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    lineHeight: 12,
  },

  // --------------------------------------------------------------
  // SEARCH
  // --------------------------------------------------------------

  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },

  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    ...CARD_SHADOW,
  },

  searchIcon: {
    marginRight: spacing.sm,
  },

  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: 14.5,
    color: colors.text,
  },

  // --------------------------------------------------------------
  // FILTROS
  // --------------------------------------------------------------

  filtersPanel: {
    backgroundColor: '#fff',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: spacing.md,
    maxHeight: 340,
    ...CARD_SHADOW,
  },

  filterSection: {
    marginBottom: spacing.sm,
  },

  filterSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },

  filterChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },

  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  filterChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },

  filterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  filterChipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },

  filterChipTextActive: {
    color: 'white',
  },

  filterChipCount: {
    backgroundColor: '#E2E8F0',
    borderRadius: 6,
    paddingHorizontal: 5,
    minWidth: 18,
    alignItems: 'center',
  },

  filterChipCountActive: {
    backgroundColor:
      'rgba(255,255,255,0.25)',
  },

  filterChipCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.muted,
  },

  filterChipCountTextActive: {
    color: 'white',
  },

  filterDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: spacing.sm,
  },

  clearFiltersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },

  clearFiltersText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '700',
  },

  // --------------------------------------------------------------
  // ERROR
  // --------------------------------------------------------------

  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: 14,
  },

  errorIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },

  errorText: {
    flex: 1,
    color: '#991b1b',
    fontSize: 13,
    marginRight: spacing.sm,
  },

  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 8,
  },

  retryText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 12.5,
  },

  // --------------------------------------------------------------
  // GRID
  // --------------------------------------------------------------

  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl,
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical:
      spacing.xl * 1.5,
    width: '100%',
  },

  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...CARD_SHADOW,
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.xs,
  },

  emptyText: {
    color: colors.muted,
    fontSize: 13.5,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    lineHeight: 19,
  },

  resetEmptyButton: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: 10,
  },

  resetEmptyButtonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
  },

  // --------------------------------------------------------------
  // PHOTO GRID ITEM
  // --------------------------------------------------------------

  photoItem: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    marginRight: GRID_GAP,
    marginBottom: GRID_GAP,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
    ...CARD_SHADOW,
  },

  photoImage: {
    width: '100%',
    height: '100%',
  },

  photoPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },

  photoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 12,
    paddingBottom: 6,
    paddingHorizontal: 6,
  },

  photoProjectText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },

  locationBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    borderWidth: 1.5,
    borderColor:
      'rgba(255,255,255,0.4)',
  },

  photoCategoryBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },

  photoCategoryBadgeText: {
    color: 'white',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  // --------------------------------------------------------------
  // MODAL
  // --------------------------------------------------------------

  photoModalOverlay: {
    flex: 1,
    backgroundColor:
      'rgba(8,11,20,0.96)',
  },

  photoModalSafeArea: {
    backgroundColor:
      'rgba(0,0,0,0.3)',
  },

  photoModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    minHeight: 56,
  },

  photoModalCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor:
      'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },

  photoModalHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },

  photoModalContent: {
    paddingBottom: 30,
  },

  photoModalImageContainer: {
    width: '100%',
    height: height * 0.45,
    backgroundColor: '#000',
  },

  photoModalImage: {
    width: '100%',
    height: '100%',
  },

  photoModalPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },

  photoModalInfo: {
    padding: spacing.lg,
    gap: 10,
  },

  photoModalHeaderInfo: {
    flexDirection: 'row',
    justifyContent:
      'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },

  photoModalProject: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
    flex: 1,
    marginRight: spacing.sm,
    letterSpacing: -0.3,
  },

  photoModalCategoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
  },

  photoModalCategoryText: {
    color: 'white',
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  locationInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor:
      'rgba(255,255,255,0.05)',
  },

  locationInfoRowClickable: {
    backgroundColor:
      'rgba(76, 175, 80, 0.12)',
    borderWidth: 1,
    borderColor:
      'rgba(76, 175, 80, 0.3)',
  },

  locationIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  locationInfoText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },

  locationInfoTextWith: {
    color: '#4CAF50',
  },

  locationInfoTextWithout: {
    color: '#EF4444',
  },

  locationChevron: {
    marginLeft: 'auto',
  },

  photoModalOpenMap: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 4,
  },

  photoModalOpenMapGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },

  photoModalOpenMapText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },

  infoRowIcon: {
    marginRight: 8,
  },

  infoRowText: {
    color: '#cbd5e1',
    fontSize: 13.5,
    fontWeight: '500',
  },

  photoModalComment: {
    color: '#94a3b8',
    fontSize: 13.5,
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: 4,
  },

  photoModalDate: {
    color: '#64748b',
    fontSize: 11.5,
    marginTop: 4,
  },

  photoModalViewInstallation: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: spacing.md,
  },

  photoModalViewInstallationGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },

  photoModalViewInstallationText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});