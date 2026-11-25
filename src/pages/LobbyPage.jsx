import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import TableTennisGame from '../components/TableTennisGame';
import { useAuth } from '../contexts/AuthContext';
import { useWebRTC } from '../hooks/useWebRTC';

export default function LobbyPage() {
  const { user, recordMatch, isFirebaseConfigured } = useAuth();
  const [joinCode, setJoinCode] = useState('');
  const [manualOfferInput, setManualOfferInput] = useState('');
  const [manualAnswerInput, setManualAnswerInput] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [copied, setCopied] = useState(false);

  const [scores, setScores] = useState({ left: 0, right: 0 });
  const [muted, setMuted] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [rematchSignal, setRematchSignal] = useState(0);

  const incomingStateRef = useRef(null);
  const incomingPaddleRef = useRef(null);

  const handleMessage = useCallback((msg) => {
    if (msg.type === 'state') {
      incomingStateRef.current = msg;
    } else if (msg.type === 'paddle') {
      incomingPaddleRef.current = msg;
    } else if (msg.type === 'chat') {
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + Math.random(), sender: msg.sender, text: msg.text, mine: false },
      ]);
    } else if (msg.type === 'rematch') {
      setRematchSignal((n) => n + 1);
    }
  }, []);

  const {
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
  } = useWebRTC({ onMessage: handleMessage });

  async function handleCopy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  }

  function handleSendChat(e) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    if (sendReliable({ type: 'chat', sender: user.username, text })) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + Math.random(), sender: user.username, text, mine: true },
      ]);
      setChatInput('');
    }
  }

  function handleLeaveArena() {
    disconnect();
    setMessages([]);
    setScores({ left: 0, right: 0 });
  }

  if (status === 'connected') {
    const leftPlayer =
      role === 'host'
        ? user
        : peerUser || { username: 'Host', avatarColor: '#10b981', elo: 1000 };
    const rightPlayer =
      role === 'guest'
        ? user
        : peerUser || { username: 'Mehmon', avatarColor: '#06b6d4', elo: 1000 };

    return (
      <div>
        <div className="scoreboard">
          <div className="player-pill">
            <span
              className="avatar-badge"
              style={{ background: leftPlayer.avatarColor || '#10b981' }}
            >
              {leftPlayer.username?.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <div style={{ fontWeight: 700 }}>
                {leftPlayer.username} {role === 'host' && '(Siz)'}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                ELO {leftPlayer.elo || 1000}
              </div>
            </div>
          </div>

          <div className="score-display">
            <span style={{ color: 'var(--accent-emerald)' }}>{scores.left}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>:</span>
            <span style={{ color: 'var(--accent-cyan)' }}>{scores.right}</span>
          </div>

          <div className="player-pill">
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700 }}>
                {rightPlayer.username} {role === 'guest' && '(Siz)'}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                ELO {rightPlayer.elo || 1000}
              </div>
            </div>
            <span
              className="avatar-badge"
              style={{ background: rightPlayer.avatarColor || '#06b6d4' }}
            >
              {rightPlayer.username?.slice(0, 2).toUpperCase()}
            </span>
          </div>
        </div>

        <div className="arena-layout">
          <div>
            <TableTennisGame
              mode="webrtc"
              role={role}
              muted={muted}
              leftPlayer={leftPlayer}
              rightPlayer={rightPlayer}
              sendGameData={sendGameData}
              sendReliable={sendReliable}
              incomingStateRef={incomingStateRef}
              incomingPaddleRef={incomingPaddleRef}
              rematchSignal={rematchSignal}
              onScoreChange={setScores}
              onMatchEnd={({ won, myScore, opponentScore }) =>
                recordMatch({
                  won,
                  myScore,
                  opponentScore,
                  opponentName: peerUser?.username || 'WebRTC Raqib',
                  mode: 'webrtc',
                })
              }
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 12,
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="badge badge-emerald">P2P Ulangan</span>
                {latencyMs !== null && (
                  <span className="badge badge-cyan">{latencyMs} ms</span>
                )}
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  Boshqaruv: Sichqoncha / Sensor yoki WASD
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setMuted((m) => !m)}
                >
                  {muted ? 'Ovoz: O‘chiq' : 'Ovoz: Yoniq'}
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={handleLeaveArena}
                >
                  Xonadan chiqish
                </button>
              </div>
            </div>
          </div>

          <div className="card chat-box">
            <h3 style={{ fontSize: '1.05rem', marginBottom: 4 }}>P2P Chat</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
              Xona: {roomCode}
            </p>
            <div className="chat-messages">
              {messages.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                  Xabarlar WebRTC DataChannel orqali to‘g‘ridan-to‘g‘ri uzatiladi.
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`chat-msg ${m.mine ? 'mine' : ''}`}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    {m.sender}
                  </div>
                  <div>{m.text}</div>
                </div>
              ))}
            </div>
            <form className="chat-form" onSubmit={handleSendChat}>
              <input
                className="form-input"
                type="text"
                placeholder="Xabar yozing..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
              />
              <button type="submit" className="btn btn-primary btn-sm">
                Yuborish
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: 6 }}>
            Salom, {user?.username}!
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            WebRTC orqali do‘stingiz bilan to‘g‘ridan-to‘g‘ri stol tennisi o‘ynang yoki AI bilan mashq qiling.
          </p>
        </div>
        <Link to="/practice" className="btn btn-secondary">
          AI bilan mashq qilish
        </Link>
      </div>

      {!isFirebaseConfigured && (
        <div className="alert alert-info">
          <strong>Lokal WebRTC rejimi:</strong> Bir xil brauzerda 2 ta tab ochib 6 xonali
          xona kodi bilan avtomatik ulanishingiz mumkin. Boshqa qurilmalar bilan o‘ynash
          uchun quyidagi <em>Qo‘lda SDP kod almashish</em> bo‘limidan foydalaning.
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div className="grid-2">
        {/* Create Room */}
        <div className="card">
          <h2 className="card-title">Yangi o‘yin xonasi yaratish</h2>
          <p className="card-subtitle">
            Xona yarating va kodni raqibingizga yuboring.
          </p>

          {status === 'waiting' && role === 'host' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="room-code-box">{roomCode}</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  onClick={() => handleCopy(roomCode)}
                >
                  {copied ? 'Nusxalandi!' : 'Kodni nusxalash'}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={disconnect}
                >
                  Bekor qilish
                </button>
              </div>
              <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                Raqib ulanishi kutilmoqda...
              </p>

              {localSignalCode && (
                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm btn-block"
                    onClick={() => setShowManual((s) => !s)}
                  >
                    {showManual
                      ? 'Qo‘lda SDP almashishni yopish'
                      : 'Boshqa qurilma uchun Qo‘lda SDP kod'}
                  </button>

                  {showManual && (
                    <div style={{ marginTop: 12 }}>
                      <div className="form-group">
                        <label className="form-label">
                          1. Ushbu Offer kodini do‘stingizga yuboring:
                        </label>
                        <textarea
                          className="form-textarea"
                          readOnly
                          value={localSignalCode}
                          onClick={(e) => e.target.select()}
                        />
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleCopy(localSignalCode)}
                        >
                          Offer kodni nusxalash
                        </button>
                      </div>

                      <div className="form-group">
                        <label className="form-label">
                          2. Do‘stingiz yuborgan Answer kodini kiriting:
                        </label>
                        <textarea
                          className="form-textarea"
                          placeholder="Answer kodini shu yerga joylashtiring..."
                          value={manualAnswerInput}
                          onChange={(e) => setManualAnswerInput(e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => acceptManualAnswer(manualAnswerInput)}
                        >
                          Ulanishni yakunlash
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={status === 'creating' || status === 'joining'}
              onClick={() => createRoom(user)}
            >
              {status === 'creating' ? 'Xona yaratilmoqda...' : 'Xona yaratish'}
            </button>
          )}
        </div>

        {/* Join Room */}
        <div className="card">
          <h2 className="card-title">Xonaga qo‘shilish</h2>
          <p className="card-subtitle">
            Do‘stingiz bergan 6 xonali kodni kiriting.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              joinRoom(joinCode, user);
            }}
          >
            <div className="form-group">
              <label className="form-label">Xona kodi</label>
              <input
                className="form-input"
                type="text"
                placeholder="Masalan: A7K9P2"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={8}
                style={{ letterSpacing: '0.14em', fontWeight: 700 }}
              />
            </div>
            <button
              type="submit"
              className="btn btn-cyan btn-block"
              disabled={status === 'joining' || !joinCode.trim()}
            >
              {status === 'joining' ? 'Ulanmoqda...' : 'Xonaga kirish'}
            </button>
          </form>

          <div
            style={{
              borderTop: '1px solid var(--border-subtle)',
              marginTop: 18,
              paddingTop: 14,
            }}
          >
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
              Yoki boshqa qurilmadan Offer kodi bilan ulaning:
            </p>
            <div className="form-group">
              <textarea
                className="form-textarea"
                placeholder="Host yuborgan Offer kodini kiriting..."
                value={manualOfferInput}
                onChange={(e) => setManualOfferInput(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm btn-block"
              disabled={!manualOfferInput.trim()}
              onClick={() => acceptManualOffer(manualOfferInput, user)}
            >
              Offer kodini qabul qilish va Answer yaratish
            </button>

            {role === 'guest' && status === 'waiting' && localSignalCode && (
              <div style={{ marginTop: 12 }}>
                <label className="form-label">
                  Ushbu Answer kodini Hostga yuboring:
                </label>
                <textarea
                  className="form-textarea"
                  readOnly
                  value={localSignalCode}
                  onClick={(e) => e.target.select()}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => handleCopy(localSignalCode)}
                >
                  {copied ? 'Nusxalandi!' : 'Answer kodini nusxalash'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
