// app/_layout.tsx

import { Stack } from 'expo-router';
import { AuthProvider } from '../context/AuthContext';
import { NotificationProvider } from '../context/NotificationContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { StatusBar } from 'expo-status-bar';

// Componente interno para aplicar el tema
function ThemedStack() {
  console.log('🟢 DIAGNÓSTICO: ThemedStack inició');

  const { colors: themeColors, isDark } = useTheme();

  console.log('🟢 DIAGNÓSTICO: useTheme respondió');

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: themeColors.background,
          },
        }}
      >
        {/* Pantallas principales */}
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="home" />

        {/* Supervisor */}
        <Stack.Screen name="supervisor" />

        <Stack.Screen name="select-company" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="privacy-policy" />
        <Stack.Screen name="notifications" />

        {/* Pantalla de Fotos con Ubicación - Admin */}
        <Stack.Screen
          name="admin/photos/index"
          options={{
            headerShown: true,
            title: 'Fotos',
            headerBackTitle: 'Volver',
            headerStyle: {
              backgroundColor: themeColors.background,
            },
            headerTintColor: themeColors.text,
            headerShadowVisible: false,
          }}
        />

        {/* Pantalla de Dispositivos Instalados - Admin */}
        <Stack.Screen
          name="admin/devices/index"
          options={{
            headerShown: true,
            title: '📱 Dispositivos Instalados',
            headerBackTitle: 'Volver',
            headerStyle: {
              backgroundColor: themeColors.background,
            },
            headerTintColor: themeColors.text,
            headerShadowVisible: false,
          }}
        />

        {/* Admin */}
        <Stack.Screen name="admin/index" />

        {/* Technician */}
        {/* La ruta technician/installations/[id] no existe actualmente */}

        {/* Otras rutas */}
        <Stack.Screen name="administrators" />
        <Stack.Screen name="technicians" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  console.log('🔵 DIAGNÓSTICO: RootLayout inició');

  console.log('🟡 DIAGNÓSTICO: Antes de ThemeProvider');

  return (
    <ThemeProvider>
      {console.log('🟡 DIAGNÓSTICO: ThemeProvider montado')}

      <AuthProvider>
        {console.log('🟠 DIAGNÓSTICO: AuthProvider montado')}

        <NotificationProvider>
          {console.log('🟣 DIAGNÓSTICO: NotificationProvider montado')}

          <ThemedStack />
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}