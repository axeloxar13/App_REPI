// mobile-app/hooks/useInstallation.ts

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import * as Location from 'expo-location';
import type { InstallationWithClient, PhotoWithLocation } from '../types/installation';

const photoColumns = `
  id,
  installation_id,
  equipment_id,
  image_url,
  description,
  latitude,
  longitude,
  has_location,
  uploaded_by,
  created_at,
  updated_at
`;

export const useInstallation = (installationId?: string) => {
  const { selectedMembership, status } = useAuth();
  const [installation, setInstallation] = useState<InstallationWithClient | null>(null);
  const [photos, setPhotos] = useState<PhotoWithLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchInstallation = useCallback(async (mode: 'loading' | 'refresh' = 'loading') => {
    if (!installationId || status !== 'authenticated' || !selectedMembership) {
      setInstallation(null);
      setPhotos([]);
      setLoading(false);
      setIsRefreshing(false);
      return;
    }

    if (mode === 'refresh') {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      // Obtener instalación
      const { data: installData, error: installError } = await supabase
        .from('installations')
        .select(`
          id,
          organization_id,
          project_name,
          client_id,
          address,
          installation_type,
          technician_id,
          technician_membership_id,
          assigned_date,
          start_date,
          started_at,
          estimated_completion_date,
          completed_at,
          status,
          observations,
          clients:installations_client_organization_fkey (
            id,
            name,
            phone,
            email
          )
        `)
        .eq('id', installationId)
        .eq('organization_id', selectedMembership.organizationId)
        .eq('technician_membership_id', selectedMembership.id)
        .maybeSingle();

      if (installError) {
        throw new Error(installError.message);
      }

      if (!installData) {
        setInstallation(null);
        setPhotos([]);
        setLoading(false);
        setIsRefreshing(false);
        return;
      }

      // Obtener fotos
      const { data: photosData, error: photosError } = await supabase
        .from('installation_photos')
        .select(photoColumns)
        .eq('installation_id', installationId)
        .order('created_at', { ascending: false });

      if (photosError) {
        console.error('Error al cargar fotos:', photosError);
      }

      const client = Array.isArray(installData.clients) 
        ? installData.clients[0] 
        : installData.clients;

      const mappedInstallation: InstallationWithClient = {
        id: installData.id,
        organizationId: installData.organization_id,
        projectName: installData.project_name,
        clientId: installData.client_id,
        address: installData.address,
        installationType: installData.installation_type,
        technicianId: installData.technician_id ?? '',
        technicianMembershipId: installData.technician_membership_id ?? '',
        assignedDate: installData.assigned_date,
        startDate: installData.start_date,
        startedAt: installData.started_at,
        estimatedCompletionDate: installData.estimated_completion_date,
        completedAt: installData.completed_at,
        status: installData.status,
        observations: installData.observations,
        items: [],
        client: {
          id: client?.id ?? installData.client_id,
          name: client?.name ?? 'Cliente sin definir',
          phone: client?.phone ?? null,
          email: client?.email ?? null,
        },
      };

      setInstallation(mappedInstallation);
      setPhotos(photosData || []);
      
    } catch (err) {
      console.error('Error en fetchInstallation:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar la instalación');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [installationId, selectedMembership, status]);

  // ✅ FUNCIÓN PARA OBTENER UBICACIÓN EN SILENCIO
  const getLocationSilently = useCallback(async () => {
    try {
      // Solicitar permisos si no los tiene
      const { status: permissionStatus } = await Location.requestForegroundPermissionsAsync();
      if (permissionStatus !== 'granted') {
        return null;
      }

      // Obtener ubicación con alta precisión
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 1,
      });

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
      };
    } catch (error) {
      // ✅ SILENCIOSO: si falla, solo devolvemos null
      console.log('GPS no disponible para esta foto');
      return null;
    }
  }, []);

  // ✅ FUNCIÓN PARA SUBIR FOTO (CON UBICACIÓN AUTOMÁTICA)
  const addPhoto = async (photoData: {
    image_url: string;
    description?: string;
    equipment_id?: string;
    installation_id: string;
  }) => {
    if (!selectedMembership) {
      throw new Error('No hay sesión activa');
    }

    try {
      let imageUrl = photoData.image_url;
      
      // Si es una URI local, subir a Supabase Storage
      if (photoData.image_url.startsWith('file://') || photoData.image_url.startsWith('content://')) {
        const response = await fetch(photoData.image_url);
        const blob = await response.blob();
        const fileExt = photoData.image_url.split('.').pop() || 'jpg';
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `installation-photos/${photoData.installation_id}/${fileName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('installation-photos')
          .upload(filePath, blob, {
            contentType: `image/${fileExt}`,
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('installation-photos')
          .getPublicUrl(filePath);

        imageUrl = urlData.publicUrl;
      }

      // ✅ OBTENER UBICACIÓN AUTOMÁTICAMENTE (EN SILENCIO)
      const location = await getLocationSilently();

      // ✅ INSERTAR CON O SIN UBICACIÓN (AUTOMÁTICO)
      const { data, error } = await supabase
        .from('installation_photos')
        .insert({
          installation_id: photoData.installation_id,
          equipment_id: photoData.equipment_id || null,
          image_url: imageUrl,
          description: photoData.description || '',
          latitude: location?.latitude || null,
          longitude: location?.longitude || null,
          has_location: !!location,
          uploaded_by: selectedMembership.userId || 'system',
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Actualizar lista local
      const newPhoto: PhotoWithLocation = {
        id: data.id,
        installation_id: data.installation_id,
        equipment_id: data.equipment_id,
        image_url: data.image_url,
        description: data.description,
        latitude: data.latitude,
        longitude: data.longitude,
        has_location: data.has_location,
        uploaded_by: data.uploaded_by,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };

      setPhotos(prev => [newPhoto, ...prev]);
      
      return newPhoto;
    } catch (err) {
      console.error('Error al subir foto:', err);
      throw err;
    }
  };

  // Eliminar foto
  const deletePhoto = async (photoId: string) => {
    try {
      const { error } = await supabase
        .from('installation_photos')
        .delete()
        .eq('id', photoId);

      if (error) throw error;

      setPhotos(prev => prev.filter(p => p.id !== photoId));
      
    } catch (err) {
      console.error('Error al eliminar foto:', err);
      throw err;
    }
  };

  // Obtener solo fotos con ubicación (para admin)
  const getPhotosWithLocation = useCallback(() => {
    return photos.filter(p => p.has_location && p.latitude && p.longitude);
  }, [photos]);

  const refresh = useCallback(() => {
    return fetchInstallation('refresh');
  }, [fetchInstallation]);

  useEffect(() => {
    fetchInstallation();
  }, [fetchInstallation]);

  return {
    installation,
    photos,
    loading,
    error,
    isRefreshing,
    fetchInstallation,
    addPhoto,              // ✅ Ahora obtiene ubicación automáticamente
    deletePhoto,
    getPhotosWithLocation,  // ✅ Para el admin
    refresh,
  };
};