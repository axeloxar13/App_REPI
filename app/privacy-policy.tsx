import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronIcon } from '../components/ChevronIcon';
import { colors, radius, spacing } from '../constants/theme';

const lastUpdated = 'Última actualización: 30 de julio de 2026';

const legalAddress = 'Calle Melchor Ocampo #300A\nTulancingo, Colonia Centro - 43600\nMéxico (MX)';

const sections = [
  {
    title: 'A. Identidad del responsable',
    paragraphs: [
      'Tamin Instalaciones, operada por Tamin, es responsable del tratamiento de los datos personales procesados mediante esta aplicación.',
      `Domicilio:\n${legalAddress}`,
      'Correo para privacidad, derechos y eliminación: tamin.desarrollo@gmail.com',
      'Sitio web: https://tamin.mx',
      'La aplicación está destinada a personal técnico y usuarios autorizados relacionados con la gestión de instalaciones y servicios de Tamin.',
    ],
  },
  {
    title: 'B. Datos personales procesados',
    paragraphs: [
      'Datos de cuenta e identificación: nombre, correo electrónico, identificador de usuario, empresa, rol, información de sesión y autenticación.',
      'Datos operativos de instalaciones: instalación o servicio asignado, domicilio proporcionado para realizar el servicio, fechas, horarios, estados, avances, observaciones y notas operativas.',
      'Datos de clientes o personas receptoras: nombre, teléfono asociado al trabajo, domicilio de la instalación y nombre de quien recibe o valida el servicio.',
      'Evidencias: fotografías tomadas con la cámara o seleccionadas desde la galería, comentarios, firma de conformidad, observaciones finales e información asociada a la entrega.',
      'La firma de conformidad se utiliza como evidencia de aceptación o entrega del servicio; no se utiliza como sistema de identificación biométrica.',
      'Ubicación precisa: la aplicación procesa ubicación GPS únicamente cuando el técnico pulsa “Registrar ubicación actual”. Se guarda por instalación o partida junto con precisión, fecha, hora y usuario que realizó el registro.',
      'Datos técnicos: identificadores internos, token de notificaciones, plataforma, datos técnicos mínimos necesarios y registros de seguridad o diagnóstico utilizados para operar y proteger la aplicación.',
      'La aplicación no realiza seguimiento continuo, no recopila ubicación en segundo plano y no utiliza contactos, micrófono, publicidad personalizada, rastreo publicitario ni información financiera.',
    ],
  },
  {
    title: 'C. Finalidades',
    paragraphs: [
      'Los datos se utilizan para autenticar usuarios autorizados, controlar el acceso conforme al rol, mostrar instalaciones y servicios asignados, y permitir la comunicación operativa entre administradores y técnicos.',
      'También se usan para documentar los trabajos antes, durante y después de la instalación; registrar evidencias, avances, observaciones, entrega y conformidad; mostrar información necesaria para realizar el servicio; enviar notificaciones relacionadas con asignaciones, cambios o avances; mantener el historial operativo y administrativo; proteger la seguridad de las cuentas y prevenir accesos no autorizados; atender soporte, correcciones, derechos de privacidad y obligaciones legales.',
      'La ubicación precisa se utiliza para documentar el lugar donde se realiza el servicio. El técnico no puede modificarla después de guardarla; un administrador autorizado puede invalidarla para permitir una corrección.',
      'Los datos no se utilizan para publicidad personalizada, elaboración de perfiles comerciales ni venta de información.',
    ],
  },
  {
    title: 'D. Permisos del dispositivo',
    paragraphs: [
      'Cámara: se solicita cuando el técnico decide tomar fotografías como evidencia de una instalación.',
      'Fotografías o galería: se solicita cuando el técnico selecciona imágenes existentes para adjuntarlas como evidencia.',
      'Ubicación precisa en primer plano: se solicita únicamente cuando el técnico pulsa “Registrar ubicación actual”. No se solicita ubicación permanente ni en segundo plano.',
      'Notificaciones: se utilizan para recibir avisos operativos relacionados con instalaciones y tareas asignadas.',
      'Estos permisos se solicitan únicamente cuando son necesarios y pueden administrarse desde los ajustes del dispositivo. La aplicación no solicita micrófono.',
    ],
  },
  {
    title: 'E. Proveedores y transferencias',
    paragraphs: [
      'Para operar la aplicación pueden intervenir proveedores tecnológicos que prestan infraestructura y servicios necesarios.',
      'Supabase se utiliza para autenticación, gestión de sesiones, base de datos, almacenamiento privado de evidencias y archivos, y generación de accesos temporales a archivos privados.',
      'Expo Notifications y los servicios de notificaciones de Google y Apple pueden intervenir para el envío y recepción de notificaciones operativas.',
      'Estos proveedores deben tratar la información conforme a sus obligaciones contractuales y medidas de seguridad. La infraestructura tecnológica puede implicar procesamiento o almacenamiento fuera de México, exclusivamente para operar el servicio.',
      'Los datos no se comparten con anunciantes, redes publicitarias ni corredores de datos.',
    ],
  },
  {
    title: 'F. Seguridad',
    paragraphs: [
      'Tamin aplica medidas razonables administrativas y técnicas para proteger la información, incluyendo transmisión mediante HTTPS, autenticación de usuarios, control de acceso por cuenta, empresa y rol, almacenamiento protegido, políticas de acceso y acceso restringido a personal autorizado.',
      'Ningún sistema puede garantizar seguridad absoluta; sin embargo, se busca prevenir accesos no autorizados, pérdida, alteración o uso indebido de la información.',
    ],
  },
  {
    title: 'G. Conservación',
    paragraphs: [
      'Los datos se conservan mientras la cuenta esté activa, mientras sean necesarios para gestionar instalaciones, evidencias e historial operativo, y durante los periodos necesarios para cumplir responsabilidades contractuales, administrativas o legales.',
      'Cuando los datos dejen de ser necesarios, deberán eliminarse, anonimizarse o bloquearse conforme a las obligaciones aplicables y a las capacidades técnicas de respaldo.',
    ],
  },
  {
    title: 'H. Derechos ARCO y privacidad',
    paragraphs: [
      'Las personas titulares pueden solicitar acceso, rectificación, cancelación, oposición, limitación del uso, revocación del consentimiento, eliminación de cuenta y datos cuando proceda.',
      'El canal para ejercer estos derechos es: tamin.desarrollo@gmail.com.',
      'La solicitud debe incluir nombre de la persona, correo asociado, relación con la instalación o cuenta, descripción clara de la solicitud e información suficiente para comprobar identidad y localizar los datos.',
      'Ciertas evidencias pueden conservarse temporalmente cuando exista una obligación contractual, administrativa o legal.',
    ],
  },
  {
    title: 'I. Eliminación de cuenta y datos',
    paragraphs: [
      'Actualmente la aplicación móvil no incluye un botón de eliminación directa de cuenta.',
      'El usuario puede solicitar la eliminación o desactivación de su cuenta y de los datos asociados mediante el administrador de su empresa o enviando una solicitud a tamin.desarrollo@gmail.com.',
      'La eliminación o desactivación se atenderá conforme a la relación operativa aplicable, las obligaciones legales y las capacidades técnicas del sistema.',
    ],
  },
  {
    title: 'J. Personas menores de edad',
    paragraphs: [
      'La aplicación es una herramienta laboral y operativa para personal autorizado y no está dirigida a menores de edad.',
    ],
  },
  {
    title: 'K. Cambios al aviso',
    paragraphs: [
      'Las modificaciones a este aviso podrán comunicarse mediante una actualización dentro de la aplicación, el sitio web oficial o los medios de contacto registrados, según corresponda.',
    ],
  },
  {
    title: 'L. Contacto',
    paragraphs: [
      'Responsable: Tamin Instalaciones, operada por Tamin',
      'Correo: tamin.desarrollo@gmail.com',
      'Sitio web: https://tamin.mx',
      `Domicilio:\n${legalAddress}`,
    ],
  },
];

export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          style={styles.backLink}
          onPress={() => router.back()}
          accessibilityRole="button"
        >
          <ChevronIcon direction="left" size={18} color={colors.primary} />
          <Text style={styles.backText}>Volver</Text>
        </Pressable>

        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Aviso de privacidad integral</Text>
            <Text style={styles.subtitle}>Tamin Instalaciones</Text>
            <Text style={styles.updated}>{lastUpdated}</Text>
          </View>

          {sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.paragraphs.map((paragraph) => (
                <Text key={paragraph} style={styles.body}>
                  {paragraph}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  backLink: {
    minHeight: 44,
    alignSelf: 'flex-start',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingRight: spacing.sm,
  },
  backText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 22,
  },
  card: {
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
  },
  subtitle: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  updated: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  body: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
});
