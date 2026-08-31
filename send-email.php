<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

$allowedOrigins = [
    'https://glvglobalfoodservices.com',
    'https://www.glvglobalfoodservices.com',
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if ($origin !== '') {
    if (!in_array($origin, $allowedOrigins, true)) {
        respond(403, ['success' => false, 'error' => 'Origen no autorizado.']);
    }
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Credentials: true');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
    header('Access-Control-Max-Age: 600');
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST, OPTIONS');
    respond(405, ['success' => false, 'error' => 'Método no permitido.']);
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

/* CSRF is checked before validation and before consuming the rate limit. */
$submittedToken = $_POST['csrf_token'] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
$sessionToken = $_SESSION['csrf_token'] ?? '';
if (
    !is_string($submittedToken)
    || !is_string($sessionToken)
    || $submittedToken === ''
    || !hash_equals($sessionToken, $submittedToken)
) {
    respond(403, ['success' => false, 'error' => 'Token de seguridad inválido o vencido.']);
}

function cleanText($value, int $maxLength): string
{
    if (!is_string($value)) {
        return '';
    }
    $value = strip_tags($value);
    $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value) ?? '';
    $value = trim($value);
    return function_exists('mb_substr')
        ? mb_substr($value, 0, $maxLength, 'UTF-8')
        : substr($value, 0, $maxLength);
}

$name = cleanText($_POST['name'] ?? '', 120);
$company = cleanText($_POST['company'] ?? '', 160);
$emailInput = is_string($_POST['email'] ?? null) ? trim((string) $_POST['email']) : '';
$email = filter_var($emailInput, FILTER_VALIDATE_EMAIL);
$phone = cleanText($_POST['phone'] ?? '', 60);
$product = cleanText($_POST['product'] ?? '', 180);
$destination = cleanText($_POST['destination'] ?? '', 180);
$volume = cleanText($_POST['volume'] ?? '', 100);
$incoterm = cleanText($_POST['incoterm'] ?? '', 40);
$payment = cleanText($_POST['payment'] ?? '', 80);
$message = cleanText($_POST['message'] ?? '', 2000);

$errors = [];
if (strlen($name) < 2) {
    $errors[] = 'El nombre es obligatorio.';
}
if (strlen($company) < 2) {
    $errors[] = 'La empresa y el país son obligatorios.';
}
if ($email === false || strlen($emailInput) > 254 || preg_match('/[\r\n]/', $emailInput)) {
    $errors[] = 'El correo electrónico no es válido.';
}
if ($product === '') {
    $errors[] = 'El producto es obligatorio.';
}
if ($destination === '') {
    $errors[] = 'El destino es obligatorio.';
}
if ($errors !== []) {
    respond(422, ['success' => false, 'error' => implode(' ', $errors)]);
}

/* Use the direct peer address. Forwarded headers are intentionally not trusted by default. */
$remoteAddress = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
if ($remoteAddress !== 'unknown' && filter_var($remoteAddress, FILTER_VALIDATE_IP) === false) {
    $remoteAddress = 'unknown';
}
$rateDirectory = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'glv_quote_rate';
if (!is_dir($rateDirectory) && !mkdir($rateDirectory, 0700, true) && !is_dir($rateDirectory)) {
    respond(500, ['success' => false, 'error' => 'No fue posible procesar la solicitud en este momento.']);
}

$rateFile = $rateDirectory . DIRECTORY_SEPARATOR . hash('sha256', $remoteAddress) . '.json';
$rateHandle = fopen($rateFile, 'c+');
if ($rateHandle === false || !flock($rateHandle, LOCK_EX)) {
    if (is_resource($rateHandle)) {
        fclose($rateHandle);
    }
    respond(500, ['success' => false, 'error' => 'No fue posible procesar la solicitud en este momento.']);
}

$now = time();
$windowSeconds = 600;
$maxRequests = 5;
$stored = stream_get_contents($rateHandle);
$history = json_decode($stored !== false ? $stored : '[]', true);
if (!is_array($history)) {
    $history = [];
}
$history = array_values(array_filter($history, static function ($timestamp) use ($now, $windowSeconds): bool {
    return is_int($timestamp) && $timestamp > ($now - $windowSeconds);
}));

if (count($history) >= $maxRequests) {
    flock($rateHandle, LOCK_UN);
    fclose($rateHandle);
    respond(429, ['success' => false, 'error' => 'Has enviado demasiadas solicitudes. Espera unos minutos e intenta de nuevo.']);
}

$history[] = $now;
rewind($rateHandle);
ftruncate($rateHandle, 0);
fwrite($rateHandle, json_encode($history));
fflush($rateHandle);
flock($rateHandle, LOCK_UN);
fclose($rateHandle);

$escape = static function (string $value): string {
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
};

$safeName = $escape($name);
$safeCompany = $escape($company);
$safeEmail = $escape((string) $email);
$safePhone = $escape($phone);
$safeProduct = $escape($product);
$safeDestination = $escape($destination);
$safeVolume = $escape($volume);
$safeIncoterm = $escape($incoterm);
$safePayment = $escape($payment);
$safeMessage = nl2br($escape($message), false);

$subject = 'Nueva solicitud de cotización — ' . preg_replace('/[\r\n]+/', ' ', $product) . ' — ' . preg_replace('/[\r\n]+/', ' ', $company);
$body = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>'
    . 'body{font-family:Arial,sans-serif;color:#222;line-height:1.6}.box{max-width:680px;margin:auto;border:1px solid #ddd;padding:24px}'
    . 'h1{font-size:22px;color:#9b7d2d}table{width:100%;border-collapse:collapse}td{padding:8px;border-bottom:1px solid #eee}'
    . 'td:first-child{font-weight:bold;width:34%;color:#555}</style></head><body><div class="box">'
    . '<h1>Nueva solicitud de cotización</h1><table>'
    . '<tr><td>Nombre</td><td>' . $safeName . '</td></tr>'
    . '<tr><td>Empresa · País</td><td>' . $safeCompany . '</td></tr>'
    . '<tr><td>Email</td><td>' . $safeEmail . '</td></tr>'
    . '<tr><td>WhatsApp / Teléfono</td><td>' . ($safePhone !== '' ? $safePhone : '—') . '</td></tr>'
    . '<tr><td>Producto</td><td>' . $safeProduct . '</td></tr>'
    . '<tr><td>Destino</td><td>' . $safeDestination . '</td></tr>'
    . '<tr><td>Volumen</td><td>' . ($safeVolume !== '' ? $safeVolume : '—') . '</td></tr>'
    . '<tr><td>Incoterm</td><td>' . ($safeIncoterm !== '' ? $safeIncoterm : '—') . '</td></tr>'
    . '<tr><td>Método de pago</td><td>' . ($safePayment !== '' ? $safePayment : '—') . '</td></tr>'
    . '<tr><td>Mensaje</td><td>' . ($safeMessage !== '' ? $safeMessage : '—') . '</td></tr>'
    . '</table></div></body></html>';

$headers = [
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'From: GLV Global Food Services <info@glvglobalfoodservices.com>',
    'Reply-To: ' . preg_replace('/[\r\n]+/', '', (string) $email),
    'X-Mailer: PHP/' . PHP_VERSION,
];

$mailDisabled = getenv('GLV_DISABLE_MAIL') === '1';
$sent = $mailDisabled || mail(
    'info@glvglobalfoodservices.com',
    $subject,
    $body,
    implode("\r\n", $headers)
);

if (!$sent) {
    respond(500, ['success' => false, 'error' => 'No fue posible enviar la solicitud. Conservamos tus datos en el formulario para que puedas intentarlo de nuevo.']);
}

if (!$mailDisabled) {
    $replySubject = 'Recibimos tu solicitud — GLV Global Food Services';
    $replyBody = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Arial,sans-serif;color:#222;line-height:1.6">'
        . '<div style="max-width:620px;margin:auto;border:1px solid #ddd;padding:24px">'
        . '<h1 style="font-size:22px;color:#9b7d2d">Solicitud recibida</h1>'
        . '<p>Hola ' . $safeName . ',</p>'
        . '<p>Recibimos tu solicitud para <strong>' . $safeProduct . '</strong> con destino <strong>' . $safeDestination . '</strong>.</p>'
        . '<p>Nuestro equipo comercial responderá a <strong>' . $safeEmail . '</strong> en menos de 24 horas hábiles.</p>'
        . '<p>GLV Global Food Services LLC<br>Miami, Florida, USA</p></div></body></html>';
    mail((string) $email, $replySubject, $replyBody, implode("\r\n", [
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'From: GLV Global Food Services <info@glvglobalfoodservices.com>',
    ]));
}

$_SESSION['csrf_token'] = bin2hex(random_bytes(32));
respond(200, [
    'success' => true,
    'message' => 'Solicitud enviada correctamente.',
    'csrf_token' => $_SESSION['csrf_token'],
]);
