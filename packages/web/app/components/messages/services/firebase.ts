/**
 * Firebase service stub.
 *
 * Replaces the real Firebase SDK integration with no-op implementations so the
 * messages feature can compile and render without a Firebase dependency.
 */
import { type MediaFileDetail, MediaStatus } from '@/app/types/media';

// ---------------------------------------------------------------------------
// Stub types that mirror the subset of firebase/auth types consumers rely on
// ---------------------------------------------------------------------------

/** Minimal shape that matches what callers access on a Firebase User. */
export interface StubFirebaseUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  phoneNumber: string | null;
  getIdToken: () => Promise<string>;
}

/** Minimal shape standing in for firebase/auth RecaptchaVerifier. */
export interface StubRecaptchaVerifier {
  clear: () => void;
}

/** Minimal shape standing in for firebase/auth ConfirmationResult. */
export interface StubConfirmationResult {
  confirm: (code: string) => Promise<{ user: StubFirebaseUser }>;
}

/** Return type of initializeFirebase. */
interface StubFirebaseServices {
  firebaseApp: null;
  auth: null;
  storage: null;
}

// ---------------------------------------------------------------------------
// Stub implementations
// ---------------------------------------------------------------------------

export const initializeFirebase = (): StubFirebaseServices => {
  return { firebaseApp: null, auth: null, storage: null };
};

export const getCurrentFirebaseUser = async (): Promise<StubFirebaseUser | null> => {
  return null;
};

export const checkSimpleFirebaseAuth = async (): Promise<StubFirebaseUser | null> => {
  return null;
};

export const checkFirebaseAuth = async (): Promise<boolean> => {
  return false;
};

export const signInWithEmailPassword = async (
  _email: string,
  _password: string
): Promise<StubFirebaseUser> => {
  throw new Error('Firebase is not available in this environment.');
};

export const signUpWithEmailPassword = async (
  _email: string,
  _password: string
): Promise<StubFirebaseUser> => {
  throw new Error('Firebase is not available in this environment.');
};

export const signInOrSignUp = async (
  _email: string,
  _password: string
): Promise<{ user: StubFirebaseUser; isNewUser: boolean }> => {
  throw new Error('Firebase is not available in this environment.');
};

export const uploadFile = async (
  _groupName: string,
  _namespace: string,
  id: string,
  file: MediaFileDetail,
  _onUpdate: (fileId: string, progress: number) => void
): Promise<MediaFileDetail> => {
  console.warn('[firebase stub] uploadFile called – returning stub result');
  return {
    ...file,
    link: '',
    status: MediaStatus.PENDING,
    path: `stub/${id}-${file.name}`,
  };
};

export const signOutFromFirebase = async (): Promise<void> => {
  // no-op
};

export const initializeRecaptcha = (_containerId: string): StubRecaptchaVerifier => {
  return { clear: () => {} };
};

export const sendSMSVerification = async (
  _phoneNumber: string,
  _recaptcha: StubRecaptchaVerifier
): Promise<StubConfirmationResult> => {
  throw new Error('Firebase is not available in this environment.');
};

export const verifySMSCode = async (
  _confirmationResult: StubConfirmationResult,
  _code: string
): Promise<StubFirebaseUser> => {
  throw new Error('Firebase is not available in this environment.');
};

export const updateUserPhotoURL = async (_photoURL: string): Promise<void> => {
  // no-op
};

export const resetPassword = async (_email: string): Promise<void> => {
  // no-op
};

export default {
  initializeFirebase,
  checkFirebaseAuth,
  getCurrentFirebaseUser,
  signInWithEmailPassword,
  signUpWithEmailPassword,
  signInOrSignUp,
  uploadFile,
  signOutFromFirebase,
  initializeRecaptcha,
  sendSMSVerification,
  verifySMSCode,
  updateUserPhotoURL,
  resetPassword,
};
