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

export const initializeFirebase = (): StubFirebaseServices => ({
  firebaseApp: null,
  auth: null,
  storage: null,
});

export const getCurrentFirebaseUser = async (): Promise<StubFirebaseUser | null> => {
  const uid = process.env.NEXT_PUBLIC_CLOSER_FIREBASE_UID;
  if (!uid) return null;
  return {
    uid,
    email: null,
    displayName: null,
    photoURL: null,
    phoneNumber: null,
    getIdToken: async () => '',
  };
};

export const checkSimpleFirebaseAuth = async (): Promise<StubFirebaseUser | null> => null;

export const checkFirebaseAuth = async (): Promise<boolean> => false;

export const signInWithEmailPassword = async (email: string, password: string): Promise<StubFirebaseUser> => {
  void email;
  void password;
  throw new Error('Firebase is not available in this environment.');
};

export const signUpWithEmailPassword = async (email: string, password: string): Promise<StubFirebaseUser> => {
  void email;
  void password;
  throw new Error('Firebase is not available in this environment.');
};

export const signInOrSignUp = async (
  email: string,
  password: string
): Promise<{ user: StubFirebaseUser; isNewUser: boolean }> => {
  void email;
  void password;
  throw new Error('Firebase is not available in this environment.');
};

export const uploadFile = async (
  groupName: string,
  namespace: string,
  id: string,
  file: MediaFileDetail,
  onUpdate: (fileId: string, progress: number) => void
): Promise<MediaFileDetail> => {
  void groupName;
  void namespace;
  void onUpdate;
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

export const initializeRecaptcha = (containerId: string): StubRecaptchaVerifier => {
  void containerId;
  return { clear: () => {} };
};

export const sendSMSVerification = async (
  phoneNumber: string,
  recaptcha: StubRecaptchaVerifier
): Promise<StubConfirmationResult> => {
  void phoneNumber;
  void recaptcha;
  throw new Error('Firebase is not available in this environment.');
};

export const verifySMSCode = async (
  confirmationResult: StubConfirmationResult,
  code: string
): Promise<StubFirebaseUser> => {
  void confirmationResult;
  void code;
  throw new Error('Firebase is not available in this environment.');
};

export const updateUserPhotoURL = async (photoURL: string): Promise<void> => {
  void photoURL;
  // no-op
};

export const resetPassword = async (email: string): Promise<void> => {
  void email;
  // no-op
};

const firebaseService = {
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

export default firebaseService;
