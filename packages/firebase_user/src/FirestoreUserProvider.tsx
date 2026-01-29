import React, {
  createContext,
  PropsWithChildren,
  useEffect,
  useReducer,
} from "react";
import { Logger } from "@rn-video-call/base";
import { IUserInfo } from "./interfaces";
import { IUserContext, setUserInfo, userReducer } from "./reducer";
import { createUserProfile, FirestoreUserServices } from "./services";

const logger = Logger.getInstance('FirestoreUserProvider');

const firestoreUserServices = FirestoreUserServices.getInstance();

interface FirestoreUserProviderProps extends PropsWithChildren {
  userInfo: IUserInfo | null;
  prefix?: string;
}

export const FirestoreUserContext = createContext<IUserContext | null>(null);
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
      }).catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn('Firebase not configured, user profile creation skipped:', errorMessage);
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
