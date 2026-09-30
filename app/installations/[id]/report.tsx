// app/installations/[id]/report.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Image,
  Alert,
  Dimensions,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import { colors, radius, spacing } from '../../../constants/theme';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabase';
import { StatusChip } from '../../../components/admin/StatusChip';
import { formatDate, formatDateTime } from '../../../lib/date';
import { fetchInstallationByIdAdmin } from '../../../hooks/useInstallations';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Asset } from 'expo-asset';
import JSZip from 'jszip';
import SignaturePad from '../../../components/SignaturePad';

const { width } = Dimensions.get('window');

const ACTA_TEMPLATE = require(
  '../../../assets/templates/acta-instalacion-template-app.docx'
);

type Equipment = {
  id: string;
  serial_number: string;
  brand: string;
  model: string;
  status: string;
  created_at: string;
};

type PhotoWithUrl = {
  id: string;
  url: string;
  category: string;
  created_at: string;
  latitud: number | null;
  longitud: number | null;
  tiene_ubicacion: boolean;
  uploader_name_snapshot: string | null;
  comment: string | null;
  base64?: string;
};

type HandoffData = {
  id: string;
  status: string;
  technician_name_snapshot: string;
  recipient_name: string;
  signature_storage_path: string | null;
  submitted_at: string;
  approved_at: string | null;
  final_notes: string | null;
  project_name_snapshot: string;
  client_name_snapshot: string;
  address_snapshot: string;
  organization_name_snapshot: string;
  installation_item_id: string | null;
};

type ReportEquipment = {
  id: string;
  equipmentType: string;
  serialNumber: string;
  brand: string;
  model: string;
  location: string;
  observations: string;
  isManual: boolean;
};

type ReportReviewData = {
  projectName: string;
  clientName: string;
  address: string;
  technicianName: string;
  organizationName: string;
  serviceName: string;
  serviceType: string;
  location: string;
  vehicle: string;
  description: string;
  equipment: ReportEquipment[];
  tests: string;
  training: string;
  generalObservations: string;
  recipientName: string;
  recipientPosition: string;
  deliveryComments: string;
};

export default function InstallationReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { selectedMembership, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [installation, setInstallation] = useState<any>(null);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [photos, setPhotos] = useState<PhotoWithUrl[]>([]);
  const [handoff, setHandoff] = useState<HandoffData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [reportVersion, setReportVersion] = useState(1);
  const [signatureBase64Data, setSignatureBase64Data] = useState<string | null>(null);
  const [reviewData, setReviewData] = useState<ReportReviewData | null>(null);
  const [showReview, setShowReview] = useState(true);

  // ============================================================
  // CARGAR DATOS
  // ============================================================

  const loadData = useCallback(async () => {
    if (!id || !selectedMembership) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await fetchInstallationByIdAdmin(
        id,
        selectedMembership.organizationId
      );

      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      setInstallation(result.data);

      // ========================================================
      // EQUIPOS
      // ========================================================

      const { data: equipData, error: equipError } = await supabase
        .from('installation_equipment')
        .select(`
          id,
          installation_id,
          installation_item_id,
          technical_record_id,
          equipment_type,
          serial_number,
          brand,
          model,
          observations,
          detected_value,
          confirmed_value,
          capture_method,
          technician_user_id,
          technician_membership_id,
          created_at,
          updated_at
        `)
        .eq('installation_id', id)
        .order('created_at', { ascending: false });

      if (!equipError) {
        setEquipment(equipData || []);
      } else {
        console.warn('Error cargando equipos:', equipError);
        setEquipment([]);
      }

      // ========================================================
      // ELEMENTO DE INSTALACIÓN
      // ========================================================

      let installationItem: any = null;

      const installationItemId = equipData?.[0]?.installation_item_id;

      if (installationItemId) {
        const { data: itemData, error: itemError } = await supabase
          .from('installation_items')
          .select(`
            id,
            organization_id,
            installation_id,
            position,
            name,
            service_type,
            specific_location,
            status,
            observations,
            assigned_date,
            start_date,
            estimated_completion_date,
            started_at,
            completed_at,
            created_at,
            updated_at,
            item_role,
            service_category_id,
            work_type,
            work_description,
            legacy_service_type
          `)
          .eq('id', installationItemId)
          .maybeSingle();

        if (!itemError) {
          installationItem = itemData;
        } else {
          console.warn('Error cargando elemento de instalación:', itemError);
        }
      }

      // ========================================================
      // CATEGORÍA DE SERVICIO
      // ========================================================

      let serviceCategory: any = null;

      if (installationItem?.service_category_id) {
        const { data: categoryData, error: categoryError } = await supabase
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
          .eq('id', installationItem.service_category_id)
          .maybeSingle();

        if (!categoryError) {
          serviceCategory = categoryData;
        } else {
          console.warn('Error cargando categoría de servicio:', categoryError);
        }
      }

      // ========================================================
      // FOTOS CON BASE64
      // ========================================================

      const { data: photoData, error: photoError } = await supabase
        .from('installation_photos')
        .select('*')
        .eq('installation_id', id)
        .order('created_at', { ascending: false });

      if (!photoError) {
        const photosWithBase64 = await Promise.all(
          (photoData || []).map(async (photo) => {
            let base64 = '';
            let url = '';

            if (photo.storage_path) {
              try {
                const { data: urlData } = await supabase.storage
                  .from('installation-photos')
                  .createSignedUrl(photo.storage_path, 3600);

                url = urlData?.signedUrl || '';

                if (url) {
                  const response = await fetch(url);
                  const blob = await response.blob();
                  const reader = new FileReader();

                  base64 = await new Promise<string>((resolve) => {
                    reader.onload = () => {
                      const result = reader.result as string;
                      const base64Data = result.split(',')[1] || result;
                      resolve(base64Data);
                    };

                    reader.onerror = () => resolve('');
                    reader.readAsDataURL(blob);
                  });
                }
              } catch (e) {
                console.warn('Error obteniendo foto:', e);
              }
            }

            return {
              ...photo,
              url,
              base64,
              tiene_ubicacion:
                photo.latitud !== null &&
                photo.latitud !== undefined &&
                photo.longitud !== null &&
                photo.longitud !== undefined,
            };
          })
        );

        setPhotos(photosWithBase64);
      } else {
        console.warn('Error cargando fotos:', photoError);
        setPhotos([]);
      }

      // ========================================================
      // ENTREGA / RECEPCIÓN
      // ========================================================

      const { data: handoffData, error: handoffError } = await supabase
        .from('installation_handoffs')
        .select('*')
        .eq('installation_id', id)
        .order('submitted_at', { ascending: false })
        .limit(1);

      const latestHandoff =
        !handoffError && handoffData && handoffData.length > 0
          ? handoffData[0]
          : null;

      if (latestHandoff) {
        setHandoff(latestHandoff);
      } else {
        setHandoff(null);
      }

      // ========================================================
      // CONSTRUIR DATOS DE REVISIÓN DEL ACTA
      // ========================================================

      const reportEquipment: ReportEquipment[] = (equipData || []).map(
        (item: any) => ({
          id: item.id,
          equipmentType: item.equipment_type || '',
          serialNumber: item.serial_number || '',
          brand: item.brand || '',
          model: item.model || '',
          location: installationItem?.specific_location || '',
          observations: item.observations || '',
          isManual: false,
        })
      );

      const generatedReviewData: ReportReviewData = {
        projectName:
          result.data?.projectName ||
          latestHandoff?.project_name_snapshot ||
          '',

        clientName:
          result.data?.client?.name ||
          latestHandoff?.client_name_snapshot ||
          '',

        address:
          result.data?.address ||
          latestHandoff?.address_snapshot ||
          '',

        technicianName:
          result.data?.technician?.full_name ||
          latestHandoff?.technician_name_snapshot ||
          user?.full_name ||
          '',

        organizationName:
          latestHandoff?.organization_name_snapshot ||
          '',

        serviceName:
          installationItem?.name ||
          '',

        serviceType:
          serviceCategory?.name ||
          installationItem?.service_type ||
          '',

        location:
          installationItem?.specific_location ||
          '',

        vehicle: '',

        description:
          installationItem?.work_description ||
          '',

        equipment: reportEquipment,

        tests: '',

        training: '',

        generalObservations:
          installationItem?.observations ||
          latestHandoff?.final_notes ||
          '',

        recipientName:
          latestHandoff?.recipient_name ||
          '',

        recipientPosition: '',

        deliveryComments:
          latestHandoff?.final_notes ||
          '',
      };

      setReviewData(generatedReviewData);

      console.log(
        '📋 DATOS PARA REVISIÓN DEL ACTA:',
        generatedReviewData
      );

      // ========================================================
      // VERSIÓN DEL REPORTE
      // ========================================================

      const { data: versionData, error: versionError } = await supabase
        .from('installation_reports')
        .select('version')
        .eq('installation_id', id)
        .order('version', { ascending: false })
        .limit(1);

      if (!versionError && versionData && versionData.length > 0) {
        setReportVersion(versionData[0].version + 1);
      } else {
        setReportVersion(1);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id, selectedMembership, user?.full_name]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ============================================================
  // MANEJAR FIRMA
  // ============================================================

  const handleSignatureSave = async (signatureBase64: string) => {
    try {
      if (!installation || !selectedMembership) {
        Alert.alert('Error', 'Faltan datos para guardar la firma');
        return;
      }

      console.log('📝 Guardando firma versión:', reportVersion);

      let cleanBase64 = signatureBase64;

      if (signatureBase64.includes('base64,')) {
        cleanBase64 = signatureBase64.split('base64,')[1];
      }

      cleanBase64 = cleanBase64.replace(/^[\"']|[\"']$/g, '');

      if (cleanBase64.startsWith('data:image')) {
        const parts = cleanBase64.split(',');

        if (parts.length > 1) {
          cleanBase64 = parts[1];
        }
      }

      setSignatureBase64Data(cleanBase64);

      const arrayBuffer = decode(cleanBase64);

      const fileName = `signature_${installation.id}_v${reportVersion}_${Date.now()}.png`;
      const storagePath =
        `${selectedMembership.organizationId}/reports/${installation.id}/${fileName}`;

      const BUCKET_NAME = 'signatures';

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(storagePath, arrayBuffer, {
          contentType: 'image/png',
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) {
        console.error('Error subiendo firma:', uploadError);
        Alert.alert(
          'Error',
          `No se pudo guardar la firma: ${uploadError.message}`
        );
        return;
      }

      const { error: insertError } = await supabase
        .from('installation_reports')
        .insert({
          installation_id: id,
          version: reportVersion,
          signature_storage_path: storagePath,
          generated_by: user?.id,
          generated_at: new Date().toISOString(),
          recipient_name:
            reviewData?.recipientName ||
            handoff?.recipient_name ||
            'Cliente',
        });

      if (insertError) {
        console.error('Error guardando reporte:', insertError);
        Alert.alert(
          'Error',
          'No se pudo guardar el reporte en la base de datos'
        );
        return;
      }

      setShowSignaturePad(false);

      await generateReportWithSignature(cleanBase64);
    } catch (error) {
      console.error('Error en handleSignatureSave:', error);
      Alert.alert('Error', 'Ocurrió un error al guardar la firma');
    }
  };

  // ============================================================
  // GENERAR REPORTE
  // ============================================================

  const generateReport = async () => {
    if (!installation || !reviewData) return;
    setShowSignaturePad(true);
  };

  const updateReviewField = <K extends keyof ReportReviewData>(
    field: K,
    value: ReportReviewData[K]
  ) => {
    setReviewData((current) =>
      current ? { ...current, [field]: value } : current
    );
  };

  const updateEquipmentField = (
    equipmentId: string,
    field: keyof ReportEquipment,
    value: string | boolean
  ) => {
    setReviewData((current) => {
      if (!current) return current;

      return {
        ...current,
        equipment: current.equipment.map((item) =>
          item.id === equipmentId
            ? { ...item, [field]: value }
            : item
        ),
      };
    });
  };

  const addManualEquipment = () => {
    const manualEquipment: ReportEquipment = {
      id: `manual-${Date.now()}`,
      equipmentType: '',
      serialNumber: '',
      brand: '',
      model: '',
      location: reviewData?.location || '',
      observations: '',
      isManual: true,
    };

    setReviewData((current) =>
      current
        ? {
            ...current,
            equipment: [...current.equipment, manualEquipment],
          }
        : current
    );
  };

  const removeEquipment = (equipmentId: string) => {
    setReviewData((current) => {
      if (!current) return current;

      return {
        ...current,
        equipment: current.equipment.filter(
          (item) => item.id !== equipmentId
        ),
      };
    });
  };

  const openSignatureFromReview = () => {
    if (!reviewData) return;

    const missingSerial = reviewData.equipment.some(
      (item) => !item.serialNumber.trim()
    );

    if (missingSerial) {
      Alert.alert(
        'Número de serie pendiente',
        'Todos los equipos deben tener número de serie antes de continuar. Si algún equipo no tiene serie, escríbelo o elimínalo de la revisión.'
      );
      return;
    }

    setShowReview(false);
    setShowSignaturePad(true);
  };

  const generateReportWithSignature = async (
    signatureBase64: string
  ) => {
    setGenerating(true);

    try {
      if (!installation || !reviewData) {
        throw new Error(
          'No hay información suficiente para generar el acta.'
        );
      }

      const actaFilePath =
        await buildActaFromWordTemplate(signatureBase64);

      const isSharingAvailable =
        await Sharing.isAvailableAsync();

      if (isSharingAvailable) {
        await Sharing.shareAsync(actaFilePath, {
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          dialogTitle: `Acta de instalación v${reportVersion}`,
        });
      } else {
        Alert.alert(
          'Acta generada',
          `El acta versión ${reportVersion} se guardó correctamente.`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error(
        'Error generando acta desde plantilla Word:',
        error
      );

      Alert.alert(
        'Error',
        error instanceof Error
          ? error.message
          : 'No se pudo generar el acta desde la plantilla Word.'
      );
    } finally {
      setGenerating(false);
    }
  };

  // ============================================================
  // GENERAR DOCX SOBRE LA PLANTILLA ORIGINAL
  // ============================================================

  const buildActaFromWordTemplate = async (
    signatureBase64: string
  ): Promise<string> => {
    if (!installation || !reviewData) {
      throw new Error('No hay datos de revisión para generar el acta.');
    }

    console.log('📄 Generando acta usando la plantilla real de ONER...');

    const templateAsset = Asset.fromModule(ACTA_TEMPLATE);
    await templateAsset.downloadAsync();

    if (!templateAsset.localUri) {
      throw new Error('No se pudo acceder a la plantilla Word.');
    }

    const templateBase64 = await FileSystem.readAsStringAsync(
      templateAsset.localUri,
      { encoding: FileSystem.EncodingType.Base64 }
    );

    const zip = await JSZip.loadAsync(templateBase64, { base64: true });
    const documentFile = zip.file('word/document.xml');

    if (!documentFile) {
      throw new Error('La plantilla Word no contiene word/document.xml.');
    }

    let documentXml = await documentFile.async('string');
    const originalLength = documentXml.length;

    console.log('📄 document.xml original:', originalLength);

    // Esta plantilla es la que se construyó directamente a partir del
    // archivo ACTA INSTALACIÓN PLANTILLA.docx del usuario. Tiene marcadores
    // editables, pero conserva el encabezado, logo, pie y diseño original.
    if (!documentXml.includes('{{PROJECT_NAME}}')) {
      throw new Error(
        'La aplicación no está cargando la plantilla correcta. Debe ser acta-instalacion-template-app.docx. Reinicia Expo con: npx expo start -c'
      );
    }

    const submittedAt = handoff?.submitted_at
      ? new Date(handoff.submitted_at)
      : new Date();

    const dateText = submittedAt.toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const timeText = submittedAt.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const clean = (value: unknown, fallback = '') =>
      String(value ?? '').trim() || fallback;

    const organization = clean(
      reviewData.organizationName,
      'Soluciones Tecnológicas & Protección Aeroespacial, S.A. de C.V.'
    );
    const project = clean(reviewData.projectName, 'Instalación');
    const client = clean(reviewData.clientName, 'Cliente');
    const address = clean(reviewData.address, 'Domicilio indicado en la orden de trabajo');
    const serviceName = clean(reviewData.serviceName, 'sistema');
    const serviceType = clean(reviewData.serviceType, 'sistema');
    const location = clean(reviewData.location, address);
    const technician = clean(reviewData.technicianName, '____________________________');
    const recipient = clean(reviewData.recipientName, '____________________________');
    const recipientPosition = clean(
      reviewData.recipientPosition,
      '____________________________'
    );

    const equipment = reviewData.equipment || [];

    const equipmentLine = (item: ReportEquipment) => {
      const type = clean(item.equipmentType, 'Equipo');
      const brand = clean(item.brand, 'Marca no especificada');
      const model = clean(item.model, 'Modelo no especificado');
      const serial = clean(item.serialNumber, 'sin número de serie');
      const itemLocation = clean(item.location);
      const observations = clean(item.observations);

      let line = `* 01 ${type}, marca ${brand}, modelo ${model}, número de serie: ${serial}.`;
      if (itemLocation) line += ` Ubicación: ${itemLocation}.`;
      if (observations) line += ` Observaciones: ${observations}.`;
      return line;
    };

    const isAccessory = (item: ReportEquipment) => {
      const value = `${item.equipmentType} ${item.brand} ${item.model}`.toLowerCase();
      return /(cargador|charger|switch|bater[ií]a|battery|maleta|convertidor|inversor|panel|solar|fuente|psu|power supply|accesorio)/i.test(value);
    };

    const principalEquipment = equipment.filter((item) => !isAccessory(item));
    const accessoryEquipment = equipment.filter((item) => isAccessory(item));

    const tests = clean(
      reviewData.tests,
      'Una vez concluida la instalación se realizaron las pruebas correspondientes de energización, comunicación, operación y funcionamiento general de los equipos instalados. Como resultado de dichas pruebas se verificó el funcionamiento general del sistema y se dejó en condiciones de operación al momento de la firma de la presente acta.'
    );

    const training = clean(
      reviewData.training,
      'El personal usuario recibió la capacitación correspondiente respecto de la operación básica, procedimientos de encendido y apagado, supervisión del sistema y recomendaciones generales de uso.'
    );

    const observations = clean(
      reviewData.generalObservations,
      'No se registraron observaciones adicionales al momento de la entrega.'
    );

    const intro =
      `Siendo las ${timeText} horas del día ${dateText}, se hace constar que personal técnico de ${organization} concluyó la instalación de ${serviceType} correspondiente al proyecto ${project}, para ${client}, en ${address}.`;

    const subtitle = serviceType.toUpperCase();

    // 1. Reemplazos simples. Solo se cambia el texto de los marcadores;
    // no se reconstruye el documento ni se toca el header/footer.
    const values: Record<string, string> = {
      '{{ACTA_SUBTITLE}}': subtitle,
      '{{TIME}}': timeText,
      '{{DATE}}': dateText,
      '{{ORGANIZATION_NAME}}': organization,
      '{{SERVICE_NAME}}': serviceName,
      '{{CLIENT_NAME}}': client,
      '{{ADDRESS}}': address,
      '{{LOCATION}}': location,
      '{{PROJECT_NAME}}': project,
      '{{TESTS_TEXT}}': tests,
      '{{TRAINING_TEXT}}': training,
      '{{GENERAL_OBSERVATIONS}}': observations,
      '{{TECHNICIAN_NAME}}': technician,
      '{{RECIPIENT_NAME}}': recipient,
      '{{RECIPIENT_POSITION}}': recipientPosition,
      '{{SIGNATURE_PLACEHOLDER}}': '',
      '{{SERIAL_TABLE_MARKER}}': '',
    };

    Object.entries(values).forEach(([placeholder, value]) => {
      documentXml = replacePlaceholderParagraph(documentXml, placeholder, value);
      documentXml = replacePlainText(documentXml, placeholder, value);
    });

    // 2. Párrafos de equipos. Se clona únicamente el párrafo marcador,
    // conservando su formato, y se crean tantos como equipos existan.
    documentXml = replaceParagraphWithList(
      documentXml,
      '{{EQUIPMENT_MAIN}}',
      principalEquipment.length
        ? principalEquipment.map(equipmentLine)
        : ['* No se registraron equipos principales.']
    );

    documentXml = replaceParagraphWithList(
      documentXml,
      '{{EQUIPMENT_ACCESSORIES}}',
      accessoryEquipment.length
        ? accessoryEquipment.map(equipmentLine)
        : ['* No se registraron accesorios o componentes adicionales.']
    );

    // 3. Tabla de números de serie incluida en la plantilla base.
    documentXml = replaceSerialPlaceholderTable(documentXml, equipment);

    // 4. Firma capturada en la pantalla.
    if (signatureBase64) {
      const relsFile = zip.file('word/_rels/document.xml.rels');

      if (relsFile) {
        const relationshipsXml = await relsFile.async('string');
        const relationshipId = getNextRelationshipId(relationshipsXml);
        const mediaName = `signature-${Date.now()}.png`;

        zip.file(`word/media/${mediaName}`, signatureBase64, { base64: true });

        const updatedRelationships = relationshipsXml.replace(
          '</Relationships>',
          `<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${mediaName}"/></Relationships>`
        );

        zip.file('word/_rels/document.xml.rels', updatedRelationships);

        documentXml = replaceSignaturePlaceholder(
          documentXml,
          relationshipId
        );
      }
    }

    if (documentXml.includes('{{')) {
      console.warn('⚠️ Quedaron marcadores sin reemplazar en el documento.');
    }

    console.log('📄 document.xml final:', documentXml.length);

    if (documentXml.length < originalLength * 0.55) {
      throw new Error(
        `La plantilla fue alterada de forma inesperada (${originalLength} → ${documentXml.length}). Se canceló la generación.`
      );
    }

    zip.file('word/document.xml', documentXml);

    const outputBase64 = await zip.generateAsync({
      type: 'base64',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const fileName =
      `Acta_Instalacion_${sanitizeFileName(project)}_v${reportVersion}_${Date.now()}.docx`;
    const filePath = FileSystem.documentDirectory + fileName;

    await FileSystem.writeAsStringAsync(
      filePath,
      outputBase64,
      { encoding: FileSystem.EncodingType.Base64 }
    );

    console.log('✅ Acta Word creada:', filePath);
    return filePath;
  };

  // ============================================================
  // UTILIDADES DOCX PARA LA PLANTILLA BASE
  // ============================================================

  const xmlEscape = (value: string) =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const xmlUnescape = (value: string) =>
    value
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/gi, "'");

  const sanitizeFileName = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80);

  const paragraphPattern = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  const rowPattern = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g;
  const cellPattern = /<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g;

  const getParagraphText = (paragraphXml: string) =>
    xmlUnescape(
      [...paragraphXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
        .map((m) => m[1])
        .join('')
    ).trim();

  const setParagraphText = (paragraphXml: string, text: string) => {
    const escaped = xmlEscape(text).replace(
      /\n/g,
      '</w:t><w:br/><w:t xml:space="preserve">'
    );

    const textMatches = [
      ...paragraphXml.matchAll(/<w:t\b[^>]*>[\s\S]*?<\/w:t>/g),
    ];

    if (textMatches.length === 0) {
      const run = `<w:r><w:t xml:space="preserve">${escaped}</w:t></w:r>`;
      const pPr = paragraphXml.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/);
      return pPr
        ? paragraphXml.replace(pPr[0], `${pPr[0]}${run}`)
        : paragraphXml.replace(/(<w:p\b[^>]*>)/, `$1${run}`);
    }

    let first = true;
    return paragraphXml.replace(
      /<w:t\b[^>]*>[\s\S]*?<\/w:t>/g,
      () => {
        if (!first) return '';
        first = false;
        return `<w:t xml:space="preserve">${escaped}</w:t>`;
      }
    );
  };

  const replacePlaceholderParagraph = (
    xml: string,
    placeholder: string,
    value: string
  ) =>
    xml.replace(paragraphPattern, (paragraph) =>
      getParagraphText(paragraph) === placeholder
        ? setParagraphText(paragraph, value)
        : paragraph
    );

  const replacePlainText = (
    xml: string,
    placeholder: string,
    value: string
  ) => xml.split(placeholder).join(xmlEscape(value));

  const replaceParagraphWithList = (
    xml: string,
    placeholder: string,
    values: string[]
  ) =>
    xml.replace(paragraphPattern, (paragraph) => {
      if (getParagraphText(paragraph) !== placeholder) return paragraph;
      return values
        .map((value) => setParagraphText(paragraph, value))
        .join('');
    });

  const setRowCells = (rowXml: string, values: string[]) => {
    let index = 0;
    return rowXml.replace(cellPattern, (cellXml) => {
      if (index >= values.length) return cellXml;
      const value = values[index++];
      const pMatch = cellXml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/);
      if (!pMatch) return cellXml;
      return cellXml.replace(pMatch[0], setParagraphText(pMatch[0], value));
    });
  };

  const replaceSerialPlaceholderTable = (
    xml: string,
    items: ReportEquipment[]
  ) => {
    const tablePattern = /<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g;
    let changed = false;

    return xml.replace(tablePattern, (tableXml) => {
      if (changed || !tableXml.includes('{{SERIAL_EQUIPMENT_1}}')) {
        return tableXml;
      }

      const rows = [...tableXml.matchAll(rowPattern)].map((m) => m[0]);
      if (rows.length < 2) return tableXml;

      changed = true;
      const headerRow = rows[0];
      const sampleRow = rows[1];

      const dataRows = (items.length ? items : []).map((item) => {
        const name = [
          item.equipmentType?.trim(),
          item.brand?.trim(),
          item.model?.trim(),
        ].filter(Boolean).join(' ') || 'Equipo';

        return setRowCells(sampleRow, [
          name,
          item.serialNumber?.trim() || 'Sin número de serie',
        ]);
      });

      if (!dataRows.length) {
        dataRows.push(setRowCells(sampleRow, ['Sin equipos registrados', '—']));
      }

      return tableXml.replace(
        rowPattern,
        (row, index) => index === 0 ? headerRow : (dataRows[index - 1] || '')
      ).replace(
        '</w:tbl>',
        dataRows.length + 1 > rows.length
          ? `${dataRows.slice(rows.length - 1).join('')}</w:tbl>`
          : '</w:tbl>'
      );
    });
  };

  const getNextRelationshipId = (relationshipsXml: string) => {
    const ids = [...relationshipsXml.matchAll(/Id="rId(\d+)"/g)]
      .map((m) => Number(m[1]));
    return `rId${ids.length ? Math.max(...ids) + 1 : 1}`;
  };

  const replaceSignaturePlaceholder = (
    xml: string,
    relationshipId: string
  ) => {
    const drawing = `
      <w:p>
        <w:pPr><w:jc w:val="center"/></w:pPr>
        <w:r><w:drawing>
          <wp:inline distT="0" distB="0" distL="0" distR="0">
            <wp:extent cx="3600000" cy="1200000"/>
            <wp:docPr id="1001" name="Firma de conformidad"/>
            <a:graphic>
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic>
                  <pic:nvPicPr><pic:cNvPr id="1001" name="signature.png"/><pic:cNvPicPr/></pic:nvPicPr>
                  <pic:blipFill>
                    <a:blip r:embed="${relationshipId}"/>
                    <a:stretch><a:fillRect/></a:stretch>
                  </pic:blipFill>
                  <pic:spPr>
                    <a:xfrm><a:off x="0" y="0"/><a:ext cx="3600000" cy="1200000"/></a:xfrm>
                    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                  </pic:spPr>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing></w:r>
      </w:p>`;

    return xml.replace(paragraphPattern, (paragraph) =>
      getParagraphText(paragraph) === '{{SIGNATURE_PLACEHOLDER}}'
        ? drawing
        : paragraph
    );
  };

  // ============================================================
  // RENDER
  // ============================================================

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerScreen}>
          <ActivityIndicator
            size="large"
            color={colors.primary}
          />
          <Text style={styles.loadingText}>
            Cargando datos...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !installation) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerScreen}>
          <Text style={styles.errorText}>
            Error al cargar
          </Text>

          <Text style={styles.errorDetail}>
            {error || 'No se encontró la instalación'}
          </Text>

          <Pressable
            style={styles.retryButton}
            onPress={loadData}
          >
            <Text style={styles.retryText}>
              Reintentar
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      <Stack.Screen
        options={{
          title: showReview
            ? 'Revisión del acta'
            : 'Reporte de Instalación',
          headerShown: true,
          headerBackTitle: 'Volver',
        }}
      />

      {showReview && reviewData ? (
        <ScrollView
          style={styles.container}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.reviewHeader}>
            <View style={styles.reviewHeaderIcon}>
              <Ionicons
                name="document-text-outline"
                size={36}
                color={colors.primary}
              />
            </View>

            <Text style={styles.reviewTitle}>
              Revisión del acta de instalación
            </Text>

            <Text style={styles.reviewSubtitle}>
              Revisa y corrige la información antes de firmar y generar el acta.
            </Text>

            <View style={styles.reviewNotice}>
              <Ionicons
                name="information-circle-outline"
                size={20}
                color={colors.primary}
              />
              <Text style={styles.reviewNoticeText}>
                Los cambios de esta pantalla son para el acta. No modifican los registros técnicos originales.
              </Text>
            </View>
          </View>

          <View style={styles.reviewSection}>
            <Text style={styles.reviewSectionTitle}>
              📌 Información general
            </Text>

            <View style={styles.formCard}>
              <FormField
                label="Proyecto"
                value={reviewData.projectName}
                onChangeText={(value) =>
                  updateReviewField('projectName', value)
                }
                placeholder="Nombre del proyecto"
              />

              <FormField
                label="Cliente"
                value={reviewData.clientName}
                onChangeText={(value) =>
                  updateReviewField('clientName', value)
                }
                placeholder="Nombre del cliente"
              />

              <FormField
                label="Dirección"
                value={reviewData.address}
                onChangeText={(value) =>
                  updateReviewField('address', value)
                }
                placeholder="Dirección"
              />

              <FormField
                label="Técnico"
                value={reviewData.technicianName}
                onChangeText={(value) =>
                  updateReviewField('technicianName', value)
                }
                placeholder="Nombre del técnico"
              />

              <FormField
                label="Organización"
                value={reviewData.organizationName}
                onChangeText={(value) =>
                  updateReviewField('organizationName', value)
                }
                placeholder="Organización"
              />
            </View>
          </View>

          <View style={styles.reviewSection}>
            <Text style={styles.reviewSectionTitle}>
              🛠️ Servicio / elemento instalado
            </Text>

            <View style={styles.formCard}>
              <FormField
                label="Nombre del servicio / elemento"
                value={reviewData.serviceName}
                onChangeText={(value) =>
                  updateReviewField('serviceName', value)
                }
                placeholder="Qué se instaló"
              />

              <FormField
                label="Tipo de servicio"
                value={reviewData.serviceType}
                onChangeText={(value) =>
                  updateReviewField('serviceType', value)
                }
                placeholder="Tipo de servicio"
              />

              <FormField
                label="Ubicación"
                value={reviewData.location}
                onChangeText={(value) =>
                  updateReviewField('location', value)
                }
                placeholder="Dónde se instaló"
              />

              <FormField
                label="Vehículo / unidad (si aplica)"
                value={reviewData.vehicle}
                onChangeText={(value) =>
                  updateReviewField('vehicle', value)
                }
                placeholder="Ej. RAM 4X4 8110337"
              />

              <FormField
                label="Descripción de los trabajos"
                value={reviewData.description}
                onChangeText={(value) =>
                  updateReviewField('description', value)
                }
                placeholder="Describe lo que se realizó"
                multiline
              />
            </View>
          </View>

          <View style={styles.reviewSection}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.reviewSectionTitle}>
                🔧 Equipos instalados
              </Text>

              <View style={styles.equipmentCountBadge}>
                <Text style={styles.equipmentCountText}>
                  {reviewData.equipment.length}
                </Text>
              </View>
            </View>

            {reviewData.equipment.length === 0 ? (
              <View style={styles.emptyReviewCard}>
                <Ionicons
                  name="hardware-chip-outline"
                  size={28}
                  color={colors.muted}
                />
                <Text style={styles.emptyReviewTitle}>
                  No hay equipos agregados
                </Text>
                <Text style={styles.emptyReviewText}>
                  Puedes agregar manualmente un equipo si fue instalado pero no quedó registrado.
                </Text>
              </View>
            ) : (
              reviewData.equipment.map((item, index) => (
                <View
                  key={item.id}
                  style={styles.equipmentReviewCard}
                >
                  <View style={styles.equipmentReviewHeader}>
                    <View style={styles.equipmentReviewTitleWrap}>
                      <View style={styles.equipmentNumber}>
                        <Text style={styles.equipmentNumberText}>
                          {index + 1}
                        </Text>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.equipmentReviewTitle}>
                          {item.isManual
                            ? 'Equipo agregado manualmente'
                            : 'Equipo registrado'}
                        </Text>

                        {!item.isManual && (
                          <Text style={styles.equipmentReviewSource}>
                            Cargado desde la instalación
                          </Text>
                        )}
                      </View>
                    </View>

                    <Pressable
                      style={styles.removeEquipmentButton}
                      onPress={() => removeEquipment(item.id)}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color="#DC2626"
                      />
                    </Pressable>
                  </View>

                  <FormField
                    label="Tipo / nombre del equipo"
                    value={item.equipmentType}
                    onChangeText={(value) =>
                      updateEquipmentField(
                        item.id,
                        'equipmentType',
                        value
                      )
                    }
                    placeholder="Ej. Equipo, cámara, sensor..."
                  />

                  <FormField
                    label="Marca"
                    value={item.brand}
                    onChangeText={(value) =>
                      updateEquipmentField(
                        item.id,
                        'brand',
                        value
                      )
                    }
                    placeholder="Marca"
                  />

                  <FormField
                    label="Modelo"
                    value={item.model}
                    onChangeText={(value) =>
                      updateEquipmentField(
                        item.id,
                        'model',
                        value
                      )
                    }
                    placeholder="Modelo"
                  />

                  <FormField
                    label="Número de serie"
                    value={item.serialNumber}
                    onChangeText={(value) =>
                      updateEquipmentField(
                        item.id,
                        'serialNumber',
                        value
                      )
                    }
                    placeholder="Número de serie"
                    autoCapitalize="characters"
                  />

                  <FormField
                    label="Ubicación"
                    value={item.location}
                    onChangeText={(value) =>
                      updateEquipmentField(
                        item.id,
                        'location',
                        value
                      )
                    }
                    placeholder="Dónde quedó instalado"
                  />

                  <FormField
                    label="Observaciones"
                    value={item.observations}
                    onChangeText={(value) =>
                      updateEquipmentField(
                        item.id,
                        'observations',
                        value
                      )
                    }
                    placeholder="Observaciones del equipo"
                    multiline
                  />
                </View>
              ))
            )}

            <Pressable
              style={styles.addEquipmentButton}
              onPress={addManualEquipment}
            >
              <Ionicons
                name="add-circle-outline"
                size={21}
                color={colors.primary}
              />

              <Text style={styles.addEquipmentButtonText}>
                Agregar equipo manualmente
              </Text>
            </Pressable>
          </View>

          <View style={styles.reviewSection}>
            <Text style={styles.reviewSectionTitle}>
              🧪 Pruebas y funcionamiento
            </Text>

            <View style={styles.formCard}>
              <FormField
                label="Pruebas realizadas"
                value={reviewData.tests}
                onChangeText={(value) =>
                  updateReviewField('tests', value)
                }
                placeholder="Describe las pruebas realizadas y el funcionamiento del equipo..."
                multiline
                minHeight={130}
              />
            </View>
          </View>

          <View style={styles.reviewSection}>
            <Text style={styles.reviewSectionTitle}>
              🎓 Capacitación / entrenamiento
            </Text>

            <View style={styles.formCard}>
              <FormField
                label="Capacitación proporcionada"
                value={reviewData.training}
                onChangeText={(value) =>
                  updateReviewField('training', value)
                }
                placeholder="Describe la capacitación o explicación proporcionada al cliente..."
                multiline
                minHeight={130}
              />
            </View>
          </View>

          <View style={styles.reviewSection}>
            <Text style={styles.reviewSectionTitle}>
              📝 Observaciones generales
            </Text>

            <View style={styles.formCard}>
              <FormField
                label="Comentarios generales"
                value={reviewData.generalObservations}
                onChangeText={(value) =>
                  updateReviewField(
                    'generalObservations',
                    value
                  )
                }
                placeholder="Escribe aquí las observaciones generales de la instalación..."
                multiline
                minHeight={140}
              />
            </View>
          </View>

          <View style={styles.reviewSection}>
            <Text style={styles.reviewSectionTitle}>
              🤝 Entrega y recepción
            </Text>

            <View style={styles.formCard}>
              <FormField
                label="Nombre de quien recibe"
                value={reviewData.recipientName}
                onChangeText={(value) =>
                  updateReviewField(
                    'recipientName',
                    value
                  )
                }
                placeholder="Nombre del receptor"
              />

              <FormField
                label="Cargo de quien recibe"
                value={reviewData.recipientPosition}
                onChangeText={(value) =>
                  updateReviewField(
                    'recipientPosition',
                    value
                  )
                }
                placeholder="Cargo / puesto"
              />

              <FormField
                label="Comentarios de entrega"
                value={reviewData.deliveryComments}
                onChangeText={(value) =>
                  updateReviewField(
                    'deliveryComments',
                    value
                  )
                }
                placeholder="Comentarios de la entrega"
                multiline
                minHeight={110}
              />
            </View>
          </View>

          <View style={styles.reviewFooter}>
            <View style={styles.reviewFooterInfo}>
              <Ionicons
                name="checkmark-circle-outline"
                size={22}
                color="#16A34A"
              />

              <Text style={styles.reviewFooterText}>
                Cuando termines de revisar, continúa a la firma para generar el acta.
              </Text>
            </View>

            <Pressable
              style={styles.continueSignatureButton}
              onPress={openSignatureFromReview}
            >
              <Ionicons
                name="create-outline"
                size={21}
                color="#fff"
              />

              <Text style={styles.continueSignatureText}>
                Continuar a firma
              </Text>

              <Ionicons
                name="arrow-forward"
                size={19}
                color="#fff"
              />
            </Pressable>

            <Pressable
              style={styles.backReviewButton}
              onPress={() => router.back()}
            >
              <Ionicons
                name="arrow-back"
                size={19}
                color={colors.primary}
              />

              <Text style={styles.backReviewButtonText}>
                Volver
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.container}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.reportHeader}>
            <View style={styles.reportHeaderIcon}>
              <Ionicons
                name="document-text"
                size={40}
                color={colors.primary}
              />
            </View>

            <Text style={styles.reportTitle}>
              Reporte de Instalación
            </Text>

            <Text style={styles.reportSubtitle}>
              {installation?.projectName || 'Instalación'}
            </Text>

            <View style={styles.versionBadge}>
              <Text style={styles.versionBadgeText}>
                📄 Versión {reportVersion}
              </Text>
            </View>

            <StatusChip status="completed" />
          </View>

          <View style={styles.summaryCards}>
            <View style={styles.summaryCard}>
              <Ionicons
                name="hardware-chip-outline"
                size={24}
                color="#2563EB"
              />
              <Text style={styles.summaryNumber}>
                {reviewData?.equipment.length || 0}
              </Text>
              <Text style={styles.summaryLabel}>
                Equipos
              </Text>
            </View>

            <View style={styles.summaryCard}>
              <Ionicons
                name="images-outline"
                size={24}
                color="#8B5CF6"
              />
              <Text style={styles.summaryNumber}>
                {photos.length}
              </Text>
              <Text style={styles.summaryLabel}>
                Fotos
              </Text>
            </View>

            <View style={styles.summaryCard}>
              <Ionicons
                name="checkmark-circle-outline"
                size={24}
                color="#10B981"
              />
              <Text style={styles.summaryNumber}>
                1
              </Text>
              <Text style={styles.summaryLabel}>
                Instalación
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              📌 Datos revisados
            </Text>

            <View style={styles.infoCard}>
              <InfoRow
                label="Cliente"
                value={reviewData?.clientName || 'No especificado'}
              />

              <InfoRow
                label="Proyecto"
                value={reviewData?.projectName || 'No especificado'}
              />

              <InfoRow
                label="Dirección"
                value={reviewData?.address || 'No especificada'}
              />

              <InfoRow
                label="Técnico"
                value={reviewData?.technicianName || 'No asignado'}
              />

              <InfoRow
                label="Servicio"
                value={reviewData?.serviceType || 'No especificado'}
              />

              <InfoRow
                label="Elemento"
                value={reviewData?.serviceName || 'No especificado'}
              />

              <InfoRow
                label="Ubicación"
                value={reviewData?.location || 'No especificada'}
              />

              <InfoRow
                label="Vehículo / unidad"
                value={reviewData?.vehicle || 'No aplica'}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              🔧 Equipos del acta
            </Text>

            {reviewData?.equipment.map((item) => (
              <View
                key={item.id}
                style={styles.equipmentCard}
              >
                <Text style={styles.equipmentSerial}>
                  🔢 {item.serialNumber || 'N/A'}
                </Text>

                <View style={styles.equipmentDetails}>
                  <Text style={styles.equipmentDetail}>
                    🏷️ {item.brand || 'N/A'}
                  </Text>

                  <Text style={styles.equipmentDetail}>
                    📱 {item.model || 'N/A'}
                  </Text>
                </View>

                <Text style={styles.equipmentDate}>
                  {item.location || 'Sin ubicación'}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              📸 Evidencia Fotográfica
            </Text>

            {photos.length === 0 ? (
              <Text style={styles.emptyText}>
                No hay fotos registradas
              </Text>
            ) : (
              <View style={styles.photosGrid}>
                {photos.map((photo) => (
                  <View
                    key={photo.id}
                    style={styles.photoItem}
                  >
                    {photo.base64 ? (
                      <Image
                        source={{
                          uri:
                            `data:image/jpeg;base64,${photo.base64}`,
                        }}
                        style={styles.photoImage}
                      />
                    ) : photo.url ? (
                      <Image
                        source={{ uri: photo.url }}
                        style={styles.photoImage}
                      />
                    ) : (
                      <View style={styles.photoPlaceholder}>
                        <Ionicons
                          name="image-outline"
                          size={24}
                          color={colors.muted}
                        />
                      </View>
                    )}

                    <View style={styles.photoOverlay}>
                      <Text style={styles.photoCategory}>
                        {photo.category || 'Sin categoría'}
                      </Text>

                      {photo.tiene_ubicacion && (
                        <Ionicons
                          name="location"
                          size={12}
                          color="#4CAF50"
                        />
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              ✍️ Firma de Conformidad
            </Text>

            <View style={styles.signatureBox}>
              <View style={styles.signaturePlaceholder}>
                <Ionicons
                  name="create-outline"
                  size={32}
                  color={colors.muted}
                />

                <Text style={styles.signaturePlaceholderText}>
                  Firma requerida
                </Text>

                <Text style={styles.signatureSubtext}>
                  La firma se solicita antes de generar el acta.
                </Text>
              </View>
            </View>

            <Text style={styles.signatureName}>
              {reviewData?.recipientName ||
                'Cliente no registrado'}
            </Text>
          </View>

          <View style={styles.actionsContainer}>
            <Pressable
              style={[
                styles.actionButton,
                styles.actionButtonPrimary,
              ]}
              onPress={() => setShowReview(true)}
            >
              <Ionicons
                name="create-outline"
                size={20}
                color="#fff"
              />

              <Text style={styles.actionButtonText}>
                Editar revisión del acta
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.actionButton,
                styles.actionButtonSecondary,
              ]}
              onPress={() => router.back()}
            >
              <Ionicons
                name="arrow-back"
                size={20}
                color={colors.primary}
              />

              <Text
                style={[
                  styles.actionButtonText,
                  { color: colors.primary },
                ]}
              >
                Volver
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      )}

      <SignaturePad
        visible={showSignaturePad}
        onClose={() => {
          setShowSignaturePad(false);
          setShowReview(true);
        }}
        onSave={handleSignatureSave}
        clientName={
          reviewData?.clientName ||
          installation?.client?.name ||
          'Cliente'
        }
        isAlreadySigned={false}
      />
    </SafeAreaView>
  );
}

// ============================================================
// UTILIDADES
// ============================================================

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================
// SUBCOMPONENTES
// ============================================================

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  minHeight,
  autoCapitalize = 'sentences',
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  minHeight?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>
        {label}
      </Text>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[
          styles.formInput,
          multiline && styles.formInputMultiline,
          minHeight ? { minHeight } : null,
        ]}
      />
    </View>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>
        {label}
      </Text>

      <Text style={styles.infoValue}>
        {value}
      </Text>
    </View>
  );
}

// ============================================================
// ESTILOS
// ============================================================

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  centerScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    padding: spacing.lg,
  },

  loadingText: {
    marginTop: spacing.md,
    color: colors.muted,
    fontSize: 16,
  },

  container: {
    flex: 1,
    padding: spacing.lg,
  },

  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ef4444',
    marginBottom: spacing.xs,
  },

  errorDetail: {
    color: colors.muted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },

  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },

  retryText: {
    color: 'white',
    fontWeight: '600',
  },

  reviewHeader: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    alignItems: 'center',
  },

  reviewHeaderIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },

  reviewTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },

  reviewSubtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: spacing.xs,
  },

  reviewNotice: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
    gap: 8,
  },

  reviewNoticeText: {
    flex: 1,
    color: '#1D4ED8',
    fontSize: 12,
    lineHeight: 18,
  },

  reviewSection: {
    marginBottom: spacing.md,
  },

  reviewSectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.sm,
  },

  formCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },

  formField: {
    marginBottom: spacing.md,
  },

  formLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },

  formInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: radius.sm,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14,
    color: colors.text,
  },

  formInputMultiline: {
    minHeight: 110,
    paddingTop: 12,
  },

  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  equipmentCountBadge: {
    minWidth: 30,
    height: 30,
    paddingHorizontal: 8,
    borderRadius: 15,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },

  equipmentCountText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },

  equipmentReviewCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },

  equipmentReviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },

  equipmentReviewTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },

  equipmentNumber: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  equipmentNumberText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 14,
  },

  equipmentReviewTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },

  equipmentReviewSource: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },

  removeEquipmentButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },

  addEquipmentButton: {
    minHeight: 50,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: radius.md,
    backgroundColor: '#F8FBFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.xs,
  },

  addEquipmentButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },

  emptyReviewCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },

  emptyReviewTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
  },

  emptyReviewText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 4,
  },

  reviewFooter: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },

  reviewFooterInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0FDF4',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 8,
    marginBottom: spacing.md,
  },

  reviewFooterText: {
    flex: 1,
    color: '#166534',
    fontSize: 12,
    lineHeight: 18,
  },

  continueSignatureButton: {
    minHeight: 54,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },

  continueSignatureText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  backReviewButton: {
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.sm,
  },

  backReviewButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },

  reportHeader: {
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: spacing.lg,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },

  reportHeaderIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },

  reportTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },

  reportSubtitle: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: spacing.xs,
  },

  versionBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 4,
  },

  versionBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },

  summaryCards: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },

  summaryCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },

  summaryNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginTop: 4,
  },

  summaryLabel: {
    fontSize: 12,
    color: colors.muted,
  },

  section: {
    marginBottom: spacing.md,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },

  infoCard: {
    backgroundColor: '#fff',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },

  infoLabel: {
    fontSize: 13,
    color: colors.muted,
  },

  infoValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
    textAlign: 'right',
    flex: 1,
    marginLeft: spacing.md,
  },

  equipmentCard: {
    backgroundColor: '#fff',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },

  equipmentSerial: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },

  equipmentDetails: {
    flexDirection: 'row',
    gap: spacing.md,
    marginVertical: 4,
  },

  equipmentDetail: {
    fontSize: 13,
    color: colors.muted,
  },

  equipmentDate: {
    fontSize: 11,
    color: colors.muted,
  },

  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },

  photoItem: {
    width:
      (width - spacing.lg * 2 - spacing.sm * 2) / 3,
    height:
      (width - spacing.lg * 2 - spacing.sm * 2) / 3,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  photoCategory: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },

  emptyText: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
    padding: spacing.md,
  },

  signatureBox: {
    backgroundColor: '#fff',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },

  signaturePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },

  signaturePlaceholderText: {
    color: colors.muted,
    fontSize: 14,
    marginTop: spacing.xs,
  },

  signatureSubtext: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },

  signatureName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.xs,
  },

  actionsContainer: {
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },

  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },

  actionButtonPrimary: {
    backgroundColor: colors.primary,
  },

  actionButtonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
  },

  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
