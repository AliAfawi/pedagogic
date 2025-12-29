import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBbH8hUxYj9yNrcryT7pbY0l-8FBhDMVec",
  authDomain: "al-sanaa.firebaseapp.com",
  projectId: "al-sanaa",
  storageBucket: "al-sanaa.firebasestorage.app",
  messagingSenderId: "876951075532",
  appId: "1:876951075532:web:111eb72e64d403e4b46069",
  measurementId: "G-GBZM4849DJ",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
