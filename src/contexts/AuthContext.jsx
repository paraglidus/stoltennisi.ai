import { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../utils/firebase';

const AuthContext = createContext(null);

const STORAGE_USERS_KEY = 'stoltennisi_users_v1';
const STORAGE_SESSION_KEY = 'stoltennisi_session_v1';

const AVATAR_COLORS = [
  '#10b981',
  '#06b6d4',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#3b82f6',
];

function readLocalUsers() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_USERS_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeLocalUsers(users) {
  localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));
}

function hashPassword(pw) {
  let h = 2166136261;
  for (let i = 0; i < pw.length; i += 1) {
    h ^= pw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function sanitizeUser(record) {
  const { passwordHash: _ignored, ...safe } = record;
  return safe;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isFirebaseConfigured && auth) {
      const unsub = onAuthStateChanged(auth, async (fbUser) => {
        if (!fbUser) {
          setUser(null);
          setLoading(false);
          return;
        }
        try {
          const snap = await getDoc(doc(db, 'users', fbUser.uid));
          if (snap.exists()) {
            setUser({ uid: fbUser.uid, ...snap.data() });
          } else {
            const fallback = {
              uid: fbUser.uid,
              email: fbUser.email,
              username: fbUser.displayName || fbUser.email?.split('@')[0] || 'O‘yinchi',
              avatarColor: AVATAR_COLORS[0],
              elo: 1000,
              wins: 0,
              losses: 0,
              matches: [],
            };
            await setDoc(doc(db, 'users', fbUser.uid), fallback);
            setUser(fallback);
          }
        } catch {
          setUser(null);
        } finally {
          setLoading(false);
        }
      });
      return unsub;
    }

    const sessionEmail = localStorage.getItem(STORAGE_SESSION_KEY);
    if (sessionEmail) {
      const users = readLocalUsers();
      const found = users[sessionEmail];
      if (found) {
        setUser(sanitizeUser(found));
      }
    }
    setLoading(false);
    return undefined;
  }, []);

  async function register({ username, email, password, avatarColor }) {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = username.trim();
    if (!cleanName || cleanName.length < 2) {
      throw new Error('Ism kamida 2 ta belgidan iborat bo‘lishi kerak');
    }
    if (!cleanEmail.includes('@')) {
      throw new Error('To‘g‘ri email manzil kiriting');
    }
    if (!password || password.length < 6) {
      throw new Error('Parol kamida 6 ta belgidan iborat bo‘lishi kerak');
    }

    const color =
      avatarColor ||
      AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

    if (isFirebaseConfigured && auth) {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      await updateProfile(cred.user, { displayName: cleanName });
      const profile = {
        uid: cred.user.uid,
        email: cleanEmail,
        username: cleanName,
        avatarColor: color,
        elo: 1000,
        wins: 0,
        losses: 0,
        matches: [],
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'users', cred.user.uid), profile);
      setUser(profile);
      return profile;
    }

    const users = readLocalUsers();
    if (users[cleanEmail]) {
      throw new Error('Bu email allaqachon ro‘yxatdan o‘tgan');
    }
    const newUser = {
      uid: `local_${Date.now().toString(36)}`,
      email: cleanEmail,
      username: cleanName,
      avatarColor: color,
      passwordHash: hashPassword(password),
      elo: 1000,
      wins: 0,
      losses: 0,
      matches: [],
      createdAt: new Date().toISOString(),
    };
    users[cleanEmail] = newUser;
    writeLocalUsers(users);
    localStorage.setItem(STORAGE_SESSION_KEY, cleanEmail);
    const safe = sanitizeUser(newUser);
    setUser(safe);
    return safe;
  }

  async function login({ email, password }) {
    const cleanEmail = email.trim().toLowerCase();
    if (isFirebaseConfigured && auth) {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const snap = await getDoc(doc(db, 'users', cred.user.uid));
      const profile = snap.exists()
        ? { uid: cred.user.uid, ...snap.data() }
        : {
            uid: cred.user.uid,
            email: cleanEmail,
            username: cred.user.displayName || 'O‘yinchi',
            avatarColor: AVATAR_COLORS[0],
            elo: 1000,
            wins: 0,
            losses: 0,
            matches: [],
          };
      setUser(profile);
      return profile;
    }

    const users = readLocalUsers();
    const record = users[cleanEmail];
    if (!record || record.passwordHash !== hashPassword(password)) {
      throw new Error('Email yoki parol noto‘g‘ri');
    }
    localStorage.setItem(STORAGE_SESSION_KEY, cleanEmail);
    const safe = sanitizeUser(record);
    setUser(safe);
    return safe;
  }

  async function logout() {
    if (isFirebaseConfigured && auth) {
      await signOut(auth);
    }
    localStorage.removeItem(STORAGE_SESSION_KEY);
    setUser(null);
  }

  async function recordMatch({ won, myScore, opponentScore, opponentName, mode }) {
    if (!user) return;
    const delta = mode === 'webrtc' ? (won ? 24 : -16) : won ? 8 : -4;
    const nextElo = Math.max(100, (user.elo || 1000) + delta);
    const entry = {
      id: Date.now().toString(36),
      won,
      myScore,
      opponentScore,
      opponentName: opponentName || 'Raqib',
      mode,
      delta,
      playedAt: new Date().toISOString(),
    };
    const nextMatches = [entry, ...(user.matches || [])].slice(0, 20);
    const updated = {
      ...user,
      elo: nextElo,
      wins: (user.wins || 0) + (won ? 1 : 0),
      losses: (user.losses || 0) + (won ? 0 : 1),
      matches: nextMatches,
    };
    setUser(updated);

    if (isFirebaseConfigured && db && user.uid) {
      await updateDoc(doc(db, 'users', user.uid), {
        elo: updated.elo,
        wins: updated.wins,
        losses: updated.losses,
        matches: updated.matches,
      });
    } else {
      const users = readLocalUsers();
      if (users[user.email]) {
        users[user.email] = {
          ...users[user.email],
          ...updated,
        };
        writeLocalUsers(users);
      }
    }
  }

  async function getPlayersLeaderboard() {
    if (isFirebaseConfigured && db) {
      const q = query(collection(db, 'users'), orderBy('elo', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => {
        const data = d.data();
        const wins = data.wins || 0;
        const losses = data.losses || 0;
        return {
          uid: d.id,
          username: data.username || 'O‘yinchi',
          avatarColor: data.avatarColor || AVATAR_COLORS[0],
          elo: data.elo || 1000,
          wins,
          losses,
          totalGames: wins + losses,
          createdAt: data.createdAt || null,
        };
      });
    }

    const users = readLocalUsers();
    return Object.values(users)
      .map((u) => {
        const wins = u.wins || 0;
        const losses = u.losses || 0;
        return {
          uid: u.uid,
          email: u.email,
          username: u.username,
          avatarColor: u.avatarColor || AVATAR_COLORS[0],
          elo: u.elo || 1000,
          wins,
          losses,
          totalGames: wins + losses,
          createdAt: u.createdAt || null,
        };
      })
      .sort((a, b) => b.elo - a.elo || b.wins - a.wins);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isFirebaseConfigured,
        register,
        login,
        logout,
        recordMatch,
        getPlayersLeaderboard,
        avatarColors: AVATAR_COLORS,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
