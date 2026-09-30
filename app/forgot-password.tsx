import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { AuthInput } from '../components/AuthInput';
import { PrimaryButton } from '../components/PrimaryButton';
import { taminLogo } from '../constants/assets';
import { colors, radius, spacing } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { sendPasswordRecoveryEmail } from '../lib/passwordRecovery';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const recoverySuccessMessage =
  'Si existe una cuenta asociada, recibirás instrucciones en tu correo.';

export default function ForgotPasswordScreen() {
  const { rememberedEmail } = useAuth();

  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const entrance = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const messageAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (rememberedEmail) {
      setEmail(rememberedEmail);
    }

    Animated.timing(entrance, {
      toValue: 1,
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [rememberedEmail, entrance]);

  function showError(error: string) {
    setIsError(true);
    setMessage(error);
    messageAnimation.setValue(0);

    Animated.parallel([
      Animated.sequence([
        Animated.timing(shake, {
          toValue: 1,
          duration: 70,
          useNativeDriver: true,
        }),
        Animated.timing(shake, {
          toValue: -1,
          duration: 70,
          useNativeDriver: true,
        }),
        Animated.timing(shake, {
          toValue: 0.7,
          duration: 70,
          useNativeDriver: true,
        }),
        Animated.timing(shake, {
          toValue: -0.7,
          duration: 70,
          useNativeDriver: true,
        }),
        Animated.timing(shake, {
          toValue: 0,
          duration: 70,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(messageAnimation, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }

  function showInfo(info: string) {
    setIsError(false);
    setMessage(info);
    messageAnimation.setValue(0);

    Animated.timing(messageAnimation, {
      toValue: 1,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }

  async function handleSubmit() {
    if (isSubmitting) {
      return;
    }

    setMessage('');
    setIsError(false);

    if (!emailPattern.test(email.trim())) {
      showError('Ingresa un correo electrónico válido.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await sendPasswordRecoveryEmail(email.trim());

      if (!result.ok) {
        showError(result.error);
        return;
      }

      showInfo(recoverySuccessMessage);
    } catch {
      showError(
        'No fue posible enviar el enlace. Intenta nuevamente o ponte en contacto con el área de IT.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const panelTranslateY = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [35, 0],
  });

  const panelOpacity = entrance;

  const shakeTranslate = shake.interpolate({
    inputRange: [-1, 1],
    outputRange: [-9, 9],
  });

  const messageTranslateY = messageAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });

  return (
    <KeyboardAvoidingView
      style={styles.keyboard}
      behavior={Platform.select({
        ios: 'padding',
        android: undefined,
      })}
    >
      <StatusBar style="light" />

      <LinearGradient
        colors={['#071b3a', '#0b2d5c', '#0f4c81']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.background}
      >
        <View pointerEvents="none" style={styles.decorativeOrbTop} />
        <View pointerEvents="none" style={styles.decorativeOrbBottom} />

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              styles.panel,
              {
                opacity: panelOpacity,
                transform: [{ translateY: panelTranslateY }],
              },
            ]}
          >
            <View style={styles.logoContainer}>
              <Image
                source={taminLogo}
                style={styles.logo}
                resizeMode="contain"
                accessibilityLabel="Logo Tamin"
              />
            </View>

            <View style={styles.titleContainer}>
              <Text style={styles.title}>Recuperar contraseña</Text>
              <Text style={styles.subtitle}>
                Ingresa tu correo y te enviaremos un enlace para restablecer
                tu contraseña.
              </Text>
            </View>

            <View style={styles.form}>
              <AuthInput
                label="Correo electrónico"
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  if (message) {
                    setMessage('');
                    setIsError(false);
                  }
                }}
                placeholder="tecnico@empresa.com"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoCapitalize="none"
                autoCorrect={false}
              />

              {message ? (
                <Animated.View
                  style={[
                    styles.messageContainer,
                    isError ? styles.errorContainer : styles.infoContainer,
                    {
                      opacity: messageAnimation,
                      transform: [{ translateY: messageTranslateY }],
                    },
                  ]}
                >
                  <Ionicons
                    name={isError ? 'alert-circle-outline' : 'checkmark-circle-outline'}
                    size={21}
                    color={isError ? colors.error : colors.primary}
                  />
                  <Text
                    style={[
                      styles.message,
                      isError ? styles.errorText : styles.infoText,
                    ]}
                  >
                    {message}
                  </Text>
                </Animated.View>
              ) : null}

              <Animated.View
                style={{ transform: [{ translateX: shakeTranslate }] }}
              >
                <PrimaryButton
                  title="Enviar enlace"
                  onPress={handleSubmit}
                  loading={isSubmitting}
                  disabled={isSubmitting}
                />
              </Animated.View>

              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => [
                  styles.backButton,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Volver al inicio de sesión"
              >
                <Ionicons
                  name="arrow-back-outline"
                  size={18}
                  color={colors.primary}
                />
                <Text style={styles.backLink}>
                  Volver al inicio de sesión
                </Text>
              </Pressable>
            </View>

            <View style={styles.itNotice}>
              <View style={styles.itIcon}>
                <Ionicons
                  name="information-circle-outline"
                  size={21}
                  color={colors.primary}
                />
              </View>

              <View style={styles.itTextContainer}>
                <Text style={styles.itTitle}>¿No funciona el enlace?</Text>
                <Text style={styles.itText}>
                  Si el enlace no funciona o no recibes el correo, favor de
                  ponerse en contacto con el área de IT.
                </Text>
              </View>
            </View>

            <Text style={styles.footer}>Soporte de acceso · Tamin</Text>
          </Animated.View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1,
    backgroundColor: '#071b3a',
  },
  background: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  decorativeOrbTop: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: -100,
    right: -80,
  },
  decorativeOrbBottom: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(255,255,255,0.04)',
    bottom: -160,
    left: -120,
  },
  panel: {
    width: '100%',
    maxWidth: 450,
    borderRadius: 28,
    backgroundColor: '#ffffff',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
  logoContainer: {
    width: '100%',
    height: 125,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  logo: {
    width: '90%',
    height: 115,
  },
  titleContainer: {
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 32,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: spacing.sm,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  form: {
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errorContainer: {
    borderColor: '#fecaca',
    backgroundColor: colors.errorSoft,
  },
  infoContainer: {
    borderColor: '#bfdbfe',
    backgroundColor: colors.primarySoft,
  },
  message: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    color: colors.error,
  },
  infoText: {
    color: colors.primary,
  },
  backButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  backLink: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  pressed: {
    opacity: 0.65,
  },
  itNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  itIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  itTextContainer: {
    flex: 1,
  },
  itTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
  },
  itText: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  footer: {
    marginTop: spacing.md,
    color: '#94a3b8',
    fontSize: 11,
    textAlign: 'center',
  },
});
