import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  router,
  useLocalSearchParams,
} from 'expo-router';

import { SafeAreaView } from 'react-native-safe-area-context';

import { StatusBar } from 'expo-status-bar';

import { Ionicons } from '@expo/vector-icons';

import * as ImagePicker from 'expo-image-picker';

import * as Location from 'expo-location';

import { useAuth } from '../../../context/AuthContext';

import {
  fetchInstallationById,
} from '../../../hooks/useInstallations';

import {
  usePhotoCollectionUpload,
} from '../../../hooks/usePhotoCollectionUpload';

import { supabase } from '../../../lib/supabase';

import type {
  InstallationItem,
  ServiceCategory,
} from '../../../types/database';

import { colors, radius, spacing } from '../../../constants/theme';

/* =========================================================
   TIPOS
========================================================= */

type PhotoCollectionGroup = {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
  items: string[];
};

type SelectedPhoto =
  ImagePicker.ImagePickerAsset;

type PhotoLocation = {
  latitude: number;
  longitude: number;
  capturedAt: string;
};

/* =========================================================
   CONFIGURACIÓN DE FOTOGRAFÍAS POR SERVICIO
========================================================= */

const PHOTO_GROUPS_BY_SERVICE: Record<
  string,
  PhotoCollectionGroup[]
> = {
  /* =======================================================
     GPS VEHICULAR
  ======================================================= */

  gps_vehicular: [
    {
      id: 'gps_device',
      name: 'Dispositivo GPS',
      icon: 'navigate-outline',
      description:
        'Equipo GPS y su instalación física.',
      items: [
        'GPS instalado',
        'Ubicación del GPS',
        'Vista del dispositivo',
        'Número de serie',
        'Etiqueta del equipo',
        'IMEI / identificador',
      ],
    },
    {
      id: 'vehicle',
      name: 'Vehículo',
      icon: 'car-outline',
      description:
        'Evidencia relacionada con el vehículo.',
      items: [
        'Vista frontal',
        'Vista trasera',
        'Vista lateral',
        'Interior del vehículo',
        'Tablero',
        'Ubicación de instalación',
        'Identificación del vehículo',
      ],
    },
    {
      id: 'installation',
      name: 'Instalación',
      icon: 'construct-outline',
      description:
        'Montaje, alimentación y cableado.',
      items: [
        'Cableado',
        'Alimentación',
        'Conectores',
        'Fusible / protección',
        'Montaje',
        'Canalización',
      ],
    },
    {
      id: 'tests',
      name: 'Pruebas',
      icon: 'checkmark-circle-outline',
      description:
        'Evidencia de funcionamiento.',
      items: [
        'GPS funcionando',
        'Señal GPS',
        'Ubicación en plataforma',
        'Comunicación',
        'Prueba de ruta',
      ],
    },
    {
      id: 'identification',
      name: 'Identificación',
      icon: 'pricetag-outline',
      description:
        'Datos e identificación del servicio.',
      items: [
        'Etiqueta',
        'Folio',
        'Número económico',
        'Placa',
        'Documentación',
        'Otra',
      ],
    },
  ],

  /* =======================================================
     CCTV SEGURIDAD
  ======================================================= */

  cctv_seguridad: [
    {
      id: 'cameras',
      name: 'Cámaras',
      icon: 'videocam-outline',
      description:
        'Cámaras y elementos relacionados.',
      items: [
        'Cámara instalada',
        'Vista general de cámara',
        'Montaje / soporte',
        'Ángulo de visión',
        'Placa / número de cámara',
        'Número de serie / etiqueta',
        'Lente',
        'Carcasa',
        'Conexiones de cámara',
      ],
    },
    {
      id: 'recording',
      name: 'Grabación',
      icon: 'desktop-outline',
      description:
        'NVR, DVR y almacenamiento.',
      items: [
        'NVR',
        'DVR',
        'Disco duro',
        'Pantalla de monitoreo',
        'Grabador instalado',
        'Conexiones del grabador',
        'Estado de grabación',
      ],
    },
    {
      id: 'network',
      name: 'Red',
      icon: 'globe-outline',
      description:
        'Infraestructura de red y comunicación.',
      items: [
        'Switch',
        'Switch PoE',
        'Router',
        'Patch panel',
        'Puerto de red',
        'Cableado de red',
        'Conexión de red',
        'Configuración de red',
      ],
    },
    {
      id: 'infrastructure',
      name: 'Infraestructura',
      icon: 'git-network-outline',
      description:
        'Canalización y elementos físicos.',
      items: [
        'Canalización',
        'Tubería',
        'Canaleta',
        'Charola',
        'Caja de paso',
        'Conectores',
        'Gabinete',
        'Rack',
      ],
    },
    {
      id: 'power',
      name: 'Energía',
      icon: 'flash-outline',
      description:
        'Alimentación eléctrica de los equipos.',
      items: [
        'Fuente de alimentación',
        'UPS',
        'Contacto eléctrico',
        'Centro de carga',
        'Protección eléctrica',
        'Tierra física',
        'Cableado eléctrico',
      ],
    },
    {
      id: 'tests',
      name: 'Pruebas',
      icon: 'checkmark-circle-outline',
      description:
        'Pruebas y evidencia de funcionamiento.',
      items: [
        'Imagen de cámara',
        'Visión nocturna',
        'Grabación',
        'Conectividad',
        'Acceso remoto',
        'Movimiento / PTZ',
        'Audio',
        'Prueba general',
      ],
    },
    {
      id: 'identification',
      name: 'Identificación',
      icon: 'pricetag-outline',
      description:
        'Etiquetas, seriales y documentación.',
      items: [
        'Etiquetado',
        'Número de cámara',
        'Número de serie',
        'Placa técnica',
        'Folio / identificación',
        'Diagrama / plano',
        'Otra',
      ],
    },
  ],

  /* =======================================================
     CCTV MÓVIL
  ======================================================= */

  cctv_movil: [
    {
      id: 'vehicle',
      name: 'Vehículo',
      icon: 'car-outline',
      description:
        'Evidencia del vehículo donde se instala el sistema.',
      items: [
        'Vista frontal',
        'Vista trasera',
        'Vista lateral',
        'Vista interior',
        'Tablero',
        'Ubicación del sistema',
        'Identificación del vehículo',
      ],
    },
    {
      id: 'cameras',
      name: 'Cámaras',
      icon: 'videocam-outline',
      description:
        'Cámaras instaladas en el vehículo.',
      items: [
        'Cámara instalada',
        'Vista de cámara',
        'Montaje / soporte',
        'Ángulo de visión',
        'Número de cámara',
        'Número de serie',
        'Conexiones',
      ],
    },
    {
      id: 'recording',
      name: 'Grabación',
      icon: 'desktop-outline',
      description:
        'Grabador y almacenamiento.',
      items: [
        'DVR móvil',
        'NVR móvil',
        'Disco duro',
        'Almacenamiento',
        'Grabador instalado',
        'Conexiones del grabador',
      ],
    },
    {
      id: 'communications',
      name: 'Comunicaciones',
      icon: 'cellular-outline',
      description:
        'Comunicación, GPS y conectividad.',
      items: [
        'Router',
        'Módem',
        'Antena',
        'GPS',
        'SIM / etiqueta',
        'Conexión de datos',
        'Señal',
      ],
    },
    {
      id: 'installation',
      name: 'Instalación',
      icon: 'construct-outline',
      description:
        'Cableado y montaje.',
      items: [
        'Cableado',
        'Conectores',
        'Fuente de alimentación',
        'Protección',
        'Canalización',
        'Montaje',
        'Caja de conexión',
      ],
    },
    {
      id: 'tests',
      name: 'Pruebas',
      icon: 'checkmark-circle-outline',
      description:
        'Pruebas del sistema móvil.',
      items: [
        'Video',
        'Grabación',
        'GPS',
        'Red',
        'Comunicación',
        'Acceso remoto',
        'Prueba general',
      ],
    },
    {
      id: 'identification',
      name: 'Identificación',
      icon: 'pricetag-outline',
      description:
        'Identificación de equipos y vehículo.',
      items: [
        'Etiqueta',
        'Número de serie',
        'Número de cámara',
        'Placa',
        'Número económico',
        'Folio',
        'Otra',
      ],
    },
  ],

  /* =======================================================
     DOMÓTICA
  ======================================================= */

  domotica: [
    {
      id: 'devices',
      name: 'Dispositivos',
      icon: 'hardware-chip-outline',
      description:
        'Equipos y dispositivos de automatización.',
      items: [
        'Dispositivo instalado',
        'Controlador',
        'Sensor',
        'Actuador',
        'Hub / Gateway',
        'Pantalla / panel',
        'Número de serie',
      ],
    },
    {
      id: 'automation',
      name: 'Automatización',
      icon: 'bulb-outline',
      description:
        'Elementos automatizados.',
      items: [
        'Iluminación',
        'Persiana / cortina',
        'Climatización',
        'Control de acceso',
        'Audio',
        'Escena automatizada',
        'Control central',
      ],
    },
    {
      id: 'network',
      name: 'Red',
      icon: 'globe-outline',
      description:
        'Conectividad del sistema.',
      items: [
        'Router',
        'Switch',
        'Gateway',
        'Punto de red',
        'Cableado',
        'Conexión inalámbrica',
      ],
    },
    {
      id: 'installation',
      name: 'Instalación',
      icon: 'construct-outline',
      description:
        'Montaje e infraestructura.',
      items: [
        'Montaje',
        'Cableado',
        'Canalización',
        'Caja de conexión',
        'Fuente',
        'Conectores',
      ],
    },
    {
      id: 'tests',
      name: 'Pruebas',
      icon: 'checkmark-circle-outline',
      description:
        'Evidencia de funcionamiento.',
      items: [
        'Dispositivo funcionando',
        'Automatización funcionando',
        'Control desde aplicación',
        'Comunicación',
        'Escena funcionando',
        'Prueba general',
      ],
    },
    {
      id: 'identification',
      name: 'Identificación',
      icon: 'pricetag-outline',
      description:
        'Identificación y documentación.',
      items: [
        'Etiqueta',
        'Número de serie',
        'Placa técnica',
        'Folio',
        'Diagrama',
        'Otra',
      ],
    },
  ],

  /* =======================================================
     BIAS TRANSPORTE
  ======================================================= */

  bias_transporte: [
    {
      id: 'vehicle',
      name: 'Vehículo',
      icon: 'car-outline',
      description:
        'Evidencia del vehículo.',
      items: [
        'Vista frontal',
        'Vista trasera',
        'Vista lateral',
        'Interior',
        'Tablero',
        'Identificación del vehículo',
        'Placa',
      ],
    },
    {
      id: 'equipment',
      name: 'Equipo',
      icon: 'hardware-chip-outline',
      description:
        'Equipos relacionados con el servicio.',
      items: [
        'Equipo instalado',
        'Unidad principal',
        'Accesorio',
        'Número de serie',
        'Etiqueta',
        'Ubicación del equipo',
      ],
    },
    {
      id: 'installation',
      name: 'Instalación',
      icon: 'construct-outline',
      description:
        'Montaje e infraestructura.',
      items: [
        'Montaje',
        'Cableado',
        'Conectores',
        'Alimentación',
        'Protección',
        'Canalización',
      ],
    },
    {
      id: 'operation',
      name: 'Operación',
      icon: 'speedometer-outline',
      description:
        'Evidencia del funcionamiento del servicio.',
      items: [
        'Panel funcionando',
        'Pantalla',
        'Lectura',
        'Indicador',
        'Comunicación',
        'Prueba operativa',
      ],
    },
    {
      id: 'tests',
      name: 'Pruebas',
      icon: 'checkmark-circle-outline',
      description:
        'Pruebas realizadas.',
      items: [
        'Prueba general',
        'Comunicación',
        'Lectura',
        'Sistema funcionando',
        'Prueba de operación',
      ],
    },
    {
      id: 'identification',
      name: 'Identificación',
      icon: 'pricetag-outline',
      description:
        'Identificación de unidad y equipos.',
      items: [
        'Etiqueta',
        'Número de serie',
        'Placa',
        'Número económico',
        'Folio',
        'Documentación',
        'Otra',
      ],
    },
  ],

  /* =======================================================
     INSTALACIÓN ELÉCTRICA
  ======================================================= */

  instalacion_electrica: [
    {
      id: 'panel',
      name: 'Tablero eléctrico',
      icon: 'grid-outline',
      description:
        'Tableros y distribución eléctrica.',
      items: [
        'Tablero',
        'Centro de carga',
        'Interruptores',
        'Protecciones',
        'Barras',
        'Identificación del tablero',
      ],
    },
    {
      id: 'wiring',
      name: 'Cableado',
      icon: 'git-network-outline',
      description:
        'Conductores y conexiones.',
      items: [
        'Cableado',
        'Conductor',
        'Conexión',
        'Terminal',
        'Conector',
        'Canalización',
      ],
    },
    {
      id: 'outlets',
      name: 'Puntos eléctricos',
      icon: 'flash-outline',
      description:
        'Contactos y puntos de alimentación.',
      items: [
        'Contacto',
        'Apagador',
        'Salida eléctrica',
        'Alimentación',
        'Caja eléctrica',
        'Punto especial',
      ],
    },
    {
      id: 'grounding',
      name: 'Tierra física',
      icon: 'earth-outline',
      description:
        'Sistema de puesta a tierra.',
      items: [
        'Sistema de tierra',
        'Barra de tierra',
        'Electrodo',
        'Conductor de tierra',
        'Conexión a tierra',
        'Registro',
      ],
    },
    {
      id: 'infrastructure',
      name: 'Infraestructura',
      icon: 'construct-outline',
      description:
        'Canalización y montaje.',
      items: [
        'Tubería',
        'Charola',
        'Canaleta',
        'Caja de paso',
        'Soporte',
        'Gabinete',
      ],
    },
    {
      id: 'tests',
      name: 'Pruebas',
      icon: 'checkmark-circle-outline',
      description:
        'Pruebas eléctricas.',
      items: [
        'Voltaje',
        'Continuidad',
        'Polaridad',
        'Tierra física',
        'Protección',
        'Prueba general',
      ],
    },
    {
      id: 'identification',
      name: 'Identificación',
      icon: 'pricetag-outline',
      description:
        'Etiquetado y documentación.',
      items: [
        'Etiquetado',
        'Número de circuito',
        'Placa técnica',
        'Folio',
        'Diagrama eléctrico',
        'Otra',
      ],
    },
  ],

  /* =======================================================
     AIRE ACONDICIONADO
  ======================================================= */

  aire_acondicionado: [
    {
      id: 'equipment',
      name: 'Equipo',
      icon: 'snow-outline',
      description:
        'Equipos de climatización.',
      items: [
        'Unidad interior',
        'Unidad exterior',
        'Condensadora',
        'Evaporadora',
        'Termostato',
        'Control',
        'Número de serie',
        'Etiqueta del equipo',
      ],
    },
    {
      id: 'installation',
      name: 'Instalación',
      icon: 'construct-outline',
      description:
        'Montaje y conexiones.',
      items: [
        'Montaje',
        'Soporte',
        'Tubería',
        'Drenaje',
        'Cableado',
        'Conexiones',
        'Aislamiento',
      ],
    },
    {
      id: 'electrical',
      name: 'Alimentación',
      icon: 'flash-outline',
      description:
        'Alimentación eléctrica del equipo.',
      items: [
        'Alimentación',
        'Centro de carga',
        'Protección',
        'Contacto',
        'Cableado eléctrico',
        'Conexión',
      ],
    },
    {
      id: 'comfort',
      name: 'Confort inteligente',
      icon: 'bulb-outline',
      description:
        'Control y automatización.',
      items: [
        'Control inteligente',
        'Termostato inteligente',
        'Sensor',
        'Gateway',
        'Aplicación',
        'Automatización',
      ],
    },
    {
      id: 'tests',
      name: 'Pruebas',
      icon: 'checkmark-circle-outline',
      description:
        'Pruebas de operación.',
      items: [
        'Encendido',
        'Enfriamiento',
        'Temperatura',
        'Control remoto',
        'Comunicación',
        'Drenaje',
        'Prueba general',
      ],
    },
    {
      id: 'identification',
      name: 'Identificación',
      icon: 'pricetag-outline',
      description:
        'Identificación del equipo.',
      items: [
        'Etiqueta',
        'Número de serie',
        'Modelo',
        'Placa técnica',
        'Folio',
        'Otra',
      ],
    },
  ],

  /* =======================================================
     ENERGÍA INTELIGENTE
  ======================================================= */

  energia_inteligente: [
    {
      id: 'solar',
      name: 'Sistema solar',
      icon: 'sunny-outline',
      description:
        'Paneles y componentes solares.',
      items: [
        'Panel solar',
        'Arreglo de paneles',
        'Estructura',
        'Inversor',
        'Microinversor',
        'Controlador',
        'Número de serie',
      ],
    },
    {
      id: 'electrical',
      name: 'Sistema eléctrico',
      icon: 'flash-outline',
      description:
        'Distribución y alimentación.',
      items: [
        'Tablero',
        'Centro de carga',
        'Protección',
        'Cableado',
        'Conexiones',
        'Tierra física',
        'Desconectador',
      ],
    },
    {
      id: 'monitoring',
      name: 'Monitoreo',
      icon: 'analytics-outline',
      description:
        'Monitoreo y comunicación del sistema.',
      items: [
        'Gateway',
        'Medidor',
        'Pantalla',
        'Aplicación',
        'Comunicación',
        'Lectura',
      ],
    },
    {
      id: 'installation',
      name: 'Instalación',
      icon: 'construct-outline',
      description:
        'Montaje e infraestructura.',
      items: [
        'Montaje',
        'Estructura',
        'Canalización',
        'Cableado',
        'Conectores',
        'Caja de conexión',
      ],
    },
    {
      id: 'tests',
      name: 'Pruebas',
      icon: 'checkmark-circle-outline',
      description:
        'Pruebas del sistema energético.',
      items: [
        'Generación',
        'Voltaje',
        'Corriente',
        'Monitoreo',
        'Comunicación',
        'Funcionamiento',
        'Prueba general',
      ],
    },
    {
      id: 'identification',
      name: 'Identificación',
      icon: 'pricetag-outline',
      description:
        'Identificación y documentación.',
      items: [
        'Etiqueta',
        'Número de serie',
        'Placa técnica',
        'Folio',
        'Diagrama',
        'Otra',
      ],
    },
  ],

  /* =======================================================
     ALARMAS
  ======================================================= */

  alarmas: [
    {
      id: 'control',
      name: 'Panel de alarma',
      icon: 'shield-checkmark-outline',
      description:
        'Panel y elementos principales.',
      items: [
        'Panel de alarma',
        'Teclado',
        'Sirena',
        'Fuente',
        'Batería',
        'Número de serie',
        'Etiqueta',
      ],
    },
    {
      id: 'sensors',
      name: 'Sensores',
      icon: 'radio-outline',
      description:
        'Sensores y dispositivos de detección.',
      items: [
        'Sensor de movimiento',
        'Sensor magnético',
        'Sensor de humo',
        'Sensor de temperatura',
        'Sensor exterior',
        'Detector',
        'Montaje del sensor',
      ],
    },
    {
      id: 'communication',
      name: 'Comunicación',
      icon: 'cellular-outline',
      description:
        'Comunicación y conectividad.',
      items: [
        'Módulo GSM',
        'Módulo LTE',
        'Antena',
        'SIM / etiqueta',
        'Ethernet',
        'Wi-Fi',
        'Comunicación',
      ],
    },
    {
      id: 'installation',
      name: 'Instalación',
      icon: 'construct-outline',
      description:
        'Cableado y montaje.',
      items: [
        'Cableado',
        'Canalización',
        'Conectores',
        'Caja de paso',
        'Montaje',
        'Alimentación',
      ],
    },
    {
      id: 'tests',
      name: 'Pruebas',
      icon: 'checkmark-circle-outline',
      description:
        'Pruebas del sistema de alarma.',
      items: [
        'Activación',
        'Sensor',
        'Sirena',
        'Comunicación',
        'Alerta',
        'Batería',
        'Prueba general',
      ],
    },
    {
      id: 'identification',
      name: 'Identificación',
      icon: 'pricetag-outline',
      description:
        'Identificación y documentación.',
      items: [
        'Etiqueta',
        'Número de serie',
        'Zona',
        'Folio',
        'Placa técnica',
        'Otra',
      ],
    },
  ],

  /* =======================================================
     CONTROL DE ACCESO
  ======================================================= */

  control_acceso: [
    {
      id: 'access',
      name: 'Control de acceso',
      icon: 'lock-closed-outline',
      description:
        'Equipos principales del control de acceso.',
      items: [
        'Controlador',
        'Lector',
        'Teclado',
        'Biométrico',
        'Tarjetero',
        'Credencial',
        'Número de serie',
      ],
    },
    {
      id: 'door',
      name: 'Puerta / acceso',
      icon: 'enter-outline',
      description:
        'Elementos físicos de la puerta.',
      items: [
        'Puerta',
        'Chapa eléctrica',
        'Electroimán',
        'Botón de salida',
        'Sensor de puerta',
        'Contacto magnético',
        'Soporte',
      ],
    },
    {
      id: 'credentials',
      name: 'Credenciales',
      icon: 'card-outline',
      description:
        'Elementos relacionados con identificación.',
      items: [
        'Tarjeta',
        'Llavero',
        'Código',
        'Huella',
        'Rostro',
        'Configuración de usuario',
      ],
    },
    {
      id: 'network',
      name: 'Red',
      icon: 'globe-outline',
      description:
        'Comunicación del sistema.',
      items: [
        'Red',
        'Switch',
        'Router',
        'Cableado',
        'Punto de red',
        'Configuración',
      ],
    },
    {
      id: 'installation',
      name: 'Instalación',
      icon: 'construct-outline',
      description:
        'Montaje, cableado y alimentación.',
      items: [
        'Montaje',
        'Cableado',
        'Fuente',
        'Batería',
        'Canalización',
        'Conectores',
      ],
    },
    {
      id: 'tests',
      name: 'Pruebas',
      icon: 'checkmark-circle-outline',
      description:
        'Pruebas de acceso y funcionamiento.',
      items: [
        'Lectura de tarjeta',
        'Huella',
        'Rostro',
        'Apertura',
        'Cierre',
        'Botón de salida',
        'Comunicación',
        'Prueba general',
      ],
    },
    {
      id: 'identification',
      name: 'Identificación',
      icon: 'pricetag-outline',
      description:
        'Identificación de equipos.',
      items: [
        'Etiqueta',
        'Número de serie',
        'Placa técnica',
        'Folio',
        'Identificación de puerta',
        'Otra',
      ],
    },
  ],

  /* =======================================================
     OTRO
  ======================================================= */

  otro: [
    {
      id: 'equipment',
      name: 'Equipo / elemento',
      icon: 'hardware-chip-outline',
      description:
        'Equipo o elemento principal del servicio.',
      items: [
        'Equipo instalado',
        'Elemento principal',
        'Accesorio',
        'Número de serie',
        'Etiqueta',
        'Ubicación del equipo',
      ],
    },
    {
      id: 'installation',
      name: 'Instalación',
      icon: 'construct-outline',
      description:
        'Montaje e infraestructura.',
      items: [
        'Montaje',
        'Cableado',
        'Canalización',
        'Conectores',
        'Alimentación',
        'Infraestructura',
      ],
    },
    {
      id: 'tests',
      name: 'Pruebas',
      icon: 'checkmark-circle-outline',
      description:
        'Evidencia de funcionamiento.',
      items: [
        'Funcionamiento',
        'Prueba general',
        'Comunicación',
        'Configuración',
        'Resultado',
      ],
    },
    {
      id: 'identification',
      name: 'Identificación',
      icon: 'pricetag-outline',
      description:
        'Identificación y documentación.',
      items: [
        'Etiqueta',
        'Número de serie',
        'Placa técnica',
        'Folio',
        'Documentación',
        'Otra',
      ],
    },
    {
      id: 'general',
      name: 'Evidencia general',
      icon: 'images-outline',
      description:
        'Evidencia que no pertenece a otra categoría.',
      items: [
        'Vista general',
        'Área de trabajo',
        'Resultado final',
        'Condición existente',
        'Otra',
      ],
    },
  ],
};

const FALLBACK_PHOTO_GROUPS =
  PHOTO_GROUPS_BY_SERVICE.otro;

/* =========================================================
   COMPONENTE
========================================================= */

export default function PhotoCollectionScreen() {
  const { id } =
    useLocalSearchParams<{ id: string }>();

  const {
    status,
    selectedMembership,
    user,
  } = useAuth();

  /* =======================================================
     ESTADO
  ======================================================= */

  const [items, setItems] =
    useState<InstallationItem[]>([]);

  // Nombre real de la instalación (projectName), cargado desde la instalación.
  const [installationName, setInstallationName] =
    useState('Instalación');

  const [serviceCategories, setServiceCategories] =
    useState<ServiceCategory[]>([]);

  const [selectedItem, setSelectedItem] =
    useState<InstallationItem | null>(null);

  const [selectedGroup, setSelectedGroup] =
    useState<PhotoCollectionGroup | null>(null);

  const [selectedPhotoType, setSelectedPhotoType] =
    useState<string | null>(null);

  const [selectedPhoto, setSelectedPhoto] =
    useState<SelectedPhoto | null>(null);

  const [selectedPhotoSource, setSelectedPhotoSource] =
    useState<'camera' | 'gallery' | null>(null);

  const [photoLocation, setPhotoLocation] =
    useState<PhotoLocation | null>(null);

  const [isLoading, setIsLoading] =
    useState(true);

  const [isLoadingServices, setIsLoadingServices] =
    useState(true);

  const [isCapturingPhoto, setIsCapturingPhoto] =
    useState(false);

  const [isGettingLocation, setIsGettingLocation] =
    useState(false);

  const [isPmiPickerOpen, setIsPmiPickerOpen] =
    useState(false);

  const [isPhotoTypePickerOpen, setIsPhotoTypePickerOpen] =
    useState(false);

  const [error, setError] =
    useState('');

  const [servicesError, setServicesError] =
    useState('');

  /* =======================================================
     CARGAR SERVICIOS
  ======================================================= */

  const loadServiceCategories =
    useCallback(async () => {
      if (!supabase) {
        setServicesError(
          'Supabase no está configurado.',
        );

        setIsLoadingServices(false);
        return;
      }

      setIsLoadingServices(true);
      setServicesError('');

      const {
        data,
        error: queryError,
      } = await supabase
        .from('service_categories')
        .select(`
          id,
          code,
          name,
          description,
          active,
          sort_order,
          capture_rules
        `)
        .eq('active', true)
        .order('sort_order', {
          ascending: true,
        })
        .returns<ServiceCategory[]>();

      if (queryError) {
        console.info(
          '[photo-collection] Error cargando servicios:',
          queryError,
        );

        setServiceCategories([]);

        setServicesError(
          'No pudimos cargar los servicios de la instalación.',
        );

        setIsLoadingServices(false);
        return;
      }

      setServiceCategories(data ?? []);
      setIsLoadingServices(false);
    }, []);

  /* =======================================================
     CARGAR INSTALACIÓN
  ======================================================= */

  const loadInstallation =
    useCallback(async () => {
      if (
        status !== 'authenticated' ||
        !selectedMembership ||
        !id
      ) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError('');

      const result =
        await fetchInstallationById(
          id,
          selectedMembership,
        );

      if (
        result.error ||
        !result.data
      ) {
        setItems([]);
        setSelectedItem(null);

        setError(
          result.error ||
            'No pudimos cargar la instalación.',
        );

        setIsLoading(false);
        return;
      }

      const installationItems =
        result.data.items ?? [];

      setInstallationName(
        result.data.projectName?.trim() || 'Instalación',
      );

      setItems(installationItems);

      if (
        installationItems.length === 1
      ) {
        setSelectedItem(
          installationItems[0],
        );
      } else {
        setSelectedItem((current) => {
          if (!current) {
            return null;
          }

          return (
            installationItems.find(
              (item) =>
                item.id === current.id,
            ) ?? null
          );
        });
      }

      setIsLoading(false);
    }, [
      id,
      selectedMembership,
      status,
    ]);

  useEffect(() => {
    loadInstallation();
    loadServiceCategories();
  }, [
    loadInstallation,
    loadServiceCategories,
  ]);

  /* =======================================================
     SERVICIO
  ======================================================= */

  const selectedService =
    useMemo(() => {
      if (
        !selectedItem?.serviceCategoryId
      ) {
        return null;
      }

      return (
        serviceCategories.find(
          (service) =>
            service.id ===
            selectedItem.serviceCategoryId,
        ) ?? null
      );
    }, [
      selectedItem,
      serviceCategories,
    ]);

  /* =======================================================
     GRUPOS
  ======================================================= */

  const photoGroups =
    useMemo(() => {
      if (!selectedService) {
        return FALLBACK_PHOTO_GROUPS;
      }

      return (
        PHOTO_GROUPS_BY_SERVICE[
          selectedService.code
        ] ?? FALLBACK_PHOTO_GROUPS
      );
    }, [selectedService]);

  /* =======================================================
     METADATA PARA SUBIDA
  ======================================================= */

  const photoCollectionMetadata =
    useMemo(() => {
      if (
        !selectedService ||
        !selectedGroup ||
        !selectedPhotoType
      ) {
        return null;
      }

      return {
        serviceCode:
          selectedService.code,

        serviceName:
          selectedService.name,

        photoGroupId:
          selectedGroup.id,

        photoGroupLabel:
          selectedGroup.name,

        photoTypeId:
          selectedPhotoType,

        photoTypeLabel:
          selectedPhotoType,
      };
    }, [
      selectedGroup,
      selectedPhotoType,
      selectedService,
    ]);

  /* =======================================================
     HOOK DE SUBIDA
  ======================================================= */

  const {
    uploadPhoto,
    isUploading:
      isUploadingCollectionPhoto,
    progress:
      collectionUploadProgress,
    message:
      collectionUploadMessage,
  } = usePhotoCollectionUpload({
    organizationId:
      selectedItem?.organizationId ?? '',

    installationId:
      id ?? '',

    installationItemId:
      selectedItem?.id ?? '',

    technicianId:
      user?.id ?? '',

    technicianMembershipId:
      selectedMembership?.id ?? '',

    metadata:
      photoCollectionMetadata ?? {
        serviceCode:
          selectedService?.code ?? '',

        serviceName:
          selectedService?.name ?? '',

        photoGroupId:
          selectedGroup?.id ?? '',

        photoGroupLabel:
          selectedGroup?.name ?? '',

        photoTypeId:
          selectedPhotoType ?? '',

        photoTypeLabel:
          selectedPhotoType ?? '',
      },

    photo:
      selectedPhoto,

    source:
      selectedPhotoSource ?? 'camera',

    location:
      photoLocation
        ? {
            latitude:
              photoLocation.latitude,

            longitude:
              photoLocation.longitude,

            capturedAt:
              photoLocation.capturedAt,
          }
        : null,
  });

  /* =======================================================
     SELECCIONAR ELEMENTO
  ======================================================= */

  const handleSelectItem =
    useCallback(
      (
        item: InstallationItem,
      ) => {
        if (
          isUploadingCollectionPhoto
        ) {
          return;
        }

        setSelectedItem(item);

        setSelectedGroup(null);
        setSelectedPhotoType(null);

        setSelectedPhoto(null);
        setSelectedPhotoSource(null);

        setPhotoLocation(null);

        setIsPmiPickerOpen(false);
      },
      [isUploadingCollectionPhoto],
    );

  /* =======================================================
     ABRIR SELECTOR
  ======================================================= */

  const handleOpenPhotoTypePicker =
    useCallback(() => {
      if (!selectedItem) {
        Alert.alert(
          'Selecciona un elemento',
          'Primero selecciona el elemento al que pertenece la fotografía.',
        );

        return;
      }

      setIsPhotoTypePickerOpen(true);
    }, [selectedItem]);

  /* =======================================================
     SELECCIONAR GRUPO
  ======================================================= */

  const handleSelectGroup =
    useCallback(
      (
        group: PhotoCollectionGroup,
      ) => {
        if (
          isUploadingCollectionPhoto
        ) {
          return;
        }

        const isSameGroup =
          selectedGroup?.id === group.id;

        if (isSameGroup) {
          setSelectedGroup(null);
          setSelectedPhotoType(null);
          setSelectedPhoto(null);
          setSelectedPhotoSource(null);
          setPhotoLocation(null);

          return;
        }

        setSelectedGroup(group);
        setSelectedPhotoType(null);

        setSelectedPhoto(null);
        setSelectedPhotoSource(null);

        setPhotoLocation(null);
      },
      [
        isUploadingCollectionPhoto,
        selectedGroup?.id,
      ],
    );

  /* =======================================================
     SELECCIONAR TIPO
  ======================================================= */

  const handleSelectPhotoType =
    useCallback(
      (
        group: PhotoCollectionGroup,
        photoType: string,
      ) => {
        if (
          isUploadingCollectionPhoto
        ) {
          return;
        }

        setSelectedGroup(group);
        setSelectedPhotoType(
          photoType,
        );

        setSelectedPhoto(null);
        setSelectedPhotoSource(null);

        setPhotoLocation(null);

        setIsPhotoTypePickerOpen(false);
      },
      [isUploadingCollectionPhoto],
    );

  /* =======================================================
     PERMISO CÁMARA
  ======================================================= */

  const requestCameraPermission =
    useCallback(async () => {
      const current =
        await ImagePicker.getCameraPermissionsAsync();

      if (current.granted) {
        return true;
      }

      const requested =
        await ImagePicker.requestCameraPermissionsAsync();

      if (requested.granted) {
        return true;
      }

      if (!requested.canAskAgain) {
        Alert.alert(
          'Permiso de cámara requerido',
          'El acceso a la cámara está desactivado. Actívalo desde la configuración de la aplicación.',
          [
            {
              text: 'Cancelar',
              style: 'cancel',
            },
            {
              text: 'Abrir configuración',
              onPress: () => {
                Linking.openSettings();
              },
            },
          ],
        );
      } else {
        Alert.alert(
          'Permiso de cámara requerido',
          'Necesitamos acceso a la cámara para tomar la fotografía.',
        );
      }

      return false;
    }, []);

  /* =======================================================
     PERMISO GALERÍA
  ======================================================= */

  const requestGalleryPermission =
    useCallback(async () => {
      const current =
        await ImagePicker.getMediaLibraryPermissionsAsync();

      if (current.granted) {
        return true;
      }

      const requested =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (requested.granted) {
        return true;
      }

      if (!requested.canAskAgain) {
        Alert.alert(
          'Permiso de fotografías requerido',
          'El acceso a tus fotografías está desactivado. Actívalo desde la configuración de la aplicación.',
          [
            {
              text: 'Cancelar',
              style: 'cancel',
            },
            {
              text: 'Abrir configuración',
              onPress: () => {
                Linking.openSettings();
              },
            },
          ],
        );
      } else {
        Alert.alert(
          'Permiso de fotografías requerido',
          'Necesitamos acceso a tus fotografías para seleccionar una imagen.',
        );
      }

      return false;
    }, []);

  /* =======================================================
     GPS
  ======================================================= */

  const getCurrentPhotoLocation =
    useCallback(
      async (): Promise<
        PhotoLocation | null
      > => {
        try {
          setIsGettingLocation(true);

          const permission =
            await Location.getForegroundPermissionsAsync();

          let permissionStatus =
            permission.status;

          if (
            permissionStatus !==
            Location.PermissionStatus.GRANTED
          ) {
            const requested =
              await Location.requestForegroundPermissionsAsync();

            permissionStatus =
              requested.status;
          }

          if (
            permissionStatus !==
            Location.PermissionStatus.GRANTED
          ) {
            Alert.alert(
              'Ubicación requerida',
              'Necesitamos permiso para obtener la ubicación de la fotografía.',
              [
                {
                  text: 'Cancelar',
                  style: 'cancel',
                },
                {
                  text: 'Abrir configuración',
                  onPress: () => {
                    Linking.openSettings();
                  },
                },
              ],
            );

            return null;
          }

          const location =
            await Location.getCurrentPositionAsync(
              {
                accuracy:
                  Location.Accuracy.High,
              },
            );

          const nextLocation =
            {
              latitude:
                location.coords.latitude,

              longitude:
                location.coords.longitude,

              capturedAt:
                new Date().toISOString(),
            };

          setPhotoLocation(
            nextLocation,
          );

          return nextLocation;
        } catch (error) {
          console.error(
            '[photo-collection] Error obteniendo ubicación:',
            error,
          );

          Alert.alert(
            'No fue posible obtener la ubicación',
            'La fotografía se obtuvo correctamente, pero no pudimos obtener la ubicación actual. Inténtalo nuevamente.',
          );

          return null;
        } finally {
          setIsGettingLocation(false);
        }
      },
      [],
    );

  /* =======================================================
     TOMAR FOTO
  ======================================================= */

  const handleTakePhoto =
    useCallback(async () => {
      if (!selectedItem) {
        Alert.alert(
          'Selecciona un elemento',
          'Primero selecciona el elemento.',
        );

        return;
      }

      if (
        !selectedGroup ||
        !selectedPhotoType
      ) {
        Alert.alert(
          'Selecciona el tipo de fotografía',
          'Primero selecciona qué fotografía estás recabando.',
        );

        return;
      }

      if (
        isCapturingPhoto ||
        isUploadingCollectionPhoto
      ) {
        return;
      }

      try {
        setIsCapturingPhoto(true);

        const allowed =
          await requestCameraPermission();

        if (!allowed) {
          return;
        }

        const result =
          await ImagePicker.launchCameraAsync(
            {
              mediaTypes: ['images'],
              quality: 1,
              allowsEditing: false,
              exif: false,
              base64: false,
            },
          );

        if (result.canceled) {
          return;
        }

        const photo =
          result.assets?.[0];

        if (!photo?.uri) {
          Alert.alert(
            'Fotografía no disponible',
            'La cámara no devolvió una fotografía válida.',
          );

          return;
        }

        setSelectedPhoto(photo);
        setSelectedPhotoSource(
          'camera',
        );

        await getCurrentPhotoLocation();
      } catch (error) {
        console.error(
          '[photo-collection] Error tomando fotografía:',
          error,
        );

        Alert.alert(
          'No fue posible tomar la fotografía',
          'Ocurrió un problema al abrir la cámara.',
        );
      } finally {
        setIsCapturingPhoto(false);
      }
    }, [
      getCurrentPhotoLocation,
      isCapturingPhoto,
      isUploadingCollectionPhoto,
      requestCameraPermission,
      selectedGroup,
      selectedItem,
      selectedPhotoType,
    ]);

  /* =======================================================
     GALERÍA
  ======================================================= */

  const handlePickPhoto =
    useCallback(async () => {
      if (!selectedItem) {
        Alert.alert(
          'Selecciona un elemento',
          'Primero selecciona el elemento.',
        );

        return;
      }

      if (
        !selectedGroup ||
        !selectedPhotoType
      ) {
        Alert.alert(
          'Selecciona el tipo de fotografía',
          'Primero selecciona qué fotografía estás recabando.',
        );

        return;
      }

      if (
        isCapturingPhoto ||
        isUploadingCollectionPhoto
      ) {
        return;
      }

      try {
        setIsCapturingPhoto(true);

        const allowed =
          await requestGalleryPermission();

        if (!allowed) {
          return;
        }

        const result =
          await ImagePicker.launchImageLibraryAsync(
            {
              mediaTypes: ['images'],
              quality: 1,
              allowsEditing: false,
              exif: false,
              base64: false,
              allowsMultipleSelection:
                false,
              selectionLimit: 1,
            },
          );

        if (result.canceled) {
          return;
        }

        const photo =
          result.assets?.[0];

        if (!photo?.uri) {
          Alert.alert(
            'Fotografía no disponible',
            'No fue posible obtener la fotografía seleccionada.',
          );

          return;
        }

        setSelectedPhoto(photo);
        setSelectedPhotoSource(
          'gallery',
        );

        await getCurrentPhotoLocation();
      } catch (error) {
        console.error(
          '[photo-collection] Error seleccionando fotografía:',
          error,
        );

        Alert.alert(
          'No fue posible seleccionar la fotografía',
          'Ocurrió un problema al abrir la galería.',
        );
      } finally {
        setIsCapturingPhoto(false);
      }
    }, [
      getCurrentPhotoLocation,
      isCapturingPhoto,
      isUploadingCollectionPhoto,
      requestGalleryPermission,
      selectedGroup,
      selectedItem,
      selectedPhotoType,
    ]);

  /* =======================================================
     ELIMINAR FOTO
  ======================================================= */

  const handleRemovePhoto =
    useCallback(() => {
      if (
        isUploadingCollectionPhoto
      ) {
        return;
      }

      setSelectedPhoto(null);
      setSelectedPhotoSource(null);
      setPhotoLocation(null);
    }, [isUploadingCollectionPhoto]);

  /* =======================================================
     GUARDAR FOTO
  ======================================================= */

  const handleUploadCollectionPhoto =
    useCallback(async () => {
      if (
        isUploadingCollectionPhoto
      ) {
        return;
      }

      if (!selectedItem) {
        Alert.alert(
          'Elemento requerido',
          'Selecciona el elemento al que pertenece la fotografía.',
        );

        return;
      }

      if (!selectedGroup) {
        Alert.alert(
          'Categoría requerida',
          'Selecciona la categoría de la fotografía.',
        );

        return;
      }

      if (!selectedPhotoType) {
        Alert.alert(
          'Tipo requerido',
          'Selecciona qué fotografía estás recabando.',
        );

        return;
      }

      if (!selectedPhoto) {
        Alert.alert(
          'Fotografía requerida',
          'Primero toma una fotografía o selecciónala desde la galería.',
        );

        return;
      }

      if (!photoCollectionMetadata) {
        Alert.alert(
          'Información incompleta',
          'No fue posible determinar los datos de la fotografía.',
        );

        return;
      }

      if (
        !selectedMembership?.id
      ) {
        Alert.alert(
          'Membresía no disponible',
          'No se encontró la membresía del técnico actual.',
        );

        return;
      }

      if (!user?.id) {
        Alert.alert(
          'Usuario no disponible',
          'No se encontró el usuario técnico actual.',
        );

        return;
      }

      try {
        const result =
          await uploadPhoto();

        if (!result?.ok) {
          return;
        }

        /*
         * Conservamos elemento, grupo y tipo.
         *
         * Solo eliminamos la fotografía actual para que el
         * técnico pueda recabar inmediatamente otra del mismo elemento.
         */
        setSelectedPhoto(null);
        setSelectedPhotoSource(null);
        setPhotoLocation(null);

        Alert.alert(
          'Fotografía guardada',
          photoLocation
            ? 'La fotografía se guardó correctamente con su ubicación.'
            : 'La fotografía se guardó correctamente.',
        );
      } catch (error) {
        console.error(
          '[photo-collection] Error guardando fotografía:',
          error,
        );

        Alert.alert(
          'No fue posible guardar la fotografía',
          error instanceof Error
            ? error.message
            : 'Ocurrió un error inesperado.',
        );
      }
    }, [
      isUploadingCollectionPhoto,
      photoCollectionMetadata,
      photoLocation,
      selectedGroup,
      selectedItem,
      selectedMembership?.id,
      selectedPhoto,
      selectedPhotoType,
      uploadPhoto,
      user?.id,
    ]);

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <SafeAreaView
      style={styles.safeArea}
    >
      <StatusBar style="dark" />

      <View style={styles.container}>
        {/* =================================================
            HEADER
        ================================================= */}

        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() => {
              if (
                isUploadingCollectionPhoto
              ) {
                return;
              }

              router.back();
            }}
            disabled={
              isUploadingCollectionPhoto
            }
          >
            <Ionicons
              name="arrow-back"
              size={22}
              color={colors.primary}
            />
          </Pressable>

          <View
            style={
              styles.headerTextContainer
            }
          >
            <Text style={styles.title}>
              Recabar fotografías
            </Text>

            <Text style={styles.subtitle}>
              Selecciona el elemento y qué parte vas a documentar.
            </Text>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={
            styles.content
          }
          showsVerticalScrollIndicator={
            false
          }
        >
          {/* =================================================
              ELEMENTO
          ================================================= */}

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Selecciona el elemento
            </Text>

            <Text
              style={
                styles.sectionDescription
              }
            >
              Indica a qué elemento de la instalación pertenece
              la fotografía.
            </Text>

            {isLoading ? (
              <View
                style={
                  styles.loadingCard
                }
              >
                <ActivityIndicator
                  size="small"
                  color={
                    colors.primary
                  }
                />

                <Text
                  style={
                    styles.loadingText
                  }
                >
                  Cargando instalación...
                </Text>
              </View>
            ) : error ? (
              <View
                style={
                  styles.errorCard
                }
              >
                <View
                  style={
                    styles.errorIcon
                  }
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={25}
                    color="#dc2626"
                  />
                </View>

                <Text
                  style={
                    styles.errorText
                  }
                >
                  {error}
                </Text>

                <Pressable
                  style={
                    styles.retryButton
                  }
                  onPress={
                    loadInstallation
                  }
                >
                  <Text
                    style={
                      styles.retryButtonText
                    }
                  >
                    Reintentar
                  </Text>
                </Pressable>
              </View>
            ) : items.length === 0 ? (
              <View
                style={
                  styles.emptyCard
                }
              >
                <View
                  style={
                    styles.emptyIcon
                  }
                >
                  <Ionicons
                    name="cube-outline"
                    size={30}
                    color={
                      colors.muted
                    }
                  />
                </View>

                <Text
                  style={
                    styles.emptyTitle
                  }
                >
                  No hay elementos disponibles
                </Text>

                <Text
                  style={
                    styles.emptyText
                  }
                >
                  Esta instalación no tiene elementos registrados
                  para seleccionar.
                </Text>
              </View>
            ) : (
              <Pressable
                style={[
                  styles.picker,
                  selectedItem &&
                    styles.pickerSelected,
                ]}
                onPress={() =>
                  setIsPmiPickerOpen(
                    true,
                  )
                }
                disabled={
                  isUploadingCollectionPhoto
                }
              >
                <View
                  style={
                    styles.pickerIcon
                  }
                >
                  <Ionicons
                    name="location-outline"
                    size={22}
                    color={
                      colors.primary
                    }
                  />
                </View>

                <View
                  style={
                    styles.pickerContent
                  }
                >
                  {selectedItem ? (
                    <>
                      <Text
                        style={
                          styles.pickerLabel
                        }
                      >
                        Elemento seleccionado
                      </Text>

                      <Text
                        style={
                          styles.pickerValue
                        }
                        numberOfLines={2}
                      >
                        {selectedItem.name}
                      </Text>

                      {!!selectedItem.specificLocation && (
                        <Text
                          style={
                            styles.pickerLocation
                          }
                          numberOfLines={
                            2
                          }
                        >
                          {
                            selectedItem.specificLocation
                          }
                        </Text>
                      )}
                    </>
                  ) : (
                    <>
                      <Text
                        style={
                          styles.pickerPlaceholder
                        }
                      >
                        Selecciona un elemento
                      </Text>

                      <Text
                        style={
                          styles.pickerHint
                        }
                      >
                        Toca para ver los elementos disponibles
                      </Text>
                    </>
                  )}
                </View>

                <Ionicons
                  name="chevron-down"
                  size={20}
                  color={colors.muted}
                />
              </Pressable>
            )}
          </View>

          {/* =================================================
              SERVICIO
          ================================================= */}

          {selectedItem && (
            <View
              style={
                styles.serviceCard
              }
            >
              <View
                style={
                  styles.serviceIcon
                }
              >
                <Ionicons
                  name="briefcase-outline"
                  size={22}
                  color={
                    colors.primary
                  }
                />
              </View>

              <View
                style={
                  styles.serviceContent
                }
              >
                <Text
                  style={
                    styles.serviceLabel
                  }
                >
                  SERVICIO
                </Text>

                {isLoadingServices ? (
                  <View
                    style={
                      styles.serviceLoading
                    }
                  >
                    <ActivityIndicator
                      size="small"
                      color={
                        colors.primary
                      }
                    />

                    <Text
                      style={
                        styles.serviceLoadingText
                      }
                    >
                      Consultando servicio...
                    </Text>
                  </View>
                ) : selectedService ? (
                  <>
                    <Text
                      style={
                        styles.serviceName
                      }
                      numberOfLines={2}
                    >
                      {
                        selectedService.name
                      }
                    </Text>

                    {!!selectedService.description && (
                      <Text
                        style={
                          styles.serviceDescription
                        }
                        numberOfLines={
                          3
                        }
                      >
                        {
                          selectedService.description
                        }
                      </Text>
                    )}
                  </>
                ) : (
                  <>
                    <Text
                      style={
                        styles.serviceName
                      }
                    >
                      Servicio no identificado
                    </Text>

                    <Text
                      style={
                        styles.serviceDescription
                      }
                    >
                      Se utilizarán categorías generales.
                    </Text>
                  </>
                )}
              </View>
            </View>
          )}

          {/* =================================================
              TIPO
          ================================================= */}

          {selectedItem && (
            <View
              style={
                styles.photoTypeSection
              }
            >
              <Text
                style={
                  styles.sectionLabel
                }
              >
                ¿Qué fotografía estás recabando?
              </Text>

              <Text
                style={
                  styles.sectionDescription
                }
              >
                Selecciona la categoría y después el tipo exacto
                de fotografía.
              </Text>

              <Pressable
                style={[
                  styles.photoTypePicker,
                  selectedPhotoType &&
                    styles.photoTypePickerSelected,
                ]}
                onPress={
                  handleOpenPhotoTypePicker
                }
                disabled={
                  isUploadingCollectionPhoto
                }
              >
                <View
                  style={
                    styles.photoTypeIcon
                  }
                >
                  <Ionicons
                    name={
                      selectedGroup?.icon ??
                      'camera-outline'
                    }
                    size={22}
                    color={
                      colors.primary
                    }
                  />
                </View>

                <View
                  style={
                    styles.photoTypeContent
                  }
                >
                  {selectedPhotoType ? (
                    <>
                      <Text
                        style={
                          styles.pickerLabel
                        }
                      >
                        Tipo de fotografía
                      </Text>

                      <Text
                        style={
                          styles.pickerValue
                        }
                        numberOfLines={2}
                      >
                        {
                          selectedPhotoType
                        }
                      </Text>

                      <Text
                        style={
                          styles.pickerLocation
                        }
                      >
                        {
                          selectedGroup?.name
                        }
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text
                        style={
                          styles.pickerPlaceholder
                        }
                      >
                        Selecciona el tipo de fotografía
                      </Text>

                      <Text
                        style={
                          styles.pickerHint
                        }
                      >
                        Opciones adaptadas al servicio seleccionado
                      </Text>
                    </>
                  )}
                </View>

                <Ionicons
                  name="chevron-down"
                  size={20}
                  color={colors.muted}
                />
              </Pressable>

              {!!servicesError && (
                <Text
                  style={
                    styles.warningText
                  }
                >
                  {servicesError}
                </Text>
              )}
            </View>
          )}

          {/* =================================================
              RESUMEN
          ================================================= */}

          {selectedItem &&
            selectedPhotoType &&
            selectedGroup && (
              <View
                style={
                  styles.selectionSummary
                }
              >
                <View
                  style={
                    styles.selectionSummaryHeader
                  }
                >
                  <View
                    style={
                      styles.summaryCheck
                    }
                  >
                    <Ionicons
                      name="checkmark"
                      size={17}
                      color={
                        colors.primary
                      }
                    />
                  </View>

                  <Text
                    style={
                      styles.selectionSummaryTitle
                    }
                  >
                    Datos de la fotografía
                  </Text>
                </View>

                <View
                  style={
                    styles.summaryDivider
                  }
                />

                <View
                  style={
                    styles.summaryRow
                  }
                >
                  <Text
                    style={
                      styles.summaryLabel
                    }
                  >
                    Instalación
                  </Text>

                  <Text
                    style={
                      styles.summaryValue
                    }
                    numberOfLines={2}
                  >
                    {installationName}
                  </Text>
                </View>

                <View
                  style={
                    styles.summaryRow
                  }
                >
                  <Text
                    style={
                      styles.summaryLabel
                    }
                  >
                    Elemento
                  </Text>

                  <Text
                    style={
                      styles.summaryValue
                    }
                    numberOfLines={2}
                  >
                    {selectedItem.name}
                  </Text>
                </View>

                {selectedService && (
                  <View
                    style={
                      styles.summaryRow
                    }
                  >
                    <Text
                      style={
                        styles.summaryLabel
                      }
                    >
                      Servicio
                    </Text>

                    <Text
                      style={
                        styles.summaryValue
                      }
                      numberOfLines={2}
                    >
                      {
                        selectedService.name
                      }
                    </Text>
                  </View>
                )}

                <View
                  style={
                    styles.summaryRow
                  }
                >
                  <Text
                    style={
                      styles.summaryLabel
                    }
                  >
                    Categoría
                  </Text>

                  <Text
                    style={
                      styles.summaryValue
                    }
                    numberOfLines={2}
                  >
                    {
                      selectedGroup.name
                    }
                  </Text>
                </View>

                <View
                  style={
                    styles.summaryRow
                  }
                >
                  <Text
                    style={
                      styles.summaryLabel
                    }
                  >
                    Tipo
                  </Text>

                  <Text
                    style={
                      styles.summaryValue
                    }
                    numberOfLines={2}
                  >
                    {
                      selectedPhotoType
                    }
                  </Text>
                </View>
              </View>
            )}

          {/* =================================================
              CAPTURA
          ================================================= */}

          {selectedItem &&
            selectedGroup &&
            selectedPhotoType && (
              <View
                style={
                  styles.captureSection
                }
              >
                <View
                  style={
                    styles.captureHeader
                  }
                >
                  <View
                    style={
                      styles.captureStepBadge
                    }
                  >
                    <Text
                      style={
                        styles.captureStepBadgeText
                      }
                    >
                      4
                    </Text>
                  </View>

                  <View
                    style={
                      styles.captureHeaderContent
                    }
                  >
                    <Text
                      style={
                        styles.sectionLabel
                      }
                    >
                      Recabar fotografía
                    </Text>

                    <Text
                      style={
                        styles.sectionDescription
                      }
                    >
                      Toma la fotografía con la cámara o selecciona
                      una existente de la galería.
                    </Text>
                  </View>
                </View>

                {!selectedPhoto ? (
                  <View
                    style={
                      styles.captureOptions
                    }
                  >
                    <Pressable
                      style={[
                        styles.captureOption,
                        isCapturingPhoto &&
                          styles.captureOptionDisabled,
                      ]}
                      onPress={
                        handleTakePhoto
                      }
                      disabled={
                        isCapturingPhoto ||
                        isUploadingCollectionPhoto
                      }
                    >
                      <View
                        style={
                          styles.captureOptionIcon
                        }
                      >
                        {isCapturingPhoto ? (
                          <ActivityIndicator
                            size="small"
                            color={
                              colors.primary
                            }
                          />
                        ) : (
                          <Ionicons
                            name="camera-outline"
                            size={30}
                            color={
                              colors.primary
                            }
                          />
                        )}
                      </View>

                      <Text
                        style={
                          styles.captureOptionTitle
                        }
                      >
                        Tomar fotografía
                      </Text>

                      <Text
                        style={
                          styles.captureOptionDescription
                        }
                      >
                        Abrir cámara
                      </Text>
                    </Pressable>

                    <Pressable
                      style={[
                        styles.captureOption,
                        isCapturingPhoto &&
                          styles.captureOptionDisabled,
                      ]}
                      onPress={
                        handlePickPhoto
                      }
                      disabled={
                        isCapturingPhoto ||
                        isUploadingCollectionPhoto
                      }
                    >
                      <View
                        style={
                          styles.captureOptionIcon
                        }
                      >
                        <Ionicons
                          name="images-outline"
                          size={30}
                          color={
                            colors.primary
                          }
                        />
                      </View>

                      <Text
                        style={
                          styles.captureOptionTitle
                        }
                      >
                        Elegir de galería
                      </Text>

                      <Text
                        style={
                          styles.captureOptionDescription
                        }
                      >
                        Seleccionar imagen
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <View
                    style={
                      styles.photoPreviewCard
                    }
                  >
                    {/* FOTO */}

                    <View
                      style={
                        styles.photoPreviewHeader
                      }
                    >
                      <View
                        style={
                          styles.photoPreviewHeaderContent
                        }
                      >
                        <Text
                          style={
                            styles.photoPreviewTitle
                          }
                        >
                          Fotografía seleccionada
                        </Text>

                        <Text
                          style={
                            styles.photoPreviewFileName
                          }
                          numberOfLines={1}
                        >
                          {selectedPhoto.fileName ??
                            'Imagen seleccionada'}
                        </Text>
                      </View>

                      <Pressable
                        style={
                          styles.removePhotoButton
                        }
                        onPress={
                          handleRemovePhoto
                        }
                        disabled={
                          isUploadingCollectionPhoto
                        }
                        hitSlop={8}
                      >
                        <Ionicons
                          name="close"
                          size={20}
                          color={
                            colors.text
                          }
                        />
                      </Pressable>
                    </View>

                    <Image
                      source={{
                        uri: selectedPhoto.uri,
                      }}
                      style={
                        styles.photoPreview
                      }
                      resizeMode="cover"
                    />

                    {/* INFO */}

                    <View
                      style={
                        styles.photoPreviewInfo
                      }
                    >
                      <View
                        style={
                          styles.photoInfoRow
                        }
                      >
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={18}
                          color={
                            colors.primary
                          }
                        />

                        <Text
                          style={
                            styles.photoInfoText
                          }
                        >
                          Fotografía lista para guardar.
                        </Text>
                      </View>

                      <View
                        style={
                          styles.photoInfoRow
                        }
                      >
                        <Ionicons
                          name="hardware-chip-outline"
                          size={18}
                          color={
                            colors.muted
                          }
                        />

                        <Text
                          style={
                            styles.photoInfoText
                          }
                          numberOfLines={2}
                        >
                          Instalación: {installationName}
                        </Text>
                      </View>

                      <View
                        style={
                          styles.photoInfoRow
                        }
                      >
                        <Ionicons
                          name="hardware-chip-outline"
                          size={18}
                          color={
                            colors.muted
                          }
                        />

                        <Text
                          style={
                            styles.photoInfoText
                          }
                          numberOfLines={2}
                        >
                          Elemento: {selectedItem.name}
                        </Text>
                      </View>

                      <View
                        style={
                          styles.photoInfoRow
                        }
                      >
                        <Ionicons
                          name={
                            selectedGroup.icon
                          }
                          size={18}
                          color={
                            colors.muted
                          }
                        />

                        <Text
                          style={
                            styles.photoInfoText
                          }
                          numberOfLines={2}
                        >
                          {
                            selectedGroup.name
                          }{' '}
                          ·{' '}
                          {
                            selectedPhotoType
                          }
                        </Text>
                      </View>

                      <View
                        style={
                          styles.photoInfoRow
                        }
                      >
                        <Ionicons
                          name="location-outline"
                          size={18}
                          color={
                            photoLocation
                              ? colors.primary
                              : colors.muted
                          }
                        />

                        <View
                          style={
                            styles.photoLocationContent
                          }
                        >
                          <Text
                            style={
                              styles.photoInfoText
                            }
                          >
                            {isGettingLocation
                              ? 'Obteniendo ubicación...'
                              : photoLocation
                                ? 'Ubicación obtenida'
                                : 'Ubicación no disponible'}
                          </Text>

                          {photoLocation && (
                            <Text
                              style={
                                styles.photoCoordinates
                              }
                            >
                              {
                                photoLocation.latitude
                              }
                              ,{' '}
                              {
                                photoLocation.longitude
                              }
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>

                    {/* CAMBIAR */}

                    <View
                      style={
                        styles.photoPreviewActions
                      }
                    >
                      <Pressable
                        style={
                          styles.changePhotoButton
                        }
                        onPress={
                          handleTakePhoto
                        }
                        disabled={
                          isCapturingPhoto ||
                          isUploadingCollectionPhoto
                        }
                      >
                        <Ionicons
                          name="camera-outline"
                          size={19}
                          color={
                            colors.text
                          }
                        />

                        <Text
                          style={
                            styles.changePhotoButtonText
                          }
                        >
                          Tomar otra
                        </Text>
                      </Pressable>

                      <Pressable
                        style={
                          styles.changePhotoButton
                        }
                        onPress={
                          handlePickPhoto
                        }
                        disabled={
                          isCapturingPhoto ||
                          isUploadingCollectionPhoto
                        }
                      >
                        <Ionicons
                          name="images-outline"
                          size={19}
                          color={
                            colors.text
                          }
                        />

                        <Text
                          style={
                            styles.changePhotoButtonText
                          }
                        >
                          Cambiar
                        </Text>
                      </Pressable>
                    </View>

                    {/* GUARDAR */}

                    <View
                      style={
                        styles.savePhotoContainer
                      }
                    >
                      <Pressable
                        style={[
                          styles.savePhotoButton,
                          isUploadingCollectionPhoto &&
                            styles.savePhotoButtonDisabled,
                        ]}
                        onPress={
                          handleUploadCollectionPhoto
                        }
                        disabled={
                          isUploadingCollectionPhoto ||
                          isGettingLocation
                        }
                      >
                        {isUploadingCollectionPhoto ? (
                          <>
                            <ActivityIndicator
                              size="small"
                              color={
                                colors.background
                              }
                            />

                            <Text
                              style={
                                styles.savePhotoButtonText
                              }
                            >
                              {
                                collectionUploadProgress?.label ??
                                'Guardando fotografía…'
                              }
                            </Text>
                          </>
                        ) : (
                          <>
                            <Ionicons
                              name="cloud-upload-outline"
                              size={20}
                              color={
                                colors.background
                              }
                            />

                            <Text
                              style={
                                styles.savePhotoButtonText
                              }
                            >
                              Guardar fotografía
                            </Text>
                          </>
                        )}
                      </Pressable>

                      {!!collectionUploadProgress &&
                        isUploadingCollectionPhoto && (
                          <Text
                            style={
                              styles.uploadProgressText
                            }
                          >
                            Paso{' '}
                            {
                              collectionUploadProgress.current
                            }{' '}
                            de{' '}
                            {
                              collectionUploadProgress.total
                            }
                          </Text>
                        )}

                      {!!collectionUploadMessage && (
                        <Text
                          style={
                            styles.collectionUploadMessage
                          }
                        >
                          {
                            collectionUploadMessage
                          }
                        </Text>
                      )}
                    </View>

                    {!isUploadingCollectionPhoto && (
                      <View
                        style={
                          styles.photoPendingNotice
                        }
                      >
                        <Ionicons
                          name="information-circle-outline"
                          size={18}
                          color={
                            colors.muted
                          }
                        />

                        <Text
                          style={
                            styles.photoPendingNoticeText
                          }
                        >
                          La fotografía se guardará asociada a la instalación y al elemento,
                          categoría, tipo de fotografía y ubicación
                          obtenida.
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}
        </ScrollView>
      </View>

      {/* =====================================================
          MODAL ELEMENTOS
      ===================================================== */}

      <Modal
        visible={
          isPmiPickerOpen
        }
        transparent
        animationType="slide"
        onRequestClose={() =>
          setIsPmiPickerOpen(false)
        }
      >
        <View
          style={
            styles.modalOverlay
          }
        >
          <Pressable
            style={
              styles.modalBackdrop
            }
            onPress={() =>
              setIsPmiPickerOpen(
                false,
              )
            }
          />

          <View
            style={
              styles.modalCard
            }
          >
            <View
              style={
                styles.modalHeader
              }
            >
              <View
                style={
                  styles.modalTitleContainer
                }
              >
                <Text
                  style={
                    styles.modalTitle
                  }
                >
                  Selecciona el elemento
                </Text>

                <Text
                  style={
                    styles.modalSubtitle
                  }
                >
                  Elige el elemento al que pertenece la fotografía.
                </Text>
              </View>

              <Pressable
                style={
                  styles.closeButton
                }
                onPress={() =>
                  setIsPmiPickerOpen(
                    false,
                  )
                }
              >
                <Ionicons
                  name="close"
                  size={22}
                  color={
                    colors.text
                  }
                />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={
                false
              }
              contentContainerStyle={
                styles.modalList
              }
            >
              {items.map(
                (item, index) => {
                  const isSelected =
                    selectedItem?.id ===
                    item.id;

                  const service =
                    serviceCategories.find(
                      (current) =>
                        current.id ===
                        item.serviceCategoryId,
                    );

                  return (
                    <Pressable
                      key={item.id}
                      style={[
                        styles.itemOption,
                        isSelected &&
                          styles.itemOptionSelected,
                      ]}
                      onPress={() =>
                        handleSelectItem(
                          item,
                        )
                      }
                      disabled={
                        isUploadingCollectionPhoto
                      }
                    >
                      <View
                        style={[
                          styles.itemNumber,
                          isSelected &&
                            styles.itemNumberSelected,
                        ]}
                      >
                        {isSelected ? (
                          <Ionicons
                            name="checkmark"
                            size={20}
                            color={
                              colors.primary
                            }
                          />
                        ) : (
                          <Text
                            style={
                              styles.itemNumberText
                            }
                          >
                            {index + 1}
                          </Text>
                        )}
                      </View>

                      <View
                        style={
                          styles.itemContent
                        }
                      >
                        <Text
                          style={
                            styles.itemName
                          }
                        >
                          {item.name}
                        </Text>

                        {!!item.specificLocation && (
                          <View
                            style={
                              styles.locationRow
                            }
                          >
                            <Ionicons
                              name="location-outline"
                              size={14}
                              color={
                                colors.muted
                              }
                            />

                            <Text
                              style={
                                styles.itemLocation
                              }
                              numberOfLines={
                                2
                              }
                            >
                              {
                                item.specificLocation
                              }
                            </Text>
                          </View>
                        )}

                        {!!item.serviceType && (
                          <Text
                            style={
                              styles.itemService
                            }
                          >
                            {
                              item.serviceType
                            }
                          </Text>
                        )}

                        {!!service?.code && (
                          <Text
                            style={
                              styles.itemServiceCode
                            }
                          >
                            {service.code}
                          </Text>
                        )}
                      </View>

                      {isSelected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={24}
                          color={
                            colors.primary
                          }
                        />
                      )}
                    </Pressable>
                  );
                },
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* =====================================================
          MODAL TIPO DE FOTO
      ===================================================== */}

      <Modal
        visible={
          isPhotoTypePickerOpen
        }
        transparent
        animationType="slide"
        onRequestClose={() =>
          setIsPhotoTypePickerOpen(
            false,
          )
        }
      >
        <View
          style={
            styles.modalOverlay
          }
        >
          <Pressable
            style={
              styles.modalBackdrop
            }
            onPress={() =>
              setIsPhotoTypePickerOpen(
                false,
              )
            }
          />

          <View
            style={
              styles.photoModalCard
            }
          >
            <View
              style={
                styles.modalHeader
              }
            >
              <View
                style={
                  styles.modalTitleContainer
                }
              >
                <Text
                  style={
                    styles.modalTitle
                  }
                >
                  ¿Qué fotografía estás recabando?
                </Text>

                <Text
                  style={
                    styles.modalSubtitle
                  }
                >
                  {selectedService?.name ??
                    'Selecciona una categoría'}
                </Text>
              </View>

              <Pressable
                style={
                  styles.closeButton
                }
                onPress={() =>
                  setIsPhotoTypePickerOpen(
                    false,
                  )
                }
              >
                <Ionicons
                  name="close"
                  size={22}
                  color={
                    colors.text
                  }
                />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={
                false
              }
              contentContainerStyle={
                styles.modalList
              }
            >
              {photoGroups.map(
                (group) => {
                  const isGroupSelected =
                    selectedGroup?.id ===
                    group.id;

                  return (
                    <View
                      key={group.id}
                    >
                      <Pressable
                        style={[
                          styles.photoGroupOption,
                          isGroupSelected &&
                            styles.photoGroupOptionSelected,
                        ]}
                        onPress={() =>
                          handleSelectGroup(
                            group,
                          )
                        }
                        disabled={
                          isUploadingCollectionPhoto
                        }
                      >
                        <View
                          style={
                            styles.photoGroupIcon
                          }
                        >
                          <Ionicons
                            name={
                              group.icon
                            }
                            size={23}
                            color={
                              colors.primary
                            }
                          />
                        </View>

                        <View
                          style={
                            styles.photoGroupContent
                          }
                        >
                          <Text
                            style={
                              styles.photoGroupName
                            }
                          >
                            {
                              group.name
                            }
                          </Text>

                          <Text
                            style={
                              styles.photoGroupDescription
                            }
                            numberOfLines={
                              2
                            }
                          >
                            {
                              group.description
                            }
                          </Text>

                          <Text
                            style={
                              styles.photoGroupCount
                            }
                          >
                            {
                              group.items
                                .length
                            }{' '}
                            {group.items
                              .length ===
                            1
                              ? 'opción'
                              : 'opciones'}
                          </Text>
                        </View>

                        <Ionicons
                          name={
                            isGroupSelected
                              ? 'chevron-down'
                              : 'chevron-forward'
                          }
                          size={21}
                          color={
                            colors.primary
                          }
                        />
                      </Pressable>

                      {isGroupSelected && (
                        <View
                          style={
                            styles.subcategoryContainer
                          }
                        >
                          <Text
                            style={
                              styles.subcategoryTitle
                            }
                          >
                            {
                              group.name
                            }
                          </Text>

                          {group.items.map(
                            (item) => {
                              const isSelected =
                                selectedPhotoType ===
                                item;

                              return (
                                <Pressable
                                  key={
                                    item
                                  }
                                  style={[
                                    styles.subcategoryOption,
                                    isSelected &&
                                      styles.subcategoryOptionSelected,
                                  ]}
                                  onPress={() =>
                                    handleSelectPhotoType(
                                      group,
                                      item,
                                    )
                                  }
                                  disabled={
                                    isUploadingCollectionPhoto
                                  }
                                >
                                  <View
                                    style={
                                      styles.subcategoryBullet
                                    }
                                  >
                                    <Ionicons
                                      name={
                                        isSelected
                                          ? 'checkmark'
                                          : 'ellipse-outline'
                                      }
                                      size={
                                        isSelected
                                          ? 17
                                          : 15
                                      }
                                      color={
                                        colors.primary
                                      }
                                    />
                                  </View>

                                  <Text
                                    style={
                                      styles.subcategoryText
                                    }
                                  >
                                    {
                                      item
                                    }
                                  </Text>

                                  {isSelected && (
                                    <Ionicons
                                      name="checkmark-circle"
                                      size={
                                        20
                                      }
                                      color={
                                        colors.primary
                                      }
                                    />
                                  )}
                                </Pressable>
                              );
                            },
                          )}
                        </View>
                      )}
                    </View>
                  );
                },
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* =========================================================
   ESTILOS
========================================================= */

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor:
      colors.background,
  },

  container: {
    flex: 1,
    paddingHorizontal:
      spacing.lg,
    paddingTop: spacing.md,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom:
      spacing.lg,
  },

  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor:
      colors.border,
    borderRadius:
      radius.sm,
    backgroundColor:
      colors.surface,
  },

  headerTextContainer: {
    flex: 1,
    gap: 2,
  },

  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
  },

  subtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },

  scrollView: {
    flex: 1,
  },

  content: {
    paddingBottom:
      spacing.xl,
    gap: spacing.lg,
  },

  section: {
    gap: spacing.sm,
  },

  photoTypeSection: {
    gap: spacing.sm,
  },

  sectionLabel: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },

  sectionDescription: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom:
      spacing.xs,
  },

  /* =======================================================
     ELEMENTO
  ======================================================= */

  picker: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor:
      colors.border,
    borderRadius:
      radius.md,
    backgroundColor:
      colors.surface,
    paddingHorizontal:
      spacing.md,
    paddingVertical:
      spacing.sm,
  },

  pickerSelected: {
    borderColor: '#93c5fd',
    backgroundColor:
      colors.primarySoft,
  },

  pickerIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius:
      radius.sm,
    backgroundColor:
      colors.primarySoft,
  },

  pickerContent: {
    flex: 1,
    gap: 2,
  },

  pickerLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    textTransform:
      'uppercase',
  },

  pickerValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 21,
  },

  pickerLocation: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },

  pickerPlaceholder: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },

  pickerHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },

  /* =======================================================
     SERVICIO
  ======================================================= */

  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius:
      radius.md,
    backgroundColor:
      colors.primarySoft,
    padding:
      spacing.md,
  },

  serviceIcon: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius:
      radius.sm,
    backgroundColor:
      colors.background,
  },

  serviceContent: {
    flex: 1,
    gap: 2,
  },

  serviceLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },

  serviceName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },

  serviceDescription: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
  },

  serviceLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },

  serviceLoadingText: {
    color: colors.muted,
    fontSize: 12,
  },

  warningText: {
    color: '#92400e',
    fontSize: 11,
    lineHeight: 16,
  },

  /* =======================================================
     TIPO
  ======================================================= */

  photoTypePicker: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor:
      colors.border,
    borderRadius:
      radius.md,
    backgroundColor:
      colors.surface,
    paddingHorizontal:
      spacing.md,
    paddingVertical:
      spacing.sm,
  },

  photoTypePickerSelected: {
    borderColor: '#93c5fd',
    backgroundColor:
      colors.primarySoft,
  },

  photoTypeIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius:
      radius.sm,
    backgroundColor:
      colors.primarySoft,
  },

  photoTypeContent: {
    flex: 1,
    gap: 2,
  },

  /* =======================================================
     RESUMEN
  ======================================================= */

  selectionSummary: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius:
      radius.md,
    backgroundColor:
      colors.primarySoft,
    padding:
      spacing.md,
  },

  selectionSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },

  summaryCheck: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor:
      colors.background,
  },

  selectionSummaryTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },

  summaryDivider: {
    height: 1,
    backgroundColor: '#dbeafe',
  },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },

  summaryLabel: {
    width: 75,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },

  summaryValue: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },

  /* =======================================================
     ESTADOS
  ======================================================= */

  loadingCard: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor:
      colors.border,
    borderRadius:
      radius.md,
    backgroundColor:
      colors.surface,
  },

  loadingText: {
    color: colors.muted,
    fontSize: 13,
  },

  errorCard: {
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius:
      radius.md,
    backgroundColor:
      '#fef2f2',
    padding:
      spacing.lg,
  },

  errorIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor:
      '#fee2e2',
  },

  errorText: {
    color: '#991b1b',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },

  retryButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius:
      radius.sm,
    backgroundColor:
      colors.primary,
    paddingHorizontal:
      spacing.lg,
  },

  retryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },

  emptyCard: {
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor:
      colors.border,
    borderRadius:
      radius.md,
    backgroundColor:
      colors.surface,
    padding:
      spacing.lg,
  },

  emptyIcon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    backgroundColor:
      '#eef2f7',
  },

  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },

  emptyText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },

  /* =======================================================
     CAPTURA
  ======================================================= */

  captureSection: {
    gap: spacing.md,
  },

  captureHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },

  captureStepBadge: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor:
      colors.primarySoft,
  },

  captureStepBadgeText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },

  captureHeaderContent: {
    flex: 1,
  },

  captureOptions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },

  captureOption: {
    flex: 1,
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor:
      colors.border,
    borderRadius:
      radius.md,
    backgroundColor:
      colors.surface,
    padding:
      spacing.md,
  },

  captureOptionDisabled: {
    opacity: 0.55,
  },

  captureOptionIcon: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 29,
    backgroundColor:
      colors.primarySoft,
    marginBottom:
      spacing.sm,
  },

  captureOptionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },

  captureOptionDescription: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 11,
    textAlign: 'center',
  },

  /* =======================================================
     PREVIEW
  ======================================================= */

  photoPreviewCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor:
      colors.border,
    borderRadius:
      radius.md,
    backgroundColor:
      colors.surface,
  },

  photoPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
    gap: spacing.sm,
    padding:
      spacing.md,
  },

  photoPreviewHeaderContent: {
    flex: 1,
  },

  photoPreviewTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },

  photoPreviewFileName: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 11,
  },

  removePhotoButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor:
      colors.border,
    borderRadius:
      radius.sm,
    backgroundColor:
      colors.background,
  },

  photoPreview: {
    width: '100%',
    height: 280,
    backgroundColor:
      colors.background,
  },

  photoPreviewInfo: {
    gap: spacing.sm,
    padding:
      spacing.md,
  },

  photoInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },

  photoInfoText: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    lineHeight: 17,
  },

  photoLocationContent: {
    flex: 1,
  },

  photoCoordinates: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'monospace',
  },

  photoPreviewActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal:
      spacing.md,
    paddingBottom:
      spacing.md,
  },

  changePhotoButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor:
      colors.border,
    borderRadius:
      radius.sm,
    backgroundColor:
      colors.background,
  },

  changePhotoButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },

  /* =======================================================
     GUARDAR
  ======================================================= */

  savePhotoContainer: {
    paddingHorizontal:
      spacing.md,
    paddingBottom:
      spacing.md,
  },

  savePhotoButton: {
    minHeight: 52,
    borderRadius:
      radius.md,
    backgroundColor:
      colors.primary,
    paddingHorizontal:
      spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },

  savePhotoButtonDisabled: {
    opacity: 0.65,
  },

  savePhotoButtonText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '800',
  },

  uploadProgressText: {
    marginTop: spacing.xs,
    color: colors.muted,
    fontSize: 11,
    textAlign: 'center',
  },

  collectionUploadMessage: {
    marginTop: spacing.sm,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },

  photoPendingNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal:
      spacing.md,
    paddingBottom:
      spacing.md,
  },

  photoPendingNoticeText: {
    flex: 1,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
  },

  /* =======================================================
     MODALES
  ======================================================= */

  modalOverlay: {
    flex: 1,
    justifyContent:
      'flex-end',
  },

  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor:
      'rgba(0, 0, 0, 0.35)',
  },

  modalCard: {
    maxHeight: '82%',
    borderTopLeftRadius:
      radius.lg,
    borderTopRightRadius:
      radius.lg,
    backgroundColor:
      colors.background,
    paddingTop:
      spacing.lg,
    paddingHorizontal:
      spacing.lg,
    paddingBottom:
      spacing.xl,
  },

  photoModalCard: {
    maxHeight: '90%',
    borderTopLeftRadius:
      radius.lg,
    borderTopRightRadius:
      radius.lg,
    backgroundColor:
      colors.background,
    paddingTop:
      spacing.lg,
    paddingHorizontal:
      spacing.lg,
    paddingBottom:
      spacing.xl,
  },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom:
      spacing.md,
  },

  modalTitleContainer: {
    flex: 1,
    gap: 3,
  },

  modalTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 25,
  },

  modalSubtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },

  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor:
      colors.border,
    borderRadius:
      radius.sm,
    backgroundColor:
      colors.surface,
  },

  modalList: {
    gap: spacing.sm,
    paddingBottom:
      spacing.lg,
  },

  /* =======================================================
     ELEMENT OPTIONS
  ======================================================= */

  itemOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor:
      colors.border,
    borderRadius:
      radius.md,
    backgroundColor:
      colors.surface,
    padding:
      spacing.md,
  },

  itemOptionSelected: {
    borderColor: '#93c5fd',
    backgroundColor:
      colors.primarySoft,
  },

  itemNumber: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor:
      '#eef2f7',
  },

  itemNumberSelected: {
    backgroundColor:
      '#dbeafe',
  },

  itemNumberText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '800',
  },

  itemContent: {
    flex: 1,
    gap: 3,
  },

  itemName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },

  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 3,
  },

  itemLocation: {
    flex: 1,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },

  itemService: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },

  itemServiceCode: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '600',
  },

  /* =======================================================
     GRUPOS
  ======================================================= */

  photoGroupOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor:
      colors.border,
    borderRadius:
      radius.md,
    backgroundColor:
      colors.surface,
    padding:
      spacing.md,
  },

  photoGroupOptionSelected: {
    borderColor: '#93c5fd',
    backgroundColor:
      colors.primarySoft,
  },

  photoGroupIcon: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius:
      radius.sm,
    backgroundColor:
      colors.primarySoft,
  },

  photoGroupContent: {
    flex: 1,
    gap: 3,
  },

  photoGroupName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },

  photoGroupDescription: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
  },

  photoGroupCount: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '700',
  },

  subcategoryContainer: {
    gap: spacing.xs,
    marginTop:
      spacing.xs,
    paddingLeft:
      spacing.md,
    paddingRight:
      spacing.xs,
  },

  subcategoryTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    marginBottom:
      spacing.xs,
  },

  subcategoryOption: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor:
      colors.border,
    borderRadius:
      radius.sm,
    backgroundColor:
      colors.surface,
    paddingHorizontal:
      spacing.md,
  },

  subcategoryOptionSelected: {
    borderColor: '#93c5fd',
    backgroundColor:
      colors.primarySoft,
  },

  subcategoryBullet: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  subcategoryText: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
});