import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Determine if we are running in the server/build phase
const isServer = typeof window === "undefined";

// The real environment variables
const realApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

// Only use dummy values during server-side build if the real keys are missing.
// This prevents Next.js static prerendering from failing due to missing keys.
const useDummy = isServer && !realApiKey;

const firebaseConfig = {
  apiKey: realApiKey || (useDummy ? "AIzaSyDummyKeyForBuildOnly12345" : undefined),
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || (useDummy ? "mintsglobal-erp.firebaseapp.com" : undefined),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || (useDummy ? "mintsglobal-erp" : undefined),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || (useDummy ? "mintsglobal-erp.appspot.com" : undefined),
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || (useDummy ? "1234567890" : undefined),
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || (useDummy ? "1:1234567890:web:1234567890" : undefined),
};

let app;
let auth: any;
let db: any;
let storage: any;

// Helper to check if Firebase is configured
const isFirebaseConfigured = !!firebaseConfig.apiKey;

if (isFirebaseConfigured) {
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
} else {
  // If we are on the client and configuration is missing, we create a proxy
  // that throws a helpful error when accessed, rather than throwing cryptic Firebase errors.
  const createMissingConfigHandler = (serviceName: string) => {
    return new Proxy({}, {
      get: (target, prop) => {
        if (typeof window !== "undefined") {
          const errMsg = `Mints Global ERP: Firebase is not configured. Please add the following Environment Variables in your Vercel Project Settings:\n` +
            `- NEXT_PUBLIC_FIREBASE_API_KEY\n` +
            `- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN\n` +
            `- NEXT_PUBLIC_FIREBASE_PROJECT_ID\n` +
            `- NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET\n` +
            `- NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID\n` +
            `- NEXT_PUBLIC_FIREBASE_APP_ID\n` +
            `Then, redeploy your project on Vercel.`;
          console.error(errMsg);
          alert(errMsg);
          throw new Error(errMsg);
        }
        return undefined;
      }
    });
  };

  auth = createMissingConfigHandler("Auth");
  db = createMissingConfigHandler("Firestore");
  storage = createMissingConfigHandler("Storage");
}

export { app, auth, db, storage, firebaseConfig, isFirebaseConfigured };
