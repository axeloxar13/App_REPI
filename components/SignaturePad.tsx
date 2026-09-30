// components/SignaturePad.tsx
import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SignatureScreen, { type SignatureViewRef } from 'react-native-signature-canvas';
import { colors, radius, spacing } from '../constants/theme';

const { width, height } = Dimensions.get('window');

interface SignaturePadProps {
  visible: boolean;
  onClose: () => void;
  onSave: (signature: string) => void;
  clientName?: string;
  isAlreadySigned?: boolean;
}

export default function SignaturePad({
  visible,
  onClose,
  onSave,
  clientName = 'Cliente',
  isAlreadySigned = false,
}: SignaturePadProps) {
  const signatureRef = useRef<SignatureViewRef>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);

  const webStyle = `
    .m-signature-pad {
      box-shadow: none;
      border: 0;
      margin: 0;
    }
    .m-signature-pad--body {
      border: 0;
    }
    .m-signature-pad--footer {
      display: none;
      margin: 0;
    }
    body, html {
      width: 100%;
      height: 100%;
      background: #ffffff;
    }
  `;

  // 🔥 CAPTURAR FIRMA MANUALMENTE
  const captureSignature = async () => {
    try {
      // @ts-ignore - readSignature es un método de la librería
      signatureRef.current?.readSignature();
    } catch (error) {
      console.error('Error al capturar firma:', error);
      Alert.alert('Error', 'No se pudo capturar la firma. Intenta de nuevo.');
    }
  };

  // 🔥 MANEJAR FIRMA CAPTURADA
  const handleSignature = (signatureImage: string) => {
    console.log('✅ Firma capturada, longitud:', signatureImage?.length);
    if (signatureImage && signatureImage.length > 100) {
      setHasSignature(true);
      setSignatureData(signatureImage);
      Alert.alert('✅ Firma capturada', 'La firma se ha capturado correctamente.');
    } else {
      Alert.alert('⚠️ Firma vacía', 'No se detectó ninguna firma. Por favor, firma en el área designada.');
    }
  };

  const handleEmpty = () => {
    console.log('⚠️ Firma vacía - onEmpty llamado');
  };

  const handleClear = () => {
    signatureRef.current?.clearSignature();
    setHasSignature(false);
    setSignatureData(null);
  };

  const handleConfirm = () => {
    if (signatureData) {
      onSave(signatureData);
      onClose();
    } else {
      Alert.alert('Firma requerida', 'Por favor, firma en el área designada antes de continuar.');
    }
  };

  // Si ya está firmado, mostrar mensaje
  if (isAlreadySigned) {
    return (
      <Modal visible={visible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>✍️ Firma registrada</Text>
              <View style={{ width: 40 }} />
            </View>

            <View style={styles.alreadySignedContainer}>
              <Ionicons name="checkmark-circle" size={64} color="#10B981" />
              <Text style={styles.alreadySignedTitle}>✅ Documento firmado</Text>
              <Text style={styles.alreadySignedText}>
                Este documento ya ha sido firmado por el cliente.
              </Text>
              <Text style={styles.alreadySignedSubtext}>
                No es necesario volver a firmar.
              </Text>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={[styles.button, styles.confirmButton]} onPress={onClose}>
                <Text style={styles.confirmButtonText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>✍️ Firma de conformidad</Text>
            <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
              <Text style={styles.clearButtonText}>Limpiar</Text>
            </TouchableOpacity>
          </View>

          {/* Cliente */}
          <View style={styles.clientInfo}>
            <Text style={styles.clientLabel}>Cliente: <Text style={styles.clientName}>{clientName}</Text></Text>
            <Text style={styles.clientSubtext}>Firma en el área de abajo</Text>
          </View>

          {/* 🔥 Área de firma */}
          <View style={styles.signatureContainer}>
            <SignatureScreen
              ref={signatureRef}
              onOK={handleSignature}
              onEmpty={handleEmpty}
              descriptionText=""
              clearText="Limpiar"
              confirmText="Guardar"
              webStyle={webStyle}
              autoClear={false}
              backgroundColor="#ffffff"
              penColor="#1E293B"
              // 🔥 IMPORTANTE: Deshabilitar la captura automática
              onBegin={() => {
                console.log('✍️ Comenzó a dibujar');
                setHasSignature(true);
              }}
            />
          </View>

          {/* 🔥 INDICADOR DE ESTADO */}
          <View style={styles.signatureStatusBar}>
            <View style={[styles.statusDot, hasSignature ? styles.statusDotSuccess : styles.statusDotWarning]} />
            <Text style={[styles.statusText, hasSignature ? styles.statusTextSuccess : styles.statusTextWarning]}>
              {hasSignature ? '✅ Firma capturada' : '⏳ Firma pendiente'}
            </Text>
          </View>

          {/* 🔥 BOTONES - El de "Confirmar firma" captura la firma */}
          <View style={styles.modalFooter}>
            <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.button, styles.captureButton]} 
              onPress={captureSignature}
            >
              <Ionicons name="scan-outline" size={20} color="#fff" />
              <Text style={styles.captureButtonText}>Capturar firma</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.button, styles.confirmButton]} 
              onPress={handleConfirm}
              disabled={!signatureData}
            >
              <Ionicons name="checkmark" size={20} color="#fff" />
              <Text style={styles.confirmButtonText}>Confirmar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    width: width * 0.95,
    maxHeight: height * 0.92,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
    textAlign: 'center',
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  clearButtonText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '600',
  },
  clientInfo: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  clientLabel: {
    fontSize: 14,
    color: colors.muted,
  },
  clientName: {
    fontWeight: '700',
    color: colors.text,
  },
  clientSubtext: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  signatureContainer: {
    flex: 1,
    minHeight: 280,
    maxHeight: 350,
    backgroundColor: '#fff',
    margin: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  signatureStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusDotSuccess: {
    backgroundColor: '#10B981',
  },
  statusDotWarning: {
    backgroundColor: '#F59E0B',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
  },
  statusTextSuccess: {
    color: '#10B981',
  },
  statusTextWarning: {
    color: '#F59E0B',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    gap: 6,
  },
  cancelButton: {
    backgroundColor: '#F1F5F9',
  },
  cancelButtonText: {
    color: colors.muted,
    fontWeight: '600',
  },
  captureButton: {
    backgroundColor: '#8B5CF6',
  },
  captureButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: colors.primary,
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  alreadySignedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    minHeight: 300,
  },
  alreadySignedTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#10B981',
    marginTop: spacing.md,
  },
  alreadySignedText: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  alreadySignedSubtext: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});