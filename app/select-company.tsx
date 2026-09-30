import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  Redirect,
  router,
} from 'expo-router';

import {
  SafeAreaView,
} from 'react-native-safe-area-context';

import {
  StatusBar,
} from 'expo-status-bar';

import {
  LogoHeader,
} from '../components/LogoHeader';

import {
  LoadingState,
} from '../components/LoadingState';

import {
  colors,
  radius,
  spacing,
} from '../constants/theme';

import {
  useAuth,
} from '../context/AuthContext';

export default function SelectCompanyScreen() {
  const {
    status,
    memberships,
    selectedMembership,
    selectMembership,
    signOut,
  } = useAuth();

  async function handleSelect(
    membershipId: string,
  ) {
    const membership =
      memberships.find(
        (item) =>
          item.id === membershipId,
      );

    if (!membership) {
      return;
    }

    const ok =
      await selectMembership(
        membershipId,
      );

    if (!ok) {
      return;
    }

    router.replace(
      membership.role === 'admin'
        ? '/admin'
        : '/home',
    );
  }

  async function handleSignOut() {
    await signOut();

    router.replace('/login');
  }

  if (status === 'checking') {
    return (
      <View style={styles.centerScreen}>
        <StatusBar style="dark" />

        <LoadingState
          text="Comprobando acceso"
        />
      </View>
    );
  }

  if (status !== 'authenticated') {
    return (
      <Redirect href="/login" />
    );
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
    >
      <StatusBar style="dark" />

      <View
        style={styles.content}
      >
        <View
          style={styles.panel}
        >
          <LogoHeader
            title="Tamin Instalaciones"
            subtitle="Selecciona empresa"
          />

          <View
            style={styles.companyList}
          >
            {memberships.map(
              (membership) => (
                <Pressable
                  key={membership.id}
                  style={[
                    styles.companyButton,

                    selectedMembership?.id ===
                    membership.id
                      ? styles.companyButtonSelected
                      : null,
                  ]}
                  onPress={() =>
                    handleSelect(
                      membership.id,
                    )
                  }
                  accessibilityRole="button"
                >
                  <View
                    style={
                      styles.companyInfo
                    }
                  >
                    <Text
                      style={
                        styles.companyName
                      }
                    >
                      {
                        membership.organizationName
                      }
                    </Text>

                    <Text
                      style={
                        styles.roleText
                      }
                    >
                      {membership.role ===
                      'admin'
                        ? 'Administrador'
                        : 'Técnico'}
                    </Text>
                  </View>

                  <Text
                    style={
                      styles.companyAction
                    }
                  >
                    Entrar
                  </Text>
                </Pressable>
              ),
            )}
          </View>

          <Pressable
            style={
              styles.logoutButton
            }
            onPress={
              handleSignOut
            }
            accessibilityRole="button"
          >
            <Text
              style={
                styles.logoutText
              }
            >
              Cerrar sesión
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor:
      colors.background,
  },

  centerScreen: {
    flex: 1,
    backgroundColor:
      colors.background,
  },

  content: {
    flex: 1,
    justifyContent:
      'center',
    padding:
      spacing.lg,
  },

  panel: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    gap:
      spacing.lg,
    borderWidth: 1,
    borderColor:
      colors.border,
    borderRadius:
      radius.lg,
    backgroundColor:
      colors.surface,
    padding:
      spacing.lg,
  },

  companyList: {
    gap:
      spacing.sm,
  },

  companyButton: {
    minHeight: 62,
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'space-between',
    gap:
      spacing.md,
    borderWidth: 1,
    borderColor:
      '#e4edf7',
    borderRadius:
      radius.sm,
    backgroundColor:
      colors.background,
    paddingHorizontal:
      spacing.md,
    paddingVertical:
      spacing.sm,
  },

  companyButtonSelected: {
    borderColor:
      colors.primary,
    backgroundColor:
      colors.primarySoft,
  },

  companyInfo: {
    flex: 1,
    gap: 2,
  },

  companyName: {
    color:
      colors.text,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },

  roleText: {
    color:
      colors.muted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },

  companyAction: {
    color:
      colors.primary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },

  logoutButton: {
    alignSelf:
      'center',
    minHeight: 42,
    justifyContent:
      'center',
    paddingHorizontal:
      spacing.md,
  },

  logoutText: {
    color:
      colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
});