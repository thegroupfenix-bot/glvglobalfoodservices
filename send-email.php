<?php
header('Content-Type: application/json');

// ── CORS ──────────────────────────────────────────────────────────────────────
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (preg_match('#^https?://(www\.)?glvglobalfoodservices\.com$#i', $origin)) {
    header("Access-Control-Allow-Origin: {$origin}");
} else {
    header('Access-Control-Allow-Origin: https://glvglobalfoodservices.com');
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
    http_response_code(204);
    exit;
}

// ── METHOD GUARD ──────────────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// ── RATE LIMITING (5 requests per IP per 10 minutes) ─────────────────────────
$ip        = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$ip        = trim(explode(',', $ip)[0]);
$cacheDir  = sys_get_temp_dir() . '/glv_rate';
if (!is_dir($cacheDir)) { @mkdir($cacheDir, 0700, true); }
$cacheFile = $cacheDir . '/' . md5($ip) . '.json';
$now       = time();
$window    = 600;   // 10 minutes
$limit     = 5;

$rl = ['count' => 0, 'start' => $now];
if (file_exists($cacheFile)) {
    $data = json_decode(file_get_contents($cacheFile), true);
    if ($data && ($now - $data['start']) < $window) {
        $rl = $data;
    }
}
if ($rl['count'] >= $limit) {
    http_response_code(429);
    echo json_encode(['success' => false, 'error' => 'Too many requests. Please try again in a few minutes.']);
    exit;
}
$rl['count']++;
file_put_contents($cacheFile, json_encode($rl), LOCK_EX);

// ── CSRF TOKEN ────────────────────────────────────────────────────────────────
if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params(['secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
    session_start();
}
$csrfToken = $_POST['csrf_token'] ?? $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
if (empty($_SESSION['csrf_token']) || !hash_equals($_SESSION['csrf_token'], $csrfToken)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Invalid security token. Please reload the page and try again.']);
    exit;
}
// Rotate token after use
$_SESSION['csrf_token'] = bin2hex(random_bytes(32));

// ── SANITIZATION ──────────────────────────────────────────────────────────────
function sanitize(string $val, int $max = 200): string {
    return substr(strip_tags(trim($val)), 0, $max);
}

$name     = sanitize($_POST['name']        ?? '');
$company  = sanitize($_POST['company']     ?? '');
$phone    = sanitize($_POST['phone']       ?? '', 30);
$product  = sanitize($_POST['product']     ?? '');
$dest     = sanitize($_POST['destination'] ?? '');
$volume   = sanitize($_POST['volume']      ?? '', 100);
$incoterm = sanitize($_POST['incoterm']    ?? '', 50);
$payment  = sanitize($_POST['payment']     ?? '', 100);
$message  = sanitize($_POST['message']     ?? '', 2000);

// ── SERVER-SIDE VALIDATION ────────────────────────────────────────────────────
$errors = [];
if (strlen($name) < 2)    { $errors[] = 'Name must be at least 2 characters.'; }
if (strlen($product) < 2) { $errors[] = 'Product is required.'; }

$email = filter_var(trim($_POST['email'] ?? ''), FILTER_VALIDATE_EMAIL);
if (!$email) { $errors[] = 'Invalid email address.'; }

if ($errors) {
    http_response_code(422);
    echo json_encode(['success' => false, 'error' => implode(' ', $errors)]);
    exit;
}

// ── HEADER INJECTION PREVENTION (CWE-93) ─────────────────────────────────────
$safe_name  = preg_replace('/[\r\n\t]/', ' ', $name);
$safe_email = preg_replace('/[\r\n\t]/', '', $email);

// ── COMPOSE EMAIL ─────────────────────────────────────────────────────────────
$to  = 'info@glvglobalfoodservices.com';
$to2 = 'info@glvservicesexp.com';

$subject = "GLV Food Services — Cotizacion: {$product} | {$company}";

$body  = "===========================================\n";
$body .= " GLV GLOBAL FOOD SERVICES LLC - MIAMI\n";
$body .= " Nueva Solicitud de Cotizacion\n";
$body .= "===========================================\n\n";
$body .= "CONTACTO\n";
$body .= "--------\n";
$body .= "Nombre:    {$name}\n";
$body .= "Empresa:   {$company}\n";
$body .= "Email:     {$email}\n";
$body .= "WhatsApp:  {$phone}\n\n";
$body .= "PEDIDO\n";
$body .= "------\n";
$body .= "Producto:  {$product}\n";
$body .= "Destino:   {$dest}\n";
$body .= "Volumen:   {$volume}\n";
$body .= "Incoterm:  {$incoterm}\n";
$body .= "Pago:      {$payment}\n\n";
if ($message) {
    $body .= "MENSAJE ADICIONAL\n";
    $body .= "-----------------\n";
    $body .= "{$message}\n\n";
}
$body .= "-------------------------------------------\n";
$body .= "IP:     {$ip}\n";
$body .= "Enviado desde glvglobalfoodservices.com\n";
$body .= date('Y-m-d H:i:s T') . "\n";

$headers  = "From: GLV Food Services <noreply@glvglobalfoodservices.com>\r\n";
$headers .= "Reply-To: {$safe_name} <{$safe_email}>\r\n";
$headers .= "X-Mailer: GLV-QuoteForm/2.0\r\n";
$headers .= "MIME-Version: 1.0\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

// ── SEND ──────────────────────────────────────────────────────────────────────
$sent = mail($to, $subject, $body, $headers);
mail($to2, $subject, $body, $headers);

if ($sent) {
    $replySubject = "GLV Global Food Services - Recibimos su solicitud / We received your request";
    $replyBody  = "Dear {$name},\n\n";
    $replyBody .= "Thank you for contacting GLV Global Food Services LLC - Miami, Florida.\n";
    $replyBody .= "We have received your inquiry for: {$product}\n\n";
    $replyBody .= "Our team will respond within 24 business hours.\n\n";
    $replyBody .= "---\n\n";
    $replyBody .= "Estimado/a {$name},\n\n";
    $replyBody .= "Gracias por contactar a GLV Global Food Services LLC - Miami, Florida.\n";
    $replyBody .= "Hemos recibido su solicitud para: {$product}\n\n";
    $replyBody .= "Nuestro equipo respondera en menos de 24 horas habiles.\n\n";
    $replyBody .= "WhatsApp CO +57 316 086 5294\n";
    $replyBody .= "WhatsApp BR +55 11 9466 10038\n";
    $replyBody .= "Email: info@glvglobalfoodservices.com\n\n";
    $replyBody .= "Where Food Moves Markets.\n";
    $replyBody .= "GLV Global Food Services LLC\n";

    $replyHeaders  = "From: GLV Global Food Services <info@glvglobalfoodservices.com>\r\n";
    $replyHeaders .= "MIME-Version: 1.0\r\n";
    $replyHeaders .= "Content-Type: text/plain; charset=UTF-8\r\n";
    mail($safe_email, $replySubject, $replyBody, $replyHeaders);

    // New CSRF token in response so client can make a fresh request if needed
    echo json_encode(['success' => true, 'csrf_token' => $_SESSION['csrf_token']]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Mail server error. Please contact us directly at info@glvglobalfoodservices.com']);
}
