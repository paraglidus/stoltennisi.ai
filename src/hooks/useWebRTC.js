import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../utils/firebase';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function encodeSignal(obj) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
}

function decodeSignal(str) {
  return JSON.parse(decodeURIComponent(escape(atob(str.trim()))));
}

function waitForIceGathering(pc, timeoutMs = 2500) {
  if (pc.iceGatheringState === 'complete') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    }, timeoutMs);

    function check() {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timer);
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    }
    pc.addEventListener('icegatheringstatechange', check);
  });
}

export function useWebRTC({ onMessage } = {}) {
  const [status, setStatus] = useState('idle');
  const [role, setRole] = useState(null);
  const [roomCode, setRoomCode] = useState('');
  const [peerUser, setPeerUser] = useState(null);
  const [localSignalCode, setLocalSignalCode] = useState('');
  const [error, setError] = useState('');
  const [latencyMs, setLatencyMs] = useState(null);

  const pcRef = useRef(null);
  const fastChannelRef = useRef(null);
  const reliableChannelRef = useRef(null);
  const bcRef = useRef(null);
  const unsubscribesRef = useRef([]);
  const onMessageRef = useRef(onMessage);
  const localUserRef = useRef(null);
  const pingIntervalRef = useRef(null);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const cleanup = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    unsubscribesRef.current.forEach((fn) => {
      try {
        fn();
      } catch {
        // ignore
      }
    });
    unsubscribesRef.current = [];

    if (bcRef.current) {
      bcRef.current.close();
      bcRef.current = null;
    }
    if (fastChannelRef.current) {
      fastChannelRef.current.close();
      fastChannelRef.current = null;
    }
    if (reliableChannelRef.current) {
      reliableChannelRef.current.close();
      reliableChannelRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const sendReliable = useCallback((payload) => {
    const ch = reliableChannelRef.current;
    if (ch && ch.readyState === 'open') {
      ch.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  const sendGameData = useCallback((payload) => {
    const ch = fastChannelRef.current || reliableChannelRef.current;
    if (ch && ch.readyState === 'open') {
      ch.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  const attachChannelHandlers = useCallback((channel, isFast) => {
    channel.onopen = () => {
      if (!isFast) {
        setStatus('connected');
        if (localUserRef.current) {
          channel.send(
            JSON.stringify({
              type: 'handshake',
              user: {
                username: localUserRef.current.username,
                avatarColor: localUserRef.current.avatarColor,
                elo: localUserRef.current.elo || 1000,
              },
            })
          );
        }
        pingIntervalRef.current = setInterval(() => {
          if (channel.readyState === 'open') {
            channel.send(JSON.stringify({ type: 'ping', t: performance.now() }));
          }
        }, 2500);
      }
    };

    channel.onclose = () => {
      if (!isFast) {
        setStatus('disconnected');
      }
    };

    channel.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'handshake') {
          setPeerUser(msg.user);
          return;
        }
        if (msg.type === 'ping') {
          if (reliableChannelRef.current?.readyState === 'open') {
            reliableChannelRef.current.send(
              JSON.stringify({ type: 'pong', t: msg.t })
            );
          }
          return;
        }
        if (msg.type === 'pong') {
          setLatencyMs(Math.round(performance.now() - msg.t));
          return;
        }
        onMessageRef.current?.(msg);
      } catch {
        // ignore malformed packets
      }
    };
  }, []);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setStatus('connected');
      } else if (
        pc.connectionState === 'disconnected' ||
        pc.connectionState === 'failed' ||
        pc.connectionState === 'closed'
      ) {
        setStatus((prev) => (prev === 'idle' ? 'idle' : 'disconnected'));
      }
    };
    pcRef.current = pc;
    return pc;
  }, []);

  const createRoom = useCallback(
    async (user) => {
      cleanup();
      setError('');
      setPeerUser(null);
      setLocalSignalCode('');
      localUserRef.current = user;
      const code = generateRoomCode();
      setRoomCode(code);
      setRole('host');
      setStatus('creating');

      try {
        const pc = createPeerConnection();
        const reliable = pc.createDataChannel('reliable', { ordered: true });
        const fast = pc.createDataChannel('fast', {
          ordered: false,
          maxRetransmits: 0,
        });
        reliableChannelRef.current = reliable;
        fastChannelRef.current = fast;
        attachChannelHandlers(reliable, false);
        attachChannelHandlers(fast, true);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        if (isFirebaseConfigured && db) {
          const roomRef = doc(db, 'rooms', code);
          const callerCandidates = collection(roomRef, 'callerCandidates');

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              addDoc(callerCandidates, event.candidate.toJSON());
            }
          };

          await setDoc(roomRef, {
            offer: { type: offer.type, sdp: offer.sdp },
            hostUser: {
              username: user.username,
              avatarColor: user.avatarColor,
              elo: user.elo || 1000,
            },
            createdAt: Date.now(),
          });

          const unsubRoom = onSnapshot(roomRef, async (snap) => {
            const data = snap.data();
            if (data?.answer && !pc.currentRemoteDescription) {
              await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            }
          });

          const unsubCallee = onSnapshot(
            collection(roomRef, 'calleeCandidates'),
            (snap) => {
              snap.docChanges().forEach((change) => {
                if (change.type === 'added') {
                  pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
                }
              });
            }
          );

          unsubscribesRef.current.push(unsubRoom, unsubCallee);
        } else {
          const bc = new BroadcastChannel(`stoltennisi_signal_${code}`);
          bcRef.current = bc;

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              bc.postMessage({
                kind: 'candidate',
                from: 'host',
                candidate: event.candidate.toJSON(),
              });
            }
          };

          bc.onmessage = async (ev) => {
            const data = ev.data;
            if (data.kind === 'guest-ready') {
              bc.postMessage({
                kind: 'offer',
                sdp: pc.localDescription?.toJSON(),
              });
            } else if (data.kind === 'answer' && !pc.currentRemoteDescription) {
              await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            } else if (data.kind === 'candidate' && data.from === 'guest') {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
              } catch {
                // ignore
              }
            }
          };
        }

        await waitForIceGathering(pc);
        if (pc.localDescription) {
          setLocalSignalCode(
            encodeSignal({
              type: 'offer',
              sdp: pc.localDescription.sdp,
              code,
            })
          );
        }
        setStatus('waiting');
        return code;
      } catch (err) {
        setError(err.message || 'Xona yaratishda xatolik');
        setStatus('error');
        return null;
      }
    },
    [attachChannelHandlers, cleanup, createPeerConnection]
  );

  const joinRoom = useCallback(
    async (codeInput, user) => {
      cleanup();
      setError('');
      setPeerUser(null);
      setLocalSignalCode('');
      localUserRef.current = user;
      const code = codeInput.trim().toUpperCase();
      if (!code || code.length < 4) {
        setError('Xona kodini to‘g‘ri kiriting');
        return false;
      }
      setRoomCode(code);
      setRole('guest');
      setStatus('joining');

      try {
        const pc = createPeerConnection();
        pc.ondatachannel = (event) => {
          const ch = event.channel;
          if (ch.label === 'fast') {
            fastChannelRef.current = ch;
            attachChannelHandlers(ch, true);
          } else {
            reliableChannelRef.current = ch;
            attachChannelHandlers(ch, false);
          }
        };

        if (isFirebaseConfigured && db) {
          const roomRef = doc(db, 'rooms', code);
          const roomSnap = await getDoc(roomRef);
          if (!roomSnap.exists()) {
            throw new Error('Bunday xona topilmadi');
          }
          const data = roomSnap.data();
          const calleeCandidates = collection(roomRef, 'calleeCandidates');

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              addDoc(calleeCandidates, event.candidate.toJSON());
            }
          };

          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          await updateDoc(roomRef, {
            answer: { type: answer.type, sdp: answer.sdp },
            guestUser: {
              username: user.username,
              avatarColor: user.avatarColor,
              elo: user.elo || 1000,
            },
          });

          const unsubCaller = onSnapshot(
            collection(roomRef, 'callerCandidates'),
            (snap) => {
              snap.docChanges().forEach((change) => {
                if (change.type === 'added') {
                  pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
                }
              });
            }
          );
          unsubscribesRef.current.push(unsubCaller);
        } else {
          const bc = new BroadcastChannel(`stoltennisi_signal_${code}`);
          bcRef.current = bc;

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              bc.postMessage({
                kind: 'candidate',
                from: 'guest',
                candidate: event.candidate.toJSON(),
              });
            }
          };

          bc.onmessage = async (ev) => {
            const data = ev.data;
            if (data.kind === 'offer' && !pc.currentRemoteDescription) {
              await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              bc.postMessage({
                kind: 'answer',
                sdp: pc.localDescription.toJSON(),
              });
            } else if (data.kind === 'candidate' && data.from === 'host') {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
              } catch {
                // ignore
              }
            }
          };

          bc.postMessage({ kind: 'guest-ready' });
        }
        return true;
      } catch (err) {
        setError(err.message || 'Xonaga qo‘shilishda xatolik');
        setStatus('error');
        return false;
      }
    },
    [attachChannelHandlers, cleanup, createPeerConnection]
  );

  const acceptManualOffer = useCallback(
    async (offerCode, user) => {
      cleanup();
      setError('');
      setPeerUser(null);
      localUserRef.current = user;
      setRole('guest');
      setStatus('joining');

      try {
        const parsed = decodeSignal(offerCode);
        if (parsed.type !== 'offer' || !parsed.sdp) {
          throw new Error('Noto‘g‘ri Offer kodi');
        }
        setRoomCode(parsed.code || 'MANUAL');

        const pc = createPeerConnection();
        pc.ondatachannel = (event) => {
          const ch = event.channel;
          if (ch.label === 'fast') {
            fastChannelRef.current = ch;
            attachChannelHandlers(ch, true);
          } else {
            reliableChannelRef.current = ch;
            attachChannelHandlers(ch, false);
          }
        };

        await pc.setRemoteDescription(
          new RTCSessionDescription({ type: 'offer', sdp: parsed.sdp })
        );
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await waitForIceGathering(pc);

        setLocalSignalCode(
          encodeSignal({
            type: 'answer',
            sdp: pc.localDescription.sdp,
          })
        );
        setStatus('waiting');
        return true;
      } catch (err) {
        setError(err.message || 'Offer kodini o‘qishda xatolik');
        setStatus('error');
        return false;
      }
    },
    [attachChannelHandlers, cleanup, createPeerConnection]
  );

  const acceptManualAnswer = useCallback(async (answerCode) => {
    setError('');
    try {
      const parsed = decodeSignal(answerCode);
      if (parsed.type !== 'answer' || !parsed.sdp) {
        throw new Error('Noto‘g‘ri Answer kodi');
      }
      const pc = pcRef.current;
      if (!pc) {
        throw new Error('Avval xona yarating');
      }
      await pc.setRemoteDescription(
        new RTCSessionDescription({ type: 'answer', sdp: parsed.sdp })
      );
      return true;
    } catch (err) {
      setError(err.message || 'Answer kodini qo‘llashda xatolik');
      return false;
    }
  }, []);

  const disconnect = useCallback(() => {
    cleanup();
    setStatus('idle');
    setRole(null);
    setRoomCode('');
    setPeerUser(null);
    setLocalSignalCode('');
    setLatencyMs(null);
    setError('');
  }, [cleanup]);

  return {
    status,
    role,
    roomCode,
    peerUser,
    localSignalCode,
    error,
    latencyMs,
    createRoom,
    joinRoom,
    acceptManualOffer,
    acceptManualAnswer,
    sendGameData,
    sendReliable,
    disconnect,
  };
}
