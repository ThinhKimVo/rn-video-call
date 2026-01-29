# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React Native video calling module built as a monorepo using Yarn workspaces. The project provides WebRTC-based video calling functionality with Firebase as the signaling backend, designed specifically for Expo applications.

### Monorepo Structure

The project is organized as a monorepo with the following packages:

- **`packages/base`** - Core interfaces and base types (`IVideoCall`, `Base`, constants)
- **`packages/firebase_user`** - Firebase user management with Firestore integration
- **`packages/webrtc_firebase`** - WebRTC implementation using Firebase as signaling server
- **`example/`** - Example Expo app demonstrating usage

Each package is an independent Expo module with its own build system.

## Development Commands

### Building
```bash
# Build all packages
yarn workspace @rn-video-call/base run build
yarn workspace @rn-video-call/firebase_user run build
yarn workspace @rn-video-call/webrtc_firebase run build

# Build specific package
cd packages/<package-name> && yarn build
```

### Testing & Linting
```bash
# Run tests
yarn workspace @rn-video-call/base run test

# Run linting
yarn workspace @rn-video-call/base run lint
```

### Running Example App
```bash
cd example
yarn start          # Start Expo development server
yarn android        # Run on Android device
yarn ios            # Run on iOS
yarn web            # Run on web
```

### Package Management
```bash
# Clean build artifacts
yarn workspace @rn-video-call/base run clean

# Prepare for publishing
yarn workspace @rn-video-call/base run prepare
```

## Architecture

### Provider Pattern
The library uses React Context providers for state management:

1. **FirestoreUserProvider** (`packages/firebase_user/src/FirestoreUserProvider.tsx`) - Manages user authentication and Firestore user profiles
2. **VideoCallProvider** (`packages/webrtc_firebase/src/VideoCallProvider.tsx`) - Manages video call state and WebRTC connections

### Proxy Pattern
The `webrtc_firebase` package implements a proxy pattern to abstract video calling implementations:
- `WebRTCFirbase` class serves as the main proxy
- Implements `IVideoCall` interface from the base package
- Uses singleton pattern for service instances

### State Management
Each package uses `useReducer` with Redux-style actions:
- User state management in `firebase_user` package
- Video call state management in `webrtc_firebase` package

### Key Dependencies
- **WebRTC**: `react-native-webrtc` for video/audio streaming
- **Firebase**: `@react-native-firebase/firestore` for signaling and user management
- **Expo Modules**: Built using `expo-module-scripts` for native module development

## Usage Pattern

Applications should wrap their root component with both providers:

```tsx
import { FirestoreUserProvider } from "@rn-video-call/firebase_user";
import { VideoCallProvider } from "@rn-video-call/webrtc_firebase";

// First wrap with FirestoreUserProvider
<FirestoreUserProvider userInfo={userInfo}>
  {/* Then wrap with VideoCallProvider */}
  <VideoCallProvider>
    <App />
  </VideoCallProvider>
</FirestoreUserProvider>
```

## Firebase Configuration

The project requires Firebase configuration for Firestore and authentication. Developers must:
1. Set up Firebase project with Firestore enabled
2. Configure native Firebase dependencies for iOS/Android
3. Add Firebase configuration files to the app

## Recent Improvements

### Logging System
- Added structured logging with `Logger` class in `packages/base/src/logger.ts`
- Replaced all `console.log` statements with proper logging levels (debug, info, warn, error)
- Logger supports configurable log levels and timestamped messages

### Error Handling
- Comprehensive error handling system with `VideoCallError` and `VideoCallErrorType`
- Custom error types for different failure scenarios (setup, media access, connection, Firebase, etc.)
- Error handlers can be injected for custom error processing

### Type Safety Improvements
- Enhanced TypeScript interfaces with proper async/await support
- Updated `IVideoCall` interface to match actual implementation
- Added proper typing for media constraints and session configurations
- Improved type safety across all packages

### Web Support
- Fixed web bundling by adding missing `react-dom` and `@expo/metro-runtime` dependencies
- Web platform now supported alongside mobile platforms

## Development Notes

- Each package must be built before use in the example app
- The monorepo uses Yarn workspaces with `nohoist` configuration
- TypeScript is used throughout with shared build configurations
- Expo autolinking is configured to work with the monorepo structure
- Use structured logging instead of console statements for better debugging
- Implement error handlers for production-ready error management