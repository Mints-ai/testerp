import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// Admin SDK setup for server-side code only (API routes). This bypasses
// firestore.rules entirely -- our own canAccess() checks inside each tool
// function are the real authorization layer, not the rules file.
//
// NEVER import this file from client components -- the service account key
// below must never reach the browser.
// ---------------------------------------------------------------------------

let app: App;

if (!getApps().length) {
    try {
        app = initializeApp({
            credential: cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                // Private keys from env vars often have literal "\n" instead of real
                // newlines -- this converts them back so the key parses correctly.
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
            }),
        });
    } catch (error) {
        console.warn("Firebase admin initialization failed (this is expected during build if env vars are missing):", (error as Error).message);
        // Fallback for build-time evaluation
        app = initializeApp({ projectId: "dummy" });
    }
} else {
    app = getApps()[0];
}

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);