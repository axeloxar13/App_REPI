import { useEffect, useRef, useState } from 'react';

import {
  Image,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { AuthInput } from '../components/AuthInput';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, radius, spacing } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { taminLogo } from '../constants/assets';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const { status, rememberedEmail, selectedMembership, signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const shakeAnimation = useRef(new Animated.Value(0)).current;
  const messageAnimation = useRef(new Animated.Value(0)).current;
  const panelAnimation = useRef(new Animated.Value(0)).current;
  const buttonGlowAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (rememberedEmail) {
      setEmail(rememberedEmail);
    }
  }, [rememberedEmail]);

  useEffect(() => {
    Animated.spring(panelAnimation, {
      toValue: 1,
      friction: 8,
      tension: 55,
      useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(buttonGlowAnimation, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(buttonGlowAnimation, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [buttonGlowAnimation, panelAnimation]);

  function animateError() {
    shakeAnimation.setValue(0);

    Animated.sequence([
      Animated.timing(shakeAnimation, {
        toValue: 1,
        duration: 55,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: -1,
        duration: 55,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 1,
        duration: 55,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: -1,
        duration: 55,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 0,
        duration: 70,
        useNativeDriver: true,
      }),
    ]).start();

    messageAnimation.setValue(0);
    Animated.spring(messageAnimation, {
      toValue: 1,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }

  function setLoginError(text: string) {
    setIsError(true);
    setMessage(text);
    animateError();
  }

  async function handleSubmit() {
    if (isSubmitting) {
      return;
    }

    setMessage('');
    setIsError(false);

    if (!email.trim() || !password) {
      setLoginError('Ingresa correo y contraseña');
      return;
    }

    if (!emailPattern.test(email.trim())) {
      setLoginError('Ingresa un correo electrónico válido.');
      return;
    }

    setIsSubmitting(true);

    const result = await signIn(
      email.trim(),
      password,
      rememberMe,
    );

    if (!result.ok) {
      setIsSubmitting(false);
      setLoginError(result.error);
      return;
    }

    setIsSubmitting(false);

    if (result.requiresCompanySelection) {
      router.replace('/select-company');
      return;
    }

    if (result.role === 'admin') {
      router.replace('/admin');
      return;
    }

    if (result.role === 'supervisor') {
      router.replace('/supervisor');
      return;
    }

    router.replace('/home');
  }

  function handleForgotPassword() {
    router.push('/forgot-password');
  }

  function handleOpenPrivacyPolicy() {
    router.push('/privacy-policy');
  }

  if (status === 'authenticated') {
  if (!selectedMembership) {
    return <Redirect href="/select-company" />;
  }

  if (selectedMembership.role === 'admin') {
    return <Redirect href="/admin" />;
  }

  if (selectedMembership.role === 'supervisor') {
    return <Redirect href="/supervisor" />;
  }

    return <Redirect href="/home" />;
  }

  const shakeTranslate = shakeAnimation.interpolate({
    inputRange: [-1, 1],
    outputRange: [-8, 8],
  });

  const panelTranslateY = panelAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [28, 0],
  });

  const panelScale = panelAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.97, 1],
  });

  const messageTranslateY = messageAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [-8, 0],
  });

  const messageOpacity = messageAnimation;

  const buttonOpacity = buttonGlowAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1],
  });

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <LinearGradient
        colors={['#07152d', '#0b2d58', '#155e91']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.backgroundGradient}
      >
        <View style={styles.backgroundOrbOne} />
        <View style={styles.backgroundOrbTwo} />
        <View style={styles.backgroundOrbThree} />

        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.select({
            ios: 'padding',
            android: undefined,
          })}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View
              style={[
                styles.panelWrapper,
                {
                  opacity: panelAnimation,
                  transform: [
                    { translateY: panelTranslateY },
                    { scale: panelScale },
                  ],
                },
              ]}
            >
              <View style={styles.panel}>
                <View style={styles.topAccent} />

                <View style={styles.brandArea}>
                  <View style={styles.logoShell}>
                    <View style={styles.logoContainer}>
            <Image
              source={taminLogo}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="Logo Tamin"
            />
          </View>
                  </View>

                  <View style={styles.welcomeBlock}>
                    <Text style={styles.subtitle}>
                      Accede para gestionar tus instalaciones de forma segura.
                    </Text>
                  </View>
                </View>

                <Animated.View
                  style={[
                    styles.form,
                    {
                      transform: [{ translateX: shakeTranslate }],
                    },
                  ]}
                >
                  <View style={styles.inputGroup}>
                    <View style={styles.inputLabelRow}>
                      <Ionicons
                        name="mail-outline"
                        size={16}
                        color="#5b6b83"
                      />
                      <Text style={styles.inputLabel}>Correo electrónico</Text>
                    </View>

                    <AuthInput
                      label=""
                      value={email}
                      onChangeText={(value) => {
                        setEmail(value);
                        if (message && isError) {
                          setMessage('');
                          setIsError(false);
                        }
                      }}
                      placeholder="persona@repi.mx"
                      keyboardType="email-address"
                      textContentType="emailAddress"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <View style={styles.inputLabelRow}>
                      <Ionicons
                        name="lock-closed-outline"
                        size={16}
                        color="#5b6b83"
                      />
                      <Text style={styles.inputLabel}>Contraseña</Text>
                    </View>

                    <AuthInput
                      label=""
                      value={password}
                      onChangeText={(value) => {
                        setPassword(value);
                        if (message && isError) {
                          setMessage('');
                          setIsError(false);
                        }
                      }}
                      placeholder="Ingresa tu contraseña"
                      secureTextEntry
                      allowVisibilityToggle
                      textContentType="password"
                    />
                  </View>

                  <View style={styles.optionsRow}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.remember,
                        pressed && styles.pressed,
                      ]}
                      onPress={() => setRememberMe((current) => !current)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: rememberMe }}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          rememberMe && styles.checkboxChecked,
                        ]}
                      >
                        {rememberMe ? (
                          <Ionicons
                            name="checkmark"
                            size={14}
                            color="#ffffff"
                          />
                        ) : null}
                      </View>

                      <Text style={styles.optionText}>Recordarme</Text>
                    </Pressable>

                    <Pressable
                      onPress={handleForgotPassword}
                      style={({ pressed }) => pressed && styles.pressed}
                    >
                      <Text style={styles.link}>
                        ¿Olvidaste tu contraseña?
                      </Text>
                    </Pressable>
                  </View>

                  {message ? (
                    <Animated.View
                      style={[
                        styles.message,
                        isError
                          ? styles.errorMessage
                          : styles.infoMessage,
                        {
                          opacity: messageOpacity,
                          transform: [{ translateY: messageTranslateY }],
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.messageIcon,
                          isError
                            ? styles.errorIcon
                            : styles.infoIcon,
                        ]}
                      >
                        <Ionicons
                          name={
                            isError
                              ? 'alert-circle-outline'
                              : 'information-circle-outline'
                          }
                          size={18}
                          color={
                            isError
                              ? '#dc2626'
                              : colors.primary
                          }
                        />
                      </View>

                      <Text
                        style={[
                          styles.messageText,
                          isError
                            ? styles.errorText
                            : styles.infoText,
                        ]}
                      >
                        {message}
                      </Text>
                    </Animated.View>
                  ) : null}

                  <Animated.View style={{ opacity: buttonOpacity }}>
                    <LinearGradient
                      colors={['#2563eb', '#0ea5e9']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.buttonGradient}
                    >
                      <PrimaryButton
                        title="Ingresar"
                        onPress={handleSubmit}
                        loading={isSubmitting}
                        disabled={
                          isSubmitting ||
                          status === 'checking'
                        }
                      />
                    </LinearGradient>
                  </Animated.View>
                </Animated.View>

                <View style={styles.securityNote}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={16}
                    color="#64748b"
                  />
                  <Text style={styles.securityText}>
                    Acceso protegido y diseñado para tu equipo de trabajo.
                  </Text>
                </View>

                <View style={styles.footer}>
                  <View style={styles.footerLine} />

                  <Pressable
                    style={({ pressed }) =>
                      pressed && styles.pressed
                    }
                    onPress={handleOpenPrivacyPolicy}
                    accessibilityRole="link"
                  >
                    <Text style={styles.link}>
                      Política de privacidad
                    </Text>
                  </Pressable>
                </View>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  logoContainer: {
    width: '100%',
    height: 145,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  logo: {
    width: '92%',
    height: 135,
  },
  root: {
    flex: 1,
    backgroundColor: '#07152d',
  },

  backgroundGradient: {
    flex: 1,
    overflow: 'hidden',
  },

  backgroundOrbOne: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(37, 99, 235, 0.18)',
    top: -100,
    right: -90,
  },

  backgroundOrbTwo: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(14, 165, 233, 0.13)',
    bottom: -70,
    left: -80,
  },

  backgroundOrbThree: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    top: '34%',
    right: -45,
  },

  keyboard: {
    flex: 1,
  },

  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },

  panelWrapper: {
    width: '100%',
    maxWidth: 470,
    alignSelf: 'center',
  },

  panel: {
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: '#ffffff',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.24,
    shadowRadius: 28,
    elevation: 12,
  },

  topAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
    backgroundColor: '#2563eb',
  },

  brandArea: {
    alignItems: 'center',
  },

  logoShell: {
    width: '100%',
    alignItems: 'center',
  },

  welcomeBlock: {
    alignItems: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },

  eyebrow: {
    color: '#2563eb',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
    lineHeight: 16,
    marginBottom: 4,
  },

  title: {
    color: '#0f172a',
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36,
    letterSpacing: -0.5,
  },

  subtitle: {
    maxWidth: 360,
    marginTop: 7,
    color: '#64748b',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },

  form: {
    gap: spacing.md,
    marginTop: spacing.xl,
  },

  inputGroup: {
    gap: 5,
  },

  inputLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 2,
  },

  inputLabel: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },

  optionsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: -2,
  },

  remember: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 36,
  },

  checkbox: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 7,
    backgroundColor: '#f8fafc',
  },

  checkboxChecked: {
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
  },

  optionText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 20,
  },

  link: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 20,
  },

  pressed: {
    opacity: 0.65,
  },

  message: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  errorMessage: {
    borderColor: '#fecaca',
    backgroundColor: '#fff1f2',
  },

  infoMessage: {
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },

  messageIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },

  errorIcon: {
    backgroundColor: '#fee2e2',
  },

  infoIcon: {
    backgroundColor: '#dbeafe',
  },

  messageText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },

  errorText: {
    color: '#b91c1c',
  },

  infoText: {
    color: '#1d4ed8',
  },

  buttonGradient: {
    minHeight: 52,
    borderRadius: radius.md,
    overflow: 'hidden',
    justifyContent: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 5,
  },

  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.sm,
  },

  securityText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
    textAlign: 'center',
  },

  footer: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },

  footerLine: {
    width: '100%',
    height: 1,
    backgroundColor: '#e2e8f0',
    marginBottom: 2,
  },
});
