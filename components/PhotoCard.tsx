// components/PhotoCard.tsx
import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const { width } = Dimensions.get('window');
const CARD_SIZE = (width - 48) / 2; // 2 columnas con padding

interface PhotoCardProps {
  photo: {
    id: string;
    storage_path: string;
    url?: string;
    latitud: number | null;
    longitud: number | null;
    created_at: string;
    uploader_name_snapshot?: string | null;
    technician_name?: string;
    installation_number?: string;
    client_name?: string;
    address?: string;
    category?: string;
  };
  onPress: () => void;
}

export default function PhotoCard({ photo, onPress }: PhotoCardProps) {
  // Usar la URL si existe
  const imageUrl = photo.url || photo.storage_path;
  
  const formattedDate = photo.created_at 
    ? format(new Date(photo.created_at), "dd MMM yyyy", { locale: es })
    : 'Fecha desconocida';

  const userName = photo.technician_name || 
                   photo.uploader_name_snapshot || 
                   'Técnico';

  const hasLocation = photo.latitud !== null && photo.latitud !== undefined && 
                      photo.longitud !== null && photo.longitud !== undefined;

  return (
    <TouchableOpacity style={[styles.card, { width: CARD_SIZE }]} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.imageContainer}>
        {imageUrl ? (
          <Image 
            source={{ uri: imageUrl }} 
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="image-outline" size={32} color="#CBD5E1" />
          </View>
        )}
        
        {/* Badge de instalación */}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            #{photo.installation_number || 'N/A'}
          </Text>
        </View>

        {/* Indicador de ubicación */}
        {hasLocation && (
          <View style={styles.locationBadge}>
            <Ionicons name="location" size={12} color="#4CAF50" />
          </View>
        )}
      </View>
      
      <View style={styles.infoContainer}>
        <Text style={styles.userName} numberOfLines={1}>
          {userName}
        </Text>
        <Text style={styles.dateText} numberOfLines={1}>
          {formattedDate}
        </Text>
        {photo.category && (
          <Text style={styles.categoryText} numberOfLines={1}>
            {photo.category}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  imageContainer: {
    position: 'relative',
    height: CARD_SIZE * 0.75,
    backgroundColor: '#F1F5F9',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  locationBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContainer: {
    padding: 10,
    gap: 2,
  },
  userName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  dateText: {
    fontSize: 10,
    color: '#94A3B8',
  },
  categoryText: {
    fontSize: 10,
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
});