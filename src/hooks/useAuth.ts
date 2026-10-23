// src/hooks/useAuth.ts
import { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import {
  loginWithGoogle,
  logoutUser,
  subscribeToAuthChanges,
  parseFirebaseAuthError,
  FirebaseAuthErrorDetails,
} from '../services/firebase';

export interface UseAuthReturn {
  user: User | null;
  loading: boolean;
  error: FirebaseAuthErrorDetails | null;
  clearError: () => void;
  login: () => Promise<User | null>;
  logout: () => Promise<void>;
}

export const useAuth = (): UseAuthReturn => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<FirebaseAuthErrorDetails | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const login = useCallback(async (): Promise<User | null> => {
    try {
      setError(null);
      setLoading(true);
      const loggedUser = await loginWithGoogle();
      setUser(loggedUser);
      return loggedUser;
    } catch (err: any) {
      const parsed = parseFirebaseAuthError(err);
      setError(parsed);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      setLoading(true);
      await logoutUser();
      setUser(null);
    } catch (err: any) {
      const parsed = parseFirebaseAuthError(err);
      setError(parsed);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    user,
    loading,
    error,
    clearError,
    login,
    logout,
  };
};
