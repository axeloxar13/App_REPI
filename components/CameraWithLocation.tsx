// components/CameraWithLocation.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
} from 'react-native';
import { CameraView, useCameraPermissions, type CameraCapturedPicture } from 'expo-camera';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

interface CameraWithLocationProps {
  visible: boolean;
  onClose: () => void;
  onPhotoTaken: (photo: any) => void;
  installationId: string;
  organizationId: string;
  technicianId: string;
  category: 'before' | 'during' | 'after';
  installationItemId?: string;
}

export default function CameraWithLocation({
  visible,
  onClose,
  onPhotoTaken,
  installationId,
  organizationId,
  technicianId,
  category,
  installationItemId,
}: CameraWithLocationProps) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [takingPhoto, setTakingPhoto] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // 🔥 OBTENER UBICACIÓN AL ABRIR LA CÁMARA
  useEffect(() => {
    if (visible) {
      getLocation();
    }
  }, [visible]);

  // 🔥 FUNCIÓN PARA OBTENER UBICACIÓN
  const getLocation = async () => {
    setLoadingLocation(true);
    setLocationError(null);

    try {
      // Solicitar permisos de ubicación
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        setLocationError('Permiso de ubicación denegado');
        setLoadingLocation(false);
        return;
      }

      // Obtener ubicación actual
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeout: 10000,
      });

      console.log('📍 Ubicación obtenida:', {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        accuracy: currentLocation.coords.accuracy,
      });

      setLocation(currentLocation);
    } catch (error) {
      console.error('Error al obtener ubicación:', error);
      setLocationError('Error al obtener ubicación');
    } finally {
      setLoadingLocation(false);
    }
  };

  // 🔥 TOMAR FOTO CON UBICACIÓN
  const takePicture = async () => {
    if (!cameraRef.current || !cameraReady) {
      Alert.alert('Error', 'La cámara no está lista');
      return;
    }

    if (!location) {
      Alert.alert(
        'Sin ubicación',
        'No se pudo obtener tu ubicación. ¿Deseas continuar sin ubicación?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { 
            text: 'Continuar sin ubicación', 
            onPress: () => takePhotoWithoutLocation(),
            style: 'destructive'
          },
        ]
      );
      return;
    }

    takePhotoWithLocation();
  };

  // 🔥 TOMAR FOTO CON UBICACIÓN
  const takePhotoWithLocation = async () => {
    try {
      setTakingPhoto(true);

      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.8,
        base64: true,
        exif: true,
      });

      if (!photo) {
        throw new Error('No se pudo tomar la foto');
      }

      // Guardar la foto con ubicación
      const photoData = {
        uri: photo.uri,
        base64: photo.base64,
        width: photo.width,
        height: photo.height,
        latitude: location?.coords.latitude || null,
        longitude: location?.coords.longitude || null,
        timestamp: new Date().toISOString(),
      };

      setPreviewUri(photo.uri);
      setShowPreview(true);
      setTakingPhoto(false);

    } catch (error) {
      console.error('Error al tomar foto:', error);
      Alert.alert('Error', 'No se pudo tomar la foto');
      setTakingPhoto(false);
    }
  };

  // 🔥 TOMAR FOTO SIN UBICACIÓN (FALLBACK)
  const takePhotoWithoutLocation = async () => {
    try {
      setTakingPhoto(true);

      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.8,
        base64: true,
      });

      if (!photo) {
        throw new Error('No se pudo tomar la foto');
      }

      const photoData = {
        uri: photo.uri,
        base64: photo.base64,
        width: photo.width,
        height: photo.height,
        latitude: null,
        longitude: null,
        timestamp: new Date().toISOString(),
      };

      setPreviewUri(photo.uri);
      setShowPreview(true);
      setTakingPhoto(false);

    } catch (error) {
      console.error('Error al tomar foto:', error);
      Alert.alert('Error', 'No se pudo tomar la foto');
      setTakingPhoto(false);
    }
  };

  // 🔥 SUBIR FOTO A SUPABASE CON UBICACIÓN
  const uploadPhoto = async () => {
    if (!previewUri) return;

    try {
      setTakingPhoto(true);

      // Obtener el blob de la imagen
      const response = await fetch(previewUri);
      const blob = await response.blob();

      // Generar nombre único
      const fileExt = 'jpg';
      const fileName = `${Date.now()}.${fileExt}`;
      const storagePath = `${organizationId}/${installationId}/${technicianId}/${category}/${fileName}`;

      // 🔥 1. Subir a Storage
      const { error: uploadError } = await supabase.storage
        .from('installation-photos')
        .upload(storagePath, blob, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
        });

      if (uploadError) {
        console.error('Error al subir foto:', uploadError);
        throw uploadError;
      }

      // Obtener URL pública
      const { data: urlData } = supabase.storage
        .from('installation-photos')
        .getPublicUrl(storagePath);

      const publicUrl = urlData.publicUrl;

      // 🔥 2. Guardar en la base de datos CON UBICACIÓN
      const photoRecord = {
        installation_id: installationId,
        technician_id: technicianId,
        organization_id: organizationId,
        category: category,
        storage_path: storagePath,
        file_name: fileName,
        mime_type: 'image/jpeg',
        source: 'camera',
        captured_at: new Date().toISOString(),
        uploaded_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        // 🔥🔥🔥 AQUÍ SE GUARDA LA UBICACIÓN 🔥🔥🔥
        latitud: location?.coords.latitude || null,
        longitud: location?.coords.longitude || null,
        tiene_ubicacion: !!location,
        uploader_name_snapshot: 'Técnico',
        installation_item_id: installationItemId || null,
      };

      console.log('📝 Guardando foto con ubicación:', {
        latitud: photoRecord.latitud,
        longitud: photoRecord.longitud,
        tiene_ubicacion: photoRecord.tiene_ubicacion,
      });

      const { data, error: insertError } = await supabase
        .from('installation_photos')
        .insert(photoRecord)
        .select()
        .single();

      if (insertError) {
        console.error('Error al guardar en BD:', insertError);
        throw insertError;
      }

      // 🔥 3. Callback con la foto guardada
      onPhotoTaken({
        ...data,
        url: publicUrl,
        latitude: location?.coords.latitude || null,
        longitude: location?.coords.longitude || null,
        tiene_ubicacion: !!location,
      });

      setShowPreview(false);
      setPreviewUri(null);
      onClose();

    } catch (error: any) {
      console.error('Error al subir foto:', error);
      Alert.alert('Error', 'No se pudo guardar la foto: ' + (error.message || 'Error desconocido'));
    } finally {
      setTakingPhoto(false);
    }
  };

  // 🔥 RECHAZAR PREVIEW
  const rejectPhoto = () => {
    setShowPreview(false);
    setPreviewUri(null);
  };

  // 🔥 RENDER: SOLICITANDO PERMISOS
  if (!permission) {
    return (
      <Modal visible={visible} transparent animationType="slide">
        <View style={styles.container}>
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.loadingText}>Solicitando permisos...</Text>
          </View>
        </View>
      </Modal>
    );
  }

  // 🔥 RENDER: SIN PERMISO DE CÁMARA
  if (!permission.granted) {
    return (
      <Modal visible={visible} transparent animationType="slide">
        <View style={styles.container}>
          <View style={styles.centerContent}>
            <Ionicons name="camera-off" size={64} color="#EF4444" />
            <Text style={styles.errorTitle}>Sin acceso a la cámara</Text>
            <Text style={styles.errorMessage}>
              Necesitamos acceso a la cámara para tomar fotos
            </Text>
            <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
              <Text style={styles.permissionButtonText}>Conceder permiso</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // 🔥 RENDER: CARGANDO UBICACIÓN
  if (loadingLocation && !location) {
    return (
      <Modal visible={visible} transparent animationType="slide">
        <View style={styles.container}>
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.loadingText}>Obteniendo ubicación...</Text>
            <Text style={styles.loadingSubtext}>Asegúrate de tener el GPS activado</Text>
          </View>
        </View>
      </Modal>
    );
  }

  // 🔥 RENDER: PREVIEW DE LA FOTO
  if (showPreview && previewUri) {
    return (
      <Modal visible={visible} transparent animationType="slide">
        <View style={styles.container}>
          <Image source={{ uri: previewUri }} style={styles.previewImage} />
          
          <View style={styles.previewActions}>
            <TouchableOpacity 
              style={[styles.previewButton, styles.rejectButton]}
              onPress={rejectPhoto}
              disabled={takingPhoto}
            >
              <Ionicons name="close" size={32} color="#fff" />
              <Text style={styles.previewButtonText}>Rechazar</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.previewButton, styles.acceptButton]}
              onPress={uploadPhoto}
              disabled={takingPhoto}
            >
              {takingPhoto ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={32} color="#fff" />
                  <Text style={styles.previewButtonText}>Aceptar</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* 🔥 INDICADOR DE UBICACIÓN */}
          <View style={styles.locationStatus}>
            <Ionicons 
              name={location ? 'location' : 'location-off'} 
              size={16} 
              color={location ? '#4CAF50' : '#EF4444'} 
            />
            <Text style={[styles.locationStatusText, location ? styles.locationStatusTextSuccess : styles.locationStatusTextError]}>
              {location 
                ? `📍 ${location.coords.latitude.toFixed(6)}, ${location.coords.longitude.toFixed(6)}` 
                : 'Sin ubicación'}
            </Text>
          </View>
        </View>
      </Modal>
    );
  }

  // 🔥 RENDER: CÁMARA
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.container}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          onCameraReady={() => setCameraReady(true)}
        >
          {/* 🔥 INDICADOR DE UBICACIÓN EN LA CÁMARA */}
          <View style={styles.locationInfo}>
            <Ionicons 
              name={location ? 'location' : 'location-off'} 
              size={16} 
              color={location ? '#4CAF50' : '#EF4444'} 
            />
            <Text style={[styles.locationText, location ? styles.locationTextSuccess : styles.locationTextError]}>
              {location 
                ? `📍 ${location.coords.latitude.toFixed(6)}, ${location.coords.longitude.toFixed(6)}` 
                : '📍 Sin ubicación'}
            </Text>
          </View>

          <View style={styles.categoryInfo}>
            <Text style={styles.categoryText}>
              {category === 'before' ? '📸 Antes' : category === 'during' ? '📸 Durante' : '📸 Después'}
            </Text>
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={styles.closeButtonCamera}
              onPress={onClose}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.captureButton, !cameraReady && styles.captureButtonDisabled]}
              onPress={takePicture}
              disabled={!cameraReady || takingPhoto}
            >
              {takingPhoto ? (
                <ActivityIndicator size="large" color="#fff" />
              ) : (
                <View style={styles.captureInner} />
              )}
            </TouchableOpacity>

            <View style={styles.placeholderButton} />
          </View>

          <TouchableOpacity 
            style={styles.retryLocationButton}
            onPress={getLocation}
            disabled={loadingLocation}
          >
            <Ionicons name="refresh-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </CameraView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
    backgroundColor: '#000',
  },
  loadingText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 20,
  },
  loadingSubtext: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  errorTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 16,
  },
  errorMessage: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  permissionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  closeButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  closeButtonText: {
    color: '#94A3B8',
    fontSize: 16,
  },
  camera: {
    flex: 1,
  },
  locationInfo: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
  },
  locationText: {
    fontSize: 12,
    fontWeight: '500',
  },
  locationTextSuccess: {
    color: '#4CAF50',
  },
  locationTextError: {
    color: '#EF4444',
  },
  categoryInfo: {
    position: 'absolute',
    top: 110,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  closeButtonCamera: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  placeholderButton: {
    width: 50,
    height: 50,
  },
  retryLocationButton: {
    position: 'absolute',
    bottom: 120,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    flex: 1,
    resizeMode: 'contain',
    backgroundColor: '#000',
  },
  previewActions: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 30,
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 30,
  },
  rejectButton: {
    backgroundColor: '#EF4444',
  },
  acceptButton: {
    backgroundColor: '#22C55E',
  },
  previewButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  locationStatus: {
    position: 'absolute',
    top: 50,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationStatusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  locationStatusTextSuccess: {
    color: '#4CAF50',
  },
  locationStatusTextError: {
    color: '#EF4444',
  },
});