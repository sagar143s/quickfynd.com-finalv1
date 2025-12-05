import { useEffect, useState } from 'react';
import { auth } from './firebase';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const getToken = async (forceRefresh = false) => {
    // Get current user directly from auth instead of state
    const currentUser = auth.currentUser;
    if (!currentUser) {
      // No user is logged in; this is normal for guests.
      return null;
    }
    try {
      const token = await currentUser.getIdToken(forceRefresh);
      return token;
    } catch (error) {
      console.error('[useAuth] Error getting token:', error);
      // Try to refresh the token
      try {
        const token = await currentUser.getIdToken(true);
        return token;
      } catch (retryError) {
        console.error('[useAuth] Error refreshing token:', retryError);
        return null;
      }
    }
  };

  return { user, loading, getToken };
}
