import { useState } from 'react';
import TableTennisGame from '../components/TableTennisGame';
import { useAuth } from '../contexts/AuthContext';

export default function PracticePage() {
  const { user, recordMatch } = useAuth();
  const [difficulty, setDifficulty] = useState('easy');
  const [scores, setScores] = useState({ near: 0, far: 0 });
  const [muted, setMuted] = useState(false);

  const aiPlayer = {
    username:
      difficulty === 'hard'
        ? 'AI (Qiyin)'
        : difficulty === 'easy'
          ? 'AI (Oson)'
          : 'AI (O‘rta)',
    avatarColor: '#f59e0b',
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: 4 }}>AI Mashq Rejimi</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            11 ochkogacha o‘ynang. Sichqoncha, sensor yoki WASD / strelkalar bilan boshqaring.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {['easy', 'medium', 'hard'].map((lvl) => (
            <button
              key={lvl}
              type="button"
              className={`btn btn-sm ${
                difficulty === lvl ? 'btn-primary' : 'btn-secondary'
              }`}
              onClick={() => setDifficulty(lvl)}
            >
              {lvl === 'easy' ? 'Oson' : lvl === 'medium' ? 'O‘rta' : 'Qiyin'}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setMuted((m) => !m)}
          >
            {muted ? 'Ovoz: O‘chiq' : 'Ovoz: Yoniq'}
          </button>
        </div>
      </div>

      <div className="scoreboard">
        <div className="player-pill">
          <span
            className="avatar-badge"
            style={{ background: user?.avatarColor || '#10b981' }}
          >
            {user?.username?.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <div style={{ fontWeight: 700 }}>{user?.username} (Siz)</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              ELO {user?.elo || 1000}
            </div>
          </div>
        </div>

        <div className="score-display">
          <span style={{ color: 'var(--accent-emerald)' }}>{scores.near}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>:</span>
          <span style={{ color: 'var(--accent-amber)' }}>{scores.far}</span>
        </div>

        <div className="player-pill">
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700 }}>{aiPlayer.username}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Bot raqib
            </div>
          </div>
          <span className="avatar-badge" style={{ background: aiPlayer.avatarColor }}>
            AI
          </span>
        </div>
      </div>

      <TableTennisGame
        mode="ai"
        difficulty={difficulty}
        muted={muted}
        nearPlayer={user}
        farPlayer={aiPlayer}
        onScoreChange={setScores}
        onMatchEnd={({ won, myScore, opponentScore }) =>
          recordMatch({
            won,
            myScore,
            opponentScore,
            opponentName: aiPlayer.username,
            mode: 'ai',
          })
        }
      />
    </div>
  );
}
