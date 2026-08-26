import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Cloud Firestore using the provisioned database ID
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || undefined);
export { app };
