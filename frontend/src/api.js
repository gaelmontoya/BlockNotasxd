// src/api.js - Servicios API para el backend PHP

// En local (XAMPP) usa la ruta de siempre. En el build de producción
// (Netlify), CRA reemplaza process.env.REACT_APP_API_URL con el valor que
// le hayas puesto en sus variables de entorno antes de compilar.
const BASE_URL = process.env.REACT_APP_API_URL || 'http://blocknotasxd-production.up.railway.app';

function getToken() {
  return localStorage.getItem('bn_token');
}

function authHeaders() {
  const token = getToken();

  return {
    'Content-Type': 'application/json',
    ...(token && {
      Authorization: `Bearer ${token}`
    })
  };
}

async function request(path, options = {}) {
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: authHeaders(),
      ...options
    });

    // Obtener respuesta como texto para depurar
    const text = await response.text();

    console.log('Respuesta backend:');
    console.log(text);

    let data;

    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(
        `El backend devolvió HTML o texto en lugar de JSON:\n${text}`
      );
    }

    if (!response.ok) {
      const msg = data.detalle ? `${data.error} (${data.detalle})` : (data.error || 'Error del servidor');
      throw new Error(msg);
    }

    return data;

  } catch (error) {
    console.error('Error API:', error);
    throw error;
  }
}

export const api = {
  auth: {
    login: (email, password) =>
      request('/auth.php?action=login', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password
        })
      }),

    register: (nombre, email, password) =>
      request('/auth.php?action=register', {
        method: 'POST',
        body: JSON.stringify({
          nombre,
          email,
          password
        })
      }),

    me: () =>
      request('/auth.php?action=me'),
  },

  notas: {
    listar: (q = '', etiqueta = '') => {
      const params = new URLSearchParams();

      if (q) params.set('q', q);
      if (etiqueta) params.set('etiqueta', etiqueta);

      return request(`/notas.php?${params}`);
    },

    obtener: (id) =>
      request(`/notas.php?id=${id}`),

    crear: (data) =>
      request('/notas.php', {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    actualizar: (id, data) =>
      request(`/notas.php?id=${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      }),

    eliminar: (id) =>
      request(`/notas.php?id=${id}`, {
        method: 'DELETE'
      }),
  },

  planes: {
    listar: () =>
      request('/planes.php'),

    misLimites: () =>
      request('/planes.php?action=mis-limites'),

    pagar: (planId) =>
      request('/planes.php?action=pagar', {
        method: 'POST',
        body: JSON.stringify({
          plan_id: planId,
          metodo: 'mercadopago'
        })
      }),

    historial: () =>
      request('/planes.php?action=historial'),
  },

  stats: {
    obtener: () =>
      request('/stats.php'),
  }
};
