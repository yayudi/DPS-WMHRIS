import { ref, onUnmounted } from 'vue';
import { ref as dbRef, onValue, off } from 'firebase/database';
import { firebaseDb } from '../config/firebase';

/**
 * Composable untuk mendengarkan sinyal real-time dari Firebase
 * @param {string} userId - ID User yang sedang login
 * @param {Array<string>} permissions - Array permission milik user
 * @param {Function} onSignalReceived - Callback yang dipanggil saat ada sinyal masuk
 */
export const useFirebaseListener = (userId, permissions = [], onSignalReceived) => {
  const isListening = ref(false);
  let userSignalRef = null;
  let permissionRefs = [];

  const startListening = () => {
    if (!userId) return;
    
    // Listen for personal user signals
    const safeUserId = String(userId).replace(/[.#$[\]]/g, '_');
    userSignalRef = dbRef(firebaseDb, `signals/users/${safeUserId}`);
    onValue(userSignalRef, (snapshot) => {
      const data = snapshot.val();
      if (data && data.action) {
        onSignalReceived(data);
      }
    });

    // Listen for shared task signals based on permissions
    if (permissions && Array.isArray(permissions)) {
      permissions.forEach(permission => {
        const safePermission = permission.replace(/[.#$[\]]/g, '_');
        const pRef = dbRef(firebaseDb, `signals/permissions/${safePermission}`);
        onValue(pRef, (snapshot) => {
          const data = snapshot.val();
          if (data && data.action) {
            onSignalReceived(data);
          }
        });
        permissionRefs.push(pRef);
      });
    }

    isListening.value = true;
  };

  const stopListening = () => {
    if (userSignalRef) {
      off(userSignalRef);
      userSignalRef = null;
    }
    
    permissionRefs.forEach(pRef => off(pRef));
    permissionRefs = [];
    
    isListening.value = false;
  };

  // Otomatis stop listening saat komponen di-unmount
  onUnmounted(() => {
    stopListening();
  });

  return {
    isListening,
    startListening,
    stopListening
  };
};
