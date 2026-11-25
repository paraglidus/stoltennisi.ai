import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AuthPage() {
  const { login, register, avatarColors } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [avatarColor, setAvatarColor] = useState(avatarColors[0]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await login({ email, password });
      } else {
        await register({ username, email, password, avatarColor });
      }
      navigate('/');
    } catch (err) {
      setError(err.message || 'Xatolik yuz berdi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="card auth-card">
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <span className="badge badge-emerald" style={{ marginBottom: 10 }}>
            WebRTC P2P Stol Tennisi
          </span>
          <h1 style={{ fontSize: '1.75rem', marginBottom: 6 }}>
            {mode === 'login' ? 'Akkauntga kirish' : 'Yangi akkaunt ochish'}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
            {mode === 'login'
              ? 'Reyting va o‘yinlarni davom ettirish uchun kiring'
              : 'Ro‘yxatdan o‘ting va do‘stlaringiz bilan real vaqtda o‘ynang'}
          </p>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => {
              setMode('login');
              setError('');
            }}
          >
            Kirish
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => {
              setMode('register');
              setError('');
            }}
          >
            Ro‘yxatdan o‘tish
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label">Foydalanuvchi nomi</label>
              <input
                className="form-input"
                type="text"
                placeholder="Masalan: Abbos_Pro"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              placeholder="ism@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Parol</label>
            <input
              className="form-input"
              type="password"
              placeholder="Kamida 6 ta belgi"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label">Avatar rangi</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {avatarColors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAvatarColor(c)}
                    aria-label={`Rang ${c}`}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      background: c,
                      border:
                        avatarColor === c
                          ? '3px solid #fff'
                          : '2px solid transparent',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={busy}
            style={{ marginTop: 8 }}
          >
            {busy
              ? 'Kutilmoqda...'
              : mode === 'login'
                ? 'Tizimga kirish'
                : 'Akkaunt yaratish'}
          </button>
        </form>
      </div>
    </div>
  );
}
