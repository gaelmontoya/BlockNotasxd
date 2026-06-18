<?php
// auth.php - Autenticación: registro y login
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if ($method === 'POST' && $action === 'register') {
    $input = getInput();
    $nombre = trim($input['nombre'] ?? '');
    $email = trim(strtolower($input['email'] ?? ''));
    $password = $input['password'] ?? '';

    if (!$nombre || !$email || !$password) {
        jsonResponse(['error' => 'Todos los campos son requeridos'], 400);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['error' => 'Email inválido'], 400);
    }
    if (strlen($password) < 6) {
        jsonResponse(['error' => 'La contraseña debe tener al menos 6 caracteres'], 400);
    }

    $db = getDB();
    $stmt = $db->prepare('SELECT id FROM users WHERE email = ?');
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        jsonResponse(['error' => 'El email ya está registrado'], 409);
    }

    $hash = password_hash($password, PASSWORD_BCRYPT);
    $stmt = $db->prepare('INSERT INTO users (nombre, email, password) VALUES (?, ?, ?)');
    $stmt->execute([$nombre, $email, $hash]);
    $userId = $db->lastInsertId();

    $token = generateToken($userId);
    jsonResponse([
        'success' => true,
        'token' => $token,
        'user' => ['id' => $userId, 'nombre' => $nombre, 'email' => $email, 'plan' => 'free']
    ]);
}

if ($method === 'POST' && $action === 'login') {
    $input = getInput();
    $email = trim(strtolower($input['email'] ?? ''));
    $password = $input['password'] ?? '';

    if (!$email || !$password) {
        jsonResponse(['error' => 'Email y contraseña requeridos'], 400);
    }

    $db = getDB();
    $stmt = $db->prepare('SELECT * FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password'])) {
        jsonResponse(['error' => 'Credenciales incorrectas'], 401);
    }

    $token = generateToken($user['id']);
    jsonResponse([
        'success' => true,
        'token' => $token,
        'user' => [
            'id' => $user['id'],
            'nombre' => $user['nombre'],
            'email' => $user['email'],
            'plan' => $user['plan']
        ]
    ]);
}

if ($method === 'GET' && $action === 'me') {
    $userId = getAuthUser();
    $db = getDB();
    $stmt = $db->prepare('SELECT id, nombre, email, plan, created_at FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    if (!$user) jsonResponse(['error' => 'Usuario no encontrado'], 404);
    jsonResponse(['user' => $user]);
}

jsonResponse(['error' => 'Acción no válida'], 404);
