<?php
// stats.php - Estadísticas del usuario
require_once 'config.php';

$userId = getAuthUser();
$db = getDB();

$totalNotas = $db->prepare('SELECT COUNT(*) as total FROM notas WHERE user_id = ?');
$totalNotas->execute([$userId]);
$total = $totalNotas->fetch()['total'];

$pinnedNotas = $db->prepare('SELECT COUNT(*) as total FROM notas WHERE user_id = ? AND is_pinned = 1');
$pinnedNotas->execute([$userId]);
$pinned = $pinnedNotas->fetch()['total'];

$recientes = $db->prepare('SELECT id, titulo, updated_at FROM notas WHERE user_id = ? ORDER BY updated_at DESC LIMIT 5');
$recientes->execute([$userId]);

// Etiquetas más usadas
$etiquetasQuery = $db->prepare('SELECT etiquetas FROM notas WHERE user_id = ? AND etiquetas != ""');
$etiquetasQuery->execute([$userId]);
$etiquetasRaw = $etiquetasQuery->fetchAll(PDO::FETCH_COLUMN);
$etiquetasCount = [];
foreach ($etiquetasRaw as $row) {
    foreach (explode(',', $row) as $tag) {
        $tag = trim($tag);
        if ($tag) $etiquetasCount[$tag] = ($etiquetasCount[$tag] ?? 0) + 1;
    }
}
arsort($etiquetasCount);

// Info del usuario
$userStmt = $db->prepare('SELECT nombre, email, plan, created_at FROM users WHERE id = ?');
$userStmt->execute([$userId]);
$user = $userStmt->fetch();

jsonResponse([
    'stats' => [
        'total_notas' => (int)$total,
        'notas_fijadas' => (int)$pinned,
        'plan' => $user['plan'],
        'recientes' => $recientes->fetchAll(),
        'etiquetas_populares' => array_slice($etiquetasCount, 0, 10, true),
        'usuario' => $user
    ]
]);
