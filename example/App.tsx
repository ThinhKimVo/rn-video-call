import React from "react";
import { StatusBar } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

// Initialize Firebase app
import firebaseApp from '@react-native-firebase/app';

import { VideoCallProvider } from "@rn-video-call/webrtc_firebase";
import { HomeScreen } from "./src/screens";
import {FirestoreUserProvider} from "@rn-video-call/firebase_user";

// Initialize Firebase if not already initialized
if (!firebaseApp.apps.length) {
  // Firebase will auto-initialize from google-services.json and GoogleService-Info.plist
  // For development without proper config files, we'll create a mock config
  const firebaseConfig = {
    apiKey: "mock-api-key",
    authDomain: "mock-project.firebaseapp.com",
    projectId: "mock-project",
    storageBucket: "mock-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:mock-app-id",
  };

  try {
    firebaseApp.initializeApp(firebaseConfig);
  } catch (error) {
    console.warn('Firebase initialization failed:', error);
  }
}

const userInfo = {
  id: "user-1",
  name: "User 1",
  avatar: "",
};

export default function App() {
  // Displays local stream on calling
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }}>
        <FirestoreUserProvider userInfo={userInfo}>
          <VideoCallProvider>
            <StatusBar barStyle="dark-content" />
            <HomeScreen />
          </VideoCallProvider>
        </FirestoreUserProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
