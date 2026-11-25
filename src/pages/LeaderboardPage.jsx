import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('uz-UZ', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

export default function LeaderboardPage() {
  const { user, getPlayersLeaderboard, isFirebaseConfigured } = useAuth();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true);
    try {
      const list = await getPlayersLeaderboard();
      setPlayers(list);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.elo, user?.wins, user?.losses]);

  const filtered = players.filter((p) =>
    p.username.toLowerCase().includes(search.trim().toLowerCase())
  );

  const totalPlayers = players.length;
  const totalGamesPlayed = players.reduce((sum, p) => sum + (p.totalGames || 0), 0);
  const topElo = players.length > 0 ? players[0].elo : 1000;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.85rem', marginBottom: 4 }}>
            Reyting va O‘yinchilar (Leaderboard)
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
            Ro‘yxatdan o‘tgan barcha o‘yinchilar, o‘yinlar soni va ELO reyting jadvali.
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={load}>
          Yangilash
        </button>
      </div>

      {!isFirebaseConfigured && (
        <div className="alert alert-info">
          <strong>Lokal rejim:</strong> Hozircha ushbu brauzerda ro‘yxatdan o‘tgan
          o‘yinchilar ko‘rsatilmoqda. Barcha qurilmalar bo‘yicha umumiy reyting uchun
          Firebase `.env` sozlamasini ulang.
        </div>
      )}

      <div className="grid-3">
        <div className="stat-card">
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Ro‘yxatdan o‘tganlar
          </div>
          <div className="stat-value" style={{ color: 'var(--accent-emerald)' }}>
            {totalPlayers}
          </div>
        </div>
        <div className="stat-card">
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Jami o‘yinlar soni
          </div>
          <div className="stat-value" style={{ color: 'var(--accent-cyan)' }}>
            {totalGamesPlayed}
          </div>
        </div>
        <div className="stat-card">
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Eng yuqori ELO
          </div>
          <div className="stat-value" style={{ color: 'var(--accent-amber)' }}>
            {topElo}
          </div>
        </div>
      </div>

      <div className="card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          <h2 className="card-title" style={{ marginBottom: 0 }}>
            O‘yinchilar jadvali
          </h2>
          <input
            className="form-input"
            type="text"
            placeholder="O‘yinchi ismini qidirish..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 260 }}
          />
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Yuklanmoqda...</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>O‘yinchilar topilmadi.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.92rem',
              }}
            >
              <thead>
                <tr
                  style={{
                    textAlign: 'left',
                    color: 'var(--text-secondary)',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <th style={{ padding: '10px 8px' }}>#</th>
                  <th style={{ padding: '10px 8px' }}>O‘yinchi</th>
                  <th style={{ padding: '10px 8px' }}>O‘ynagan</th>
                  <th style={{ padding: '10px 8px' }}>G‘alaba / Mag‘lubiyat</th>
                  <th style={{ padding: '10px 8px' }}>Ro‘yxatdan o‘tgan</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>ELO</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, idx) => {
                  const isMe = user && (p.uid === user.uid || p.email === user.email);
                  const rank = idx + 1;
                  const winRate =
                    p.totalGames > 0
                      ? Math.round((p.wins / p.totalGames) * 100)
                      : 0;
                  return (
                    <tr
                      key={p.uid || p.username + idx}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        background: isMe
                          ? 'rgba(16, 185, 129, 0.08)'
                          : 'transparent',
                      }}
                    >
                      <td style={{ padding: '12px 8px', fontWeight: 700 }}>
                        {rank === 1
                          ? '🥇 1'
                          : rank === 2
                            ? '🥈 2'
                            : rank === 3
                              ? '🥉 3'
                              : rank}
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span
                            className="avatar-badge"
                            style={{
                              width: 30,
                              height: 30,
                              fontSize: '0.78rem',
                              background: p.avatarColor || '#10b981',
                            }}
                          >
                            {p.username?.slice(0, 2).toUpperCase()}
                          </span>
                          <span style={{ fontWeight: 600 }}>{p.username}</span>
                          {isMe && (
                            <span className="badge badge-emerald">Siz</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px 8px', fontWeight: 600 }}>
                        {p.totalGames} marta
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>
                          {p.wins}
                        </span>
                        <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>
                          /
                        </span>
                        <span style={{ color: 'var(--accent-rose)', fontWeight: 600 }}>
                          {p.losses}
                        </span>
                        <span
                          style={{
                            color: 'var(--text-secondary)',
                            fontSize: '0.8rem',
                            marginLeft: 6,
                          }}
                        >
                          ({winRate}%)
                        </span>
                      </td>
                      <td
                        style={{
                          padding: '12px 8px',
                          color: 'var(--text-secondary)',
                          fontSize: '0.85rem',
                        }}
                      >
                        {formatDate(p.createdAt)}
                      </td>
                      <td
                        style={{
                          padding: '12px 8px',
                          textAlign: 'right',
                          fontWeight: 800,
                          color: 'var(--accent-cyan)',
                        }}
                      >
                        {p.elo}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
