import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Navbar() {
  const { user, logout, isFirebaseConfigured } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/auth');
  }

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <NavLink to="/" className="brand">
          <span className="brand-icon">ST</span>
          <span>Stol Tennisi</span>
          <span className="badge badge-cyan" style={{ fontSize: '0.7rem' }}>
            WebRTC
          </span>
        </NavLink>

        {user && (
          <nav className="nav-links">
            <NavLink
              to="/"
              end
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              Lobbi
            </NavLink>
            <NavLink
              to="/practice"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              AI Mashq
            </NavLink>
            <NavLink
              to="/profile"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              Profil
            </NavLink>
          </nav>
        )}

        <div className="nav-user">
          <span
            className={`badge ${isFirebaseConfigured ? 'badge-emerald' : 'badge-amber'}`}
            title={
              isFirebaseConfigured
                ? 'Firebase bulutli baza ulangan'
                : 'Lokal brauzer rejimi (Firebase .env sozlanmagan)'
            }
          >
            {isFirebaseConfigured ? 'Cloud' : 'Local'}
          </span>

          {user ? (
            <>
              <NavLink to="/profile" className="player-pill">
                <span
                  className="avatar-badge"
                  style={{ background: user.avatarColor || '#10b981' }}
                >
                  {user.username?.slice(0, 2).toUpperCase()}
                </span>
                <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    {user.username}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    ELO {user.elo || 1000}
                  </div>
                </div>
              </NavLink>
              <button
                type="button"
                onClick={handleLogout}
                className="btn btn-secondary btn-sm"
              >
                Chiqish
              </button>
            </>
          ) : (
            <NavLink to="/auth" className="btn btn-primary btn-sm">
              Kirish
            </NavLink>
          )}
        </div>
      </div>
    </header>
  );
}
