<?php
// notas.php - CRUD completo de notas
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];
$userId = getAuthUser();
$db = getDB();
$id = $_GET['id'] ?? null;

// GET - Listar o traer una nota
if ($method === 'GET') {
    if ($id) {
        $stmt = $db->prepare('SELECT * FROM notas WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);
        $nota = $stmt->fetch();
        if (!$nota) jsonResponse(['error' => 'Nota no encontrada'], 404);
        $nota['etiquetas'] = $nota['etiquetas'] ? explode(',', $nota['etiquetas']) : [];
        jsonResponse(['nota' => $nota]);
    } else {
        $search = $_GET['q'] ?? '';
        $etiqueta = $_GET['etiqueta'] ?? '';
        
        $sql = 'SELECT * FROM notas WHERE user_id = ?';
        $params = [$userId];
        
        if ($search) {
            $sql .= ' AND (titulo LIKE ? OR contenido LIKE ?)';
            $params[] = "%$search%";
            $params[] = "%$search%";
        }
        if ($etiqueta) {
            $sql .= ' AND etiquetas LIKE ?';
            $params[] = "%$etiqueta%";
        }
        
        $sql .= ' ORDER BY is_pinned DESC, updated_at DESC';
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $notas = $stmt->fetchAll();
        
        foreach ($notas as &$nota) {
            $nota['etiquetas'] = $nota['etiquetas'] ? explode(',', $nota['etiquetas']) : [];
        }
        jsonResponse(['notas' => $notas]);
    }
}

// POST - Crear nota
if ($method === 'POST') {
    $input = getInput();
    $titulo = trim($input['titulo'] ?? 'Sin título');
    $contenido = $input['contenido'] ?? '';
    $etiquetas = isset($input['etiquetas'])
        ? (is_array($input['etiquetas'])
            ? implode(',', $input['etiquetas'])
            : $input['etiquetas'])
        : '';

    // Límite de notas según el plan del usuario
    $planInfo = getUserPlanInfo($db, $userId);
    if ((int)$planInfo['max_notas'] !== -1) {
        $countStmt = $db->prepare('SELECT COUNT(*) as total FROM notas WHERE user_id = ?');
        $countStmt->execute([$userId]);
        $actual = (int)$countStmt->fetch()['total'];
        if ($actual >= (int)$planInfo['max_notas']) {
            jsonResponse([
                'error' => "Llegaste al límite de {$planInfo['max_notas']} notas de tu plan ({$planInfo['plan']}). Mejora tu plan para crear más.",
                'limite_alcanzado' => true,
            ], 403);
        }
    }

    // Color: si no se manda, se usa el color por defecto. Si se manda, debe
    // estar dentro de los colores que desbloquea el plan del usuario.
    $coloresPermitidos = array_column(getColoresPermitidos($planInfo['plan']), 'hex');
    $color = $input['color'] ?? '#1a1a1d';
    if (!in_array($color, $coloresPermitidos, true)) {
        jsonResponse(['error' => 'Ese color no está disponible en tu plan actual.'], 403);
    }

    $stmt = $db->prepare('INSERT INTO notas (user_id, titulo, contenido, etiquetas, color) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([$userId, $titulo, $contenido, $etiquetas, $color]);
    $newId = $db->lastInsertId();

    $stmt = $db->prepare('SELECT * FROM notas WHERE id = ?');
    $stmt->execute([$newId]);
    $nota = $stmt->fetch();
    $nota['etiquetas'] = $nota['etiquetas'] ? explode(',', $nota['etiquetas']) : [];
    jsonResponse(['success' => true, 'nota' => $nota], 201);
}

// PUT - Actualizar nota
if ($method === 'PUT') {
    if (!$id) jsonResponse(['error' => 'ID requerido'], 400);
    $input = getInput();

    $stmt = $db->prepare('SELECT id FROM notas WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $userId]);
    if (!$stmt->fetch()) jsonResponse(['error' => 'Nota no encontrada'], 404);

    $fields = [];
    $params = [];
    
    if (isset($input['titulo'])) { $fields[] = 'titulo = ?'; $params[] = trim($input['titulo']); }
    if (isset($input['contenido'])) { $fields[] = 'contenido = ?'; $params[] = $input['contenido']; }
    if (isset($input['etiquetas'])) {
        $fields[] = 'etiquetas = ?';
        $params[] = is_array($input['etiquetas']) ? implode(',', $input['etiquetas']) : $input['etiquetas'];
    }
    if (isset($input['is_pinned'])) { $fields[] = 'is_pinned = ?'; $params[] = (int)$input['is_pinned']; }
    if (isset($input['color'])) {
        $planInfo = getUserPlanInfo($db, $userId);
        $coloresPermitidos = array_column(getColoresPermitidos($planInfo['plan']), 'hex');
        if (!in_array($input['color'], $coloresPermitidos, true)) {
            jsonResponse(['error' => 'Ese color no está disponible en tu plan actual.'], 403);
        }
        $fields[] = 'color = ?';
        $params[] = $input['color'];
    }
    
    $fields[] = 'updated_at = CURRENT_TIMESTAMP';
    $params[] = $id;
    $params[] = $userId;

    $sql = 'UPDATE notas SET ' . implode(', ', $fields) . ' WHERE id = ? AND user_id = ?';
    $stmt = $db->prepare($sql);
    $stmt->execute($params);

    $stmt = $db->prepare('SELECT * FROM notas WHERE id = ?');
    $stmt->execute([$id]);
    $nota = $stmt->fetch();
    $nota['etiquetas'] = $nota['etiquetas'] ? explode(',', $nota['etiquetas']) : [];
    jsonResponse(['success' => true, 'nota' => $nota]);
}

// DELETE - Eliminar nota
if ($method === 'DELETE') {
    if (!$id) jsonResponse(['error' => 'ID requerido'], 400);
    $stmt = $db->prepare('DELETE FROM notas WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $userId]);
    if ($stmt->rowCount() === 0) jsonResponse(['error' => 'Nota no encontrada'], 404);
    jsonResponse(['success' => true, 'message' => 'Nota eliminada']);
}

jsonResponse(['error' => 'Método no permitido'], 405);
