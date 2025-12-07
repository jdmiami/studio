'use client';
import {
  Auth, // Import Auth type for type hinting
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup
  // Assume getAuth and app are initialized elsewhere
} from 'firebase/auth';

/**
 * Initiate anonymous sign-in (non-blocking).
 * Calls `signInAnonymously` directly without awaiting it.
 * Auth state changes should be handled by an `onAuthStateChanged` listener.
 *
 * @param authInstance - The Firebase Auth instance.
 */
export function initiateAnonymousSignIn(authInstance: Auth): void {
  // CRITICAL: Call signInAnonymously directly. Do NOT use 'await signInAnonymously(...)'.
  signInAnonymously(authInstance);
  // Code continues immediately. Auth state change is handled by onAuthStateChanged listener.
}

/**
 * Initiate email/password sign-up (non-blocking).
 * Calls `createUserWithEmailAndPassword` directly without awaiting it.
 * Auth state changes should be handled by an `onAuthStateChanged` listener.
 *
 * @param authInstance - The Firebase Auth instance.
 * @param email - The user's email address.
 * @param password - The user's password.
 */
export function initiateEmailSignUp(authInstance: Auth, email: string, password: string): void {
  // CRITICAL: Call createUserWithEmailAndPassword directly. Do NOT use 'await createUserWithEmailAndPassword(...)'.
  createUserWithEmailAndPassword(authInstance, email, password);
  // Code continues immediately. Auth state change is handled by onAuthStateChanged listener.
}

/**
 * Initiate email/password sign-in (non-blocking).
 * Calls `signInWithEmailAndPassword` directly without awaiting it.
 * Auth state changes should be handled by an `onAuthStateChanged` listener.
 *
 * @param authInstance - The Firebase Auth instance.
 * @param email - The user's email address.
 * @param password - The user's password.
 */
export function initiateEmailSignIn(authInstance: Auth, email: string, password: string): void {
  // CRITICAL: Call signInWithEmailAndPassword directly. Do NOT use 'await signInWithEmailAndPassword(...)'.
  signInWithEmailAndPassword(authInstance, email, password);
  // Code continues immediately. Auth state change is handled by onAuthStateChanged listener.
}

/**
 * Initiate Google sign-in (non-blocking).
 * Calls `signInWithPopup` directly without awaiting it.
 * Auth state changes should be handled by an `onAuthStateChanged` listener.
 *
 * @param authInstance - The Firebase Auth instance.
 */
export function initiateGoogleSignIn(authInstance: Auth): void {
  const provider = new GoogleAuthProvider();
  // CRITICAL: Call signInWithPopup directly. Do NOT use 'await signInWithPopup(...)'.
  signInWithPopup(authInstance, provider);
  // Code continues immediately. Auth state change is handled by onAuthStateChanged listener.
}
