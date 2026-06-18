// src/pages/DashboardPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

const ICONS = {
  plus: '＋', search: '🔍', pin: '📌', trash: '🗑', edit: '✏️',
  logout: '→', note: '📝', home: '⌂', plans: '✦', star: '★', lock: '🔒'
};

export default function DashboardPage() {
  const { user, logout, setUser } = useAuth();
  const navigate = useNavigate();
  const [notas, setNotas] = useState([]);
  const [selectedNota, setSelectedNota] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState({ titulo: '', contenido: '', etiquetas: '' });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState('notas'); // 'notas' | 'planes' | 'stats'
  const [planes, setPlanes] = useState([]);
  const [stats, setStats] = useState(null);
  const [pagoMsg, setPagoMsg] = useState('');
  const [limites, setLimites] = useState(null); // { plan, max_notas, colores }
  const [colorMsg, setColorMsg] = useState('');
  const [pagoBanner, setPagoBanner] = useState(null); // 'success' | 'pending' | 'failure'
  const [premiumMode, setPremiumMode] = useState(localStorage.getItem('premiumMode')==='true');

  const cargarLimites = useCallback(async () => {
    try {
      const data = await api.planes.misLimites();
      setLimites(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { cargarLimites(); }, [cargarLimites, user?.plan]);

  // Si MercadoPago nos regresó después de un pago (?pago=success|pending|failure)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pago = params.get('pago');
    if (pago) {
      setPagoBanner(pago);
      setView('planes');
      window.history.replaceState({}, '', window.location.pathname);
      if (pago === 'success') {
        // El webhook de MercadoPago puede tardar unos segundos en llegar
        setTimeout(async () => {
          try {
            const data = await api.auth.me();
            setUser(data.user);
            cargarLimites();
          } catch (e) { console.error(e); }
        }, 2500);
      }
    }
  }, [setUser, cargarLimites]);

  const cargarNotas = useCallback(async () => {
    try {
      const data = await api.notas.listar(search);
      setNotas(data.notas);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { cargarNotas(); }, [cargarNotas]);

  useEffect(() => {
    if (view === 'planes' && planes.length === 0) {
      api.planes.listar().then(d => setPlanes(d.planes));
    }
    if (view === 'stats' && !stats) {
      api.stats.obtener().then(d => setStats(d.stats));
    }
  }, [view]);

  const limiteAlcanzado = limites && limites.max_notas !== -1 && notas.length >= limites.max_notas;

  const nuevaNota = async () => {
    if (limiteAlcanzado) {
      setView('planes');
      return;
    }
    try {
      const data = await api.notas.crear({ titulo: 'Nueva nota', contenido: '' });
      setNotas(prev => [data.nota, ...prev]);
      abrirEdicion(data.nota);
      cargarLimites();
    } catch (e) {
      if (e.message?.toLowerCase().includes('límite') || e.message?.toLowerCase().includes('limite')) {
        setView('planes');
      } else {
        console.error(e);
      }
    }
  };

  const abrirEdicion = (nota) => {
    setSelectedNota(nota);
    setEditContent({
      titulo: nota.titulo,
      contenido: nota.contenido,
      etiquetas: Array.isArray(nota.etiquetas) ? nota.etiquetas.join(', ') : nota.etiquetas
    });
    setEditMode(true);
  };

  const guardar = async () => {
    if (!selectedNota) return;
    setSaving(true);
    try {
      const etiquetas = editContent.etiquetas.split(',').map(t => t.trim()).filter(Boolean);
      const data = await api.notas.actualizar(selectedNota.id, {
        titulo: editContent.titulo,
        contenido: editContent.contenido,
        etiquetas
      });
      setNotas(prev => prev.map(n => n.id === data.nota.id ? data.nota : n));
      setSelectedNota(data.nota);
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (id) => {
    if (!window.confirm('¿Eliminar esta nota?')) return;
    await api.notas.eliminar(id);
    setNotas(prev => prev.filter(n => n.id !== id));
    if (selectedNota?.id === id) { setSelectedNota(null); setEditMode(false); }
    cargarLimites();
  };

  const togglePin = async (nota) => {
    const data = await api.notas.actualizar(nota.id, { is_pinned: nota.is_pinned ? 0 : 1 });
    setNotas(prev => prev.map(n => n.id === data.nota.id ? data.nota : n));
  };

  const cambiarColor = async (nota, color, permitido) => {
    if (!permitido) {
      setColorMsg('🔒 Ese color es de un plan superior. Mejora tu plan para desbloquearlo.');
      setTimeout(() => setColorMsg(''), 3000);
      return;
    }
    const data = await api.notas.actualizar(nota.id, { color });
    setNotas(prev => prev.map(n => n.id === data.nota.id ? data.nota : n));
    if (selectedNota?.id === nota.id) setSelectedNota(data.nota);
  };

  const cancelarPremium=()=>{localStorage.setItem('premiumMode','false');setPremiumMode(false);setPagoMsg('Suscripción cancelada');};

  const pagar = async (planId) => {
    localStorage.setItem('premiumMode','true'); setPremiumMode(true);
    setPagoMsg('Simulando activación Premium y abriendo MercadoPago...');
    try {
      const data = await api.planes.pagar(planId);
      if (data.modo_prueba) {
        setPagoMsg('⚠️ Modo de prueba: usa una tarjeta de prueba de MercadoPago, no se cobrará dinero real. Redirigiendo...');
      }
      setTimeout(() => { window.open(data.payment_url,'_blank'); }, data.modo_prueba ? 1200 : 0);
    } catch (e) {
      setPagoMsg(`❌ Error: ${e.message}`);
    }
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  const filtradas = notas.filter(n =>
    n.titulo.toLowerCase().includes(search.toLowerCase()) ||
    n.contenido.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={s.root}>
      {/* Sidebar */}
      <aside style={s.sidebar}>
        <div style={s.sidebarTop}>
          <div style={s.logo}>
            <span style={{ color: premiumMode ? '#d4af37' : '#7c6af7', fontSize: '20px' }}>⬡</span>
            <span style={s.logoText}>BlockNotas</span>
          </div>
          <div style={s.userBadge}>
            <span style={s.userName}>{user?.nombre}</span>
            <span style={s.userPlan}>{user?.plan || 'free'}</span>
          </div>

          <button onClick={nuevaNota} style={{ ...s.btnNueva, ...(limiteAlcanzado ? s.btnNuevaLimite : {}) }}>
            {limiteAlcanzado ? `${ICONS.lock} Límite alcanzado` : `${ICONS.plus} Nueva nota`}
          </button>

          <nav style={s.nav}>
            <button onClick={() => setView('notas')} style={{ ...s.navItem, ...(view === 'notas' ? s.navActive : {}) }}>
              {ICONS.note} Mis notas
            </button>
            <button onClick={() => setView('stats')} style={{ ...s.navItem, ...(view === 'stats' ? s.navActive : {}) }}>
              {ICONS.star} Estadísticas
            </button>
            <button onClick={() => setView('planes')} style={{ ...s.navItem, ...(view === 'planes' ? s.navActive : {}) }}>
              {ICONS.plans} Planes
            </button>
          </nav>
        </div>

        <button onClick={handleLogout} style={s.logoutBtn}>
          {ICONS.logout} Cerrar sesión
        </button>
      </aside>

      {/* Lista de notas */}
      {view === 'notas' && (
        <div style={s.notesList}>
          <div style={s.searchWrap}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar notas..."
              style={s.searchInput}
            />
          </div>
          <div style={s.notesCount}>
            {filtradas.length} nota{filtradas.length !== 1 ? 's' : ''}
            {limites && limites.max_notas !== -1 && ` / ${limites.max_notas}`}
          </div>
          {limiteAlcanzado && (
            <div style={s.limitBanner} onClick={() => setView('planes')}>
              {ICONS.lock} Llegaste a tu límite de notas. Mejora tu plan →
            </div>
          )}
          {loading ? (
            <div style={s.empty}>Cargando...</div>
          ) : filtradas.length === 0 ? (
            <div style={s.empty}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📝</div>
              <div>No hay notas aún</div>
              <div style={{ fontSize: '13px', color: '#555', marginTop: '4px' }}>Crea tu primera nota</div>
            </div>
          ) : filtradas.map(nota => (
            <div
              key={nota.id}
              onClick={() => { setSelectedNota(nota); setEditMode(false); }}
              style={{ ...s.noteCard, ...(selectedNota?.id === nota.id ? s.noteCardActive : {}) }}
            >
              <div style={s.noteCardHeader}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                  {nota.color && nota.color !== '#1a1a1d' && (
                    <span style={{ ...s.colorDot, background: nota.color, flexShrink: 0 }} />
                  )}
                  <span style={s.noteTitle}>{nota.titulo || 'Sin título'}</span>
                </span>
                {nota.is_pinned ? <span style={{ color: premiumMode ? '#d4af37' : '#7c6af7', fontSize: '12px' }}>📌</span> : null}
              </div>
              <div style={s.notePreview}>
                {nota.contenido ? nota.contenido.slice(0, 80) + (nota.contenido.length > 80 ? '...' : '') : 'Sin contenido'}
              </div>
              {nota.etiquetas?.length > 0 && (
                <div style={s.tagsRow}>
                  {nota.etiquetas.map(t => <span key={t} style={s.tag}>{t}</span>)}
                </div>
              )}
              <div style={s.noteDate}>{new Date(nota.updated_at).toLocaleDateString('es-MX')}</div>
            </div>
          ))}
        </div>
      )}

      {/* Editor / Vista principal */}
      <main style={s.main}>
        {view === 'notas' && (
          <>
            {selectedNota ? (
              <div style={s.editor}>
                <div style={s.editorToolbar}>
                  {editMode ? (
                    <>
                      <button onClick={guardar} disabled={saving} style={{ ...s.toolBtn, background: premiumMode ? '#d4af37' : '#7c6af7', color: '#fff' }}>
                        {saving ? 'Guardando...' : '✓ Guardar'}
                      </button>
                      <button onClick={() => setEditMode(false)} style={s.toolBtn}>Cancelar</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => abrirEdicion(selectedNota)} style={s.toolBtn}>{ICONS.edit} Editar</button>
                      <button onClick={() => togglePin(selectedNota)} style={s.toolBtn}>
                        {selectedNota.is_pinned ? '📌 Fijada' : '📌 Fijar'}
                      </button>
                      <button onClick={() => eliminar(selectedNota.id)} style={{ ...s.toolBtn, color: '#ff6b6b' }}>
                        {ICONS.trash} Eliminar
                      </button>
                    </>
                  )}
                  {limites?.colores?.length > 0 && (
                    <div style={s.colorPicker}>
                      {limites.colores.map(c => (
                        <button
                          key={c.id}
                          title={c.permitido ? c.nombre : `${c.nombre} (plan superior)`}
                          onClick={() => cambiarColor(selectedNota, c.hex, c.permitido)}
                          style={{
                            ...s.colorSwatch,
                            background: c.hex,
                            ...(selectedNota.color === c.hex ? s.colorSwatchActive : {}),
                            ...(!c.permitido ? s.colorSwatchLocked : {}),
                          }}
                        >
                          {!c.permitido && <span style={s.colorLockBadge}>{ICONS.lock}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {colorMsg && <div style={s.colorMsg}>{colorMsg}</div>}

                {editMode ? (
                  <div style={s.editForm}>
                    <input
                      value={editContent.titulo}
                      onChange={e => setEditContent(c => ({ ...c, titulo: e.target.value }))}
                      placeholder="Título..."
                      style={s.editTitle}
                    />
                    <input
                      value={editContent.etiquetas}
                      onChange={e => setEditContent(c => ({ ...c, etiquetas: e.target.value }))}
                      placeholder="Etiquetas (separadas por coma)"
                      style={s.editTags}
                    />
                    <textarea
                      value={editContent.contenido}
                      onChange={e => setEditContent(c => ({ ...c, contenido: e.target.value }))}
                      placeholder="Escribe tu nota aquí..."
                      style={s.editTextarea}
                      autoFocus
                    />
                  </div>
                ) : (
                  <div style={s.viewNote}>
                    <h1 style={s.viewTitle}>{selectedNota.titulo}</h1>
                    {selectedNota.etiquetas?.length > 0 && (
                      <div style={{ ...s.tagsRow, marginBottom: '20px' }}>
                        {selectedNota.etiquetas.map(t => <span key={t} style={s.tag}>{t}</span>)}
                      </div>
                    )}
                    <div style={s.viewDate}>
                      Actualizada: {new Date(selectedNota.updated_at).toLocaleString('es-MX')}
                    </div>
                    <div style={s.viewContent}>
                      {selectedNota.contenido || <span style={{ color: '#444' }}>Sin contenido. Haz clic en Editar para agregar.</span>}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={s.emptyMain}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>⬡</div>
                <div style={{ color: '#555', fontSize: '16px' }}>Selecciona una nota o crea una nueva</div>
              </div>
            )}
          </>
        )}

        {view === 'stats' && stats && (
          <div style={s.statsView}>
            <h2 style={s.sectionTitle}>Estadísticas</h2>
            <div style={s.statsGrid}>
              <div style={s.statCard}>
                <div style={s.statNum}>{stats.total_notas}</div>
                <div style={s.statLabel}>Notas totales</div>
              </div>
              <div style={s.statCard}>
                <div style={s.statNum}>{stats.notas_fijadas}</div>
                <div style={s.statLabel}>Notas fijadas</div>
              </div>
              <div style={s.statCard}>
                <div style={{ ...s.statNum, color: premiumMode ? '#d4af37' : '#7c6af7' }}>{stats.plan}</div>
                <div style={s.statLabel}>Plan actual</div>
              </div>
            </div>

            {stats.recientes?.length > 0 && (
              <>
                <h3 style={{ color: '#888', fontSize: '13px', marginTop: '28px', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>Recientes</h3>
                {stats.recientes.map(n => (
                  <div key={n.id} style={s.recentItem} onClick={() => { setView('notas'); setSelectedNota(notas.find(x => x.id === n.id)); }}>
                    <span style={{ color: '#ccc' }}>{n.titulo}</span>
                    <span style={{ color: '#444', fontSize: '12px' }}>{new Date(n.updated_at).toLocaleDateString('es-MX')}</span>
                  </div>
                ))}
              </>
            )}

            {Object.keys(stats.etiquetas_populares || {}).length > 0 && (
              <>
                <h3 style={{ color: '#888', fontSize: '13px', marginTop: '28px', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>Etiquetas populares</h3>
                <div style={s.tagsRow}>
                  {Object.entries(stats.etiquetas_populares).map(([tag, count]) => (
                    <span key={tag} style={{ ...s.tag, fontSize: '13px' }}>{tag} ({count})</span>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {view === 'planes' && (
          <div style={s.planesView}>
            <h2 style={s.sectionTitle}>Planes de suscripción</h2>
            <p style={{ color: '#666', marginBottom: '28px' }}>Pagos reales con MercadoPago</p>
            {pagoBanner && (
              <div style={{
                ...s.statCard, marginBottom: '20px',
                color: pagoBanner === 'success' ? '#7c6af7' : pagoBanner === 'pending' ? '#f7c86a' : '#ff6b6b'
              }}>
                {pagoBanner === 'success' && '✅ ¡Pago recibido! Tu plan se actualizará en unos segundos...'}
                {pagoBanner === 'pending' && '⏳ Tu pago está pendiente de confirmación.'}
                {pagoBanner === 'failure' && '❌ El pago no se completó. Puedes intentarlo de nuevo.'}
              </div>
            )}
            {pagoMsg && (
              <div style={{ ...s.statCard, marginBottom: '20px', whiteSpace: 'pre-line', color: pagoMsg.startsWith('❌') ? '#ff6b6b' : '#f7c86a' }}>
                {pagoMsg}
              </div>
            )}
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {(premiumMode ? planes.filter(p=>String(p.nombre).toLowerCase()==='free') : planes).map(plan => (
                <div key={plan.id} style={{ ...s.planCard, ...(plan.nombre === 'Pro' ? s.planCardFeatured : {}) }}>
                  {plan.nombre === 'Pro' && <div style={s.planBadge}>Popular</div>}
                  <div style={s.planName}>{plan.nombre}</div>
                  <div style={s.planPrice}>
                    {plan.precio === 0 ? 'Gratis' : `$${plan.precio} MXN/mes`}
                  </div>
                  <div style={s.planDesc}>{plan.descripcion}</div>
                  <ul style={s.planFeatures}>
                    {plan.features.map(f => <li key={f} style={s.planFeature}>✓ {f}</li>)}
                  </ul>
                  {plan.precio > 0 && (
                    user?.plan?.toLowerCase() === plan.nombre.toLowerCase() ? (
                      <div style={{ ...s.payBtn, background: '#1e1e22', color: '#666', textAlign: 'center', marginTop: '16px', cursor: 'default' }}>
                        Tu plan actual
                      </div>
                    ) : (
                      {premiumMode ? <button onClick={cancelarPremium} style={{...s.payBtn,background:'#d4af37'}}>Cancelar suscripción</button> : <button onClick={() => pagar(plan.id)} style={{ ...s.payBtn, background: '#009ee3', marginTop: '16px' }}>Pagar con MercadoPago</button>}
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

const s = {
  root: { display: 'flex', height: '100vh', background: '#0d0d0f', fontFamily: "'Inter', sans-serif", color: '#f0f0f2', overflow: 'hidden' },
  sidebar: { width: '220px', background: '#111113', borderRight: '1px solid #1e1e21', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px 0', flexShrink: 0 },
  sidebarTop: { display: 'flex', flexDirection: 'column', gap: '4px', padding: '0 12px' },
  logo: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' },
  logoText: { fontSize: '16px', fontWeight: '700', letterSpacing: '-0.3px' },
  userBadge: { background: '#1a1a1d', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px' },
  userName: { display: 'block', fontSize: '13px', fontWeight: '500', color: '#ccc' },
  userPlan: { fontSize: '11px', color: premiumMode ? '#d4af37' : '#7c6af7', textTransform: 'capitalize', fontWeight: '600' },
  btnNueva: { background: premiumMode ? '#d4af37' : '#7c6af7', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 14px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', width: '100%' },
  btnNuevaLimite: { background: '#2a2a2e', color: '#888' },
  nav: { display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '8px' },
  navItem: { background: 'none', border: 'none', color: '#666', fontSize: '13px', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'inherit', width: '100%' },
  navActive: { background: '#1e1e22', color: '#f0f0f2' },
  logoutBtn: { background: 'none', border: 'none', color: '#444', fontSize: '13px', padding: '8px 24px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' },
  notesList: { width: '260px', borderRight: '1px solid #1e1e21', overflowY: 'auto', flexShrink: 0 },
  searchWrap: { padding: '12px' },
  searchInput: { width: '100%', background: '#1a1a1d', border: '1px solid #2a2a2e', borderRadius: '8px', padding: '8px 12px', color: '#ccc', fontSize: '13px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  notesCount: { fontSize: '11px', color: '#444', padding: '0 12px 8px', textTransform: 'uppercase', letterSpacing: '1px' },
  limitBanner: { margin: '0 12px 12px', padding: '8px 10px', background: '#241c33', border: '1px solid #3a2d57', borderRadius: '8px', color: '#b3a4ff', fontSize: '12px', cursor: 'pointer' },
  colorDot: { width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' },
  noteCard: { padding: '12px 14px', borderBottom: '1px solid #1a1a1d', cursor: 'pointer', transition: 'background 0.1s' },
  noteCardActive: { background: '#1e1e22' },
  noteCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
  noteTitle: { fontSize: '14px', fontWeight: '500', color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' },
  notePreview: { fontSize: '12px', color: '#555', lineHeight: '1.4', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' },
  tagsRow: { display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' },
  tag: { background: '#1e1a33', color: premiumMode ? '#d4af37' : '#7c6af7', fontSize: '11px', padding: '2px 7px', borderRadius: '4px' },
  noteDate: { fontSize: '11px', color: '#333', marginTop: '6px' },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: '#444', fontSize: '14px' },
  main: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' },
  emptyMain: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#333' },
  editor: { flex: 1, display: 'flex', flexDirection: 'column' },
  editorToolbar: { display: 'flex', gap: '8px', padding: '14px 24px', borderBottom: '1px solid #1a1a1d', alignItems: 'center', flexWrap: 'wrap' },
  colorPicker: { display: 'flex', gap: '6px', marginLeft: 'auto', alignItems: 'center' },
  colorSwatch: { width: '20px', height: '20px', borderRadius: '50%', border: '2px solid transparent', cursor: 'pointer', position: 'relative', padding: 0 },
  colorSwatchActive: { border: '2px solid #fff' },
  colorSwatchLocked: { opacity: 0.35, cursor: 'not-allowed' },
  colorLockBadge: { position: 'absolute', top: '-4px', right: '-4px', fontSize: '9px' },
  colorMsg: { padding: '8px 24px', fontSize: '12px', color: '#f7c86a', background: '#26210f', borderBottom: '1px solid #1a1a1d' },
  toolBtn: { background: '#1e1e22', border: '1px solid #2a2a2e', color: '#ccc', borderRadius: '7px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' },
  editForm: { display: 'flex', flexDirection: 'column', flex: 1, padding: '24px' },
  editTitle: { fontSize: '24px', fontWeight: '700', background: 'transparent', border: 'none', outline: 'none', color: '#f0f0f2', marginBottom: '12px', fontFamily: 'inherit' },
  editTags: { fontSize: '13px', background: '#1a1a1d', border: '1px solid #2a2a2e', borderRadius: '6px', padding: '7px 12px', color: '#888', marginBottom: '16px', outline: 'none', fontFamily: 'inherit' },
  editTextarea: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#ccc', fontSize: '15px', lineHeight: '1.7', fontFamily: "'JetBrains Mono', 'Inter', monospace", resize: 'none', minHeight: '400px' },
  viewNote: { padding: '28px 32px' },
  viewTitle: { fontSize: '26px', fontWeight: '700', color: '#f0f0f2', margin: '0 0 12px 0' },
  viewDate: { fontSize: '12px', color: '#444', marginBottom: '20px' },
  viewContent: { fontSize: '15px', lineHeight: '1.8', color: '#bbb', whiteSpace: 'pre-wrap', fontFamily: "'JetBrains Mono', monospace" },
  statsView: { padding: '28px 32px' },
  sectionTitle: { fontSize: '20px', fontWeight: '700', marginBottom: '20px', color: '#f0f0f2' },
  statsGrid: { display: 'flex', gap: '16px', flexWrap: 'wrap' },
  statCard: { background: '#161618', border: '1px solid #2a2a2e', borderRadius: '12px', padding: '20px 24px', minWidth: '140px' },
  statNum: { fontSize: '32px', fontWeight: '700', color: '#f0f0f2' },
  statLabel: { fontSize: '13px', color: '#555', marginTop: '4px' },
  recentItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1a1a1d', cursor: 'pointer' },
  planesView: { padding: '28px 32px' },
  planCard: { background: '#161618', border: '1px solid #2a2a2e', borderRadius: '14px', padding: '24px', minWidth: '200px', flex: '1', maxWidth: '260px', position: 'relative' },
  planCardFeatured: { border: '1px solid #7c6af7' },
  planBadge: { position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', background: premiumMode ? '#d4af37' : '#7c6af7', color: '#fff', fontSize: '11px', fontWeight: '700', padding: '3px 12px', borderRadius: '20px' },
  planName: { fontSize: '18px', fontWeight: '700', color: '#f0f0f2', marginBottom: '6px' },
  planPrice: { fontSize: '22px', fontWeight: '700', color: premiumMode ? '#d4af37' : '#7c6af7', marginBottom: '8px' },
  planDesc: { fontSize: '13px', color: '#666', marginBottom: '14px' },
  planFeatures: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' },
  planFeature: { fontSize: '13px', color: '#aaa' },
  payBtn: { background: '#238636', color: '#fff', border: 'none', borderRadius: '7px', padding: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '500' },
};
