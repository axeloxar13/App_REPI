import * as Linking from 'expo-linking';
import { isSupabaseConfigured, supabase } from './supabase';

type RecoveryResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

export function getPasswordRecoveryRedirectUrl() {
  return Linking.createURL('/reset-password');
}

export async function sendPasswordRecoveryEmail(email: string): Promise<RecoveryResult> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      ok: false,
      error: 'Supabase Auth aún no está configurado para este proyecto.',
    };
  }

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getPasswordRecoveryRedirectUrl(),
  });

  return { ok: true };
}
