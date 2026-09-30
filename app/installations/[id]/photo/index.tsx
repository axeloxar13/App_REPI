// app/installations/[id]/photo/index.tsx
import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../../../constants/theme';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../lib/supabase';

type PhotoCategory = 'before' | 'during' | 'after';

const CATEGORY_LABELS: Record<PhotoCategory, string> = {
  before: 'Antes',
  during: 'Durante',
  after: 'Después',
};

const CATEGORY_COLORS: Record<PhotoCategory, string> = {
  before: '#d97706',
  during: '#2563EB',
  after: '#059669',
};

export default function PhotoScreen() {
  const { id: installationId, itemId } = useLocalSearchParams<{ id: string; itemId?: string }>();
  const { user, selectedMembership, session } = useAuth();
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<PhotoCategory>('before');
  const [uploading, setUploading] = useState(false);
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);

  // 🔥 OBTENER ORGANIZATION_ID DE DONDE SEA
  const getOrganizationId = (): string | null => {
    // Opción 1: Desde selectedMembership
    if (selectedMembership?.organizationId) {
      console.log('✅ organizationId desde selectedMembership:', selectedMembership.organizationId);
      return selectedMembership.organizationId;
    }

    // Opción 2: Desde session.user
    if (session?.user?.user_metadata?.organizationId) {
      console.log('✅ organizationId desde session:', session.user.user_metadata.organizationId);
      return session.user.user_metadata.organizationId;
    }

    // Opción 3: Desde las fotos existentes
    if (photos.length > 0) {
      const firstPhoto = photos[0];
      if (firstPhoto?.storage_path) {
        const parts = firstPhoto.storage_path.split('/');
        if (parts.length > 0 && parts[0].length > 10) {
          console.log('✅ organizationId desde storage_path:', parts[0]);
          return parts[0];
        }
      }
    }

    // Opción 4: Desde el perfil del usuario
    if (user?.id) {
      // Intentar obtener de la tabla profiles
      supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.organization_id) {
            console.log('✅ organizationId desde profiles:', data.organization_id);
            return data.organization_id;
          }
        })
        .catch(() => {});
    }

    console.error('❌ NO SE PUDO OBTENER organizationId');
    return null;
  };

  // 🔥 SOLICITAR PERMISOS DE UBICACIÓN
  useEffect(() => {
    requestLocationPermission();
  }, []);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setHasLocationPermission(true);
        console.log('✅ Permiso de ubicación CONCEDIDO');
      } else {
        setHasLocationPermission(false);
        console.log('❌ Permiso de ubicación DENEGADO');
      }
    } catch (error) {
      console.error('❌ Error al solicitar permiso:', error);
      setHasLocationPermission(false);
    }
  };

  // 🔥 OBTENER UBICACIÓN
  const getLocation = async (): Promise<{ latitude: number | null; longitude: number | null }> => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        return { latitude: null, longitude: null };
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeout: 15000,
        maximumAge: 10000,
      });

      console.log('📍 UBICACIÓN OBTENIDA:', {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

    } catch (error: any) {
      console.error('❌ Error al obtener ubicación:', error);
      return { latitude: null, longitude: null };
    }
  };

  // 🔥 SUBIR FOTO - SIN HOOKS, DIRECTO A SUPABASE
  const uploadPhoto = async (imageUri: string) => {
    if (!installationId) {
      Alert.alert('Error', 'No se encontró la instalación');
      return;
    }

    // 🔥 OBTENER ORGANIZATION_ID
    const orgId = getOrganizationId();
    
    if (!orgId) {
      Alert.alert(
        'Error de configuración',
        'No se encontró la organización. Por favor, cierra sesión y vuelve a iniciar.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (!user?.id) {
      Alert.alert('Error', 'No se encontró el técnico');
      return;
    }

    setUploading(true);

    try {
      // 1. OBTENER UBICACIÓN
      const { latitude, longitude } = await getLocation();

      console.log('📊 DATOS DE UBICACIÓN:', { latitude, longitude });

      // 2. PREPARAR IMAGEN
      const response = await fetch(imageUri);
      const blob = await response.blob();

      const fileName = `${Date.now()}.jpg`;
      const storagePath = `${orgId}/${installationId}/${user.id}/${selectedCategory}/${fileName}`;

      console.log('📁 Storage path:', storagePath);
      console.log('📁 OrgId:', orgId);
      console.log('📁 InstallationId:', installationId);
      console.log('📁 UserId:', user.id);

      // 3. SUBIR A STORAGE
      const { error: uploadError } = await supabase.storage
        .from('installation-photos')
        .upload(storagePath, blob, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
        });

      if (uploadError) {
        console.error('❌ Error al subir a storage:', uploadError);
        throw uploadError;
      }

      console.log('✅ Imagen subida a storage');

      // 4. GUARDAR EN BASE DE DATOS CON UBICACIÓN
      const photoRecord = {
        installation_id: installationId,
        technician_id: user.id,
        organization_id: orgId,
        category: selectedCategory,
        storage_path: storagePath,
        file_name: fileName,
        mime_type: 'image/jpeg',
        source: 'camera',
        captured_at: new Date().toISOString(),
        uploaded_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        // 🔥🔥🔥 UBICACIÓN 🔥🔥🔥
        latitud: latitude,
        longitud: longitude,
        tiene_ubicacion: latitude !== null && longitude !== null,
        uploader_name_snapshot: user?.fullName || user?.email || 'Técnico',
        installation_item_id: itemId || null,
      };

      console.log('📝 REGISTRO A GUARDAR:', JSON.stringify(photoRecord, null, 2));

      const { error: insertError } = await supabase
        .from('installation_photos')
        .insert(photoRecord);

      if (insertError) {
        console.error('❌ Error al insertar en BD:', insertError);
        throw insertError;
      }

      console.log('✅ Foto guardada en base de datos');

      // 5. RECARGAR LISTA
      await loadPhotos();

      const locationMsg = latitude ? '📍 con ubicación' : '🚫 sin ubicación';
      Alert.alert('✅ Foto subida', `Foto de ${CATEGORY_LABELS[selectedCategory]} ${locationMsg}`);

    } catch (error: any) {
      console.error('❌ Error al subir foto:', error);
      Alert.alert('Error', 'No se pudo subir la foto: ' + (error.message || 'Error desconocido'));
    } finally {
      setUploading(false);
    }
  };

  // 🔥 CARGAR FOTOS
  const loadPhotos = async () => {
    if (!installationId) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('installation_photos')
        .select('*')
        .eq('installation_id', installationId)
        .eq('installation_item_id', itemId || null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const photosWithUrls = await Promise.all(
        (data || []).map(async (photo) => {
          const { data: urlData } = supabase.storage
            .from('installation-photos')
            .getPublicUrl(photo.storage_path);

          return {
            ...photo,
            url: urlData?.publicUrl || '',
          };
        })
      );

      setPhotos(photosWithUrls);
    } catch (error) {
      console.error('Error loading photos:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPhotos();
  }, [installationId]);

  // 🔥 TOMAR FOTO
  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a la cámara');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });

    if (!result.canceled) {
      await uploadPhoto(result.assets[0].uri);
    }
  };

  // 🔥 SELECCIONAR DE GALERÍA
  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a la galería');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });

    if (!result.canceled) {
      await uploadPhoto(result.assets[0].uri);
    }
  };

  // 🔥 ELIMINAR FOTO
  const deletePhoto = async (photoId: string) => {
    Alert.alert(
      'Eliminar foto',
      '¿Estás seguro?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('installation_photos')
                .delete()
                .eq('id', photoId);

              if (error) throw error;
              await loadPhotos();
            } catch (error) {
              console.error('Error al eliminar foto:', error);
              Alert.alert('Error', 'No se pudo eliminar la foto');
            }
          },
        },
      ]
    );
  };

  // 🔥 RENDER
  const filteredPhotos = photos.filter((p) => p.category === selectedCategory);

  const renderPhotoCard = (photo: any) => {
    const hasLocation = photo.tiene_ubicacion || (photo.latitud && photo.longitud);

    return (
      <View key={photo.id} style={styles.photoCard}>
        <Image source={{ uri: photo.url }} style={styles.photoThumbnail} />
        <View style={styles.photoInfo}>
          <View style={styles.photoBadge}>
            <Ionicons 
              name={hasLocation ? 'location' : 'location-outline'} 
              size={12} 
              color={hasLocation ? '#4CAF50' : '#EF4444'} 
            />
            <Text style={[styles.photoBadgeText, hasLocation ? styles.photoBadgeTextSuccess : styles.photoBadgeTextError]}>
              {hasLocation ? '📍 Con ubicación' : '🚫 Sin ubicación'}
            </Text>
          </View>
          <Text style={styles.photoDate}>
            {new Date(photo.created_at).toLocaleString()}
          </Text>
          {hasLocation && (
            <Text style={styles.photoLocation}>
              📍 {Number(photo.latitud).toFixed(6)}, {Number(photo.longitud).toFixed(6)}
            </Text>
          )}
        </View>
        <TouchableOpacity 
          style={styles.deletePhotoButton}
          onPress={() => deletePhoto(photo.id)}
        >
          <Ionicons name="trash-outline" size={18} color="#EF4444" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📸 Fotos</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Categorías */}
      <View style={styles.categoryContainer}>
        {(['before', 'during', 'after'] as PhotoCategory[]).map((category) => (
          <TouchableOpacity
            key={category}
            style={[
              styles.categoryTab,
              selectedCategory === category && styles.categoryTabActive,
              { borderColor: selectedCategory === category ? CATEGORY_COLORS[category] : colors.border }
            ]}
            onPress={() => setSelectedCategory(category)}
          >
            <Text style={[
              styles.categoryTabText,
              selectedCategory === category && { color: CATEGORY_COLORS[category] }
            ]}>
              {CATEGORY_LABELS[category]}
            </Text>
            <View style={[
              styles.categoryCount,
              { backgroundColor: selectedCategory === category ? CATEGORY_COLORS[category] : colors.border }
            ]}>
              <Text style={styles.categoryCountText}>
                {photos.filter(p => p.category === category).length}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Contenido */}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Cargando fotos...</Text>
          </View>
        ) : filteredPhotos.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="camera-outline" size={64} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>Sin fotos</Text>
            <Text style={styles.emptyText}>
              No hay fotos en "{CATEGORY_LABELS[selectedCategory]}"
            </Text>
          </View>
        ) : (
          <View style={styles.photosGrid}>
            {filteredPhotos.map(renderPhotoCard)}
          </View>
        )}

        {/* Botones de subida */}
        <View style={styles.uploadButtons}>
          <TouchableOpacity style={[styles.uploadButton, styles.uploadButtonCamera]} onPress={takePhoto} disabled={uploading}>
            <Ionicons name="camera" size={20} color="#fff" />
            <Text style={styles.uploadButtonText}>Tomar</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.uploadButton, styles.uploadButtonGallery]} onPress={pickImage} disabled={uploading}>
            <Ionicons name="images" size={20} color="#fff" />
            <Text style={styles.uploadButtonText}>Subir</Text>
          </TouchableOpacity>
        </View>

        {uploading && (
          <View style={styles.uploadingIndicator}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.uploadingText}>Subiendo foto...</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  categoryContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  categoryTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
  },
  categoryTabActive: {
    backgroundColor: colors.primarySoft,
    borderWidth: 2,
  },
  categoryTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  categoryCount: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.muted,
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.md,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  photosGrid: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  photoCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.sm,
    alignItems: 'center',
  },
  photoThumbnail: {
    width: 60,
    height: 60,
    borderRadius: radius.sm,
    backgroundColor: '#F1F5F9',
  },
  photoInfo: {
    flex: 1,
    gap: 2,
  },
  photoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  photoBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  photoBadgeTextSuccess: {
    color: '#4CAF50',
  },
  photoBadgeTextError: {
    color: '#EF4444',
  },
  photoDate: {
    fontSize: 11,
    color: colors.muted,
  },
  photoLocation: {
    fontSize: 10,
    color: colors.muted,
  },
  deletePhotoButton: {
    padding: 8,
  },
  uploadButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  uploadButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  uploadButtonCamera: {
    backgroundColor: colors.primary,
  },
  uploadButtonGallery: {
    backgroundColor: '#10B981',
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  uploadingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.md,
  },
  uploadingText: {
    color: colors.muted,
    fontSize: 13,
  },
});