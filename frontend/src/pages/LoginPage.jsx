// src/pages/LoginPage.jsx
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ nombre: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handle = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else {
        await register(form.nombre, form.email, form.password);
      }
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.bg}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logo}>
          <span style={styles.logoIcon}>⬡</span>
          <span style={styles.logoText}>BlockNotas</span>
        </div>
        <p style={styles.tagline}>
          {mode === 'login' ? 'Bienvenido de vuelta' : 'Crea tu cuenta gratis'}
        </p>

        <form onSubmit={submit} style={styles.form}>
          {mode === 'register' && (
            <div style={styles.field}>
              <label style={styles.label}>Nombre</label>
              <input
                name="nombre"
                value={form.nombre}
                onChange={handle}
                placeholder="Tu nombre"
                required
                style={styles.input}
                autoFocus
              />
            </div>
          )}
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handle}
              placeholder="tu@email.com"
              required
              style={styles.input}
              autoFocus={mode === 'login'}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Contraseña</label>
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={handle}
              placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : '••••••••'}
              required
              style={styles.input}
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" disabled={loading} style={styles.btn}>
            {loading ? 'Cargando...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>

        <div style={styles.switchRow}>
          {mode === 'login' ? (
            <span style={styles.switchText}>
              ¿No tienes cuenta?{' '}
              <button onClick={() => { setMode('register'); setError(''); }} style={styles.switchBtn}>
                Regístrate gratis
              </button>
            </span>
          ) : (
            <span style={styles.switchText}>
              ¿Ya tienes cuenta?{' '}
              <button onClick={() => { setMode('login'); setError(''); }} style={styles.switchBtn}>
                Inicia sesión
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  bg: {
    minHeight: '100vh',
    background: '#0d0d0f',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Inter', sans-serif",
    padding: '20px',
  },
  card: {
    background: '#161618',
    border: '1px solid #2a2a2e',
    borderRadius: '16px',
    padding: '40px',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
  },
  logo: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' },
  logoIcon: { fontSize: '28px', color: '#7c6af7' },
  logoText: { fontSize: '22px', fontWeight: '700', color: '#f0f0f2', letterSpacing: '-0.5px' },
  tagline: { color: '#666', fontSize: '14px', margin: '0 0 28px 0' },
  form: { display: 'flex', flexDirection: 'column', gap: '16px' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '13px', fontWeight: '500', color: '#999' },
  input: {
    background: '#0d0d0f',
    border: '1px solid #2a2a2e',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#f0f0f2',
    fontSize: '15px',
    outline: 'none',
    transition: 'border-color 0.15s',
    fontFamily: 'inherit',
  },
  error: {
    background: '#2a1515',
    border: '1px solid #5a2020',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#ff6b6b',
    fontSize: '13px',
  },
  btn: {
    background: '#7c6af7',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '12px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '4px',
    transition: 'background 0.15s',
    fontFamily: 'inherit',
  },
  switchRow: { textAlign: 'center', marginTop: '20px' },
  switchText: { color: '#666', fontSize: '14px' },
  switchBtn: {
    background: 'none',
    border: 'none',
    color: '#7c6af7',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    textDecoration: 'underline',
    padding: 0,
  },
};
