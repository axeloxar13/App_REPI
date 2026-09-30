import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogoHeader } from '../components/LogoHeader';
import { colors, spacing } from '../constants/theme';
import { useAuth } from '../context/AuthContext';

export default function SplashScreen() {
  const { status, selectedMembership } = useAuth();
  const [minimumReady, setMinimumReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMinimumReady(true);
    }, 900);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!minimumReady || status === 'checking') {
      return;
    }

    if (status !== 'authenticated') {
      router.replace('/login');
      return;
    }

    if (!selectedMembership) {
      router.replace('/select-company');
      return;
    }

    if (selectedMembership.role === 'admin') {
      router.replace('/admin');
      return;
    }

    if (selectedMembership.role === 'supervisor') {
      router.replace('/supervisor');
      return;
    }

    router.replace('/home');
  }, [
    minimumReady,
    selectedMembership,
    status,
  ]);

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      <LogoHeader logoSize="splash" />

      <View style={styles.loader}>
        <ActivityIndicator color={colors.primary} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },

  loader: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
});