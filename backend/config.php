<?php
// config.php - Configuración principal

// ============================================================
// Todo lo sensible (llaves, URLs de producción) se lee de
// variables de entorno. En Railway esto se configura desde la
// pestaña "Variables" del servicio, sin tocar código ni terminal.
// Si la variable no existe (ej. corriendo en tu compu con
// `php -S`), se usa el valor de respaldo para desarrollo local.
// ============================================================
function env($name, $default = null) {
    $val = getenv($name);
    return ($val === false || $val === '') ? $default : $val;
}

define('DB_PATH', env('SQLITE_PATH', __DIR__ . '/blocknotas.sqlite'));
define('JWT_SECRET', env('JWT_SECRET', 'blocknotas_secret_2026_' . gethostname()));
define('JWT_EXPIRY', 86400); // 24 horas

// ============================================================
// MERCADOPAGO - credenciales reales
// ============================================================
// En Railway: Variables -> agrega MP_ACCESS_TOKEN con tu Access Token
// real (TEST- para pruebas, APP_USR- para producción). Nunca lo
// escribas directo aquí si tu repo de GitHub es público.
define('MP_ACCESS_TOKEN', env('MP_ACCESS_TOKEN', 'TEST-PON-AQUI-TU-ACCESS-TOKEN'));
define('MP_API_BASE', 'https://api.mercadopago.com');

// URL pública donde vive este backend. MercadoPago necesita poder
// llegar a esta URL desde internet para avisarte cuando un pago se
// aprueba (webhook). En Railway: Variables -> BACKEND_PUBLIC_URL con
// la URL que te da Railway (ej. https://tuapp.up.railway.app).
define('BACKEND_PUBLIC_URL', env('BACKEND_PUBLIC_URL', 'http://localhost/BLOCK_NOTAS_SQLITE/backend'));

// URL pública de tu frontend (Netlify), a donde MercadoPago regresa
// al usuario después de pagar. Variable: FRONTEND_URL.
define('FRONTEND_URL', env('FRONTEND_URL', 'http://localhost:3000'));

// CORS Headers - en PHP directamente para que funcione sin importar el
// servidor (Apache en XAMPP, Caddy/FrankenPHP en Railway, etc). Antes esto
// vivía en .htaccess, que Railway ignora por completo.
header('Access-Control-Allow-Origin: ' . FRONTEND_URL);
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Inicializar base de datos SQLite
function getDB() {
    static $db = null;
    if ($db === null) {
        try {
            $db = new PDO('sqlite:' . DB_PATH);
            $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
            $db->exec('PRAGMA foreign_keys = ON;');
            initDB($db);
            migrateDB($db);
        } catch (PDOException $e) {
            jsonResponse(['error' => 'Error de base de datos: ' . $e->getMessage()], 500);
        }
    }
    return $db;
}

function initDB($db) {
    $sql = file_get_contents(__DIR__ . '/database.sql');
    $db->exec($sql);
}

// Agrega columnas nuevas a bases de datos que ya existían antes de
// estas funciones (colores de notas, datos de pago de MercadoPago).
// Si la columna ya existe, SQLite lanza un error que simplemente
// ignoramos.
function migrateDB($db) {
    $alters = [
        "ALTER TABLE notas ADD COLUMN color TEXT DEFAULT '#1a1a1d'",
        "ALTER TABLE pagos ADD COLUMN mp_preference_id TEXT",
        "ALTER TABLE pagos ADD COLUMN mp_payment_id TEXT",
    ];
    foreach ($alters as $sql) {
        try { $db->exec($sql); } catch (PDOException $e) { /* columna ya existe */ }
    }
}

// JWT simple
function generateToken($userId) {
    $header = base64_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $payload = base64_encode(json_encode([
        'user_id' => $userId,
        'exp' => time() + JWT_EXPIRY,
        'iat' => time()
    ]));
    $signature = base64_encode(hash_hmac('sha256', "$header.$payload", JWT_SECRET, true));
    return "$header.$payload.$signature";
}

function verifyToken($token) {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return false;
    [$header, $payload, $signature] = $parts;
    $validSig = base64_encode(hash_hmac('sha256', "$header.$payload", JWT_SECRET, true));
    if ($signature !== $validSig) return false;
    $data = json_decode(base64_decode($payload), true);
    if ($data['exp'] < time()) return false;
    return $data;
}

function getAuthUser() {
    $headers = getallheaders();
    $auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    if (!$auth || !str_starts_with($auth, 'Bearer ')) {
        jsonResponse(['error' => 'No autorizado'], 401);
    }
    $token = substr($auth, 7);
    $data = verifyToken($token);
    if (!$data) {
        jsonResponse(['error' => 'Token inválido o expirado'], 401);
    }
    return $data['user_id'];
}

function jsonResponse($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit();
}

function getInput() {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

// ============================================================
// Helper genérico para llamar a la API de MercadoPago
// ============================================================
function mpRequest($method, $path, $body = null) {
    if (!function_exists('curl_init')) {
        return ['_http_code' => 0, '_curl_error' => 'La extensión curl de PHP no está habilitada en este servidor. Pide a tu hosting que la active (php-curl).'];
    }
    $ch = curl_init(MP_API_BASE . $path);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . MP_ACCESS_TOKEN,
        'Content-Type: application/json',
    ]);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }
    $response = curl_exec($ch);
    if ($response === false) {
        return ['_http_code' => 0, '_curl_error' => curl_error($ch)];
    }
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $decoded = json_decode($response, true);
    if (!is_array($decoded)) $decoded = [];
    $decoded['_http_code'] = $httpCode;
    return $decoded;
}

// ============================================================
// Colores de notas y límites por plan
// ============================================================
function getColorPalette() {
    return [
        ['id' => 'default', 'hex' => '#1a1a1d', 'nombre' => 'Sin color'],
        ['id' => 'purple',  'hex' => '#7c6af7', 'nombre' => 'Morado'],
        ['id' => 'yellow',  'hex' => '#f7c86a', 'nombre' => 'Amarillo'],
        ['id' => 'red',     'hex' => '#f76a6a', 'nombre' => 'Rojo'],
        ['id' => 'green',   'hex' => '#6af7b0', 'nombre' => 'Verde'],
        ['id' => 'blue',    'hex' => '#6ab8f7', 'nombre' => 'Azul'],
        ['id' => 'pink',    'hex' => '#f76ad4', 'nombre' => 'Rosa'],
        ['id' => 'teal',    'hex' => '#6af7e8', 'nombre' => 'Turquesa'],
    ];
}

// Cuántos colores de la paleta desbloquea cada plan (en orden).
function getColoresPermitidos($plan) {
    $todos = getColorPalette();
    $plan = strtolower($plan ?? 'free');
    if ($plan === 'business') return $todos;            // los 8
    if ($plan === 'pro') return array_slice($todos, 0, 6); // 6 colores
    return array_slice($todos, 0, 3);                     // free: 3 colores
}

// Paleta completa marcando cuáles están permitidos para el plan (para mostrar
// los bloqueados en gris en el frontend).
function getPaletteConPermisos($plan) {
    $todos = getColorPalette();
    $permitidosHex = array_column(getColoresPermitidos($plan), 'hex');
    foreach ($todos as &$c) {
        $c['permitido'] = in_array($c['hex'], $permitidosHex, true);
    }
    return $todos;
}

function getUserPlanInfo($db, $userId) {
    $stmt = $db->prepare(
        'SELECT u.plan, COALESCE(p.max_notas, 50) as max_notas
         FROM users u LEFT JOIN planes p ON LOWER(p.nombre) = LOWER(u.plan)
         WHERE u.id = ?'
    );
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    return $row ?: ['plan' => 'free', 'max_notas' => 50];
}
