import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';

import {
  getRememberedEmail,
  removeRememberedEmail,
  saveRememberedEmail,
} from '../lib/authStorage';

import { deactivateCurrentPushDevice } from '../lib/pushNotifications';
import { clearPrivateStorageUrlCache } from '../lib/privateStorageUrls';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const SELECTED_MEMBERSHIP_KEY = 'tamin:selected-membership';

const SELECTED_MEMBERSHIP_SNAPSHOT_KEY =
  'tamin:selected-membership-snapshot';

export type UserRole = 'technician' | 'admin' | 'supervisor';

export type MembershipAccessStatus = 'active' | 'inactive';

export type AppMembership = {
  id: string;
  organizationId: string;
  organizationName: string;
  userId: string;
  fullName: string;
  email: string;

  role: UserRole;

  status: string;
  active: boolean;
  archivedAt: string | null;

  accessStatus: MembershipAccessStatus;
  isActive: boolean;
};

export type AppProfile = {
  id: string;
  fullName: string;
  role: UserRole;
  active: boolean;
  email: string;
};

type AuthStatus =
  | 'checking'
  | 'authenticated'
  | 'unauthenticated';

type AuthResult =
  | {
      ok: true;
      requiresCompanySelection: boolean;
      role: UserRole | null;
    }
  | {
      ok: false;
      error: string;
    };

type AuthContextValue = {
  status: AuthStatus;

  session: Session | null;
  user: User | null;

  profile: AppProfile | null;

  memberships: AppMembership[];
  selectedMembership: AppMembership | null;

  rememberedEmail: string;

  isConfigured: boolean;

  signIn: (
    email: string,
    password: string,
    rememberEmail: boolean,
  ) => Promise<AuthResult>;

  signOut: () => Promise<void>;

  selectMembership: (
    membershipId: string,
  ) => Promise<boolean>;

  refreshSession: (
    options?: { silent?: boolean },
  ) => Promise<void>;
};

type OrganizationRow = {
  id: string;
  name: string;
  active: boolean;
};

type MembershipRow = {
  id: string;
  organization_id: string;
  user_id: string;

  role: string;

  status: string;
  active: boolean;

  full_name: string;
  email_snapshot: string;

  archived_at: string | null;

  organizations:
    | OrganizationRow
    | OrganizationRow[]
    | null;
};

type MembershipSnapshot = Pick<
  AppMembership,
  | 'id'
  | 'organizationId'
  | 'organizationName'
  | 'fullName'
  | 'email'
  | 'role'
>;

const AuthContext =
  createContext<AuthContextValue | null>(null);

function mapAuthError(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes('invalid login credentials') ||
    normalized.includes('invalid credentials') ||
    normalized.includes('email not confirmed')
  ) {
    return 'Correo o contraseña incorrectos';
  }

  return 'No se pudo iniciar sesión. Intenta nuevamente.';
}

function firstOrganization(
  organization:
    | OrganizationRow
    | OrganizationRow[]
    | null,
) {
  if (Array.isArray(organization)) {
    return organization[0] ?? null;
  }

  return organization;
}

async function readMembershipSnapshot() {
  const stored = await AsyncStorage.getItem(
    SELECTED_MEMBERSHIP_SNAPSHOT_KEY,
  );

  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(
      stored,
    ) as MembershipSnapshot;
  } catch {
    await AsyncStorage.removeItem(
      SELECTED_MEMBERSHIP_SNAPSHOT_KEY,
    );

    return null;
  }
}

async function saveMembershipSnapshot(
  membership: AppMembership,
) {
  const snapshot: MembershipSnapshot = {
    id: membership.id,

    organizationId:
      membership.organizationId,

    organizationName:
      membership.organizationName,

    fullName:
      membership.fullName,

    email:
      membership.email,

    role:
      membership.role,
  };

  await AsyncStorage.setItem(
    SELECTED_MEMBERSHIP_SNAPSHOT_KEY,
    JSON.stringify(snapshot),
  );
}

function mapMembership(
  row: MembershipRow,
  snapshot: MembershipSnapshot | null,
): AppMembership | null {
  const organization =
    firstOrganization(row.organizations);

  if (
    row.role !== 'technician' &&
    row.role !== 'admin' &&
    row.role !== 'supervisor'
  ) {
    return null;
  }

  const role = row.role as UserRole;

  const cachedOrganizationName =
    snapshot?.id === row.id
      ? snapshot.organizationName
      : null;

  const organizationName =
    organization?.name ??
    cachedOrganizationName;

  const isActive =
    row.status === 'active' &&
    row.active === true &&
    row.archived_at === null &&
    organization?.active === true;

  return {
    id: row.id,

    organizationId:
      row.organization_id,

    organizationName:
      organizationName ??
      'Empresa seleccionada',

    userId:
      row.user_id,

    fullName:
      row.full_name,

    email:
      row.email_snapshot,

    role,

    status:
      row.status,

    active:
      row.active,

    archivedAt:
      row.archived_at,

    accessStatus:
      isActive
        ? 'active'
        : 'inactive',

    isActive,
  };
}

function buildProfile(
  membership: AppMembership,
): AppProfile {
  return {
    id:
      membership.userId,

    fullName:
      membership.fullName,

    role:
      membership.role,

    active:
      membership.isActive,

    email:
      membership.email,
  };
}

export function AuthProvider({
  children,
}: PropsWithChildren) {
  const [status, setStatus] =
    useState<AuthStatus>('checking');

  const [session, setSession] =
    useState<Session | null>(null);

  const [memberships, setMemberships] =
    useState<AppMembership[]>([]);

  const [
    selectedMembership,
    setSelectedMembership,
  ] =
    useState<AppMembership | null>(null);

  const [
    rememberedEmail,
    setRememberedEmail,
  ] =
    useState('');

  const clearAuthState =
    useCallback(() => {
      setSession(null);
      setMemberships([]);
      setSelectedMembership(null);
      setStatus('unauthenticated');
    }, []);

  const loadRememberedEmail =
    useCallback(async () => {
      const storedEmail =
        await getRememberedEmail();

      setRememberedEmail(
        storedEmail ?? '',
      );
    }, []);

  const rejectSession =
    useCallback(
      async (
        error: string,
      ): Promise<AuthResult> => {
        if (supabase) {
          await supabase.auth.signOut();
        }

        await AsyncStorage.removeItem(
          SELECTED_MEMBERSHIP_KEY,
        );

        await AsyncStorage.removeItem(
          SELECTED_MEMBERSHIP_SNAPSHOT_KEY,
        );

        clearPrivateStorageUrlCache();

        clearAuthState();

        return {
          ok: false,
          error,
        };
      },
      [clearAuthState],
    );

  const validateSession =
    useCallback(
      async (
        nextSession: Session | null,
      ): Promise<AuthResult> => {
        if (!nextSession || !supabase) {
          clearAuthState();

          return {
            ok: false,
            error:
              'No hay una sesión activa.',
          };
        }

        const { data, error } =
          await supabase
            .from(
              'organization_memberships',
            )
            .select(
              `
              id,
              organization_id,
              user_id,
              role,
              status,
              active,
              full_name,
              email_snapshot,
              archived_at,
              organizations (
                id,
                name,
                active
              )
            `,
            )
            .eq(
              'user_id',
              nextSession.user.id,
            )
            .in(
              'role',
              ['technician', 'admin', 'supervisor'],
            )
            .order(
              'created_at',
              {
                ascending: true,
              },
            )
            .returns<MembershipRow[]>();

        if (error) {
          console.error(
            'Error obteniendo membresías:',
            error,
          );

          return rejectSession(
            'No pudimos validar tu acceso.',
          );
        }

        const cachedMembershipSnapshot =
          await readMembershipSnapshot();

        const appMemberships =
          (data ?? [])
            .map(
              (membership) =>
                mapMembership(
                  membership,
                  cachedMembershipSnapshot,
                ),
            )
            .filter(
              (
                membership,
              ): membership is AppMembership =>
                Boolean(membership),
            );

        if (
          appMemberships.length === 0
        ) {
          return rejectSession(
            'No tienes acceso a ninguna empresa.',
          );
        }

        const storedMembershipId =
          await AsyncStorage.getItem(
            SELECTED_MEMBERSHIP_KEY,
          );

        const storedMembership =
          appMemberships.find(
            (membership) =>
              membership.id ===
              storedMembershipId,
          );

        const nextSelected =
          storedMembership ??
          (appMemberships.length === 1
            ? appMemberships[0]
            : null);

        if (nextSelected) {
          await AsyncStorage.setItem(
            SELECTED_MEMBERSHIP_KEY,
            nextSelected.id,
          );

          await saveMembershipSnapshot(
            nextSelected,
          );
        } else {
          await AsyncStorage.removeItem(
            SELECTED_MEMBERSHIP_KEY,
          );

          await AsyncStorage.removeItem(
            SELECTED_MEMBERSHIP_SNAPSHOT_KEY,
          );
        }

        setSession(nextSession);

        setMemberships(
          appMemberships,
        );

        setSelectedMembership(
          nextSelected,
        );

        setStatus(
          'authenticated',
        );

        return {
          ok: true,

          requiresCompanySelection:
            !nextSelected,

          role:
            nextSelected?.role ?? null,
        };
      },
      [
        clearAuthState,
        rejectSession,
      ],
    );

  const refreshSession =
    useCallback(
      async (
        options?: {
          silent?: boolean;
        },
      ) => {
        if (!supabase) {
          clearAuthState();
          return;
        }

        if (!options?.silent) {
          setStatus('checking');
        }

        const { data } =
          await supabase.auth.getSession();

        await validateSession(
          data.session,
        );
      },
      [
        clearAuthState,
        validateSession,
      ],
    );

  const signIn =
    useCallback(
      async (
        email: string,
        password: string,
        rememberEmail: boolean,
      ): Promise<AuthResult> => {
        if (
          !isSupabaseConfigured ||
          !supabase
        ) {
          return {
            ok: false,
            error:
              'Supabase Auth aún no está configurado para este proyecto.',
          };
        }

        const { data, error } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (error) {
          clearAuthState();

          return {
            ok: false,
            error:
              mapAuthError(
                error.message,
              ),
          };
        }

        const validation =
          await validateSession(
            data.session,
          );

        if (!validation.ok) {
          return validation;
        }

        if (rememberEmail) {
          await saveRememberedEmail(
            email,
          );

          setRememberedEmail(
            email,
          );
        } else {
          await removeRememberedEmail();

          setRememberedEmail('');
        }

        return validation;
      },
      [
        clearAuthState,
        validateSession,
      ],
    );

  const selectMembership =
    useCallback(
      async (
        membershipId: string,
      ) => {
        const membership =
          memberships.find(
            (item) =>
              item.id === membershipId,
          );

        if (!membership) {
          return false;
        }

        await AsyncStorage.setItem(
          SELECTED_MEMBERSHIP_KEY,
          membership.id,
        );

        await saveMembershipSnapshot(
          membership,
        );

        clearPrivateStorageUrlCache();

        setSelectedMembership(
          membership,
        );

        return true;
      },
      [memberships],
    );

  const signOut =
    useCallback(async () => {
      await deactivateCurrentPushDevice(
        session?.user.id ?? null,
      );

      if (supabase) {
        await supabase.auth.signOut();
      }

      await AsyncStorage.removeItem(
        SELECTED_MEMBERSHIP_KEY,
      );

      await AsyncStorage.removeItem(
        SELECTED_MEMBERSHIP_SNAPSHOT_KEY,
      );

      clearPrivateStorageUrlCache();

      clearAuthState();
    }, [
      clearAuthState,
      session?.user.id,
    ]);

  useEffect(() => {
    loadRememberedEmail();
  }, [loadRememberedEmail]);

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      if (!supabase) {
        clearAuthState();
        return;
      }

      const { data } =
        await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      await validateSession(
        data.session,
      );
    }

    bootstrap();

    if (!supabase) {
      return () => {
        isMounted = false;
      };
    }

    const {
      data: { subscription },
    } =
      supabase.auth.onAuthStateChange(
        (
          _event,
          nextSession,
        ) => {
          if (!isMounted) {
            return;
          }

          if (!nextSession) {
            clearAuthState();
            return;
          }

          validateSession(
            nextSession,
          );
        },
      );

    return () => {
      isMounted = false;

      subscription.unsubscribe();
    };
  }, [
    clearAuthState,
    validateSession,
  ]);

  const profile =
    selectedMembership
      ? buildProfile(
          selectedMembership,
        )
      : null;

  const value =
    useMemo<AuthContextValue>(
      () => ({
        status,

        session,

        user:
          session?.user ?? null,

        profile,

        memberships,

        selectedMembership,

        rememberedEmail,

        isConfigured:
          isSupabaseConfigured,

        supabase,
        
        signIn,

        signOut,

        selectMembership,

        refreshSession,
      }),
      [
        memberships,
        profile,
        refreshSession,
        rememberedEmail,
        selectedMembership,
        selectMembership,
        session,
        signIn,
        signOut,
        status,
      ],
    );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value =
    useContext(AuthContext);

  if (!value) {
    throw new Error(
      'useAuth must be used inside AuthProvider',
    );
  }

  return value;
}