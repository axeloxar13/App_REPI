// hooks/usePhotosWithLocation.ts
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface PhotoWithLocation {
  id: string;
  installation_id: string;
  technician_id: string | null;
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
  organization_id: string;
  uploader_membership_id: string | null;
  installation_item_id: string | null;
  latitud: number | null;
  longitud: number | null;
  tiene_ubicacion: boolean | null;
  // Datos relacionados
  installation_number?: string;
  client_name?: string;
  address?: string;
  technician_name?: string;
  technician_email?: string;
  url?: string;
}

export function usePhotosWithLocation() {
  const [photos, setPhotos] = useState<PhotoWithLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPhotos = async () => {
    try {
      setLoading(true);
      setError(null);

      // 🔥 ELIMINÉ EL FILTRO DE latitud/longitud
      // Ahora trae TODAS las fotos sin importar si tienen ubicación
      const { data: photosData, error: photosError } = await supabase
        .from('installation_photos')
        .select(`
          id,
          installation_id,
          technician_id,
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
          organization_id,
          uploader_membership_id,
          installation_item_id,
          latitud,
          longitud,
          tiene_ubicacion
        `)
        // 🔥 ELIMINADO: .not('latitud', 'is', null)
        // 🔥 ELIMINADO: .not('longitud', 'is', null)
        .order('created_at', { ascending: false });

      if (photosError) throw photosError;

      if (!photosData || photosData.length === 0) {
        setPhotos([]);
        setLoading(false);
        return;
      }

      // Obtener información de las instalaciones
      const installationIds = photosData
        .map(p => p.installation_id)
        .filter((id): id is string => id !== null && id !== undefined);

      let installationsMap: Record<string, any> = {};

      if (installationIds.length > 0) {
        const { data: installationsData, error: installationsError } = await supabase
          .from('installations')
          .select('id, number, client_name, address')
          .in('id', installationIds);

        if (!installationsError && installationsData) {
          installationsMap = installationsData.reduce((acc, inst) => {
            acc[inst.id] = inst;
            return acc;
          }, {} as Record<string, any>);
        }
      }

      // Obtener nombres de los técnicos
      const technicianIds = photosData
        .map(p => p.technician_id)
        .filter((id): id is string => id !== null && id !== undefined);

      let techniciansMap: Record<string, any> = {};

      if (technicianIds.length > 0) {
        const { data: techniciansData, error: techniciansError } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', technicianIds);

        if (!techniciansError && techniciansData) {
          techniciansMap = techniciansData.reduce((acc, tech) => {
            acc[tech.id] = tech;
            return acc;
          }, {} as Record<string, any>);
        }
      }

      // Obtener URLs públicas de las fotos
      const formattedPhotos = await Promise.all(
        photosData.map(async (photo: any) => {
          const installation = installationsMap[photo.installation_id] || {};
          const technician = techniciansMap[photo.technician_id] || {};

          // Obtener URL pública
          let publicUrl = null;
          if (photo.storage_path) {
            try {
              const { data: urlData } = supabase.storage
                .from('installation-photos')
                .getPublicUrl(photo.storage_path);
              publicUrl = urlData?.publicUrl || null;
            } catch (e) {
              console.warn('Error al obtener URL de la foto:', photo.id);
            }
          }

          const userName = photo.uploader_name_snapshot || 
                           technician.full_name || 
                           photo.uploader_email_snapshot ||
                           technician.email || 
                           'Técnico';

          return {
            ...photo,
            url: publicUrl,
            // Convertir latitud/longitud a números
            latitud: photo.latitud ? Number(photo.latitud) : null,
            longitud: photo.longitud ? Number(photo.longitud) : null,
            // Datos de instalación
            installation_number: installation.number || 'N/A',
            client_name: installation.client_name || 'Cliente',
            address: installation.address || 'Sin dirección',
            // Datos del técnico
            technician_name: userName,
            technician_email: technician.email || photo.uploader_email_snapshot || '',
          };
        })
      );

      setPhotos(formattedPhotos);
    } catch (err: any) {
      console.error('Error fetching photos:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPhotos();
  }, []);

  return { photos, loading, error, refetch: fetchPhotos };
}