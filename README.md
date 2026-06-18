# BlockNotas — App tipo Notion/Obsidian

## Stack
- **Backend**: PHP + SQLite (sin configuración de servidor de BD)
- **Frontend**: React + React Router

## Estructura
```
BLOCK_NOTAS_SQLITE/
├── backend/
│   ├── config.php       # Configuración, JWT, helpers, integración MercadoPago
│   ├── database.sql     # Schema SQLite (se aplica automáticamente)
│   ├── auth.php         # Login / Registro
│   ├── notas.php        # CRUD de notas (con límite y colores por plan)
│   ├── planes.php       # Planes + pagos reales con MercadoPago
│   ├── stats.php        # Estadísticas del usuario
│   ├── test.php         # Prueba de conexión
│   └── phpinfo.php      # Info PHP
└── frontend/
    ├── src/
    │   ├── api.js               # Capa de servicios
    │   ├── App.jsx              # Rutas principales
    │   ├── context/AuthContext.jsx
    │   └── pages/
    │       ├── LoginPage.jsx    # Login + Registro
    │       └── DashboardPage.jsx # App principal
    ├── index.html
    └── package.json
```

## Instalación

### Backend
```bash
# Necesitas PHP 8+ con extensión SQLite3 (viene por defecto) y curl (php-curl)
cd backend
php -S localhost:8000
# La BD se crea/migra automáticamente en backend/blocknotas.sqlite
```

### Frontend
```bash
cd frontend
npm install
npm start
# Corre en http://localhost:3000
```

## Pagos reales con MercadoPago

Esta app ya NO simula los pagos: usa Checkout Pro de MercadoPago de verdad.
El dinero que se cobra llega directamente a la cuenta de MercadoPago que
configures (la tuya), porque el Access Token identifica a esa cuenta.

### 1. Consigue tus credenciales
1. Crea o entra a tu cuenta en https://www.mercadopago.com.mx (vincula tu
   banco/CLABE para poder retirar el dinero).
2. Ve a `developers.mercadopago.com.mx/panel/app` → **Tus integraciones** →
   **Crear aplicación**.
3. Elige el producto **Pagos online** y la solución **Checkout Pro**.
4. Copia, de la pestaña **Credenciales de prueba**: el `Access Token` (empieza
   con `TEST-`).
5. En **Webhooks → Configurar notificaciones** copia también la **clave
   secreta** (la usaremos más adelante si quieres validar la firma del
   webhook; por ahora el backend ya verifica cada pago directamente contra la
   API de MercadoPago, lo cual es seguro sin esa clave).

### 2. Configura `backend/config.php`
Reemplaza estos valores:
```php
define('MP_ACCESS_TOKEN', 'TEST-PON-AQUI-TU-ACCESS-TOKEN'); // tu Access Token real
define('BACKEND_PUBLIC_URL', 'http://localhost/BLOCK_NOTAS_SQLITE/backend');
define('FRONTEND_URL', 'http://localhost:3000');
```
**Importante:** MercadoPago necesita poder llegar a `BACKEND_PUBLIC_URL` desde
internet para avisarte cuando un pago se aprueba (webhook). `localhost` NO
funciona para esto. Para probar en tu máquina, usa un túnel como
[ngrok](https://ngrok.com) (`ngrok http 8000`) y pon esa URL temporal en
`BACKEND_PUBLIC_URL`. Cuando subas el proyecto a un hosting real, usa tu
dominio con HTTPS.

**Nunca subas `config.php` con tu Access Token real a un repositorio
público** (GitHub, etc.). Si usas git, agrega ese archivo a `.gitignore` o
muévelo a variables de entorno antes de publicar el código.

### 3. Prueba el flujo completo (sin gastar dinero real)
Mientras uses un Access Token que empiece con `TEST-`, el botón "Pagar con
MercadoPago" te lleva al sandbox de MercadoPago. Ahí debes usar una **tarjeta
de prueba**, nunca tu tarjeta real — los números oficiales (que cambian de
vez en cuando) están siempre actualizados en:
https://www.mercadopago.com.mx/developers/es/docs/checkout-api/additional-content/your-integrations/test/cards

### 4. Pasar a producción (dinero real de verdad)
Cuando todo funcione en pruebas, simplemente reemplaza `MP_ACCESS_TOKEN` por
el de la pestaña **Credenciales de producción** (empieza con `APP_USR-`) y
pon tu dominio real en `BACKEND_PUBLIC_URL`/`FRONTEND_URL` con HTTPS. No hay
que tocar nada más del código.

### Cómo se confirma un pago (seguro contra fraude)
El plan del usuario **no** se actualiza cuando el navegador regresa de
MercadoPago — eso solo muestra un mensaje. Se actualiza cuando MercadoPago le
avisa a `planes.php?action=webhook` por su cuenta, y nuestro servidor vuelve a
preguntarle a la API de MercadoPago (con nuestro propio Access Token) si ese
pago de verdad está aprobado, antes de tocar la base de datos. Así nadie
puede inventarse una notificación falsa para subirse de plan gratis.

## Límite de notas y colores por plan
- **Free**: 50 notas, 3 colores (sin color, morado, amarillo).
- **Pro**: 500 notas, 6 colores.
- **Business**: notas y colores ilimitados.

Estos límites están en la tabla `planes` (columnas `max_notas`) y en
`getColoresPermitidos()` en `config.php`. Si cambias los nombres o precios de
los planes desde la base de datos, esas funciones siguen funcionando porque
comparan por nombre de plan.

## Desplegar el backend en Railway (sin SSH)

El código ya lee todo lo sensible de variables de entorno, así que no
necesitas tocar `config.php` para desplegarlo — solo configura esto en
Railway, pestaña **Variables** de tu servicio:

| Variable | Valor |
|---|---|
| `MP_ACCESS_TOKEN` | Tu Access Token real de MercadoPago (`TEST-...` o `APP_USR-...`) |
| `BACKEND_PUBLIC_URL` | La URL que Railway te da para este servicio, ej. `https://tuapp.up.railway.app` |
| `FRONTEND_URL` | La URL de tu sitio en Netlify, ej. `https://tublocknotas.netlify.app` |
| `SQLITE_PATH` | Ruta dentro de tu Volume persistente, ej. `/data/blocknotas.sqlite` |
| `JWT_SECRET` | (opcional) cualquier texto largo y aleatorio, para que el login no dependa del hostname |

Pasos:
1. Sube la carpeta `backend/` a un repositorio de GitHub.
2. En Railway: **New Project → Deploy from GitHub repo**, selecciona el repo,
   y en la configuración del servicio pon **Root Directory** = `backend`.
3. Agrega un **Volume** desde la pestaña del servicio, móntalo en `/data`.
4. Llena las variables de la tabla de arriba.
5. Railway te da una URL pública con HTTPS automáticamente — copia esa URL
   y úsala como `BACKEND_PUBLIC_URL` (y en `REACT_APP_API_URL` al construir
   el frontend para Netlify).
6. En MercadoPago, no necesitas configurar nada extra del webhook a mano:
   el backend ya manda `notification_url` apuntando a tu propia
   `BACKEND_PUBLIC_URL` en cada pago que crea.

## API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | /auth.php?action=login | Iniciar sesión |
| POST | /auth.php?action=register | Registrarse |
| GET | /auth.php?action=me | Datos del usuario |
| GET | /notas.php | Listar notas |
| POST | /notas.php | Crear nota (respeta el límite del plan) |
| PUT | /notas.php?id=X | Actualizar nota (título, color, etc.) |
| DELETE | /notas.php?id=X | Eliminar nota |
| GET | /planes.php | Ver planes disponibles |
| GET | /planes.php?action=mis-limites | Límite de notas y colores del usuario |
| POST | /planes.php?action=pagar | Crear un pago real con MercadoPago |
| POST | /planes.php?action=webhook | (lo llama MercadoPago, no el frontend) |
| GET | /planes.php?action=historial | Historial de pagos del usuario |
| GET | /stats.php | Estadísticas |

## Métodos de pago soportados
- **MercadoPago** — integración real con Checkout Pro ✅
- Stripe y PayPal quedaron fuera de este alcance; se pueden agregar después
  siguiendo el mismo patrón (crear preferencia/checkout → webhook → verificar
  contra la API → actualizar plan).

## Entrega: Jueves 18 Junio 2026
