import React, {
  createContext,
  PropsWithChildren,
  useEffect,
  useReducer,
} from "react";
import { IUserInfo } from "./interfaces";
import { IUserContext, setUserInfo, userReducer } from "./reducer";
import { createUserProfile, FirestoreUserServices } from "./services";

const firestoreUserServices = FirestoreUserServices.getInstance();

interface FirestoreUserProviderProps extends PropsWithChildren {
  userInfo: IUserInfo | null;
  prefix?: string;
}

export const FirestoreUserContext = createContext<IUserContext>(
  {} as IUserContext
);
export const FirestoreUserProvider: React.FC<FirestoreUserProviderProps> = ({
  userInfo,
  children,
  prefix = "",
}) => {
  const [state, dispatch] = useReducer(userReducer, {});
  useEffect(() => {
    if (userInfo?.id) {
      createUserProfile(userInfo.id, userInfo.name).then(() => {
        dispatch(setUserInfo(userInfo));
        firestoreUserServices.configuration({ userInfo });
      }).catch((error) => {
        console.warn('Firebase not configured, user profile creation skipped:', error.message);
        dispatch(setUserInfo(userInfo));
        firestoreUserServices.configuration({ userInfo });
      });
    }
  }, [userInfo]);

  useEffect(() => {
    firestoreUserServices.configuration({ prefix });
  }, [prefix]);

  return (
    <FirestoreUserContext.Provider
      value={{
        userState: state,
        userDispatch: dispatch,
      }}
    >
      {children}
    </FirestoreUserContext.Provider>
  );
};
