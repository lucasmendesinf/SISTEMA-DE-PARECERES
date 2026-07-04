<?php
$config = [
    'host' => '127.0.0.1',
    'port' => 3350,
    'database' => 'sistema_pareceres',
    'username' => 'root',
    'password' => '',
    'mercado_pago' => [
        'access_token' => '',
        'public_key' => '',
        'webhook_secret' => '',
        'success_url' => 'http://localhost/Pareceres/login.php?payment=success',
        'failure_url' => 'http://localhost/Pareceres/login.php?payment=failure',
    ],
];

$host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
$isLocal = $host === '' || str_starts_with($host, 'localhost') || str_starts_with($host, '127.0.0.1');
$productionConfig = __DIR__ . '/config.production.php';

if (!$isLocal && is_file($productionConfig)) {
    $production = require $productionConfig;
    if (is_array($production)) {
        $config = array_replace_recursive($config, $production);
    }
}

return $config;
