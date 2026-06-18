-- BlockNotas SQLite Schema
-- Usuarios
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    plan TEXT DEFAULT 'free',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Notas
CREATE TABLE IF NOT EXISTS notas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    titulo TEXT NOT NULL DEFAULT 'Sin título',
    contenido TEXT DEFAULT '',
    etiquetas TEXT DEFAULT '',
    color TEXT DEFAULT '#1a1a1d',
    is_pinned INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Planes de suscripción
CREATE TABLE IF NOT EXISTS planes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    precio REAL NOT NULL,
    descripcion TEXT,
    max_notas INTEGER DEFAULT 50,
    features TEXT DEFAULT ''
);

-- Pagos
CREATE TABLE IF NOT EXISTS pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plan_id INTEGER NOT NULL,
    metodo TEXT NOT NULL,
    monto REAL NOT NULL,
    estado TEXT DEFAULT 'pendiente',
    referencia TEXT,
    mp_preference_id TEXT,
    mp_payment_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (plan_id) REFERENCES planes(id)
);

-- Insertar planes por defecto
INSERT OR IGNORE INTO planes (id, nombre, precio, descripcion, max_notas, features) VALUES
(1, 'Free', 0, 'Plan gratuito básico', 50, 'Hasta 50 notas,Acceso básico'),
(2, 'Pro', 10, 'Plan profesional completo', 500, 'Hasta 500 notas,Sincronización,Exportar PDF,Soporte prioritario'),
(3, 'Business', 25, 'Para equipos y empresas', -1, 'Notas ilimitadas,Colaboración,API access,Soporte 24/7');
