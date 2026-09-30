// mobile-app/hooks/useLocation.ts

import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
}

export const useLocation = () => {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [permissionStatus, setPermissionStatus] = 
    useState<Location.PermissionStatus | null>(null);

  // Solicitar permisos de ubicación (coincide con tu app.json)
  const requestPermissions = async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermissionStatus(status);
      
      if (status !== 'granted') {
        setErrorMsg('Permiso de ubicación denegado');
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error al solicitar permisos de ubicación:', error);
      setErrorMsg('Error al solicitar permisos');
      return false;
    }
  };

  // Obtener ubicación actual
  const getCurrentLocation = async (): Promise<LocationData | null> => {
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        setIsLoading(false);
        return null;
      }

      const options: Location.LocationOptions = {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 1,
      };

      const locationData = await Location.getCurrentPositionAsync(options);
      
      const newLocation: LocationData = {
        latitude: locationData.coords.latitude,
        longitude: locationData.coords.longitude,
        accuracy: locationData.coords.accuracy || undefined,
        timestamp: locationData.timestamp,
      };

      setLocation(newLocation);
      setIsLoading(false);
      return newLocation;
    } catch (error) {
      console.error('Error al obtener ubicación:', error);
      setErrorMsg('No se pudo obtener la ubicación');
      setIsLoading(false);
      return null;
    }
  };

  // Obtener ubicación en tiempo real
  const watchLocation = (
    callback: (location: LocationData) => void
  ) => {
    let subscription: Location.LocationSubscription | null = null;

    const startWatching = async () => {
      const hasPermission = await requestPermissions();
      if (!hasPermission) return;

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 10000,
          distanceInterval: 5,
        },
        (locationData) => {
          const newLocation: LocationData = {
            latitude: locationData.coords.latitude,
            longitude: locationData.coords.longitude,
            accuracy: locationData.coords.accuracy || undefined,
            timestamp: locationData.timestamp,
          };
          setLocation(newLocation);
          callback(newLocation);
        }
      );
    };

    startWatching();

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  };

  return {
    location,
    errorMsg,
    isLoading,
    permissionStatus,
    getCurrentLocation,
    watchLocation,
    requestPermissions,
  };
};