<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');

$allowedOrigins = [
    'https://glvglobalfoodservices.com',
    'https://www.glvglobalfoodservices.com',
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if ($origin !== '') {
    if (!in_array($origin, $allowedOrigins, true)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Origen no autorizado.'], JSON_UNESCAPED_SLASHES);
        exit;
    }
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Credentials: true');
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Allow: GET');
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido.'], JSON_UNESCAPED_SLASHES);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

if (
    empty($_SESSION['csrf_token'])
    || !is_string($_SESSION['csrf_token'])
    || !preg_match('/^[a-f0-9]{64}$/', $_SESSION['csrf_token'])
) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

echo json_encode(
    ['success' => true, 'csrf_token' => $_SESSION['csrf_token']],
    JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
);
