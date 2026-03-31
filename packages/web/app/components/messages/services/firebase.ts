import { firebaseConfig } from '@constants/firebase';
import { COMPRESSION_OPTIONS } from '@constants/media';
import { getUserInfo, setMediaUploaded } from '@services/api';
import { initializeToken } from '@services/auth';
import imageCompression from 'browser-image-compression';
import { FirebaseApp, initializeApp } from 'firebase/app';
import {
  Auth,
  AuthError,
  ConfirmationResult,
  RecaptchaVerifier,
  User,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  FirebaseStorage,
  getDownloadURL,
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
} from 'firebase/storage';
import mixpanel from 'mixpanel-browser';

import { isLocalDevelopment } from '@globalUtils/environment';

import { MediaFileDetail, MediaStatus } from '@globalTypes/media';

let firebaseApp: FirebaseApp | null = null;
let auth: Auth | null = null;
let storage: FirebaseStorage | null = null;

export const initializeFirebase = () => {
  try {
    if (firebaseApp && auth && storage) return { firebaseApp, auth, storage };
    firebaseApp = initializeApp(firebaseConfig);
    auth = getAuth(firebaseApp);
    storage = getStorage(firebaseApp);
    return { firebaseApp, auth, storage };
  } catch (error) {
    console.error('Error initializing Firebase:', error);
    throw error;
  }
};

export const getCurrentFirebaseUser = async (): Promise<User | null> => {
  try {
    const { auth } = initializeFirebase();
    if (auth.currentUser) return auth.currentUser;
    return new Promise<User | null>((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(user);
      });
    });
  } catch (error) {
    console.error('Error getting firebase USER:', error);
    throw error;
  }
};

export const checkSimpleFirebaseAuth = async (): Promise<User | null> => {
  return await getCurrentFirebaseUser();
};

export const checkFirebaseAuth = async (): Promise<boolean> => {
  const firebaseUser = await getCurrentFirebaseUser();
  if (!firebaseUser) return false;

  // Get and store Firebase ID token for API authentication
  const token = await firebaseUser.getIdToken();
  initializeToken(token);

  const uid = firebaseUser.uid;
  const userInfo = await getUserInfo(uid);
  if (userInfo && userInfo.user && !isLocalDevelopment) {
    mixpanel.identify(userInfo.user.firebaseUid);
    mixpanel.people.set({
      $name: userInfo.user.name,
      $email: userInfo.user.email,
      phone: userInfo.user.phone,
    });
  }
  return !!(userInfo && Object.keys(userInfo).length > 0 && userInfo.user?.phone);
};

export const signInWithEmailPassword = async (email: string, password: string): Promise<User> => {
  try {
    const { auth } = initializeFirebase();
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    const authError = error as AuthError;
    switch (authError.code) {
      case 'auth/invalid-credential':
        throw new Error('Invalid email or password.');
      case 'auth/user-not-found':
        throw new Error('No account found with this email address.');
      case 'auth/wrong-password':
        throw new Error('Incorrect password.');
      case 'auth/invalid-email':
        throw new Error('Invalid email address.');
      case 'auth/user-disabled':
        throw new Error('This account has been disabled.');
      case 'auth/too-many-requests':
        throw new Error('Too many failed login attempts. Please try again later.');
      case 'auth/network-request-failed':
        throw new Error('Network error. Please check your connection and try again.');
      default:
        throw new Error('Failed to sign in. Please try again.');
    }
  }
};

export const signUpWithEmailPassword = async (email: string, password: string): Promise<User> => {
  try {
    const { auth } = initializeFirebase();
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    console.error('Error creating account with email and password:', error);

    // Handle specific Firebase auth errors
    const authError = error as AuthError;
    switch (authError.code) {
      case 'auth/email-already-in-use':
        throw new Error('An account with this email address already exists.');
      case 'auth/invalid-email':
        throw new Error('Invalid email address.');
      case 'auth/weak-password':
        throw new Error('Password is too weak. Please choose a stronger password.');
      case 'auth/network-request-failed':
        throw new Error('Network error. Please check your connection and try again.');
      default:
        throw new Error('Failed to create account. Please try again.');
    }
  }
};

export const signInOrSignUp = async (
  email: string,
  password: string
): Promise<{ user: User; isNewUser: boolean }> => {
  try {
    // First, attempt to sign in with existing credentials
    const user = await signInWithEmailPassword(email, password);
    return { user, isNewUser: false };
  } catch (signInError) {
    const authError = signInError as Error;

    // If credentials are invalid (could mean user doesn't exist OR wrong password)
    // we'll attempt to create a new account
    if (
      authError.message === 'Invalid email or password.' ||
      authError.message === 'No account found with this email address.'
    ) {
      try {
        const newUser = await signUpWithEmailPassword(email, password);
        return { user: newUser, isNewUser: true };
      } catch (signUpError) {
        const signUpAuthError = signUpError as Error;

        // If sign up fails because email already exists,
        // it means the original sign-in failed due to wrong password
        if (signUpAuthError.message === 'An account with this email address already exists.') {
          throw new Error('Invalid email or password.');
        }

        // For any other sign up error, throw it
        throw signUpError;
      }
    } else {
      console.error(signInError);
    }

    // For any other sign-in error (too many requests, etc.), throw the original error
    throw signInError;
  }
};

export const uploadFile = async (
  groupName: string,
  namespace: string,
  id: string,
  file: MediaFileDetail,
  onUpdate: (fileId: string, progress: number) => void
): Promise<MediaFileDetail> => {
  try {
    // Initialize Firebase and get storage instance
    const { storage } = initializeFirebase();

    // Check if file exists
    if (!file.file) throw new Error('No file provided for upload');
    // Get current user for authentication
    const user = await getCurrentFirebaseUser();
    if (!user) throw new Error('User not authenticated');

    const filePath = `${namespace}/${groupName}/${id}-${file.name}`;

    // Create storage reference
    const mRef = storageRef(storage, filePath);

    let mFile = file.file;

    if (mFile.type.startsWith('image/')) mFile = await imageCompression(mFile, COMPRESSION_OPTIONS);

    // Create upload task with resumable upload
    const uploadTask = uploadBytesResumable(mRef, mFile, {
      cacheControl: 'public,max-age=31536000',
    });

    // Return a promise that resolves when upload completes
    return new Promise<MediaFileDetail>((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          // Calculate and report progress
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          onUpdate(id, Math.round(progress));
        },
        (error) => {
          // Handle upload errors
          console.error('Upload error:', error);
          reject(error);
        },
        async () => {
          try {
            // Upload completed successfully, get download URL
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

            // Create updated file object with download URL
            const updatedFile: MediaFileDetail = {
              ...file,
              link: downloadURL,
              status: MediaStatus.PROCESSING,
              path: filePath,
            };

            await setMediaUploaded(groupName, namespace, id, updatedFile);

            resolve(updatedFile);
          } catch (error) {
            console.error('Error getting download URL:', error);
            reject(error);
          }
        }
      );
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
};

export const signOutFromFirebase = async () => {
  try {
    const { auth } = initializeFirebase();
    await signOut(auth);
  } catch (error) {
    console.error('Error signing out from Firebase:', error);
    throw error;
  }
};

let recaptchaVerifier: RecaptchaVerifier | null = null;

export const initializeRecaptcha = (containerId: string): RecaptchaVerifier => {
  try {
    const { auth } = initializeFirebase();
    if (recaptchaVerifier) recaptchaVerifier.clear();
    recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
    });
    return recaptchaVerifier;
  } catch (error) {
    console.error('Error initializing reCAPTCHA:', error);
    throw error;
  }
};

export const sendSMSVerification = async (
  phoneNumber: string,
  recaptcha: RecaptchaVerifier
): Promise<ConfirmationResult> => {
  try {
    const { auth } = initializeFirebase();

    // Verify recaptcha is properly initialized
    if (!recaptcha) {
      throw new Error('reCAPTCHA not initialized');
    }

    const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, recaptcha);
    return confirmationResult;
  } catch (error) {
    const authError = error as AuthError;
    console.error('SMS Verification Error:', authError);

    switch (authError.code) {
      case 'auth/invalid-phone-number':
        throw new Error('Invalid phone number format.');
      case 'auth/too-many-requests':
        throw new Error('Too many requests. Please try again later.');
      case 'auth/quota-exceeded':
        throw new Error('SMS quota exceeded. Please try again later.');
      case 'auth/invalid-app-credential':
        throw new Error('Phone authentication is not properly configured. Please contact support.');
      case 'auth/app-not-authorized':
        throw new Error('This domain is not authorized for phone authentication.');
      case 'auth/captcha-check-failed':
        throw new Error('reCAPTCHA verification failed. Please try again.');
      default:
        throw new Error(`Authentication error: ${authError.message || 'Failed to send verification code'}`);
    }
  }
};

export const verifySMSCode = async (confirmationResult: ConfirmationResult, code: string): Promise<User> => {
  try {
    const result = await confirmationResult.confirm(code);
    return result.user;
  } catch (error) {
    const authError = error as AuthError;
    switch (authError.code) {
      case 'auth/invalid-verification-code':
        throw new Error('Invalid verification code.');
      case 'auth/code-expired':
        throw new Error('Verification code has expired.');
      default:
        throw new Error('Failed to verify code. Please try again.');
    }
  }
};

export const updateUserPhotoURL = async (photoURL: string): Promise<void> => {
  try {
    const user = await getCurrentFirebaseUser();
    if (!user) throw new Error('User not authenticated');

    await updateProfile(user, { photoURL });
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};

export const resetPassword = async (email: string): Promise<void> => {
  return new Promise((res, rej) => {
    const auth = getAuth();
    sendPasswordResetEmail(auth, email)
      .then(() => {
        res();
      })
      .catch((error) => {
        rej(error);
      });
  });
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
