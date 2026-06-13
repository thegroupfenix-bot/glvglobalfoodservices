<?php
header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (preg_match('#^https?://(www\.)?glvglobalfoodservices\.com$#i', $origin)) {
    header("Access-Control-Allow-Origin: {$origin}");
} else {
    header('Access-Control-Allow-Origin: https://glvglobalfoodservices.com');
}
header('Access-Control-Allow-Credentials: true');

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params(['secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
    session_start();
}

if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

echo json_encode(['csrf_token' => $_SESSION['csrf_token']]);
