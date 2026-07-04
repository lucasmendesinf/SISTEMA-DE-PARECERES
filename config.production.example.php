<?php
return [
    'host' => 'localhost',
    'port' => 3306,
    'database' => 'calutecc_ai-prof',
    'username' => 'calutecc_aiprof',
    'password' => 'SENHA_DO_MYSQL_AQUI',
    'mercado_pago' => [
        'access_token' => '',
        'public_key' => '',
        'webhook_secret' => '',
        'success_url' => 'https://SEU_DOMINIO/pareceres/login.php?payment=success',
        'failure_url' => 'https://SEU_DOMINIO/pareceres/login.php?payment=failure',
    ],
];
