<?php
// planes.php - Planes de suscripción y pagos reales con MercadoPago
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];
$db = getDB();
$action = $_GET['action'] ?? '';

// GET planes - público
if ($method === 'GET' && !$action) {
    $stmt = $db->query('SELECT * FROM planes ORDER BY precio ASC');
    $planes = $stmt->fetchAll();
    foreach ($planes as &$p) {
        $p['features'] = $p['features'] ? explode(',', $p['features']) : [];
    }
    jsonResponse(['planes' => $planes]);
}

// GET - límites y colores del plan actual del usuario (requiere auth)
if ($method === 'GET' && $action === 'mis-limites') {
    $userId = getAuthUser();
    $info = getUserPlanInfo($db, $userId);

    $countStmt = $db->prepare('SELECT COUNT(*) as total FROM notas WHERE user_id = ?');
    $countStmt->execute([$userId]);
    $actual = (int)$countStmt->fetch()['total'];

    jsonResponse([
        'plan' => $info['plan'],
        'max_notas' => (int)$info['max_notas'],
        'notas_actuales' => $actual,
        'colores' => getPaletteConPermisos($info['plan']),
    ]);
}

// POST - Iniciar pago real (requiere auth)
if ($method === 'POST' && $action === 'pagar') {
    $userId = getAuthUser();
    $input = getInput();
    $planId = $input['plan_id'] ?? null;
    $metodo = $input['metodo'] ?? '';

    if (!$planId || !$metodo) {
        jsonResponse(['error' => 'plan_id y metodo son requeridos'], 400);
    }

    // Por ahora solo MercadoPago tiene integración real. Stripe y PayPal
    // quedan deshabilitados hasta que se integren de la misma forma.
    if ($metodo !== 'mercadopago') {
        jsonResponse(['error' => 'Ese método de pago todavía no está disponible. Por ahora usa MercadoPago.'], 400);
    }

    $stmt = $db->prepare('SELECT * FROM planes WHERE id = ?');
    $stmt->execute([$planId]);
    $plan = $stmt->fetch();
    if (!$plan) jsonResponse(['error' => 'Plan no encontrado'], 404);
    if ((float)$plan['precio'] <= 0) jsonResponse(['error' => 'Ese plan es gratuito, no requiere pago'], 400);

    $stmt = $db->prepare('SELECT email, nombre FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();

    // Referencia única para poder identificar este pago cuando llegue el webhook
    $referencia = 'BN-' . $userId . '-' . $planId . '-' . bin2hex(random_bytes(8));

    $stmt = $db->prepare('INSERT INTO pagos (user_id, plan_id, metodo, monto, estado, referencia) VALUES (?, ?, ?, ?, ?, ?)');
    $stmt->execute([$userId, $planId, $metodo, $plan['precio'], 'pendiente', $referencia]);
    $pagoId = $db->lastInsertId();

    $esLocalhost = strpos(FRONTEND_URL, 'localhost') !== false || strpos(FRONTEND_URL, '127.0.0.1') !== false;

    $preferenceBody = [
        'items' => [[
            'title' => 'Plan ' . $plan['nombre'] . ' - BlockNotas',
            'currency_id' => 'MXN',
            'quantity' => 1,
            'unit_price' => (float)$plan['precio'],
        ]],
        'payer' => ['email' => $user['email']],
        'external_reference' => $referencia,
        'notification_url' => BACKEND_PUBLIC_URL . '/planes.php?action=webhook',
        'back_urls' => [
            'success' => FRONTEND_URL . '/?pago=success',
            'pending' => FRONTEND_URL . '/?pago=pending',
            'failure' => FRONTEND_URL . '/?pago=failure',
        ],
    ];
    // MercadoPago rechaza auto_return si back_urls usa localhost (no puede
    // validar que la URL exista). En local omitimos auto_return; el usuario
    // simplemente da clic en "Volver al sitio" tras pagar.
    if (!$esLocalhost) {
        $preferenceBody['auto_return'] = 'approved';
    }

    $mpResponse = mpRequest('POST', '/checkout/preferences', $preferenceBody);

    if (($mpResponse['_http_code'] ?? 0) >= 300 || empty($mpResponse['init_point'])) {
        $db->prepare('UPDATE pagos SET estado = ? WHERE id = ?')->execute(['error', $pagoId]);
        jsonResponse([
            'error' => 'No se pudo crear el pago con MercadoPago. Revisa que MP_ACCESS_TOKEN en config.php sea un Access Token válido.',
            'detalle' => $mpResponse['message'] ?? ($mpResponse['_curl_error'] ?? 'sin detalle'),
        ], 502);
    }

    $stmt = $db->prepare('UPDATE pagos SET mp_preference_id = ? WHERE id = ?');
    $stmt->execute([$mpResponse['id'], $pagoId]);

    // Si el access token es de prueba (TEST-...) usa el sandbox_init_point para pagar con tarjetas de prueba
    $esPrueba = str_starts_with(MP_ACCESS_TOKEN, 'TEST-');
    $paymentUrl = $esPrueba && !empty($mpResponse['sandbox_init_point'])
        ? $mpResponse['sandbox_init_point']
        : $mpResponse['init_point'];

    jsonResponse([
        'success' => true,
        'pago_id' => $pagoId,
        'referencia' => $referencia,
        'metodo' => $metodo,
        'monto' => $plan['precio'],
        'plan' => $plan['nombre'],
        'payment_url' => $paymentUrl,
        'modo_prueba' => $esPrueba,
    ]);
}

// POST/GET - Webhook real de MercadoPago (sin auth, lo llama MercadoPago)
if ($action === 'webhook') {
    // MercadoPago puede mandar el id como query param (?data.id=...&type=payment,
    // que PHP convierte a data_id) o dentro del cuerpo JSON.
    $type = $_GET['type'] ?? $_GET['topic'] ?? null;
    $paymentId = $_GET['data_id'] ?? $_GET['id'] ?? null;

    if (!$type || !$paymentId) {
        $body = getInput();
        $type = $type ?? ($body['type'] ?? $body['action'] ?? null);
        $paymentId = $paymentId ?? ($body['data']['id'] ?? null);
    }

    // Solo nos importan notificaciones de pago
    if ($type === 'payment' && $paymentId) {
        // Nunca confiamos en el contenido del webhook por sí solo: volvemos a
        // pedirle el pago directamente a la API de MercadoPago con nuestro
        // propio Access Token. Así nadie puede falsificar una notificación.
        $pago = mpRequest('GET', '/v1/payments/' . $paymentId);

        if (($pago['_http_code'] ?? 0) === 200) {
            $referencia = $pago['external_reference'] ?? null;
            $estadoMP = $pago['status'] ?? null; // approved, pending, rejected, etc.

            if ($referencia) {
                $stmt = $db->prepare('SELECT p.*, pl.nombre as plan_nombre FROM pagos p JOIN planes pl ON p.plan_id = pl.id WHERE p.referencia = ?');
                $stmt->execute([$referencia]);
                $pagoLocal = $stmt->fetch();

                if ($pagoLocal && $pagoLocal['estado'] !== 'completado') {
                    if ($estadoMP === 'approved') {
                        $db->prepare('UPDATE pagos SET estado = ?, mp_payment_id = ? WHERE referencia = ?')
                           ->execute(['completado', $paymentId, $referencia]);
                        $planNombre = strtolower($pagoLocal['plan_nombre']);
                        $db->prepare('UPDATE users SET plan = ? WHERE id = ?')
                           ->execute([$planNombre, $pagoLocal['user_id']]);
                    } elseif (in_array($estadoMP, ['rejected', 'cancelled'], true)) {
                        $db->prepare('UPDATE pagos SET estado = ? WHERE referencia = ?')
                           ->execute(['rechazado', $referencia]);
                    } else {
                        $db->prepare('UPDATE pagos SET estado = ? WHERE referencia = ?')
                           ->execute([$estadoMP, $referencia]);
                    }
                }
            }
        }
    }

    // MercadoPago solo necesita un 200/201 para no reintentar
    http_response_code(200);
    echo json_encode(['received' => true]);
    exit();
}

// GET historial de pagos del usuario
if ($method === 'GET' && $action === 'historial') {
    $userId = getAuthUser();
    $stmt = $db->prepare('SELECT p.*, pl.nombre as plan_nombre FROM pagos p JOIN planes pl ON p.plan_id = pl.id WHERE p.user_id = ? ORDER BY p.created_at DESC');
    $stmt->execute([$userId]);
    jsonResponse(['pagos' => $stmt->fetchAll()]);
}

jsonResponse(['error' => 'Acción no válida'], 404);
