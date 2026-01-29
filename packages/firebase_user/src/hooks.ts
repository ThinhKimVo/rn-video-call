import {useContext} from 'react';
import {FirestoreUserContext} from './FirestoreUserProvider';
import {UserState} from './reducer';

/**
 * Hook to access the Firestore user context.
 * Throws an error if used outside of FirestoreUserProvider.
 */
const useUserContext = () => {
  const context = useContext(FirestoreUserContext);
  if (!context) {
    throw new Error('useUserContext must be used within a FirestoreUserProvider');
  }
  return context;
};

/**
 * Custom hook to select a specific part of the user state.
 * @param selector A function that takes the user state and returns a specific part of it.
 * @returns The part of the user state selected by the selector function.
 */
const useUserSelector = <T>(selector: (userState: UserState) => T): T => {
  const {userState} = useUserContext();
  return selector(userState);
};

export {useUserContext, useUserSelector};
