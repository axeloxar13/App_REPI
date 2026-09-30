import AsyncStorage from '@react-native-async-storage/async-storage';

const REMEMBERED_EMAIL_KEY = 'tamin-installations:remembered-email';

export async function getRememberedEmail() {
  return AsyncStorage.getItem(REMEMBERED_EMAIL_KEY);
}

export async function saveRememberedEmail(email: string) {
  await AsyncStorage.setItem(REMEMBERED_EMAIL_KEY, email);
}

export async function removeRememberedEmail() {
  await AsyncStorage.removeItem(REMEMBERED_EMAIL_KEY);
}
