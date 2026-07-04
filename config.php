<?php
return [
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
