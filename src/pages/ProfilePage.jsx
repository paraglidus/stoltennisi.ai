import { useAuth } from '../contexts/AuthContext';

export default function ProfilePage() {
  const { user } = useAuth();
  const wins = user?.wins || 0;
  const losses = user?.losses || 0;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <span
          className="avatar-badge"
          style={{
            width: 68,
            height: 68,
            fontSize: '1.5rem',
            background: user?.avatarColor || '#10b981',
          }}
        >
          {user?.username?.slice(0, 2).toUpperCase()}
        </span>
        <div>
          <h1 style={{ fontSize: '1.8rem' }}>{user?.username}</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>{user?.email}</p>
        </div>
      </div>

      <div className="grid-3">
        <div className="stat-card">
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            ELO Reyting
          </div>
          <div className="stat-value" style={{ color: 'var(--accent-cyan)' }}>
            {user?.elo || 1000}
          </div>
        </div>
        <div className="stat-card">
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            G‘alaba / Mag‘lubiyat
          </div>
          <div className="stat-value">
            <span style={{ color: 'var(--accent-emerald)' }}>{wins}</span>
            <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>/</span>
            <span style={{ color: 'var(--accent-rose)' }}>{losses}</span>
          </div>
        </div>
        <div className="stat-card">
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            G‘alaba foizi
          </div>
          <div className="stat-value" style={{ color: 'var(--accent-amber)' }}>
            {winRate}%
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">So‘nggi o‘yinlar</h2>
        <p className="card-subtitle">Oxirgi 20 ta uchrashuv tarixi</p>

        {!user?.matches || user.matches.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>
            Hozircha o‘yinlar tarixi bo‘sh. Lobbi yoki AI Mashq bo‘limida o‘ynab ko‘ring!
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {user.matches.map((m) => (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className={`badge ${m.won ? 'badge-emerald' : 'badge-rose'}`}>
                    {m.won ? 'G‘alaba' : 'Mag‘lubiyat'}
                  </span>
                  <div>
                    <div style={{ fontWeight: 600 }}>vs {m.opponentName}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {m.mode === 'webrtc' ? 'WebRTC P2P' : 'AI Mashq'}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                    {m.myScore} : {m.opponentScore}
                  </div>
                  <div
                    style={{
                      fontSize: '0.78rem',
                      color: m.delta >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                    }}
                  >
                    {m.delta >= 0 ? `+${m.delta}` : m.delta} ELO
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
