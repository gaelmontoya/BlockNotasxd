<?php
// index.php - Health check / landing del API.
// No es una ruta que use el frontend; existe para que al abrir la URL
// base del backend (ej. https://tuapp.up.railway.app/) confirmes que
// está vivo, y para que Railpack detecte el proyecto como PHP.

require __DIR__ . '/config.php';

jsonResponse([
    'success' => true,
    'app' => 'BlockNotas API',
    'status' => 'ok',
]);
