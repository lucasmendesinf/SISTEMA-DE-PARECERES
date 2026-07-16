<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', '0');
date_default_timezone_set('America/Sao_Paulo');
session_start();

if (!function_exists('str_starts_with')) {
    function str_starts_with(string $haystack, string $needle): bool
    {
        return $needle === '' || strpos($haystack, $needle) === 0;
    }
}

try {
    $config = require __DIR__ . '/config.php';
    $pdo = new PDO(
        "mysql:host={$config['host']};port={$config['port']};dbname={$config['database']};charset=utf8mb4",
        $config['username'],
        $config['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    $addColumnIfMissing = function (PDO $pdo, string $table, string $column, string $definition): void {
        $quotedTable = '`' . str_replace('`', '``', $table) . '`';
        $stmt = $pdo->prepare("SHOW COLUMNS FROM {$quotedTable} LIKE ?");
        $stmt->execute([$column]);
        if (!$stmt->fetch(PDO::FETCH_ASSOC)) {
            $pdo->exec("ALTER TABLE {$quotedTable} ADD COLUMN {$definition}");
        }
    };

    $addColumnIfMissing($pdo, 'usuarios', 'perfil', "perfil ENUM('master','cliente') NOT NULL DEFAULT 'cliente' AFTER telefone");
    $addColumnIfMissing($pdo, 'usuarios', 'permissoes', 'permissoes JSON NULL AFTER perfil');
    $addColumnIfMissing($pdo, 'usuarios', 'ativo', 'ativo TINYINT(1) NOT NULL DEFAULT 1 AFTER permissoes');
    $addColumnIfMissing($pdo, 'usuarios', 'image_editor_permission', "image_editor_permission ENUM('none','manual','ai','both') NOT NULL DEFAULT 'none' AFTER ativo");
    $addColumnIfMissing($pdo, 'usuarios', 'billing_plan', "billing_plan VARCHAR(80) NOT NULL DEFAULT 'Basico' AFTER image_editor_permission");
    $addColumnIfMissing($pdo, 'usuarios', 'billing_cycle', "billing_cycle ENUM('monthly','annual') NOT NULL DEFAULT 'monthly' AFTER billing_plan");
    $addColumnIfMissing($pdo, 'usuarios', 'billing_cycle_id', 'billing_cycle_id BIGINT UNSIGNED NULL AFTER billing_cycle');
    $addColumnIfMissing($pdo, 'usuarios', 'billing_amount', 'billing_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER billing_cycle_id');
    $addColumnIfMissing($pdo, 'usuarios', 'billing_payment_method', "billing_payment_method ENUM('pix','card','both','manual') NOT NULL DEFAULT 'both' AFTER billing_amount");
    $addColumnIfMissing($pdo, 'usuarios', 'billing_status', "billing_status ENUM('trial','pending','active','overdue','canceled','exempt') NOT NULL DEFAULT 'pending' AFTER billing_payment_method");
    $addColumnIfMissing($pdo, 'usuarios', 'billing_next_due_date', 'billing_next_due_date DATE NULL AFTER billing_status');
    $addColumnIfMissing($pdo, 'usuarios', 'billing_notes', 'billing_notes TEXT NULL AFTER billing_next_due_date');
    $addColumnIfMissing($pdo, 'usuarios', 'billing_trial_days', 'billing_trial_days INT UNSIGNED NOT NULL DEFAULT 0 AFTER billing_notes');
    $addColumnIfMissing($pdo, 'usuarios', 'mercado_pago_customer_id', 'mercado_pago_customer_id VARCHAR(120) NULL AFTER billing_notes');
    $addColumnIfMissing($pdo, 'usuarios', 'mercado_pago_subscription_id', 'mercado_pago_subscription_id VARCHAR(120) NULL AFTER mercado_pago_customer_id');
    $addColumnIfMissing($pdo, 'usuarios', 'mercado_pago_last_payment_id', 'mercado_pago_last_payment_id VARCHAR(120) NULL AFTER mercado_pago_subscription_id');
    $addColumnIfMissing($pdo, 'usuarios', 'terms_accepted_at', 'terms_accepted_at DATETIME NULL AFTER mercado_pago_last_payment_id');
    $addColumnIfMissing($pdo, 'usuarios', 'terms_version', 'terms_version VARCHAR(40) NULL AFTER terms_accepted_at');
    $addColumnIfMissing($pdo, 'usuarios', 'terms_ip', 'terms_ip VARCHAR(45) NULL AFTER terms_version');
    $addColumnIfMissing($pdo, 'turmas', 'usuario_id', 'usuario_id BIGINT UNSIGNED NULL AFTER id');
    $addColumnIfMissing($pdo, 'periodos_avaliativos', 'usuario_id', 'usuario_id BIGINT UNSIGNED NULL AFTER id');
    $addColumnIfMissing($pdo, 'criancas', 'usuario_id', 'usuario_id BIGINT UNSIGNED NULL AFTER id');
    $addColumnIfMissing($pdo, 'atividades', 'usuario_id', 'usuario_id BIGINT UNSIGNED NULL AFTER id');
    try {
        $addColumnIfMissing($pdo, 'pareceres', 'usar_texto_final', 'usar_texto_final TINYINT(1) NOT NULL DEFAULT 0 AFTER texto');
        $addColumnIfMissing($pdo, 'pareceres', 'texto_final', 'texto_final MEDIUMTEXT NULL AFTER usar_texto_final');
    } catch (Throwable $e) {
        // A tabela pode ainda nao existir em uma instalacao nova; a migracao roda novamente nas proximas requisicoes.
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS app_settings (setting_key VARCHAR(80) PRIMARY KEY, setting_value MEDIUMTEXT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("ALTER TABLE app_settings MODIFY setting_value MEDIUMTEXT NULL");
    $pdo->exec("CREATE TABLE IF NOT EXISTS billing_payments (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        usuario_id BIGINT UNSIGNED NOT NULL,
        type ENUM('manual','mercado_pago') NOT NULL DEFAULT 'manual',
        status ENUM('pending','approved','rejected','canceled') NOT NULL DEFAULT 'pending',
        amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        due_date DATE NULL,
        paid_at DATETIME NULL,
        description VARCHAR(220) NULL,
        external_id VARCHAR(120) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_billing_payments_user (usuario_id),
        INDEX idx_billing_payments_dates (due_date, paid_at, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS billing_cycles (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(80) NOT NULL,
        slug VARCHAR(40) NOT NULL UNIQUE,
        month_count INT UNSIGNED NOT NULL DEFAULT 1,
        amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_billing_cycles_active (active, month_count, name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS google_drive_accounts (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        usuario_id BIGINT UNSIGNED NOT NULL UNIQUE,
        email_google VARCHAR(190) NULL,
        access_token MEDIUMTEXT NULL,
        refresh_token MEDIUMTEXT NULL,
        token_expiration DATETIME NULL,
        folder_id VARCHAR(190) NULL,
        folder_name VARCHAR(255) NULL,
        data_conexao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_google_drive_accounts_user (usuario_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS google_drive_uploads (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        usuario_id BIGINT UNSIGNED NOT NULL,
        parecer_id BIGINT UNSIGNED NULL,
        arquivo VARCHAR(255) NOT NULL,
        mime_type VARCHAR(120) NOT NULL,
        file_blob LONGBLOB NULL,
        drive_file_id VARCHAR(190) NULL,
        drive_link TEXT NULL,
        folder_id VARCHAR(190) NULL,
        folder_name VARCHAR(255) NULL,
        status ENUM('queued','uploading','uploaded','error') NOT NULL DEFAULT 'queued',
        error_message TEXT NULL,
        data_upload DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_google_drive_uploads_user (usuario_id),
        INDEX idx_google_drive_uploads_report (parecer_id),
        INDEX idx_google_drive_uploads_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS google_drive_audit_logs (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        usuario_id BIGINT UNSIGNED NULL,
        action VARCHAR(80) NOT NULL,
        details TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_google_drive_audit_user (usuario_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("INSERT INTO billing_cycles (name,slug,month_count,amount,active) VALUES
        ('Mensal','monthly',1,0.00,1),
        ('Trimestral','quarterly',3,0.00,1),
        ('Semestral','semiannual',6,0.00,1),
        ('Anual','annual',12,0.00,1)
        ON DUPLICATE KEY UPDATE name=VALUES(name), month_count=VALUES(month_count)");
    $pdo->exec("UPDATE usuarios u
        JOIN billing_cycles c ON c.slug = CASE WHEN u.billing_cycle='annual' THEN 'annual' ELSE 'monthly' END
        SET u.billing_cycle_id=c.id
        WHERE u.billing_cycle_id IS NULL");
    $pdo->exec("UPDATE usuarios SET perfil='master', ativo=1 WHERE id=(SELECT id FROM (SELECT id FROM usuarios ORDER BY id LIMIT 1) primeiro_usuario)");
    $pdo->exec("UPDATE turmas SET usuario_id=(SELECT id FROM (SELECT id FROM usuarios ORDER BY id LIMIT 1) primeiro_usuario) WHERE usuario_id IS NULL");
    $pdo->exec("UPDATE periodos_avaliativos SET usuario_id=(SELECT id FROM (SELECT id FROM usuarios ORDER BY id LIMIT 1) primeiro_usuario) WHERE usuario_id IS NULL");
    $pdo->exec("UPDATE criancas c JOIN turmas t ON t.id=c.turma_id SET c.usuario_id=t.usuario_id WHERE c.usuario_id IS NULL");
    $pdo->exec("UPDATE criancas SET usuario_id=(SELECT id FROM (SELECT id FROM usuarios ORDER BY id LIMIT 1) primeiro_usuario) WHERE usuario_id IS NULL");
    $pdo->exec("UPDATE atividades a LEFT JOIN turmas t ON t.id=a.turma_id SET a.usuario_id=COALESCE(t.usuario_id,(SELECT id FROM (SELECT id FROM usuarios ORDER BY id LIMIT 1) primeiro_usuario)) WHERE a.usuario_id IS NULL");

    $permissionMap = [
        'children' => 'alunos',
        'classes' => 'turmas',
        'periods' => 'periodos',
        'activities' => 'atividades',
        'reports' => 'pareceres',
        'send-report-email' => 'pareceres',
        'experience-fields' => 'configuracoes',
        'header-settings' => 'configuracoes',
    ];
    $billingSelect = "billing_plan,billing_cycle,billing_cycle_id,billing_amount,billing_payment_method,billing_status,billing_next_due_date,billing_notes,billing_trial_days,mercado_pago_customer_id,mercado_pago_subscription_id,mercado_pago_last_payment_id,(SELECT name FROM billing_cycles bc WHERE bc.id=usuarios.billing_cycle_id LIMIT 1) AS billing_cycle_name,(SELECT month_count FROM billing_cycles bc WHERE bc.id=usuarios.billing_cycle_id LIMIT 1) AS billing_cycle_months";
    $termsVersion = 'lgpd-2026-07-16';
    $currentUser = null;
    $billingDateFrom = static function (?string $value): ?DateTimeImmutable {
        $value = trim((string) $value);
        if ($value === '' || $value === '0000-00-00') return null;
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            try {
                return new DateTimeImmutable($value);
            } catch (Throwable $e) {
                return null;
            }
        }
        if (preg_match('/^(\d{2})\/(\d{2})\/(\d{4})$/', $value, $parts) && checkdate((int) $parts[2], (int) $parts[1], (int) $parts[3])) {
            return new DateTimeImmutable($parts[3] . '-' . $parts[2] . '-' . $parts[1]);
        }
        return null;
    };
    $billingDateValue = static function (?string $value) use ($billingDateFrom): ?string {
        $date = $billingDateFrom($value);
        return $date ? $date->format('Y-m-d') : null;
    };
    $legacyCycleFromMonths = static function (int $months): string {
        return $months >= 12 ? 'annual' : 'monthly';
    };
    $loadBillingCycle = static function (?int $cycleId = null, string $legacyCycle = 'monthly') use ($pdo): array {
        $row = null;
        if ($cycleId && $cycleId > 0) {
            $query = $pdo->prepare('SELECT id,name,slug,month_count,amount,active FROM billing_cycles WHERE id=? LIMIT 1');
            $query->execute([$cycleId]);
            $row = $query->fetch(PDO::FETCH_ASSOC) ?: null;
        }
        if (!$row) {
            $slug = $legacyCycle === 'annual' ? 'annual' : 'monthly';
            $query = $pdo->prepare('SELECT id,name,slug,month_count,amount,active FROM billing_cycles WHERE slug=? LIMIT 1');
            $query->execute([$slug]);
            $row = $query->fetch(PDO::FETCH_ASSOC) ?: null;
        }
        if (!$row) {
            return ['id' => null, 'name' => $legacyCycle === 'annual' ? 'Anual' : 'Mensal', 'slug' => $legacyCycle === 'annual' ? 'annual' : 'monthly', 'months' => $legacyCycle === 'annual' ? 12 : 1, 'amount' => 0.0, 'active' => true];
        }
        return [
            'id' => (int) $row['id'],
            'name' => (string) $row['name'],
            'slug' => (string) $row['slug'],
            'months' => max(1, (int) $row['month_count']),
            'amount' => (float) $row['amount'],
            'active' => (bool) $row['active'],
        ];
    };
    $billingIsCovered = static function (array $row) use ($billingDateFrom): bool {
        if (($row['perfil'] ?? 'cliente') === 'master') return true;
        if ((float) ($row['billing_amount'] ?? 0) <= 0) return true;
        if ((string) ($row['billing_status'] ?? '') === 'exempt') return true;
        $due = $billingDateFrom($row['billing_next_due_date'] ?? null);
        return $due && new DateTimeImmutable('today') <= $due;
    };
    $billingAlertFor = static function (array $row) use ($billingDateFrom, $billingIsCovered): ?array {
        if (($row['perfil'] ?? 'cliente') === 'master') return null;
        if ((float) ($row['billing_amount'] ?? 0) <= 0) return null;
        if ($billingIsCovered($row) && !in_array((string) ($row['billing_status'] ?? ''), ['active', 'trial'], true)) return null;
        if (!in_array((string) ($row['billing_status'] ?? ''), ['active', 'trial', 'pending', 'overdue'], true)) return null;
        $due = $billingDateFrom($row['billing_next_due_date'] ?? null);
        if (!$due) return null;
        $today = new DateTimeImmutable('today');
        $dueLabel = $due->format('d/m/Y');
        if ($today >= $due) {
            $daysLate = $today > $due ? (int) $due->diff($today)->days : 0;
            $lateText = $daysLate === 0 ? 'hoje' : ($daysLate === 1 ? 'ha 1 dia' : 'ha ' . $daysLate . ' dias');
            return [
                'level' => 'danger',
                'status' => $daysLate > 7 ? 'blocked' : 'overdue_grace',
                'message' => "Sua fatura venceu {$lateText} ({$dueLabel}). Regularize para evitar o bloqueio do acesso.",
                'actionRequired' => true,
                'daysLate' => $daysLate,
                'graceLimitDays' => 7,
            ];
        }
        $daysUntil = (int) $today->diff($due)->days;
        if ($daysUntil > 5) return null;
        if ($daysUntil === 1) {
            $message = "Sua fatura vence amanha ({$dueLabel}).";
            $status = 'due_soon';
        } else {
            $message = "Sua fatura vence em {$daysUntil} dias ({$dueLabel}).";
            $status = 'due_soon';
        }
        return [
            'level' => 'warning',
            'status' => $status,
            'message' => $message,
            'actionRequired' => false,
            'daysUntil' => $daysUntil,
        ];
    };
    $billingLockFor = static function (array $row) use ($billingDateFrom, $billingIsCovered): ?array {
        if (($row['perfil'] ?? 'cliente') === 'master') return null;
        if ((float) ($row['billing_amount'] ?? 0) <= 0) return null;
        if ($billingIsCovered($row)) return null;
        $status = (string) ($row['billing_status'] ?? '');
        if (!in_array($status, ['active', 'trial', 'pending', 'overdue'], true)) return null;
        $due = $billingDateFrom($row['billing_next_due_date'] ?? null);
        if (!$due) return null;
        $today = new DateTimeImmutable('today');
        if ($today <= $due) return null;
        $daysLate = (int) $due->diff($today)->days;
        if ($daysLate <= 7) return null;
        return ['locked' => true, 'reason' => 'grace_expired', 'message' => 'O prazo de 7 dias apos o vencimento terminou. Regularize o pagamento para liberar o acesso.', 'daysLate' => $daysLate, 'graceLimitDays' => 7];
    };
    $loadCurrentUser = static function () use ($pdo, $billingSelect, $billingAlertFor, $billingLockFor, $billingDateFrom, &$currentUser): array {
        if ($currentUser !== null) return $currentUser;
        if (empty($_SESSION['user_id'])) {
            http_response_code(401);
            throw new RuntimeException('Faça login para continuar.');
        }
        $query = $pdo->prepare("SELECT id,nome,email,telefone,perfil,permissoes,ativo,image_editor_permission,{$billingSelect},terms_accepted_at,terms_version,terms_ip FROM usuarios WHERE id=? LIMIT 1");
        $query->execute([(int) $_SESSION['user_id']]);
        $row = $query->fetch(PDO::FETCH_ASSOC);
        if (!$row || (int) $row['ativo'] !== 1) {
            session_destroy();
            http_response_code(401);
            throw new RuntimeException('Usuário sem acesso ativo.');
        }
        $permissions = json_decode((string) ($row['permissoes'] ?? '[]'), true);
        $row['permissions'] = is_array($permissions) ? array_values(array_filter($permissions, 'is_string')) : [];
        $billingDue = $billingDateFrom($row['billing_next_due_date'] ?? null);
        if (($row['perfil'] ?? 'cliente') !== 'master' && (float) ($row['billing_amount'] ?? 0) > 0 && in_array((string) ($row['billing_status'] ?? ''), ['active', 'trial'], true) && $billingDue) {
            $today = new DateTimeImmutable('today');
            $due = $billingDue;
            if ($today > $due) {
                $daysLate = (int) $due->diff($today)->days;
                if ($daysLate > 7) {
                    $pdo->prepare("UPDATE usuarios SET billing_status='pending' WHERE id=?")->execute([(int) $row['id']]);
                    $row['billing_status'] = 'pending';
                }
                if ($daysLate === 6) $row['billing_warning'] = 'Seu acesso sera bloqueado amanha se o pagamento nao for realizado.';
            }
        }
        $row['billing_alert'] = $billingAlertFor($row);
        $row['billing_lock'] = $billingLockFor($row);
        $currentUser = $row;
        return $currentUser;
    };
    $publicUser = static function (array $row) use ($termsVersion): array {
        $legacyCycle = (string) ($row['billing_cycle'] ?? 'monthly');
        $cycleLabel = trim((string) ($row['billing_cycle_name'] ?? ''));
        if ($cycleLabel === '') $cycleLabel = $legacyCycle === 'annual' ? 'Anual' : 'Mensal';
        $cycleMonths = max(1, (int) ($row['billing_cycle_months'] ?? ($legacyCycle === 'annual' ? 12 : 1)));
        $acceptedAt = trim((string) ($row['terms_accepted_at'] ?? ''));
        $acceptedVersion = trim((string) ($row['terms_version'] ?? ''));
        return [
            'id' => (int) $row['id'],
            'name' => $row['nome'],
            'email' => $row['email'],
            'phone' => $row['telefone'] ?? null,
            'role' => $row['perfil'] ?? 'cliente',
            'permissions' => $row['permissions'] ?? [],
            'active' => (bool) ($row['ativo'] ?? 1),
            'imageEditorPermission' => $row['image_editor_permission'] ?? 'none',
            'billing' => [
                'plan' => $row['billing_plan'] ?? 'Basico',
                'cycle' => $legacyCycle,
                'cycleId' => isset($row['billing_cycle_id']) ? (int) $row['billing_cycle_id'] : null,
                'cycleLabel' => $cycleLabel,
                'cycleMonths' => $cycleMonths,
                'amount' => (float) ($row['billing_amount'] ?? 0),
                'paymentMethod' => $row['billing_payment_method'] ?? 'both',
                'status' => $row['billing_status'] ?? 'pending',
                'nextDueDate' => $row['billing_next_due_date'] ?? null,
                'notes' => $row['billing_notes'] ?? '',
                'trialDays' => (int) ($row['billing_trial_days'] ?? 0),
            ],
            'billingWarning' => $row['billing_warning'] ?? null,
            'billingAlert' => $row['billing_alert'] ?? null,
            'billingLock' => $row['billing_lock'] ?? null,
            'terms' => [
                'accepted' => $acceptedAt !== '' && $acceptedVersion === $termsVersion,
                'acceptedAt' => $acceptedAt ?: null,
                'version' => $acceptedVersion ?: null,
                'currentVersion' => $termsVersion,
            ],
        ];
    };
    $storeBootstrapUser = static function (array $publicUser): void {
        $_SESSION['bootstrap_user'] = [
            'id' => (int) ($publicUser['id'] ?? 0),
            'name' => (string) ($publicUser['name'] ?? 'Usuario logado'),
            'email' => (string) ($publicUser['email'] ?? ''),
            'phone' => (string) ($publicUser['phone'] ?? ''),
            'role' => (string) ($publicUser['role'] ?? 'cliente'),
            'permissions' => is_array($publicUser['permissions'] ?? null) ? array_values(array_filter($publicUser['permissions'], 'is_string')) : [],
        ];
    };
    $billingRequiresPayment = static function (array $row): bool {
        if (($row['perfil'] ?? 'cliente') === 'master') return false;
        if ((float) ($row['billing_amount'] ?? 0) <= 0) return false;
        if (($row['billing_payment_method'] ?? 'both') === 'manual') return false;
        return in_array((string) ($row['billing_status'] ?? 'pending'), ['pending', 'overdue'], true);
    };
    $normalizeBilling = static function (array $input) use ($billingDateValue, $loadBillingCycle, $legacyCycleFromMonths): array {
        $billing = is_array($input['billing'] ?? null) ? $input['billing'] : [];
        $legacyCycle = in_array(($billing['cycle'] ?? 'monthly'), ['monthly', 'annual'], true) ? (string) $billing['cycle'] : 'monthly';
        $cycleId = isset($billing['cycleId']) ? (int) $billing['cycleId'] : 0;
        $registeredCycle = $loadBillingCycle($cycleId > 0 ? $cycleId : null, $legacyCycle);
        $cycle = $legacyCycleFromMonths((int) $registeredCycle['months']);
        $paymentMethod = in_array(($billing['paymentMethod'] ?? 'both'), ['pix', 'card', 'both', 'manual'], true) ? (string) $billing['paymentMethod'] : 'both';
        $status = in_array(($billing['status'] ?? 'pending'), ['trial', 'pending', 'active', 'overdue', 'canceled', 'exempt'], true) ? (string) $billing['status'] : 'pending';
        $amount = str_replace(',', '.', (string) ($billing['amount'] ?? '0'));
        $cycleAmount = (float) $registeredCycle['amount'];
        $finalAmount = $cycleAmount > 0 ? $cycleAmount : max(0, (float) $amount);
        $nextDueDate = trim((string) ($billing['nextDueDate'] ?? ''));
        $trialDays = max(0, min(365, (int) ($billing['trialDays'] ?? 0)));
        if ($trialDays > 0 && $status === 'trial' && $nextDueDate === '') {
            $nextDueDate = (new DateTimeImmutable('today'))->modify('+' . $trialDays . ' days')->format('Y-m-d');
        }
        return [
            'plan' => trim((string) ($billing['plan'] ?? 'Basico')) ?: 'Basico',
            'cycleId' => $registeredCycle['id'],
            'cycle' => $cycle,
            'amount' => number_format($finalAmount, 2, '.', ''),
            'paymentMethod' => $paymentMethod,
            'status' => $status,
            'nextDueDate' => $billingDateValue($nextDueDate),
            'notes' => trim((string) ($billing['notes'] ?? '')),
            'trialDays' => $trialDays,
        ];
    };
    $getMercadoPagoSettings = static function () use ($pdo, $config): array {
        $mp = is_array($config['mercado_pago'] ?? null) ? $config['mercado_pago'] : [];
        $query = $pdo->prepare("SELECT setting_value FROM app_settings WHERE setting_key='mercado_pago' LIMIT 1");
        $query->execute();
        $saved = json_decode((string) ($query->fetchColumn() ?: ''), true);
        if (is_array($saved)) $mp = array_merge($mp, $saved);
        return [
            'access_token' => trim((string) ($mp['access_token'] ?? '')),
            'public_key' => trim((string) ($mp['public_key'] ?? '')),
            'webhook_secret' => trim((string) ($mp['webhook_secret'] ?? '')),
            'success_url' => trim((string) ($mp['success_url'] ?? '')),
            'failure_url' => trim((string) ($mp['failure_url'] ?? '')),
        ];
    };
    $maskSecret = static function (string $value): string {
        if ($value === '') return '';
        $start = substr($value, 0, 6);
        $end = strlen($value) > 10 ? substr($value, -4) : '';
        return $start . str_repeat('*', 8) . $end;
    };
    $cryptoKey = hash('sha256', __DIR__ . '|' . ($config['database'] ?? '') . '|' . ($config['username'] ?? '') . '|' . ($config['password'] ?? ''), true);
    $encryptSecret = static function (string $value) use ($cryptoKey): string {
        if ($value === '') return '';
        if (!function_exists('openssl_encrypt')) return base64_encode($value);
        $iv = random_bytes(16);
        $cipher = openssl_encrypt($value, 'AES-256-CBC', $cryptoKey, OPENSSL_RAW_DATA, $iv);
        return $cipher === false ? '' : 'v1:' . base64_encode($iv . $cipher);
    };
    $decryptSecret = static function (?string $value) use ($cryptoKey): string {
        $value = (string) $value;
        if ($value === '') return '';
        if (!str_starts_with($value, 'v1:')) return base64_decode($value, true) ?: $value;
        if (!function_exists('openssl_decrypt')) return '';
        $raw = base64_decode(substr($value, 3), true);
        if ($raw === false || strlen($raw) <= 16) return '';
        $iv = substr($raw, 0, 16);
        $cipher = substr($raw, 16);
        $plain = openssl_decrypt($cipher, 'AES-256-CBC', $cryptoKey, OPENSSL_RAW_DATA, $iv);
        return is_string($plain) ? $plain : '';
    };
    $googleDriveDefaults = [
        'enabled' => false,
        'required' => false,
        'client_id' => '',
        'client_secret' => '',
        'folder_template' => "AiProf\n{Escola}\n{Ano}\n{Turma}\n{Aluno}",
        'filename_template' => '{Tipo} - {Aluno} - {Turma} - {Mes} {Ano}',
    ];
    $getGoogleDriveSettings = static function () use ($pdo, $googleDriveDefaults): array {
        $query = $pdo->prepare("SELECT setting_value FROM app_settings WHERE setting_key='google_drive' LIMIT 1");
        $query->execute();
        $saved = json_decode((string) ($query->fetchColumn() ?: '{}'), true);
        return array_merge($googleDriveDefaults, is_array($saved) ? $saved : []);
    };
    $publicGoogleDriveSettings = static function (array $settings): array {
        return [
            'enabled' => !empty($settings['enabled']),
            'required' => !empty($settings['required']),
            'configured' => trim((string) ($settings['client_id'] ?? '')) !== '' && trim((string) ($settings['client_secret'] ?? '')) !== '',
            'clientIdMasked' => trim((string) ($settings['client_id'] ?? '')) !== '' ? substr((string) $settings['client_id'], 0, 12) . '...' : '',
            'folderTemplate' => (string) ($settings['folder_template'] ?? ''),
            'filenameTemplate' => (string) ($settings['filename_template'] ?? ''),
            'scope' => 'https://www.googleapis.com/auth/drive.file',
        ];
    };
    $googleDriveAudit = static function (?int $userId, string $action, string $details = '') use ($pdo): void {
        $stmt = $pdo->prepare('INSERT INTO google_drive_audit_logs (usuario_id,action,details) VALUES (?,?,?)');
        $stmt->execute([$userId ?: null, $action, mb_substr($details, 0, 2000, 'UTF-8')]);
    };
    $currentApiUrl = static function (string $resource, array $params = []): string {
        $host = trim((string) ($_SERVER['HTTP_HOST'] ?? ''));
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        $basePath = rtrim(str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/'))), '/');
        $query = http_build_query(array_merge(['resource' => $resource], $params));
        return ($https ? 'https://' : 'http://') . $host . ($basePath === '' ? '' : $basePath) . '/api.php?' . $query;
    };
    $googleTokenRequest = static function (array $payload): array {
        if (!function_exists('curl_init')) throw new RuntimeException('Extensao cURL do PHP nao habilitada.');
        $ch = curl_init('https://oauth2.googleapis.com/token');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query($payload),
            CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_TIMEOUT => 25,
        ]);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        $data = json_decode((string) $body, true);
        if ($status < 200 || $status >= 300 || !is_array($data)) throw new RuntimeException($error ?: (string) ($data['error_description'] ?? $data['error'] ?? 'Falha na autenticacao Google.'));
        return $data;
    };
    $googleApiRequest = static function (string $url, string $accessToken, string $method = 'GET', $body = null, array $headers = []): array {
        if (!function_exists('curl_init')) throw new RuntimeException('Extensao cURL do PHP nao habilitada.');
        $headers[] = 'Authorization: Bearer ' . $accessToken;
        $ch = curl_init($url);
        $options = [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $headers, CURLOPT_TIMEOUT => 45];
        if ($body !== null) $options[CURLOPT_POSTFIELDS] = $body;
        curl_setopt_array($ch, $options);
        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        $data = json_decode((string) $response, true);
        if ($status < 200 || $status >= 300) throw new RuntimeException($error ?: (string) ($data['error']['message'] ?? 'Falha na comunicacao com Google Drive.'));
        return is_array($data) ? $data : [];
    };
    $loadGoogleDriveAccount = static function (int $userId) use ($pdo, $decryptSecret, $encryptSecret, $getGoogleDriveSettings, $googleTokenRequest): ?array {
        $query = $pdo->prepare('SELECT * FROM google_drive_accounts WHERE usuario_id=? LIMIT 1');
        $query->execute([$userId]);
        $account = $query->fetch(PDO::FETCH_ASSOC) ?: null;
        if (!$account) return null;
        $accessToken = $decryptSecret($account['access_token'] ?? '');
        $refreshToken = $decryptSecret($account['refresh_token'] ?? '');
        $expiration = strtotime((string) ($account['token_expiration'] ?? '')) ?: 0;
        if ($refreshToken !== '' && ($accessToken === '' || $expiration < time() + 120)) {
            $settings = $getGoogleDriveSettings();
            $token = $googleTokenRequest([
                'client_id' => $settings['client_id'],
                'client_secret' => $settings['client_secret'],
                'refresh_token' => $refreshToken,
                'grant_type' => 'refresh_token',
            ]);
            $accessToken = (string) ($token['access_token'] ?? '');
            $expires = (new DateTimeImmutable())->modify('+' . max(300, (int) ($token['expires_in'] ?? 3600)) . ' seconds')->format('Y-m-d H:i:s');
            $pdo->prepare('UPDATE google_drive_accounts SET access_token=?,token_expiration=? WHERE usuario_id=?')->execute([$encryptSecret($accessToken), $expires, $userId]);
            $account['token_expiration'] = $expires;
        }
        $account['access_token_plain'] = $accessToken;
        $account['refresh_token_plain'] = $refreshToken;
        return $account;
    };
    $driveEscape = static fn(string $value): string => str_replace(["\\", "'"], ["\\\\", "\\'"], $value);
    $driveFindFolder = static function (string $accessToken, string $name, ?string $parentId = null) use ($googleApiRequest, $driveEscape): ?array {
        $q = "mimeType='application/vnd.google-apps.folder' and trashed=false and name='" . $driveEscape($name) . "'";
        if ($parentId) $q .= " and '" . $driveEscape($parentId) . "' in parents";
        $url = 'https://www.googleapis.com/drive/v3/files?' . http_build_query(['q' => $q, 'fields' => 'files(id,name,webViewLink)', 'pageSize' => 1]);
        $result = $googleApiRequest($url, $accessToken);
        return $result['files'][0] ?? null;
    };
    $driveCreateFolder = static function (string $accessToken, string $name, ?string $parentId = null) use ($googleApiRequest): array {
        $metadata = ['name' => $name, 'mimeType' => 'application/vnd.google-apps.folder'];
        if ($parentId) $metadata['parents'] = [$parentId];
        return $googleApiRequest('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', $accessToken, 'POST', json_encode($metadata, JSON_UNESCAPED_UNICODE), ['Content-Type: application/json']);
    };
    $replaceDriveTokens = static function (string $template, array $context): string {
        $months = ['01' => 'Janeiro', '02' => 'Fevereiro', '03' => 'Marco', '04' => 'Abril', '05' => 'Maio', '06' => 'Junho', '07' => 'Julho', '08' => 'Agosto', '09' => 'Setembro', '10' => 'Outubro', '11' => 'Novembro', '12' => 'Dezembro'];
        $now = new DateTimeImmutable();
        $values = [
            '{Aluno}' => $context['student'] ?? '',
            '{Turma}' => $context['class'] ?? '',
            '{Professor}' => $context['teacher'] ?? '',
            '{Escola}' => $context['school'] ?? '',
            '{Ano}' => $context['year'] ?? $now->format('Y'),
            '{Mes}' => $months[$now->format('m')] ?? $now->format('m'),
            '{Mês}' => $months[$now->format('m')] ?? $now->format('m'),
            '{Data}' => $now->format('d-m-Y'),
            '{Tipo}' => $context['type'] ?? 'Parecer',
        ];
        return trim(strtr($template, $values));
    };
    $sanitizeDriveName = static function (string $value, string $fallback = 'Documento'): string {
        $value = trim(preg_replace('/[\\\\\\/:*?"<>|]+/u', '-', $value) ?: '');
        $value = preg_replace('/\s+/u', ' ', $value) ?: '';
        return mb_substr($value !== '' ? $value : $fallback, 0, 180, 'UTF-8');
    };
    $ensureDriveFolder = static function (int $userId, array $context = []) use ($pdo, $getGoogleDriveSettings, $loadGoogleDriveAccount, $replaceDriveTokens, $sanitizeDriveName, $driveFindFolder, $driveCreateFolder): array {
        $account = $loadGoogleDriveAccount($userId);
        if (!$account || empty($account['access_token_plain'])) throw new RuntimeException('Conecte sua conta Google Drive antes de enviar arquivos.');
        if (!empty($account['folder_id'])) return ['id' => $account['folder_id'], 'name' => $account['folder_name'] ?: 'Google Drive', 'account' => $account];
        $settings = $getGoogleDriveSettings();
        $parts = preg_split('/\R+|\/+/u', (string) ($settings['folder_template'] ?? 'AiProf')) ?: [];
        $parentId = null;
        $folder = null;
        foreach ($parts as $part) {
            $name = $sanitizeDriveName($replaceDriveTokens($part, $context), 'AiProf');
            if ($name === '') continue;
            $folder = $driveFindFolder($account['access_token_plain'], $name, $parentId) ?: $driveCreateFolder($account['access_token_plain'], $name, $parentId);
            $parentId = $folder['id'] ?? $parentId;
        }
        if (!$folder || empty($folder['id'])) throw new RuntimeException('Nao foi possivel criar a pasta no Google Drive.');
        $pdo->prepare('UPDATE google_drive_accounts SET folder_id=?,folder_name=? WHERE usuario_id=?')->execute([$folder['id'], $folder['name'] ?? 'AiProf', $userId]);
        return ['id' => $folder['id'], 'name' => $folder['name'] ?? 'AiProf', 'account' => $account];
    };
    $uploadBinaryToDrive = static function (string $accessToken, string $fileName, string $mimeType, string $binary, string $folderId) use ($googleApiRequest): array {
        $boundary = 'aiprof_' . bin2hex(random_bytes(12));
        $metadata = ['name' => $fileName, 'parents' => [$folderId]];
        $body = "--{$boundary}\r\n";
        $body .= "Content-Type: application/json; charset=UTF-8\r\n\r\n";
        $body .= json_encode($metadata, JSON_UNESCAPED_UNICODE) . "\r\n";
        $body .= "--{$boundary}\r\n";
        $body .= "Content-Type: {$mimeType}\r\n\r\n";
        $body .= $binary . "\r\n";
        $body .= "--{$boundary}--";
        return $googleApiRequest(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
            $accessToken,
            'POST',
            $body,
            ['Content-Type: multipart/related; boundary=' . $boundary]
        );
    };
    $mercadoPagoConfigured = static function () use ($getMercadoPagoSettings): bool {
        $mp = $getMercadoPagoSettings();
        return $mp['access_token'] !== '' && $mp['public_key'] !== '';
    };
    $currentPublicUrl = static function (string $resource): string {
        $host = trim((string) ($_SERVER['HTTP_HOST'] ?? ''));
        if ($host === '' || in_array(strtolower($host), ['localhost', '127.0.0.1'], true)) return '';
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        $basePath = rtrim(str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/'))), '/');
        return ($https ? 'https://' : 'http://') . $host . ($basePath === '' ? '' : $basePath) . '/api.php?resource=' . rawurlencode($resource);
    };
    $paymentMethodsAvailable = static function (array $billing): array {
        $method = $billing['paymentMethod'] ?? 'both';
        if ($method === 'pix') return ['pix'];
        if ($method === 'card') return ['card'];
        if ($method === 'manual') return ['pix', 'card'];
        return ['pix', 'card'];
    };
    $activeBillingCycles = static function () use ($pdo): array {
        $rows = $pdo->query('SELECT id,name,slug,month_count,amount,active FROM billing_cycles WHERE active=1 ORDER BY month_count, name')->fetchAll(PDO::FETCH_ASSOC);
        return array_map(static fn(array $row): array => [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'slug' => $row['slug'],
            'months' => max(1, (int) $row['month_count']),
            'amount' => (float) $row['amount'],
        ], $rows);
    };
    $applyBillingChoice = static function (array $row, array $input) use ($pdo, $loadBillingCycle, $legacyCycleFromMonths, $billingSelect): array {
        $cycleId = (int) ($input['cycleId'] ?? 0);
        $plan = trim((string) ($input['plan'] ?? ''));
        $updates = [];
        $params = [];
        if ($plan !== '') {
            $updates[] = 'billing_plan=?';
            $params[] = mb_substr($plan, 0, 80, 'UTF-8');
        }
        if ($cycleId > 0) {
            $cycle = $loadBillingCycle($cycleId);
            if (empty($cycle['active'])) throw new RuntimeException('Periodo de cobranca indisponivel.');
            $updates[] = 'billing_cycle=?';
            $params[] = $legacyCycleFromMonths((int) $cycle['months']);
            $updates[] = 'billing_cycle_id=?';
            $params[] = $cycle['id'];
            $updates[] = 'billing_amount=?';
            $params[] = number_format((float) $cycle['amount'], 2, '.', '');
        }
        if (!empty($updates)) {
            if (in_array((string) ($row['billing_status'] ?? 'pending'), ['trial', 'overdue', 'pending'], true)) {
                $updates[] = "billing_status='pending'";
            }
            $params[] = (int) $row['id'];
            $pdo->prepare('UPDATE usuarios SET ' . implode(',', $updates) . ' WHERE id=?')->execute($params);
            $query = $pdo->prepare("SELECT id,nome,email,telefone,perfil,permissoes,ativo,image_editor_permission,{$billingSelect},terms_accepted_at,terms_version,terms_ip FROM usuarios WHERE id=? LIMIT 1");
            $query->execute([(int) $row['id']]);
            $row = $query->fetch(PDO::FETCH_ASSOC) ?: $row;
            $permissions = json_decode((string) ($row['permissoes'] ?? '[]'), true);
            $row['permissions'] = is_array($permissions) ? $permissions : [];
        }
        return $row;
    };
    $mercadoPagoErrorMessage = static function (array $data): string {
        $message = (string) ($data['message'] ?? $data['error'] ?? 'Mercado Pago recusou a solicitacao.');
        if (stripos($message, 'Unauthorized use of live credentials') !== false) {
            return 'O Mercado Pago recusou o Access Token de producao para gerar esta cobranca. Para testar localmente, salve as credenciais de teste do Mercado Pago (Access Token TEST- e Public Key TEST-). Para cobrar de verdade, use credenciais de producao habilitadas em uma conta Mercado Pago ativa.';
        }
        return $message;
    };
    $mercadoPagoRequest = static function (string $endpoint, array $payload = [], string $idempotencyKey = '', string $method = 'POST') use ($getMercadoPagoSettings, $mercadoPagoErrorMessage): array {
        $mp = $getMercadoPagoSettings();
        if ($mp['access_token'] === '') throw new RuntimeException('Access Token do Mercado Pago nao configurado.');
        if (!function_exists('curl_init')) throw new RuntimeException('Extensao cURL do PHP nao habilitada para conectar ao Mercado Pago.');
        $headers = [
            'Authorization: Bearer ' . $mp['access_token'],
            'Content-Type: application/json',
        ];
        if ($idempotencyKey !== '') $headers[] = 'X-Idempotency-Key: ' . $idempotencyKey;
        $ch = curl_init('https://api.mercadopago.com' . $endpoint);
        $options = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 25,
        ];
        if ($method === 'GET') {
            $options[CURLOPT_HTTPGET] = true;
        } else {
            $options[CURLOPT_POST] = true;
            $options[CURLOPT_POSTFIELDS] = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
        curl_setopt_array($ch, $options);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);
        if ($raw === false || $curlError !== '') throw new RuntimeException('Falha ao conectar no Mercado Pago: ' . $curlError);
        $data = json_decode((string) $raw, true);
        if (!is_array($data)) throw new RuntimeException('Resposta invalida do Mercado Pago.');
        if ($status < 200 || $status >= 300) {
            throw new RuntimeException($mercadoPagoErrorMessage($data));
        }
        return $data;
    };
    $billingCycleFrequency = static function (array $billing): int {
        return max(1, (int) ($billing['cycleMonths'] ?? (($billing['cycle'] ?? 'monthly') === 'annual' ? 12 : 1)));
    };
    $billingCycleType = static function (): string {
        return 'months';
    };
    $nextBillingDate = static function ($cycleOrMonths, ?string $currentDueDate = null): string {
        $months = is_numeric($cycleOrMonths) ? max(1, (int) $cycleOrMonths) : (((string) $cycleOrMonths) === 'annual' ? 12 : 1);
        $today = new DateTimeImmutable('today');
        $base = $today;
        if ($currentDueDate && preg_match('/^\d{4}-\d{2}-\d{2}$/', $currentDueDate)) {
            $currentDue = new DateTimeImmutable($currentDueDate);
            if ($currentDue > $today) $base = $currentDue;
        }
        return $base->modify('+' . $months . ' months')->format('Y-m-d');
    };
    $mercadoPagoPaidDate = static function (array $payload): ?string {
        foreach (['date_approved', 'money_release_date', 'last_modified', 'date_created'] as $key) {
            $value = trim((string) ($payload[$key] ?? ''));
            if ($value === '') continue;
            try {
                return (new DateTimeImmutable($value))->format('Y-m-d');
            } catch (Throwable $e) {
                continue;
            }
        }
        return null;
    };
    $mercadoPagoNextDueDate = static function (array $payload): ?string {
        foreach (['next_payment_date', 'next_payment', 'date_of_next_payment'] as $key) {
            $value = trim((string) ($payload[$key] ?? ''));
            if ($value === '') continue;
            try {
                return (new DateTimeImmutable($value))->format('Y-m-d');
            } catch (Throwable $e) {
                continue;
            }
        }
        return null;
    };
    $validBackUrl = static function (string $url): string {
        $url = trim($url);
        if ($url === '' || !filter_var($url, FILTER_VALIDATE_URL)) return '';
        $parts = parse_url($url);
        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        if (!in_array($scheme, ['http', 'https'], true)) return '';
        $host = strtolower((string) ($parts['host'] ?? ''));
        if ($host === '' || in_array($host, ['localhost', '127.0.0.1', '::1'], true)) return '';
        return $url;
    };
    $auditBillingAccess = static function (array $row) use ($pdo, $billingAlertFor, $billingLockFor, $billingDateFrom): array {
        if (($row['perfil'] ?? 'cliente') === 'master') return $row;
        if ((float) ($row['billing_amount'] ?? 0) <= 0) return $row;
        if (!in_array((string) ($row['billing_status'] ?? ''), ['active', 'trial'], true)) {
            $row['billing_alert'] = $billingAlertFor($row);
            $row['billing_lock'] = $billingLockFor($row);
            return $row;
        }
        $due = $billingDateFrom($row['billing_next_due_date'] ?? null);
        if (!$due) {
            $row['billing_alert'] = $billingAlertFor($row);
            $row['billing_lock'] = $billingLockFor($row);
            return $row;
        }
        $today = new DateTimeImmutable('today');
        if ($today <= $due) {
            $row['billing_alert'] = $billingAlertFor($row);
            $row['billing_lock'] = $billingLockFor($row);
            return $row;
        }
        $daysLate = (int) $due->diff($today)->days;
        if ($daysLate > 7) {
            $pdo->prepare("UPDATE usuarios SET billing_status='pending' WHERE id=?")->execute([(int) $row['id']]);
            $row['billing_status'] = 'pending';
            $row['billing_alert'] = $billingAlertFor($row);
            $row['billing_lock'] = $billingLockFor($row);
            return $row;
        }
        if ($daysLate === 6) {
            $row['billing_warning'] = 'Seu acesso sera bloqueado amanha se o pagamento nao for realizado.';
        }
        $row['billing_alert'] = $billingAlertFor($row);
        $row['billing_lock'] = $billingLockFor($row);
        return $row;
    };
    $createMercadoPagoPayment = static function (array $row, string $method) use ($publicUser, $mercadoPagoRequest, $billingCycleFrequency, $billingCycleType, $getMercadoPagoSettings, $validBackUrl, $currentPublicUrl, $pdo): array {
        $billing = $publicUser($row)['billing'];
        $amount = round((float) ($billing['amount'] ?? 0), 2);
        if ($amount <= 0) throw new RuntimeException('Valor do plano invalido.');
        $description = ($billing['plan'] ?? 'Plano Ai Prof') . ' - ' . strtolower((string) ($billing['cycleLabel'] ?? (($billing['cycle'] ?? 'monthly') === 'annual' ? 'anual' : 'mensal')));
        $notificationUrl = $currentPublicUrl('mercado-pago-webhook');
        if ($method === 'pix') {
            $payload = [
                'transaction_amount' => $amount,
                'description' => $description,
                'payment_method_id' => 'pix',
                'payer' => [
                    'email' => $row['email'],
                    'first_name' => explode(' ', trim((string) $row['nome']))[0] ?? $row['nome'],
                ],
                'external_reference' => 'usuario-' . (int) $row['id'],
            ];
            if ($notificationUrl !== '') $payload['notification_url'] = $notificationUrl;
            $payment = $mercadoPagoRequest('/v1/payments', $payload, 'pix-user-' . (int) $row['id'] . '-' . time());
            $pdo->prepare('UPDATE usuarios SET mercado_pago_last_payment_id=? WHERE id=?')->execute([(string) ($payment['id'] ?? ''), (int) $row['id']]);
            return [
                'ok' => true,
                'method' => 'pix',
                'paymentId' => $payment['id'] ?? null,
                'status' => $payment['status'] ?? null,
                'qrCode' => $payment['point_of_interaction']['transaction_data']['qr_code'] ?? '',
                'qrCodeBase64' => $payment['point_of_interaction']['transaction_data']['qr_code_base64'] ?? '',
                'message' => 'Pix gerado com sucesso.',
            ];
        }
        $mpSettings = $getMercadoPagoSettings();
        $payload = [
            'reason' => $description,
            'payer_email' => $row['email'],
            'external_reference' => 'usuario-' . (int) $row['id'],
            'auto_recurring' => [
                'frequency' => $billingCycleFrequency($billing),
                'frequency_type' => $billingCycleType(),
                'transaction_amount' => $amount,
                'currency_id' => 'BRL',
            ],
            'status' => 'pending',
        ];
        if ($notificationUrl !== '') $payload['notification_url'] = $notificationUrl;
        $backUrl = $validBackUrl((string) ($mpSettings['success_url'] ?? ''));
        $payload['back_url'] = $backUrl !== '' ? $backUrl : 'https://www.mercadopago.com.br';
        $subscription = $mercadoPagoRequest('/preapproval', $payload);
        $pdo->prepare('UPDATE usuarios SET mercado_pago_subscription_id=? WHERE id=?')->execute([(string) ($subscription['id'] ?? ''), (int) $row['id']]);
        return [
            'ok' => true,
            'method' => 'card',
            'subscriptionId' => $subscription['id'] ?? null,
            'initPoint' => $subscription['init_point'] ?? '',
            'sandboxInitPoint' => $subscription['sandbox_init_point'] ?? '',
            'message' => 'Link para cadastrar cartao gerado com sucesso.',
        ];
    };
    $activatePaidUser = static function (int $userId, string $paymentId = '', string $subscriptionId = '', ?string $paidDate = null, ?string $remoteNextDueDate = null) use ($pdo, $nextBillingDate): array {
        $query = $pdo->prepare("SELECT id,nome,email,telefone,perfil,permissoes,ativo,image_editor_permission,billing_plan,billing_cycle,billing_cycle_id,billing_amount,billing_next_due_date,(SELECT month_count FROM billing_cycles bc WHERE bc.id=usuarios.billing_cycle_id LIMIT 1) AS billing_cycle_months FROM usuarios WHERE id=? LIMIT 1");
        $query->execute([$userId]);
        $row = $query->fetch(PDO::FETCH_ASSOC);
        if (!$row) throw new RuntimeException('Usuario da cobranca nao encontrado.');
        $previousDue = $row['billing_next_due_date'] ?? null;
        $cycleMonths = max(1, (int) ($row['billing_cycle_months'] ?? (($row['billing_cycle'] ?? 'monthly') === 'annual' ? 12 : 1)));
        $nextDue = $remoteNextDueDate ?: $nextBillingDate($cycleMonths, $row['billing_next_due_date'] ?? ($paidDate ?: null));
        $update = $pdo->prepare("UPDATE usuarios SET ativo=1,billing_status='active',billing_next_due_date=?,mercado_pago_last_payment_id=COALESCE(NULLIF(?,''),mercado_pago_last_payment_id),mercado_pago_subscription_id=COALESCE(NULLIF(?,''),mercado_pago_subscription_id) WHERE id=?");
        $update->execute([$nextDue, $paymentId, $subscriptionId, $userId]);
        $externalId = $paymentId ?: $subscriptionId;
        $exists = 0;
        if ($externalId !== '') {
            $check = $pdo->prepare("SELECT id FROM billing_payments WHERE usuario_id=? AND external_id=? AND status='approved' LIMIT 1");
            $check->execute([$userId, $externalId]);
            $exists = (int) $check->fetchColumn();
        }
        if ($exists <= 0) {
            $insertPayment = $pdo->prepare("INSERT INTO billing_payments (usuario_id,type,status,amount,due_date,paid_at,description,external_id) VALUES (?,?,?,?,?,NOW(),?,?)");
            $insertPayment->execute([$userId, 'mercado_pago', 'approved', (float) ($row['billing_amount'] ?? 0), $previousDue ?: date('Y-m-d'), (string) ($row['billing_plan'] ?? 'Plano Ai Prof'), $externalId]);
        }
        return ['ok' => true, 'status' => 'active', 'nextDueDate' => $nextDue, 'message' => 'Pagamento confirmado. Acesso liberado.'];
    };
    $confirmMercadoPagoReturn = static function (array $input) use ($mercadoPagoRequest, $activatePaidUser, $mercadoPagoPaidDate, $mercadoPagoNextDueDate, $pdo): array {
        $paymentId = trim((string) ($input['payment_id'] ?? $input['collection_id'] ?? $input['id'] ?? ''));
        $preapprovalId = trim((string) ($input['preapproval_id'] ?? ''));
        if ($paymentId !== '') {
            $payment = $mercadoPagoRequest('/v1/payments/' . rawurlencode($paymentId), [], '', 'GET');
            $status = (string) ($payment['status'] ?? '');
            if (!in_array($status, ['approved', 'accredited'], true)) throw new RuntimeException('Pagamento ainda nao aprovado pelo Mercado Pago.');
            $reference = (string) ($payment['external_reference'] ?? '');
            $userId = preg_match('/usuario-(\d+)/', $reference, $match) ? (int) $match[1] : 0;
            if ($userId <= 0) {
                $find = $pdo->prepare('SELECT id FROM usuarios WHERE mercado_pago_last_payment_id=? LIMIT 1');
                $find->execute([$paymentId]);
                $userId = (int) $find->fetchColumn();
            }
            if ($userId <= 0) throw new RuntimeException('Usuario do pagamento nao localizado.');
            return $activatePaidUser($userId, $paymentId, '', $mercadoPagoPaidDate($payment), $mercadoPagoNextDueDate($payment));
        }
        if ($preapprovalId !== '') {
            $subscription = $mercadoPagoRequest('/preapproval/' . rawurlencode($preapprovalId), [], '', 'GET');
            $status = (string) ($subscription['status'] ?? '');
            if (!in_array($status, ['authorized', 'active'], true)) throw new RuntimeException('Assinatura ainda nao autorizada pelo Mercado Pago.');
            $reference = (string) ($subscription['external_reference'] ?? '');
            $userId = preg_match('/usuario-(\d+)/', $reference, $match) ? (int) $match[1] : 0;
            if ($userId <= 0) {
                $find = $pdo->prepare('SELECT id FROM usuarios WHERE mercado_pago_subscription_id=? LIMIT 1');
                $find->execute([$preapprovalId]);
                $userId = (int) $find->fetchColumn();
            }
            if ($userId <= 0) throw new RuntimeException('Usuario da assinatura nao localizado.');
            return $activatePaidUser($userId, '', $preapprovalId, $mercadoPagoPaidDate($subscription), $mercadoPagoNextDueDate($subscription));
        }
        throw new RuntimeException('Retorno do Mercado Pago sem identificador de pagamento.');
    };
    $extractMercadoPagoDataId = static function (array $input, array $body): string {
        $candidates = [
            $input['data_id'] ?? null,
            $input['data.id'] ?? null,
            $input['id'] ?? null,
            $body['data']['id'] ?? null,
            $body['id'] ?? null,
        ];
        foreach ($candidates as $candidate) {
            $value = trim((string) $candidate);
            if ($value !== '') return $value;
        }
        return '';
    };
    $validateMercadoPagoWebhookSignature = static function (string $dataId) use ($getMercadoPagoSettings): void {
        $settings = $getMercadoPagoSettings();
        $secret = (string) ($settings['webhook_secret'] ?? '');
        if ($secret === '') return;
        $signatureHeader = (string) ($_SERVER['HTTP_X_SIGNATURE'] ?? '');
        $requestId = (string) ($_SERVER['HTTP_X_REQUEST_ID'] ?? '');
        if ($signatureHeader === '' || $requestId === '' || $dataId === '') {
            http_response_code(401);
            throw new RuntimeException('Webhook Mercado Pago sem assinatura valida.');
        }
        $parts = [];
        foreach (explode(',', $signatureHeader) as $piece) {
            [$key, $value] = array_pad(explode('=', trim($piece), 2), 2, '');
            if ($key !== '') $parts[$key] = $value;
        }
        $ts = (string) ($parts['ts'] ?? '');
        $v1 = (string) ($parts['v1'] ?? '');
        if ($ts === '' || $v1 === '') {
            http_response_code(401);
            throw new RuntimeException('Assinatura Mercado Pago incompleta.');
        }
        $manifest = 'id:' . $dataId . ';request-id:' . $requestId . ';ts:' . $ts . ';';
        $expected = hash_hmac('sha256', $manifest, $secret);
        if (!hash_equals($expected, $v1)) {
            http_response_code(401);
            throw new RuntimeException('Assinatura Mercado Pago invalida.');
        }
    };
    $resolveMercadoPagoUserId = static function (array $payload, string $externalId = '', string $subscriptionId = '') use ($pdo): int {
        $reference = (string) ($payload['external_reference'] ?? $payload['externalReference'] ?? '');
        if ($reference !== '' && preg_match('/usuario-(\d+)/', $reference, $match)) return (int) $match[1];
        if ($externalId !== '') {
            $find = $pdo->prepare('SELECT id FROM usuarios WHERE mercado_pago_last_payment_id=? LIMIT 1');
            $find->execute([$externalId]);
            $userId = (int) $find->fetchColumn();
            if ($userId > 0) return $userId;
        }
        $subscription = $subscriptionId ?: (string) ($payload['preapproval_id'] ?? $payload['preapprovalId'] ?? $payload['subscription_id'] ?? '');
        if ($subscription !== '') {
            $find = $pdo->prepare('SELECT id FROM usuarios WHERE mercado_pago_subscription_id=? LIMIT 1');
            $find->execute([$subscription]);
            $userId = (int) $find->fetchColumn();
            if ($userId > 0) return $userId;
        }
        return 0;
    };
    $handleMercadoPagoWebhook = static function (array $input, array $body) use ($mercadoPagoRequest, $activatePaidUser, $mercadoPagoPaidDate, $mercadoPagoNextDueDate, $extractMercadoPagoDataId, $validateMercadoPagoWebhookSignature, $resolveMercadoPagoUserId): array {
        $dataId = $extractMercadoPagoDataId($input, $body);
        $validateMercadoPagoWebhookSignature($dataId);
        $topic = (string) ($input['topic'] ?? $input['type'] ?? $body['topic'] ?? $body['type'] ?? '');
        if ($topic === '' && !empty($body['action'])) $topic = strtok((string) $body['action'], '.');
        if ($dataId === '') return ['ok' => true, 'ignored' => true, 'reason' => 'missing-data-id'];

        if (in_array($topic, ['payment', 'payments'], true)) {
            $payment = $mercadoPagoRequest('/v1/payments/' . rawurlencode($dataId), [], '', 'GET');
            $status = (string) ($payment['status'] ?? '');
            if (!in_array($status, ['approved', 'accredited'], true)) return ['ok' => true, 'status' => $status];
            $userId = $resolveMercadoPagoUserId($payment, $dataId, '');
            if ($userId <= 0) return ['ok' => true, 'ignored' => true, 'reason' => 'user-not-found'];
            return $activatePaidUser($userId, $dataId, '', $mercadoPagoPaidDate($payment), $mercadoPagoNextDueDate($payment));
        }

        if ($topic === 'subscription_preapproval') {
            $subscription = $mercadoPagoRequest('/preapproval/' . rawurlencode($dataId), [], '', 'GET');
            $status = (string) ($subscription['status'] ?? '');
            if (!in_array($status, ['authorized', 'active'], true)) return ['ok' => true, 'status' => $status];
            $userId = $resolveMercadoPagoUserId($subscription, '', $dataId);
            if ($userId <= 0) return ['ok' => true, 'ignored' => true, 'reason' => 'user-not-found'];
            return $activatePaidUser($userId, '', $dataId, $mercadoPagoPaidDate($subscription), $mercadoPagoNextDueDate($subscription));
        }

        if ($topic === 'subscription_authorized_payment') {
            $authorized = $mercadoPagoRequest('/authorized_payments/' . rawurlencode($dataId), [], '', 'GET');
            $status = (string) ($authorized['status'] ?? '');
            if (!in_array($status, ['approved', 'accredited', 'processed'], true)) return ['ok' => true, 'status' => $status];
            $subscriptionId = (string) ($authorized['preapproval_id'] ?? $authorized['preapprovalId'] ?? '');
            $userId = $resolveMercadoPagoUserId($authorized, $dataId, $subscriptionId);
            if ($userId <= 0 && $subscriptionId !== '') {
                $subscription = $mercadoPagoRequest('/preapproval/' . rawurlencode($subscriptionId), [], '', 'GET');
                $userId = $resolveMercadoPagoUserId($subscription, '', $subscriptionId);
            }
            if ($userId <= 0) return ['ok' => true, 'ignored' => true, 'reason' => 'user-not-found'];
            return $activatePaidUser($userId, $dataId, $subscriptionId, $mercadoPagoPaidDate($authorized), $mercadoPagoNextDueDate($authorized));
        }

        return ['ok' => true, 'ignored' => true, 'topic' => $topic ?: 'unknown'];
    };
    $canUseEditor = static function (string $requested, array $user): bool {
        if ($requested === '' || $requested === 'none') return true;
        $permission = $user['image_editor_permission'] ?? 'none';
        if ($requested === 'manual' && in_array($permission, ['manual', 'ai', 'both'], true)) return true;
        return $permission === 'both' || $permission === $requested;
    };
    $requireMaster = static function () use ($loadCurrentUser): array {
        $user = $loadCurrentUser();
        if (($user['perfil'] ?? 'cliente') !== 'master') {
            http_response_code(403);
            throw new RuntimeException('Acesso restrito ao login master.');
        }
        return $user;
    };
    $clientSetupStatus = static function (array $user) use ($pdo): array {
        $ownerId = (int) ($user['id'] ?? 0);
        if (($user['perfil'] ?? 'cliente') === 'master' || $ownerId <= 0) return ['complete' => true, 'missing' => []];
        $headerQuery = $pdo->prepare('SELECT setting_value FROM app_settings WHERE setting_key=? LIMIT 1');
        $headerQuery->execute(['header_settings_' . $ownerId]);
        $header = json_decode((string) ($headerQuery->fetchColumn() ?: '{}'), true);
        $hasHeader = is_array($header)
            && trim((string) ($header['network'] ?? '')) !== ''
            && trim((string) ($header['school'] ?? '')) !== ''
            && trim((string) ($header['contact'] ?? '')) !== '';
        $count = static function (string $table) use ($pdo, $ownerId): int {
            $query = $pdo->prepare("SELECT COUNT(*) FROM {$table} WHERE usuario_id=?");
            $query->execute([$ownerId]);
            return (int) $query->fetchColumn();
        };
        $missing = [
            'header-settings' => !$hasHeader,
            'periods' => $count('periodos_avaliativos') === 0,
            'classes' => $count('turmas') === 0,
            'children' => $count('criancas') === 0,
        ];
        return ['complete' => !in_array(true, $missing, true), 'missing' => $missing];
    };
    $setupStepAllowed = static function (string $resource, string $method, array $setup): bool {
        if (!in_array($resource, ['header-settings', 'periods', 'classes', 'children'], true)) return false;
        if ($method === 'GET') return true;
        if ($method !== 'POST') return false;
        $missing = $setup['missing'] ?? [];
        if ($resource === 'header-settings') return true;
        if ($resource === 'periods') return empty($missing['header-settings']);
        if ($resource === 'classes') return empty($missing['header-settings']) && empty($missing['periods']);
        if ($resource === 'children') return empty($missing['header-settings']) && empty($missing['periods']) && empty($missing['classes']);
        return false;
    };
    $requirePermission = static function (string $resource) use ($loadCurrentUser, $permissionMap, $pdo, $clientSetupStatus, $setupStepAllowed): void {
        $user = $loadCurrentUser();
        if (($user['perfil'] ?? 'cliente') === 'master') return;
        $setup = $clientSetupStatus($user);
        if (empty($setup['complete'])) {
            if ($setupStepAllowed($resource, $_SERVER['REQUEST_METHOD'] ?? 'GET', $setup)) return;
            http_response_code(428);
            throw new RuntimeException('Conclua o cadastro inicial antes de usar o sistema.');
        }
        if ($resource === 'header-settings') return;
        if ($resource === 'experience-fields') return;
        if ($resource === 'tutorial-videos') return;
        if (str_starts_with($resource, 'google-drive')) return;
        $setupTables = ['children' => 'criancas', 'classes' => 'turmas', 'periods' => 'periodos_avaliativos'];
        if (isset($setupTables[$resource]) && $_SERVER['REQUEST_METHOD'] === 'GET') return;
        if (isset($setupTables[$resource]) && $_SERVER['REQUEST_METHOD'] === 'POST') {
            $count = $pdo->prepare("SELECT COUNT(*) FROM {$setupTables[$resource]} WHERE usuario_id=?");
            $count->execute([(int) $user['id']]);
            if ((int) $count->fetchColumn() === 0) return;
        }
        $permission = $permissionMap[$resource] ?? $resource;
        if ($resource === 'reports' && in_array('portfolio', $user['permissions'] ?? [], true)) return;
        if (!in_array($permission, $user['permissions'] ?? [], true)) {
            http_response_code(403);
            throw new RuntimeException('Seu usuário não possui permissão para acessar esta área.');
        }
    };

    $resource = $_GET['resource'] ?? '';
    if ($resource === 'billing-return' && $_SERVER['REQUEST_METHOD'] === 'GET') {
        echo json_encode($confirmMercadoPagoReturn($_GET), JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($resource === 'mercado-pago-webhook' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $rawWebhookBody = file_get_contents('php://input');
        $webhookBody = json_decode((string) $rawWebhookBody, true);
        if (!is_array($webhookBody)) $webhookBody = [];
        echo json_encode($handleMercadoPagoWebhook($_GET, $webhookBody), JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($resource === 'billing-public' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
        $email = trim((string) ($input['email'] ?? ''));
        $method = in_array(($input['method'] ?? ''), ['pix', 'card'], true) ? (string) $input['method'] : '';
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $method === '') throw new RuntimeException('Informe o e-mail e a forma de pagamento.');
        $query = $pdo->prepare("SELECT id,nome,email,telefone,perfil,permissoes,ativo,image_editor_permission,{$billingSelect} FROM usuarios WHERE email=? LIMIT 1");
        $query->execute([$email]);
        $row = $query->fetch(PDO::FETCH_ASSOC);
        if (!$row || !$billingRequiresPayment($row)) throw new RuntimeException('Nao ha cobranca pendente para este acesso.');
        $permissions = json_decode((string) ($row['permissoes'] ?? '[]'), true);
        $row['permissions'] = is_array($permissions) ? $permissions : [];
        $billing = $publicUser($row)['billing'];
        if (!in_array($method, $paymentMethodsAvailable($billing), true)) throw new RuntimeException('Forma de pagamento nao liberada para este plano.');
        if (!$mercadoPagoConfigured()) {
            http_response_code(501);
            throw new RuntimeException('Mercado Pago ainda nao configurado. Informe access_token e public_key para habilitar Pix e cartao recorrente.');
        }
        $row = $applyBillingChoice($row, $input);
        echo json_encode($createMercadoPagoPayment($row, $method), JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($resource === 'auth' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
        $action = $input['action'] ?? '';
        if ($action === 'login') {
            $email = trim((string) ($input['email'] ?? ''));
            $password = (string) ($input['password'] ?? '');
            $user = $pdo->prepare("SELECT id,nome,email,telefone,perfil,permissoes,ativo,image_editor_permission,{$billingSelect},terms_accepted_at,terms_version,terms_ip,senha_hash FROM usuarios WHERE email=? LIMIT 1");
            $user->execute([$email]);
            $row = $user->fetch(PDO::FETCH_ASSOC);
            if (!$row || !password_verify($password, $row['senha_hash'])) {
                http_response_code(401);
                throw new RuntimeException('E-mail ou senha inválidos.');
            }
            if ((int) $row['ativo'] !== 1) {
                http_response_code(403);
                throw new RuntimeException('Este usuário está inativo.');
            }
            $permissions = json_decode((string) ($row['permissoes'] ?? '[]'), true);
            $row['permissions'] = is_array($permissions) ? $permissions : [];
            $row = $auditBillingAccess($row);
            session_regenerate_id(true);
            $_SESSION['user_id'] = (int) $row['id'];
            $public = $publicUser($row);
            $storeBootstrapUser($public);
            echo json_encode(['ok' => true, 'user' => $public], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($action === 'logout') {
            $_SESSION = [];
            session_destroy();
            echo json_encode(['ok' => true]);
            exit;
        }
        if ($action === 'accept_terms') {
            if (empty($_SESSION['user_id'])) { http_response_code(401); throw new RuntimeException('Sessão expirada.'); }
            $acceptedVersion = trim((string) ($input['version'] ?? ''));
            if ($acceptedVersion !== $termsVersion) throw new RuntimeException('Versão do termo inválida. Atualize a página e tente novamente.');
            $ip = substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
            $pdo->prepare('UPDATE usuarios SET terms_accepted_at=NOW(), terms_version=?, terms_ip=? WHERE id=?')->execute([$termsVersion, $ip ?: null, (int) $_SESSION['user_id']]);
            $user = $pdo->prepare("SELECT id,nome,email,telefone,perfil,permissoes,ativo,image_editor_permission,{$billingSelect},terms_accepted_at,terms_version,terms_ip FROM usuarios WHERE id=? LIMIT 1");
            $user->execute([(int) $_SESSION['user_id']]);
            $row = $user->fetch(PDO::FETCH_ASSOC);
            if (!$row) { http_response_code(401); throw new RuntimeException('Usuário não encontrado.'); }
            $permissions = json_decode((string) ($row['permissoes'] ?? '[]'), true);
            $row['permissions'] = is_array($permissions) ? $permissions : [];
            $row = $auditBillingAccess($row);
            $public = $publicUser($row);
            $storeBootstrapUser($public);
            echo json_encode(['ok' => true, 'user' => $public], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }
    if ($resource === 'auth' && $_SERVER['REQUEST_METHOD'] === 'GET') {
        if (empty($_SESSION['user_id'])) { http_response_code(401); throw new RuntimeException('Sessão expirada.'); }
        $user = $pdo->prepare("SELECT id,nome,email,telefone,perfil,permissoes,ativo,image_editor_permission,{$billingSelect},terms_accepted_at,terms_version,terms_ip FROM usuarios WHERE id=?");
        $user->execute([(int) $_SESSION['user_id']]);
        $row = $user->fetch(PDO::FETCH_ASSOC);
        if (!$row) { session_destroy(); http_response_code(401); throw new RuntimeException('Usuário não encontrado.'); }
        if ((int) $row['ativo'] !== 1) { session_destroy(); http_response_code(401); throw new RuntimeException('Usuário sem acesso ativo.'); }
        $permissions = json_decode((string) ($row['permissoes'] ?? '[]'), true);
        $row['permissions'] = is_array($permissions) ? $permissions : [];
        $row = $auditBillingAccess($row);
        $public = $publicUser($row);
        $storeBootstrapUser($public);
        echo json_encode($public, JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($resource === 'auth' && $_SERVER['REQUEST_METHOD'] === 'PUT') {
        $sessionUser = $loadCurrentUser();
        if (!empty($sessionUser['billing_lock'])) {
            http_response_code(402);
            throw new RuntimeException($sessionUser['billing_lock']['message'] ?? 'Pagamento do plano pendente.');
        }
        if (empty($_SESSION['user_id'])) { http_response_code(401); throw new RuntimeException('Sessão expirada.'); }
        $input = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
        if (($input['action'] ?? '') === 'change_password') {
            $currentPassword = (string) ($input['currentPassword'] ?? '');
            $newPassword = (string) ($input['newPassword'] ?? '');
            $confirmPassword = (string) ($input['confirmPassword'] ?? '');
            if ($newPassword === '' || strlen($newPassword) < 6) throw new RuntimeException('A nova senha deve ter pelo menos 6 caracteres.');
            if ($newPassword !== $confirmPassword) throw new RuntimeException('A confirmação da senha não confere.');
            $user = $pdo->prepare('SELECT senha_hash FROM usuarios WHERE id=? LIMIT 1');
            $user->execute([(int) $_SESSION['user_id']]);
            $hash = (string) $user->fetchColumn();
            if ($hash === '' || !password_verify($currentPassword, $hash)) {
                throw new RuntimeException('Senha atual incorreta.');
            }
            $updatePassword = $pdo->prepare('UPDATE usuarios SET senha_hash=? WHERE id=?');
            $updatePassword->execute([password_hash($newPassword, PASSWORD_DEFAULT), (int) $_SESSION['user_id']]);
            echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $name = trim((string) ($input['name'] ?? ''));
        $email = trim((string) ($input['email'] ?? ''));
        $phone = trim((string) ($input['phone'] ?? ''));
        if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) throw new RuntimeException('Informe nome e e-mail válidos.');
        $update = $pdo->prepare('UPDATE usuarios SET nome=?,email=?,telefone=? WHERE id=?');
        $update->execute([$name, $email, $phone ?: null, (int) $_SESSION['user_id']]);
        if (!empty($_SESSION['bootstrap_user']) && is_array($_SESSION['bootstrap_user'])) {
            $_SESSION['bootstrap_user']['name'] = $name;
            $_SESSION['bootstrap_user']['email'] = $email;
            $_SESSION['bootstrap_user']['phone'] = $phone;
        }
        echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if (empty($_SESSION['user_id'])) { http_response_code(401); throw new RuntimeException('Faça login para continuar.'); }
    $termsGuardUser = $loadCurrentUser();
    if (trim((string) ($termsGuardUser['terms_accepted_at'] ?? '')) === '' || trim((string) ($termsGuardUser['terms_version'] ?? '')) !== $termsVersion) {
        http_response_code(428);
        throw new RuntimeException('Aceite os termos de uso e privacidade para continuar.');
    }
    if ($resource === 'billing') {
        $loggedUser = $loadCurrentUser();
        $billing = $publicUser($loggedUser)['billing'];
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            echo json_encode(['billing' => $billing, 'paymentMethods' => $paymentMethodsAvailable($billing), 'cycles' => $activeBillingCycles()], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $input = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
            $method = in_array(($input['method'] ?? ''), ['pix', 'card'], true) ? (string) $input['method'] : '';
            if ($method === '' || !in_array($method, $paymentMethodsAvailable($billing), true)) throw new RuntimeException('Forma de pagamento nao liberada para este plano.');
            if (!$mercadoPagoConfigured()) {
                http_response_code(501);
                throw new RuntimeException('Mercado Pago ainda nao configurado. Informe access_token e public_key para habilitar Pix e cartao recorrente.');
            }
            $loggedUser = $applyBillingChoice($loggedUser, $input);
            echo json_encode($createMercadoPagoPayment($loggedUser, $method), JSON_UNESCAPED_UNICODE);
            exit;
        }
    }
    if ($resource === 'google-drive') {
        $user = $loadCurrentUser();
        $settings = $getGoogleDriveSettings();
        $accountQuery = $pdo->prepare('SELECT id,email_google,folder_id,folder_name,token_expiration,data_conexao FROM google_drive_accounts WHERE usuario_id=? LIMIT 1');
        $accountQuery->execute([(int) $user['id']]);
        $account = $accountQuery->fetch(PDO::FETCH_ASSOC) ?: null;
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            echo json_encode([
                'settings' => $publicGoogleDriveSettings($settings),
                'connected' => (bool) $account,
                'account' => $account ? [
                    'email' => $account['email_google'],
                    'folderId' => $account['folder_id'],
                    'folderName' => $account['folder_name'],
                    'connectedAt' => $account['data_conexao'],
                ] : null,
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $input = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
            $action = (string) ($input['action'] ?? '');
            if ($action === 'disconnect') {
                $pdo->prepare('DELETE FROM google_drive_accounts WHERE usuario_id=?')->execute([(int) $user['id']]);
                $googleDriveAudit((int) $user['id'], 'disconnected', 'Google Drive disconnected.');
                echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
                exit;
            }
            if ($action === 'set_folder') {
                $folderName = trim((string) ($input['folderName'] ?? ''));
                $folderId = trim((string) ($input['folderId'] ?? ''));
                if ($folderName === '' && $folderId === '') throw new RuntimeException('Informe o nome da pasta ou ID da pasta.');
                if ($folderId === '') {
                    $account = $loadGoogleDriveAccount((int) $user['id']);
                    if (!$account || empty($account['access_token_plain'])) throw new RuntimeException('Conecte sua conta Google Drive antes de escolher a pasta.');
                    $safeFolderName = $sanitizeDriveName($folderName, 'AiProf');
                    $folder = $driveFindFolder($account['access_token_plain'], $safeFolderName) ?: $driveCreateFolder($account['access_token_plain'], $safeFolderName);
                    $folderId = $folder['id'];
                    $folderName = $folder['name'];
                }
                $pdo->prepare('UPDATE google_drive_accounts SET folder_id=?,folder_name=? WHERE usuario_id=?')->execute([$folderId, $folderName ?: 'Google Drive', (int) $user['id']]);
                echo json_encode(['ok' => true, 'folderId' => $folderId, 'folderName' => $folderName], JSON_UNESCAPED_UNICODE);
                exit;
            }
        }
    }
    if ($resource === 'google-drive-history') {
        $user = $loadCurrentUser();
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $query = $pdo->prepare("SELECT gu.id,gu.parecer_id,gu.arquivo,gu.drive_file_id,gu.drive_link,gu.folder_name,gu.status,gu.error_message,gu.data_upload,gu.created_at,c.nome AS aluno FROM google_drive_uploads gu LEFT JOIN pareceres p ON p.id=gu.parecer_id LEFT JOIN criancas c ON c.id=p.crianca_id WHERE gu.usuario_id=? ORDER BY gu.created_at DESC LIMIT 200");
            $query->execute([(int) $user['id']]);
            echo json_encode(['uploads' => array_map(static fn(array $row): array => [
                'id' => (int) $row['id'],
                'reportId' => isset($row['parecer_id']) ? (int) $row['parecer_id'] : null,
                'fileName' => $row['arquivo'],
                'student' => $row['aluno'] ?? '',
                'folder' => $row['folder_name'] ?? '',
                'link' => $row['drive_link'] ?? '',
                'status' => $row['status'],
                'error' => $row['error_message'] ?? '',
                'uploadedAt' => $row['data_upload'],
                'createdAt' => $row['created_at'],
            ], $query->fetchAll(PDO::FETCH_ASSOC))], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
            $id = (int) ($_GET['id'] ?? 0);
            if ($id <= 0) throw new RuntimeException('Historico invalido.');
            $pdo->prepare('DELETE FROM google_drive_uploads WHERE id=? AND usuario_id=?')->execute([$id, (int) $user['id']]);
            echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $input = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
            $id = (int) ($input['id'] ?? 0);
            if ($id <= 0) throw new RuntimeException('Historico invalido.');
            $query = $pdo->prepare('SELECT * FROM google_drive_uploads WHERE id=? AND usuario_id=? LIMIT 1');
            $query->execute([$id, (int) $user['id']]);
            $row = $query->fetch(PDO::FETCH_ASSOC);
            if (!$row || empty($row['file_blob'])) throw new RuntimeException('Arquivo original nao esta mais disponivel para reenvio.');
            try {
                $folder = $ensureDriveFolder((int) $user['id']);
                $pdo->prepare('UPDATE google_drive_uploads SET status="uploading",error_message=NULL WHERE id=?')->execute([$id]);
                $driveFile = $uploadBinaryToDrive($folder['account']['access_token_plain'], (string) $row['arquivo'], (string) $row['mime_type'], (string) $row['file_blob'], $folder['id']);
                $pdo->prepare('UPDATE google_drive_uploads SET status="uploaded",file_blob=NULL,drive_file_id=?,drive_link=?,data_upload=NOW(),folder_id=?,folder_name=?,error_message=NULL WHERE id=?')->execute([(string) ($driveFile['id'] ?? ''), (string) ($driveFile['webViewLink'] ?? ''), $folder['id'], $folder['name'], $id]);
                echo json_encode(['ok' => true, 'link' => $driveFile['webViewLink'] ?? ''], JSON_UNESCAPED_UNICODE);
                exit;
            } catch (Throwable $e) {
                $pdo->prepare('UPDATE google_drive_uploads SET status="error",error_message=? WHERE id=?')->execute([$e->getMessage(), $id]);
                throw $e;
            }
        }
    }
    if ($resource === 'google-drive-upload' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $user = $loadCurrentUser();
        $settings = $getGoogleDriveSettings();
        if (empty($settings['enabled'])) throw new RuntimeException('Integracao com Google Drive desabilitada.');
        $reportId = (int) ($_POST['reportId'] ?? 0);
        $fileType = (string) ($_POST['fileType'] ?? '');
        $context = [
            'student' => (string) ($_POST['studentName'] ?? ''),
            'class' => (string) ($_POST['className'] ?? ''),
            'teacher' => (string) ($user['nome'] ?? ''),
            'school' => (string) ($_POST['schoolName'] ?? ''),
            'year' => (string) ($_POST['year'] ?? date('Y')),
            'type' => (string) ($_POST['documentLabel'] ?? 'Parecer'),
        ];
        if ($reportId <= 0 || empty($_FILES['file']['tmp_name']) || !is_uploaded_file($_FILES['file']['tmp_name'])) throw new RuntimeException('Arquivo invalido para envio ao Drive.');
        $ownerCheck = $pdo->prepare('SELECT p.id FROM pareceres p JOIN criancas c ON c.id=p.crianca_id WHERE p.id=? AND c.usuario_id=? LIMIT 1');
        $ownerCheck->execute([$reportId, (int) $user['id']]);
        if (!$ownerCheck->fetchColumn()) throw new RuntimeException('Documento nao encontrado para este login.');
        $binary = file_get_contents($_FILES['file']['tmp_name']);
        if (!is_string($binary) || $binary === '') throw new RuntimeException('Arquivo vazio para upload.');
        $mime = $fileType === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        $extension = $fileType === 'pdf' ? '.pdf' : '.docx';
        $baseName = $sanitizeDriveName($replaceDriveTokens((string) ($settings['filename_template'] ?? '{Tipo} - {Aluno}'), $context), 'Documento');
        $fileName = $baseName . $extension;
        $insert = $pdo->prepare('INSERT INTO google_drive_uploads (usuario_id,parecer_id,arquivo,mime_type,file_blob,status) VALUES (?,?,?,?,?,"queued")');
        $insert->bindValue(1, (int) $user['id'], PDO::PARAM_INT);
        $insert->bindValue(2, $reportId, PDO::PARAM_INT);
        $insert->bindValue(3, $fileName);
        $insert->bindValue(4, $mime);
        $insert->bindValue(5, $binary, PDO::PARAM_LOB);
        $insert->execute();
        $uploadId = (int) $pdo->lastInsertId();
        try {
            $folder = $ensureDriveFolder((int) $user['id'], $context);
            $pdo->prepare('UPDATE google_drive_uploads SET status="uploading",folder_id=?,folder_name=? WHERE id=?')->execute([$folder['id'], $folder['name'], $uploadId]);
            $driveFile = $uploadBinaryToDrive($folder['account']['access_token_plain'], $fileName, $mime, $binary, $folder['id']);
            $pdo->prepare('UPDATE google_drive_uploads SET status="uploaded",file_blob=NULL,drive_file_id=?,drive_link=?,data_upload=NOW(),folder_id=?,folder_name=?,error_message=NULL WHERE id=?')->execute([(string) ($driveFile['id'] ?? ''), (string) ($driveFile['webViewLink'] ?? ''), $folder['id'], $folder['name'], $uploadId]);
            $googleDriveAudit((int) $user['id'], 'upload_success', $fileName);
            echo json_encode(['ok' => true, 'uploadId' => $uploadId, 'fileName' => $fileName, 'link' => $driveFile['webViewLink'] ?? '', 'status' => 'uploaded'], JSON_UNESCAPED_UNICODE);
            exit;
        } catch (Throwable $e) {
            $pdo->prepare('UPDATE google_drive_uploads SET status="error",error_message=? WHERE id=?')->execute([$e->getMessage(), $uploadId]);
            $googleDriveAudit((int) $user['id'], 'upload_error', $e->getMessage());
            http_response_code(202);
            echo json_encode(['ok' => false, 'queued' => true, 'uploadId' => $uploadId, 'fileName' => $fileName, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }
    if ($resource === 'finance') {
        $requireMaster();
        $paymentRow = static function (array $row): array {
            return [
                'id' => (int) $row['id'],
                'userId' => (int) $row['usuario_id'],
                'userName' => $row['nome'],
                'email' => $row['email'],
                'type' => $row['type'],
                'status' => $row['status'],
                'amount' => (float) $row['amount'],
                'dueDate' => $row['due_date'],
                'paidAt' => $row['paid_at'],
                'description' => $row['description'] ?? '',
                'externalId' => $row['external_id'] ?? '',
                'createdAt' => $row['created_at'],
            ];
        };
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $start = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($_GET['start'] ?? '')) ? (string) $_GET['start'] : '';
            $end = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($_GET['end'] ?? '')) ? (string) $_GET['end'] : '';
            $status = in_array(($_GET['status'] ?? ''), ['pending', 'approved', 'rejected', 'canceled'], true) ? (string) $_GET['status'] : '';
            $userId = (int) ($_GET['userId'] ?? 0);
            $clientRows = $pdo->query("SELECT id,nome,email,telefone,perfil,ativo,{$billingSelect},created_at FROM usuarios WHERE perfil='cliente' ORDER BY billing_next_due_date IS NULL, billing_next_due_date, nome")->fetchAll(PDO::FETCH_ASSOC);
            $clients = array_map(static function (array $row): array {
                return [
                    'id' => (int) $row['id'],
                    'name' => $row['nome'],
                    'email' => $row['email'],
                    'phone' => $row['telefone'],
                    'active' => (bool) $row['ativo'],
                    'billing' => [
                        'plan' => $row['billing_plan'] ?? 'Basico',
                        'cycle' => $row['billing_cycle'] ?? 'monthly',
                        'cycleId' => isset($row['billing_cycle_id']) ? (int) $row['billing_cycle_id'] : null,
                        'cycleLabel' => trim((string) ($row['billing_cycle_name'] ?? '')) ?: (($row['billing_cycle'] ?? 'monthly') === 'annual' ? 'Anual' : 'Mensal'),
                        'cycleMonths' => max(1, (int) ($row['billing_cycle_months'] ?? (($row['billing_cycle'] ?? 'monthly') === 'annual' ? 12 : 1))),
                        'amount' => (float) ($row['billing_amount'] ?? 0),
                        'paymentMethod' => $row['billing_payment_method'] ?? 'both',
                        'status' => $row['billing_status'] ?? 'pending',
                        'nextDueDate' => $row['billing_next_due_date'] ?? null,
                        'notes' => $row['billing_notes'] ?? '',
                    ],
                    'createdAt' => $row['created_at'],
                ];
            }, $clientRows);
            $where = [];
            $params = [];
            if ($start !== '') { $where[] = 'DATE(COALESCE(bp.paid_at,bp.due_date,bp.created_at)) >= ?'; $params[] = $start; }
            if ($end !== '') { $where[] = 'DATE(COALESCE(bp.paid_at,bp.due_date,bp.created_at)) <= ?'; $params[] = $end; }
            if ($status !== '') { $where[] = 'bp.status = ?'; $params[] = $status; }
            if ($userId > 0) { $where[] = 'bp.usuario_id = ?'; $params[] = $userId; }
            $sql = "SELECT bp.*,u.nome,u.email FROM billing_payments bp JOIN usuarios u ON u.id=bp.usuario_id";
            if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
            $sql .= ' ORDER BY COALESCE(bp.paid_at,bp.due_date,bp.created_at) DESC, bp.id DESC LIMIT 500';
            $query = $pdo->prepare($sql);
            $query->execute($params);
            $payments = array_map($paymentRow, $query->fetchAll(PDO::FETCH_ASSOC));
            $summary = ['pending' => 0.0, 'approved' => 0.0, 'overdueClients' => 0, 'dueSoonClients' => 0];
            $today = new DateTimeImmutable('today');
            foreach ($clients as $client) {
                $billing = $client['billing'];
                if (($billing['status'] ?? '') === 'active') $summary['approved'] += (float) ($billing['amount'] ?? 0);
                if (!empty($billing['nextDueDate'])) {
                    $due = new DateTimeImmutable($billing['nextDueDate']);
                    $diff = (int) $today->diff($due)->format('%r%a');
                    if ($diff < 0) {
                        $summary['overdueClients']++;
                        if (in_array(($billing['status'] ?? ''), ['pending', 'overdue'], true)) $summary['pending'] += (float) ($billing['amount'] ?? 0);
                    }
                    elseif ($diff <= 5) $summary['dueSoonClients']++;
                }
            }
            echo json_encode(['clients' => $clients, 'payments' => $payments, 'summary' => $summary], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $input = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
            $action = (string) ($input['action'] ?? 'manual-charge');
            if ($action === 'manual-charge') {
                $userId = (int) ($input['userId'] ?? 0);
                $amount = (float) str_replace(',', '.', (string) ($input['amount'] ?? '0'));
                $dueDate = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($input['dueDate'] ?? '')) ? (string) $input['dueDate'] : '';
                $description = trim((string) ($input['description'] ?? 'Cobranca manual'));
                if ($userId <= 0 || $amount <= 0 || $dueDate === '') throw new RuntimeException('Informe cliente, valor e vencimento da cobranca.');
                $check = $pdo->prepare("SELECT id FROM usuarios WHERE id=? AND perfil='cliente' LIMIT 1");
                $check->execute([$userId]);
                if (!$check->fetchColumn()) throw new RuntimeException('Cliente nao encontrado.');
                $insert = $pdo->prepare("INSERT INTO billing_payments (usuario_id,type,status,amount,due_date,description) VALUES (?,'manual','pending',?,?,?)");
                $insert->execute([$userId, $amount, $dueDate, $description]);
                $pdo->prepare("UPDATE usuarios SET billing_amount=?,billing_next_due_date=?,billing_status='pending',billing_payment_method='manual',billing_notes=? WHERE id=?")->execute([$amount, $dueDate, $description, $userId]);
                echo json_encode(['ok' => true, 'id' => (int) $pdo->lastInsertId()], JSON_UNESCAPED_UNICODE);
                exit;
            }
            if ($action === 'mark-paid') {
                $paymentId = (int) ($input['paymentId'] ?? 0);
                if ($paymentId <= 0) throw new RuntimeException('Cobranca invalida.');
                $query = $pdo->prepare("SELECT bp.*,u.billing_cycle,u.billing_cycle_id,u.billing_next_due_date,(SELECT month_count FROM billing_cycles bc WHERE bc.id=u.billing_cycle_id LIMIT 1) AS billing_cycle_months FROM billing_payments bp JOIN usuarios u ON u.id=bp.usuario_id WHERE bp.id=? LIMIT 1");
                $query->execute([$paymentId]);
                $payment = $query->fetch(PDO::FETCH_ASSOC);
                if (!$payment) throw new RuntimeException('Cobranca nao encontrada.');
                $cycleMonths = max(1, (int) ($payment['billing_cycle_months'] ?? (($payment['billing_cycle'] ?? 'monthly') === 'annual' ? 12 : 1)));
                $nextDue = $nextBillingDate($cycleMonths, $payment['billing_next_due_date'] ?? null);
                $pdo->prepare("UPDATE billing_payments SET status='approved',paid_at=NOW() WHERE id=?")->execute([$paymentId]);
                $pdo->prepare("UPDATE usuarios SET ativo=1,billing_status='active',billing_next_due_date=? WHERE id=?")->execute([$nextDue, (int) $payment['usuario_id']]);
                echo json_encode(['ok' => true, 'nextDueDate' => $nextDue], JSON_UNESCAPED_UNICODE);
                exit;
            }
            throw new RuntimeException('Acao financeira invalida.');
        }
        http_response_code(405);
        throw new RuntimeException('Metodo nao permitido.');
    }
    if ($resource === 'billing-cycles') {
        $requireMaster();
        $cycleRow = static function (array $row): array {
            return [
                'id' => (int) $row['id'],
                'name' => $row['name'],
                'slug' => $row['slug'],
                'months' => (int) $row['month_count'],
                'amount' => (float) $row['amount'],
                'active' => (bool) $row['active'],
                'createdAt' => $row['created_at'] ?? null,
            ];
        };
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $rows = $pdo->query('SELECT id,name,slug,month_count,amount,active,created_at FROM billing_cycles ORDER BY active DESC, month_count, name')->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['cycles' => array_map($cycleRow, $rows)], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($_SERVER['REQUEST_METHOD'] === 'POST' || $_SERVER['REQUEST_METHOD'] === 'PUT') {
            $input = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
            $id = (int) ($input['id'] ?? 0);
            $name = trim((string) ($input['name'] ?? ''));
            $months = max(1, (int) ($input['months'] ?? 1));
            $amount = max(0, (float) str_replace(',', '.', (string) ($input['amount'] ?? '0')));
            $active = !empty($input['active']) ? 1 : 0;
            if ($name === '') throw new RuntimeException('Informe o nome do ciclo.');
            if ($months > 60) throw new RuntimeException('Informe um ciclo de ate 60 meses.');
            $asciiName = function_exists('iconv') ? (iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name) ?: $name) : $name;
            $slugBase = strtolower(trim((string) preg_replace('/[^a-z0-9]+/i', '-', $asciiName), '-')) ?: 'ciclo';
            if ($id > 0) {
                $current = $pdo->prepare('SELECT slug FROM billing_cycles WHERE id=? LIMIT 1');
                $current->execute([$id]);
                $slug = (string) ($current->fetchColumn() ?: $slugBase);
                $update = $pdo->prepare('UPDATE billing_cycles SET name=?,slug=?,month_count=?,amount=?,active=? WHERE id=?');
                $update->execute([$name, $slug, $months, number_format($amount, 2, '.', ''), $active, $id]);
            } else {
                $slug = $slugBase;
                $suffix = 2;
                while (true) {
                    $check = $pdo->prepare('SELECT id FROM billing_cycles WHERE slug=? LIMIT 1');
                    $check->execute([$slug]);
                    if (!$check->fetchColumn()) break;
                    $slug = $slugBase . '-' . $suffix++;
                }
                $insert = $pdo->prepare('INSERT INTO billing_cycles (name,slug,month_count,amount,active) VALUES (?,?,?,?,?)');
                $insert->execute([$name, $slug, $months, number_format($amount, 2, '.', ''), $active]);
                $id = (int) $pdo->lastInsertId();
            }
            echo json_encode(['ok' => true, 'id' => $id], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
            $id = (int) ($_GET['id'] ?? 0);
            if ($id <= 0) throw new RuntimeException('Ciclo invalido.');
            $pdo->prepare('UPDATE billing_cycles SET active=0 WHERE id=?')->execute([$id]);
            echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
            exit;
        }
        http_response_code(405);
        throw new RuntimeException('Metodo nao permitido.');
    }
    if ($resource === 'users') {
        $masterUser = $requireMaster();
        $allowedPermissions = ['alunos', 'turmas', 'periodos', 'atividades', 'pareceres', 'portfolio', 'configuracoes'];
        $normalizePermissions = static function (array $permissions) use ($allowedPermissions): array {
            return array_values(array_intersect($allowedPermissions, array_unique(array_map('strval', $permissions))));
        };
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $rows = $pdo->query("SELECT id,nome,email,telefone,perfil,permissoes,ativo,image_editor_permission,{$billingSelect},created_at FROM usuarios ORDER BY perfil DESC, nome")->fetchAll(PDO::FETCH_ASSOC);
            $users = array_map(static function (array $row): array {
                $permissions = json_decode((string) ($row['permissoes'] ?? '[]'), true);
                return ['id' => (int) $row['id'], 'name' => $row['nome'], 'email' => $row['email'], 'phone' => $row['telefone'], 'role' => $row['perfil'], 'permissions' => is_array($permissions) ? $permissions : [], 'active' => (bool) $row['ativo'], 'imageEditorPermission' => $row['image_editor_permission'] ?? 'none', 'billing' => ['plan' => $row['billing_plan'] ?? 'Basico', 'cycle' => $row['billing_cycle'] ?? 'monthly', 'cycleId' => isset($row['billing_cycle_id']) ? (int) $row['billing_cycle_id'] : null, 'cycleLabel' => trim((string) ($row['billing_cycle_name'] ?? '')) ?: (($row['billing_cycle'] ?? 'monthly') === 'annual' ? 'Anual' : 'Mensal'), 'cycleMonths' => max(1, (int) ($row['billing_cycle_months'] ?? (($row['billing_cycle'] ?? 'monthly') === 'annual' ? 12 : 1))), 'amount' => (float) ($row['billing_amount'] ?? 0), 'paymentMethod' => $row['billing_payment_method'] ?? 'both', 'status' => $row['billing_status'] ?? 'pending', 'nextDueDate' => $row['billing_next_due_date'] ?? null, 'notes' => $row['billing_notes'] ?? '', 'trialDays' => (int) ($row['billing_trial_days'] ?? 0)], 'createdAt' => $row['created_at']];
            }, $rows);
            echo json_encode(['users' => $users, 'currentUserId' => (int) $masterUser['id'], 'availablePermissions' => $allowedPermissions], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($_SERVER['REQUEST_METHOD'] === 'POST' || $_SERVER['REQUEST_METHOD'] === 'PUT') {
            $input = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
            $userId = (int) ($input['id'] ?? 0);
            $name = trim((string) ($input['name'] ?? ''));
            $email = trim((string) ($input['email'] ?? ''));
            $phone = trim((string) ($input['phone'] ?? ''));
            $role = ($input['role'] ?? 'cliente') === 'master' ? 'master' : 'cliente';
            $active = !empty($input['active']) ? 1 : 0;
            $editorPermission = in_array(($input['imageEditorPermission'] ?? 'none'), ['none', 'manual', 'ai', 'both'], true) ? (string) $input['imageEditorPermission'] : 'none';
            $billing = $normalizeBilling($input);
            $permissions = $role === 'master' ? [] : $normalizePermissions(is_array($input['permissions'] ?? null) ? $input['permissions'] : []);
            $password = (string) ($input['password'] ?? '');
            if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) throw new RuntimeException('Informe nome e e-mail válidos.');
            if ($userId <= 0 && strlen($password) < 6) throw new RuntimeException('A senha inicial deve ter pelo menos 6 caracteres.');
            if ($userId > 0 && $userId === (int) $masterUser['id'] && ($role !== 'master' || $active !== 1)) throw new RuntimeException('Você não pode remover o acesso master da sua própria conta.');
            if ($userId > 0) {
                $sql = 'UPDATE usuarios SET nome=?,email=?,telefone=?,perfil=?,permissoes=?,ativo=?,image_editor_permission=?,billing_plan=?,billing_cycle=?,billing_cycle_id=?,billing_amount=?,billing_payment_method=?,billing_status=?,billing_next_due_date=?,billing_notes=?,billing_trial_days=?' . ($password !== '' ? ',senha_hash=?' : '') . ' WHERE id=?';
                $params = [$name, $email, $phone ?: null, $role, json_encode($permissions, JSON_UNESCAPED_UNICODE), $active, $editorPermission, $billing['plan'], $billing['cycle'], $billing['cycleId'], $billing['amount'], $billing['paymentMethod'], $billing['status'], $billing['nextDueDate'], $billing['notes'], $billing['trialDays']];
                if ($password !== '') {
                    if (strlen($password) < 6) throw new RuntimeException('A nova senha deve ter pelo menos 6 caracteres.');
                    $params[] = password_hash($password, PASSWORD_DEFAULT);
                }
                $params[] = $userId;
                $pdo->prepare($sql)->execute($params);
            } else {
                $insert = $pdo->prepare('INSERT INTO usuarios (nome,email,telefone,perfil,permissoes,ativo,image_editor_permission,billing_plan,billing_cycle,billing_cycle_id,billing_amount,billing_payment_method,billing_status,billing_next_due_date,billing_notes,billing_trial_days,senha_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
                $insert->execute([$name, $email, $phone ?: null, $role, json_encode($permissions, JSON_UNESCAPED_UNICODE), $active, $editorPermission, $billing['plan'], $billing['cycle'], $billing['cycleId'], $billing['amount'], $billing['paymentMethod'], $billing['status'], $billing['nextDueDate'], $billing['notes'], $billing['trialDays'], password_hash($password, PASSWORD_DEFAULT)]);
                $userId = (int) $pdo->lastInsertId();
            }
            echo json_encode(['id' => $userId], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
            $userId = (int) ($_GET['id'] ?? 0);
            if ($userId <= 0) throw new RuntimeException('Usuário inválido.');
            if ($userId === (int) $masterUser['id']) throw new RuntimeException('Você não pode excluir sua própria conta.');
            $pdo->prepare('DELETE FROM usuarios WHERE id=?')->execute([$userId]);
            echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
            exit;
        }
        http_response_code(405);
        throw new RuntimeException('Método não permitido.');
    }
    if ($resource === 'mercado-pago-settings') {
        $requireMaster();
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $settings = $getMercadoPagoSettings();
            echo json_encode([
                'configured' => $settings['access_token'] !== '' && $settings['public_key'] !== '',
                'accessTokenType' => str_starts_with($settings['access_token'], 'TEST-') ? 'test' : (str_starts_with($settings['access_token'], 'APP_USR-') ? 'production' : 'unknown'),
                'publicKey' => $settings['public_key'],
                'accessTokenMasked' => $maskSecret($settings['access_token']),
                'webhookSecretMasked' => $maskSecret($settings['webhook_secret']),
                'successUrl' => $settings['success_url'],
                'failureUrl' => $settings['failure_url'],
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $input = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
            $current = $getMercadoPagoSettings();
            $accessToken = trim((string) ($input['accessToken'] ?? ''));
            $publicKey = trim((string) ($input['publicKey'] ?? ''));
            $webhookSecret = trim((string) ($input['webhookSecret'] ?? ''));
            $settings = [
                'access_token' => $accessToken !== '' ? $accessToken : $current['access_token'],
                'public_key' => $publicKey !== '' ? $publicKey : $current['public_key'],
                'webhook_secret' => $webhookSecret !== '' ? $webhookSecret : $current['webhook_secret'],
                'success_url' => trim((string) ($input['successUrl'] ?? $current['success_url'])),
                'failure_url' => trim((string) ($input['failureUrl'] ?? $current['failure_url'])),
            ];
            if ($settings['access_token'] === '' || $settings['public_key'] === '') throw new RuntimeException('Informe Access Token e Public Key do Mercado Pago.');
            $save = $pdo->prepare('INSERT INTO app_settings (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)');
            $save->execute(['mercado_pago', json_encode($settings, JSON_UNESCAPED_SLASHES)]);
            echo json_encode(['ok' => true, 'configured' => true], JSON_UNESCAPED_UNICODE);
            exit;
        }
        http_response_code(405);
        throw new RuntimeException('Metodo nao permitido.');
    }
    if ($resource === 'marketing-notice') {
        $noticeKey = 'marketing_notices';
        $legacyNoticeKey = 'marketing_notice';
        $allowedFonts = ['DM Sans', 'Arial', 'Georgia', 'Verdana', 'Times New Roman'];
        $isList = static function (array $items): bool {
            return $items === [] || array_keys($items) === range(0, count($items) - 1);
        };
        $loadNotices = static function () use ($pdo, $noticeKey, $legacyNoticeKey, $isList): array {
            $query = $pdo->prepare("SELECT setting_value FROM app_settings WHERE setting_key=? LIMIT 1");
            $query->execute([$noticeKey]);
            $stored = json_decode((string) ($query->fetchColumn() ?: '[]'), true);
            if (is_array($stored) && $isList($stored)) return $stored;

            $legacy = $pdo->prepare("SELECT setting_value FROM app_settings WHERE setting_key=? LIMIT 1");
            $legacy->execute([$legacyNoticeKey]);
            $legacyNotice = json_decode((string) ($legacy->fetchColumn() ?: '{}'), true);
            if (!is_array($legacyNotice) || empty($legacyNotice)) return [];
            $legacyNotice['id'] = $legacyNotice['id'] ?? ('notice-' . time());
            $legacyNotice['createdAt'] = $legacyNotice['createdAt'] ?? date('c');
            $legacyNotice['updatedAt'] = $legacyNotice['updatedAt'] ?? date('c');
            return [$legacyNotice];
        };
        $activeNotice = static function (array $notices): array {
            $today = date('Y-m-d');
            foreach ($notices as $notice) {
                if (empty($notice['enabled'])) continue;
                if (!empty($notice['startDate']) && $today < $notice['startDate']) continue;
                if (!empty($notice['endDate']) && $today > $notice['endDate']) continue;
                if (trim((string) ($notice['title'] ?? '')) === '' && trim((string) ($notice['body'] ?? '')) === '' && empty($notice['image'])) continue;
                return $notice;
            }
            return [];
        };
        $saveNotices = static function (array $notices) use ($pdo, $noticeKey): void {
            $save = $pdo->prepare('INSERT INTO app_settings (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)');
            $save->execute([$noticeKey, json_encode(array_values($notices), JSON_UNESCAPED_UNICODE)]);
        };
        $sanitizeNotice = static function (array $input, array $current = []) use ($allowedFonts): array {
            $startDate = trim((string) ($input['startDate'] ?? ''));
            $endDate = trim((string) ($input['endDate'] ?? ''));
            $fontFamily = trim((string) ($input['fontFamily'] ?? 'DM Sans'));
            $imageInput = (string) ($input['image'] ?? ($current['image'] ?? ''));
            $notice = [
                'id' => (string) ($current['id'] ?? ($input['id'] ?? ('notice-' . bin2hex(random_bytes(6))))),
                'enabled' => !empty($input['enabled']),
                'eyebrow' => trim((string) ($input['eyebrow'] ?? 'INFORMATIVO')),
                'title' => trim((string) ($input['title'] ?? '')),
                'body' => trim((string) ($input['body'] ?? '')),
                'textColor' => preg_match('/^#[0-9A-Fa-f]{6}$/', (string) ($input['textColor'] ?? '')) ? (string) $input['textColor'] : '#236b52',
                'fontFamily' => in_array($fontFamily, $allowedFonts, true) ? $fontFamily : 'DM Sans',
                'image' => preg_match('#^data:image/[\w.+-]+;base64,#', $imageInput) ? $imageInput : '',
                'startDate' => preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate) ? $startDate : '',
                'endDate' => preg_match('/^\d{4}-\d{2}-\d{2}$/', $endDate) ? $endDate : '',
                'createdAt' => (string) ($current['createdAt'] ?? date('c')),
                'updatedAt' => date('c'),
            ];
            if ($notice['title'] === '' || $notice['body'] === '') throw new RuntimeException('Informe titulo e texto do informativo.');
            if ($notice['startDate'] !== '' && $notice['endDate'] !== '' && $notice['startDate'] > $notice['endDate']) {
                throw new RuntimeException('A data de inicio nao pode ser maior que a data de termino.');
            }
            if ($notice['id'] === '') $notice['id'] = 'notice-' . bin2hex(random_bytes(6));
            return $notice;
        };
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $loggedUser = $loadCurrentUser();
            $notices = $loadNotices();
            usort($notices, static function (array $a, array $b): int {
                return strcmp((string) ($b['createdAt'] ?? ''), (string) ($a['createdAt'] ?? ''));
            });
            $notice = $activeNotice($notices);
            echo json_encode(($loggedUser['perfil'] ?? '') === 'master' ? ['notices' => $notices, 'notice' => $notice] : $notice, JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $requireMaster();
            $input = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
            $notices = $loadNotices();
            $id = trim((string) ($input['id'] ?? ''));
            $updated = false;
            foreach ($notices as $index => $current) {
                if ($id !== '' && (string) ($current['id'] ?? '') === $id) {
                    $notices[$index] = $sanitizeNotice($input, $current);
                    $updated = true;
                    break;
                }
            }
            if (!$updated) $notices[] = $sanitizeNotice($input);
            usort($notices, static function (array $a, array $b): int {
                return strcmp((string) ($b['createdAt'] ?? ''), (string) ($a['createdAt'] ?? ''));
            });
            $saveNotices($notices);
            echo json_encode(['ok' => true, 'notices' => $notices, 'notice' => $activeNotice($notices)], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
            $requireMaster();
            $id = trim((string) ($_GET['id'] ?? ''));
            if ($id === '') throw new RuntimeException('Informe o informativo que deseja excluir.');
            $notices = array_values(array_filter($loadNotices(), static function (array $notice) use ($id): bool {
                return (string) ($notice['id'] ?? '') !== $id;
            }));
            $saveNotices($notices);
            echo json_encode(['ok' => true, 'notices' => $notices, 'notice' => $activeNotice($notices)], JSON_UNESCAPED_UNICODE);
            exit;
        }
        http_response_code(405);
        throw new RuntimeException('Metodo nao permitido.');
    }
    if ($resource === 'user-reset') {
        $requireMaster();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            throw new RuntimeException('Metodo nao permitido.');
        }
        $input = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
        $userId = (int) ($input['userId'] ?? 0);
        if ($userId <= 0) throw new RuntimeException('Usuario invalido para reset.');
        $userQuery = $pdo->prepare("SELECT id,nome,perfil FROM usuarios WHERE id=? LIMIT 1");
        $userQuery->execute([$userId]);
        $resetUser = $userQuery->fetch(PDO::FETCH_ASSOC);
        if (!$resetUser) throw new RuntimeException('Usuario nao encontrado.');
        if (($resetUser['perfil'] ?? 'cliente') === 'master') throw new RuntimeException('Nao e permitido resetar um login master.');

        $pdo->beginTransaction();
        $reportWhere = 'FROM pareceres p JOIN criancas c ON c.id=p.crianca_id WHERE c.usuario_id=?';
        $deleteReportLinks = [
            "DELETE pa FROM parecer_anexos pa JOIN pareceres p ON p.id=pa.parecer_id JOIN criancas c ON c.id=p.crianca_id WHERE c.usuario_id=?",
            "DELETE pb FROM parecer_blocos pb JOIN pareceres p ON p.id=pb.parecer_id JOIN criancas c ON c.id=p.crianca_id WHERE c.usuario_id=?",
            "DELETE pav FROM parecer_atividades pav JOIN pareceres p ON p.id=pav.parecer_id JOIN criancas c ON c.id=p.crianca_id WHERE c.usuario_id=?",
        ];
        foreach ($deleteReportLinks as $sql) {
            $pdo->prepare($sql)->execute([$userId]);
        }
        $pdo->prepare("DELETE p {$reportWhere}")->execute([$userId]);
        $pdo->prepare("DELETE af FROM atividade_fotos af JOIN atividades a ON a.id=af.atividade_id WHERE a.usuario_id=?")->execute([$userId]);
        $pdo->prepare('DELETE FROM atividades WHERE usuario_id=?')->execute([$userId]);
        $pdo->prepare('DELETE FROM criancas WHERE usuario_id=?')->execute([$userId]);
        $pdo->prepare('DELETE FROM turmas WHERE usuario_id=?')->execute([$userId]);
        $pdo->prepare('DELETE FROM periodos_avaliativos WHERE usuario_id=?')->execute([$userId]);
        $pdo->prepare('DELETE FROM app_settings WHERE setting_key=?')->execute(['header_settings_' . $userId]);
        $pdo->commit();

        echo json_encode(['ok' => true, 'message' => 'Dados iniciais resetados para ' . (string) $resetUser['nome'] . '.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $requirePermission($resource);
    $loggedUser = $loadCurrentUser();
    if (!empty($loggedUser['billing_lock'])) {
        http_response_code(402);
        throw new RuntimeException($loggedUser['billing_lock']['message'] ?? 'Pagamento do plano pendente.');
    }
    $ownerId = (int) $loggedUser['id'];
    if ($resource === 'tutorial-videos') {
        $tutorialKey = 'tutorial_videos';
        $loadTutorials = static function () use ($pdo, $tutorialKey): array {
            $query = $pdo->prepare('SELECT setting_value FROM app_settings WHERE setting_key=? LIMIT 1');
            $query->execute([$tutorialKey]);
            $items = json_decode((string) ($query->fetchColumn() ?: '[]'), true);
            return is_array($items) && ($items === [] || array_keys($items) === range(0, count($items) - 1)) ? $items : [];
        };
        $saveTutorials = static function (array $items) use ($pdo, $tutorialKey): void {
            $save = $pdo->prepare('INSERT INTO app_settings (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)');
            $save->execute([$tutorialKey, json_encode(array_values($items), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
        };
        $youtubeId = static function (string $url): string {
            $url = trim($url);
            if (preg_match('/^[A-Za-z0-9_-]{11}$/', $url)) return $url;
            $parts = parse_url($url);
            if (!is_array($parts)) return '';
            $host = strtolower((string) ($parts['host'] ?? ''));
            $path = trim((string) ($parts['path'] ?? ''), '/');
            if (str_contains($host, 'youtu.be')) return preg_match('/^[A-Za-z0-9_-]{11}$/', $path) ? $path : '';
            parse_str((string) ($parts['query'] ?? ''), $query);
            if (isset($query['v']) && preg_match('/^[A-Za-z0-9_-]{11}$/', (string) $query['v'])) return (string) $query['v'];
            if (preg_match('#(?:embed|shorts)/([A-Za-z0-9_-]{11})#', $path, $match)) return $match[1];
            return '';
        };
        $publicTutorial = static function (array $item): array {
            return [
                'id' => (string) ($item['id'] ?? ''),
                'title' => (string) ($item['title'] ?? ''),
                'url' => (string) ($item['url'] ?? ''),
                'youtubeId' => (string) ($item['youtubeId'] ?? ''),
                'showOnHome' => !empty($item['showOnHome']),
                'showFirstLogin' => !empty($item['showFirstLogin']),
                'createdAt' => (string) ($item['createdAt'] ?? ''),
                'updatedAt' => (string) ($item['updatedAt'] ?? ''),
            ];
        };
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $items = array_map($publicTutorial, $loadTutorials());
            usort($items, static fn(array $a, array $b): int => strcmp((string) ($b['createdAt'] ?? ''), (string) ($a['createdAt'] ?? '')));
            echo json_encode(['videos' => $items], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            exit;
        }
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            if (($loggedUser['perfil'] ?? 'cliente') !== 'master') {
                http_response_code(403);
                throw new RuntimeException('Acesso restrito ao login master.');
            }
            $input = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
            $title = trim((string) ($input['title'] ?? ''));
            $url = trim((string) ($input['url'] ?? ''));
            $videoId = $youtubeId($url);
            if ($title === '') throw new RuntimeException('Informe o titulo do tutorial.');
            if ($videoId === '') throw new RuntimeException('Informe um link valido do YouTube.');
            $items = $loadTutorials();
            $id = trim((string) ($input['id'] ?? ''));
            $updated = false;
            foreach ($items as $index => $current) {
                if ($id !== '' && (string) ($current['id'] ?? '') === $id) {
                    $items[$index] = [
                        'id' => $id,
                        'title' => $title,
                        'url' => $url,
                        'youtubeId' => $videoId,
                        'showOnHome' => !empty($input['showOnHome']),
                        'showFirstLogin' => !empty($input['showFirstLogin']),
                        'createdAt' => (string) ($current['createdAt'] ?? date('c')),
                        'updatedAt' => date('c'),
                    ];
                    $updated = true;
                    break;
                }
            }
            if (!$updated) {
                $items[] = [
                    'id' => 'tutorial-' . bin2hex(random_bytes(6)),
                    'title' => $title,
                    'url' => $url,
                    'youtubeId' => $videoId,
                    'showOnHome' => !empty($input['showOnHome']),
                    'showFirstLogin' => !empty($input['showFirstLogin']),
                    'createdAt' => date('c'),
                    'updatedAt' => date('c'),
                ];
            }
            usort($items, static fn(array $a, array $b): int => strcmp((string) ($b['createdAt'] ?? ''), (string) ($a['createdAt'] ?? '')));
            $saveTutorials($items);
            echo json_encode(['ok' => true, 'videos' => array_map($publicTutorial, $items)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            exit;
        }
        if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
            if (($loggedUser['perfil'] ?? 'cliente') !== 'master') {
                http_response_code(403);
                throw new RuntimeException('Acesso restrito ao login master.');
            }
            $id = trim((string) ($_GET['id'] ?? ''));
            if ($id === '') throw new RuntimeException('Informe o tutorial que deseja excluir.');
            $items = array_values(array_filter($loadTutorials(), static fn(array $item): bool => (string) ($item['id'] ?? '') !== $id));
            $saveTutorials($items);
            echo json_encode(['ok' => true, 'videos' => array_map($publicTutorial, $items)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            exit;
        }
        http_response_code(405);
        throw new RuntimeException('Metodo nao permitido.');
    }
    if ($resource === 'google-drive-settings') {
        $masterUser = $requireMaster();
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            echo json_encode($publicGoogleDriveSettings($getGoogleDriveSettings()), JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $input = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
            $previous = $getGoogleDriveSettings();
            $settings = [
                'enabled' => !empty($input['enabled']),
                'required' => !empty($input['required']),
                'client_id' => trim((string) ($input['clientId'] ?? '')) ?: (string) ($previous['client_id'] ?? ''),
                'client_secret' => trim((string) ($input['clientSecret'] ?? '')) ?: (string) ($previous['client_secret'] ?? ''),
                'folder_template' => trim((string) ($input['folderTemplate'] ?? '')) ?: $googleDriveDefaults['folder_template'],
                'filename_template' => trim((string) ($input['filenameTemplate'] ?? '')) ?: $googleDriveDefaults['filename_template'],
            ];
            if ($settings['enabled'] && ($settings['client_id'] === '' || $settings['client_secret'] === '')) throw new RuntimeException('Informe Client ID e Client Secret do Google.');
            $save = $pdo->prepare('INSERT INTO app_settings (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)');
            $save->execute(['google_drive', json_encode($settings, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
            $googleDriveAudit((int) $masterUser['id'], 'settings_saved', 'Google Drive settings updated.');
            echo json_encode(['ok' => true, 'settings' => $publicGoogleDriveSettings($settings)], JSON_UNESCAPED_UNICODE);
            exit;
        }
        http_response_code(405);
        throw new RuntimeException('Metodo nao permitido.');
    }
    if ($resource === 'google-drive-oauth') {
        $settings = $getGoogleDriveSettings();
        if (empty($settings['enabled']) || trim((string) $settings['client_id']) === '' || trim((string) $settings['client_secret']) === '') throw new RuntimeException('Google Drive nao configurado pelo administrador.');
        $action = (string) ($_GET['action'] ?? 'start');
        if ($action === 'start') {
            $user = $loadCurrentUser();
            $state = bin2hex(random_bytes(16));
            $_SESSION['google_drive_oauth_state'] = $state;
            $_SESSION['google_drive_oauth_user'] = (int) $user['id'];
            $params = [
                'client_id' => $settings['client_id'],
                'redirect_uri' => $currentApiUrl('google-drive-oauth', ['action' => 'callback']),
                'response_type' => 'code',
                'scope' => 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
                'access_type' => 'offline',
                'prompt' => 'consent',
                'include_granted_scopes' => 'true',
                'state' => $state,
            ];
            header('Location: https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query($params));
            exit;
        }
        if ($action === 'callback') {
            $state = (string) ($_GET['state'] ?? '');
            $code = (string) ($_GET['code'] ?? '');
            $userId = (int) ($_SESSION['google_drive_oauth_user'] ?? 0);
            if ($state === '' || $state !== ($_SESSION['google_drive_oauth_state'] ?? '') || $userId <= 0 || $code === '') throw new RuntimeException('Retorno do Google invalido.');
            $token = $googleTokenRequest([
                'code' => $code,
                'client_id' => $settings['client_id'],
                'client_secret' => $settings['client_secret'],
                'redirect_uri' => $currentApiUrl('google-drive-oauth', ['action' => 'callback']),
                'grant_type' => 'authorization_code',
            ]);
            $accessToken = (string) ($token['access_token'] ?? '');
            $refreshToken = (string) ($token['refresh_token'] ?? '');
            if ($accessToken === '') throw new RuntimeException('Google nao retornou access token.');
            $profile = $googleApiRequest('https://www.googleapis.com/oauth2/v2/userinfo', $accessToken);
            $emailGoogle = (string) ($profile['email'] ?? '');
            $expires = (new DateTimeImmutable())->modify('+' . max(300, (int) ($token['expires_in'] ?? 3600)) . ' seconds')->format('Y-m-d H:i:s');
            $existing = $pdo->prepare('SELECT refresh_token FROM google_drive_accounts WHERE usuario_id=? LIMIT 1');
            $existing->execute([$userId]);
            $currentRefresh = $decryptSecret((string) ($existing->fetchColumn() ?: ''));
            if ($refreshToken === '') $refreshToken = $currentRefresh;
            $save = $pdo->prepare('INSERT INTO google_drive_accounts (usuario_id,email_google,access_token,refresh_token,token_expiration,data_conexao) VALUES (?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE email_google=VALUES(email_google),access_token=VALUES(access_token),refresh_token=VALUES(refresh_token),token_expiration=VALUES(token_expiration),updated_at=NOW()');
            $save->execute([$userId, $emailGoogle, $encryptSecret($accessToken), $encryptSecret($refreshToken), $expires]);
            unset($_SESSION['google_drive_oauth_state'], $_SESSION['google_drive_oauth_user']);
            $googleDriveAudit($userId, 'connected', 'Google account connected: ' . $emailGoogle);
            header('Location: index.php#configuracoes');
            exit;
        }
    }
    if ($resource === 'children' && $_SERVER['REQUEST_METHOD'] === 'GET') {
        $query=$pdo->prepare('SELECT id,turma_id,nome,data_nascimento,foto,foto_mime FROM criancas WHERE usuario_id=? ORDER BY nome');
        $query->execute([$ownerId]);
        $rows=$query->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(array_map(static function (array $row): array {
            return ['id'=>'db-'.$row['id'],'databaseId'=>(int)$row['id'],'name'=>$row['nome'],'birthDate'=>$row['data_nascimento'],'classId'=>(int)$row['turma_id'],'photo'=>$row['foto']?'data:'.$row['foto_mime'].';base64,'.base64_encode($row['foto']):''];
        }, $rows),JSON_UNESCAPED_UNICODE);exit;
    }
    if ($resource === 'children' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $input=json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);$name=trim((string)($input['name']??''));$classId=(int)($input['classId']??1);if($name==='')throw new RuntimeException('Nome do aluno é obrigatório.');
        $photo=null;$mime=null;if(!empty($input['photo'])&&preg_match('#^data:([\w/+.-]+);base64,(.+)$#',$input['photo'],$m)){$photo=base64_decode($m[2],true);$mime=$m[1];}
        $classCheck=$pdo->prepare('SELECT id FROM turmas WHERE id=? AND usuario_id=?');$classCheck->execute([$classId,$ownerId]);if(!$classCheck->fetchColumn())throw new RuntimeException('Turma nao encontrada para este login.');
        $id=(int)($input['databaseId']??0);if($id){$ownerCheck=$pdo->prepare('SELECT id FROM criancas WHERE id=? AND usuario_id=?');$ownerCheck->execute([$id,$ownerId]);if(!$ownerCheck->fetchColumn())throw new RuntimeException('Aluno nao encontrado para este login.');}if(!$id){$find=$pdo->prepare('SELECT id FROM criancas WHERE nome=? AND turma_id=? AND usuario_id=? LIMIT 1');$find->execute([$name,$classId,$ownerId]);$id=(int)$find->fetchColumn();}
        if($id){$sql='UPDATE criancas SET nome=?,turma_id=?,data_nascimento=?'.($photo?',foto=?,foto_mime=?':'').' WHERE id=? AND usuario_id=?';$params=[$name,$classId,$input['birthDate']?:null];if($photo){$params[]=$photo;$params[]=$mime;}$params[]=$id;$params[]=$ownerId;$pdo->prepare($sql)->execute($params);}else{$pdo->prepare('INSERT INTO criancas (usuario_id,nome,turma_id,data_nascimento,foto,foto_mime) VALUES (?,?,?,?,?,?)')->execute([$ownerId,$name,$classId,$input['birthDate']?:null,$photo,$mime]);$id=(int)$pdo->lastInsertId();}
        echo json_encode(['id'=>$id]);exit;
    }
    if ($resource === 'classes' && $_SERVER['REQUEST_METHOD'] === 'GET') {
        $query = $pdo->prepare('SELECT id, nome, etapa, turno FROM turmas WHERE usuario_id=? ORDER BY nome');
        $query->execute([$ownerId]);
        $classes = $query->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(array_map(static function (array $class): array {
            return [
                'id' => (int) $class['id'], 'name' => $class['nome'],
                'stage' => $class['etapa'], 'shift' => $class['turno']
            ];
        }, $classes), JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($resource === 'classes' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
        $name = trim((string) ($input['name'] ?? ''));
        $stage = trim((string) ($input['stage'] ?? 'Educação Infantil'));
        $shift = trim((string) ($input['shift'] ?? 'Manhã'));
        if ($name === '') throw new RuntimeException('Nome da turma é obrigatório.');
        $classId = (int) ($input['id'] ?? 0);
        if ($classId > 0) {
            $update = $pdo->prepare('UPDATE turmas SET nome=?,etapa=?,turno=? WHERE id=? AND usuario_id=?');
            $update->execute([$name, $stage, $shift, $classId, $ownerId]);
            if ($update->rowCount() === 0) {
                $check = $pdo->prepare('SELECT id FROM turmas WHERE id=? AND usuario_id=?');
                $check->execute([$classId, $ownerId]);
                if (!$check->fetchColumn()) throw new RuntimeException('Turma não encontrada.');
            }
        } else {
            $insert = $pdo->prepare('INSERT INTO turmas (usuario_id,nome,etapa,turno) VALUES (?,?,?,?)');
            $insert->execute([$ownerId, $name, $stage, $shift]);
            $classId = (int) $pdo->lastInsertId();
        }
        echo json_encode(['id' => $classId], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($resource === 'periods' && $_SERVER['REQUEST_METHOD'] === 'GET') {
        $query = $pdo->prepare("SELECT id,nome,DATE_FORMAT(data_inicio, '%d/%m/%Y') AS data_inicio,DATE_FORMAT(data_fim, '%d/%m/%Y') AS data_fim,ativo FROM periodos_avaliativos WHERE usuario_id=? ORDER BY ativo DESC, data_inicio DESC, id DESC");
        $query->execute([$ownerId]);
        $periods = $query->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(array_map(static function (array $period): array {
            return [
                'id' => (int) $period['id'], 'name' => $period['nome'],
                'start' => $period['data_inicio'] ?: 'Data não informada',
                'end' => $period['data_fim'] ?: 'Data não informada',
                'active' => (bool) $period['ativo']
            ];
        }, $periods), JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($resource === 'periods' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
        $name = trim((string) ($input['name'] ?? ''));
        if ($name === '') throw new RuntimeException('Nome do período é obrigatório.');
        $pdo->beginTransaction();
        $deactivate = $pdo->prepare('UPDATE periodos_avaliativos SET ativo = 0 WHERE usuario_id=?');
        $deactivate->execute([$ownerId]);
        $insert = $pdo->prepare('INSERT INTO periodos_avaliativos (usuario_id,nome,data_inicio,data_fim,ativo) VALUES (?,?,?,?,1)');
        $insert->execute([$ownerId, $name, $input['start'] ?: null, $input['end'] ?: null]);
        $periodId = (int) $pdo->lastInsertId();
        $pdo->commit();
        echo json_encode(['id' => $periodId], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($resource === 'periods' && $_SERVER['REQUEST_METHOD'] === 'DELETE') {
        $periodId = (int) ($_GET['id'] ?? 0);
        if ($periodId <= 0) throw new RuntimeException('Período inválido.');
        $usage = $pdo->prepare('SELECT (SELECT COUNT(*) FROM pareceres p JOIN criancas c ON c.id=p.crianca_id WHERE p.periodo_id=? AND c.usuario_id=?) + (SELECT COUNT(*) FROM atividades WHERE periodo_id=? AND usuario_id=?)');
        $usage->execute([$periodId, $ownerId, $periodId, $ownerId]);
        if ((int) $usage->fetchColumn() > 0) throw new RuntimeException('Este período possui documentos ou atividades vinculados e não pode ser excluído.');
        $totalQuery = $pdo->prepare('SELECT COUNT(*) FROM periodos_avaliativos WHERE usuario_id=?');
        $totalQuery->execute([$ownerId]);
        $total = (int) $totalQuery->fetchColumn();
        if ($total <= 1) throw new RuntimeException('Mantenha pelo menos um período cadastrado.');
        $pdo->beginTransaction();
        $wasActive = $pdo->prepare('SELECT ativo FROM periodos_avaliativos WHERE id=? AND usuario_id=? FOR UPDATE');
        $wasActive->execute([$periodId, $ownerId]);
        $active = $wasActive->fetchColumn();
        if ($active === false) throw new RuntimeException('Período não encontrado.');
        $delete = $pdo->prepare('DELETE FROM periodos_avaliativos WHERE id=? AND usuario_id=?');
        $delete->execute([$periodId, $ownerId]);
        if ((int) $active === 1) {
            $activate = $pdo->prepare('UPDATE periodos_avaliativos SET ativo=1 WHERE usuario_id=? ORDER BY data_inicio DESC, id DESC LIMIT 1');
            $activate->execute([$ownerId]);
        }
        $pdo->commit();
        echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($resource === 'experience-fields' && $_SERVER['REQUEST_METHOD'] === 'GET') {
        $fields = $pdo->query('SELECT id,nome FROM campos_experiencia ORDER BY nome')->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(array_map(static function (array $field): array {
            return ['id' => (int) $field['id'], 'name' => $field['nome']];
        }, $fields), JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($resource === 'header-settings') {
        $settingKey = 'header_settings_' . $ownerId;
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $query = $pdo->prepare('SELECT setting_value FROM app_settings WHERE setting_key=? LIMIT 1');
            $query->execute([$settingKey]);
            $settings = json_decode((string) ($query->fetchColumn() ?: '{}'), true);
            echo json_encode(is_array($settings) ? $settings : [], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $input = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
            $settings = [
                'network' => trim((string) ($input['network'] ?? '')),
                'school' => trim((string) ($input['school'] ?? '')),
                'contact' => trim((string) ($input['contact'] ?? '')),
                'finalText' => trim((string) ($input['finalText'] ?? '')),
                'documentFont' => in_array((string) ($input['documentFont'] ?? ''), ['Arial', 'Times New Roman', 'Calibri', 'Georgia', 'Verdana', 'Courier New'], true) ? (string) $input['documentFont'] : 'Arial',
                'documentFontSize' => min(16, max(10, (int) ($input['documentFontSize'] ?? 12))),
                'detailColor' => preg_match('/^#[0-9a-fA-F]{6}$/', (string) ($input['detailColor'] ?? '')) ? (string) $input['detailColor'] : '#253c31',
                'logo' => preg_match('#^data:image/[\w.+-]+;base64,#', (string) ($input['logo'] ?? '')) ? (string) $input['logo'] : '',
            ];
            $save = $pdo->prepare('INSERT INTO app_settings (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)');
            $save->execute([$settingKey, json_encode($settings, JSON_UNESCAPED_UNICODE)]);
            echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
            exit;
        }
        http_response_code(405);
        throw new RuntimeException('Metodo nao permitido.');
    }
    if ($resource === 'experience-fields' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
        $name = trim((string) ($input['name'] ?? ''));
        if ($name === '') throw new RuntimeException('Informe o nome do campo de experiência.');
        $fieldId = (int) ($input['id'] ?? 0);
        if ($fieldId > 0) {
            $update = $pdo->prepare('UPDATE campos_experiencia SET nome=? WHERE id=?');
            $update->execute([$name, $fieldId]);
            if ($update->rowCount() === 0) {
                $check = $pdo->prepare('SELECT id FROM campos_experiencia WHERE id=?');
                $check->execute([$fieldId]);
                if (!$check->fetchColumn()) throw new RuntimeException('Campo de experiência não encontrado.');
            }
        } else {
            $insert = $pdo->prepare('INSERT INTO campos_experiencia (nome) VALUES (?)');
            $insert->execute([$name]);
            $fieldId = (int) $pdo->lastInsertId();
        }
        echo json_encode(['id' => $fieldId], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($resource === 'experience-fields' && $_SERVER['REQUEST_METHOD'] === 'DELETE') {
        $fieldId = (int) ($_GET['id'] ?? 0);
        $field = $pdo->prepare('SELECT nome FROM campos_experiencia WHERE id=?');
        $field->execute([$fieldId]);
        $name = $field->fetchColumn();
        if ($name === false) throw new RuntimeException('Campo de experiência não encontrado.');
        $usage = $pdo->prepare('SELECT COUNT(*) FROM atividades WHERE campo_experiencia=?');
        $usage->execute([$name]);
        if ((int) $usage->fetchColumn() > 0) throw new RuntimeException('Este campo está vinculado a atividades e não pode ser excluído.');
        $delete = $pdo->prepare('DELETE FROM campos_experiencia WHERE id=?');
        $delete->execute([$fieldId]);
        echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($resource === 'reports' && $_SERVER['REQUEST_METHOD'] === 'GET') {
        $detailId = (int) ($_GET['id'] ?? 0);
        $summary = !empty($_GET['summary']) && $detailId <= 0;
        if ($detailId > 0) {
            $query = $pdo->prepare("SELECT p.id,p.crianca_id,c.nome,c.data_nascimento,c.turma_id,p.texto,p.usar_texto_final,p.texto_final,p.tipo_documento,p.status,p.updated_at FROM pareceres p JOIN criancas c ON c.id=p.crianca_id WHERE p.id=? AND c.usuario_id=? ORDER BY p.updated_at DESC");
            $query->execute([$detailId, $ownerId]);
            $rows = $query->fetchAll(PDO::FETCH_ASSOC);
        } elseif ($summary) {
            $query = $pdo->prepare("SELECT p.id,p.crianca_id,c.nome,c.data_nascimento,c.turma_id,'' AS texto,0 AS usar_texto_final,'' AS texto_final,p.tipo_documento,p.status,p.updated_at,COUNT(pa.atividade_id) AS activity_count FROM pareceres p JOIN criancas c ON c.id=p.crianca_id LEFT JOIN parecer_atividades pa ON pa.parecer_id=p.id WHERE c.usuario_id=? GROUP BY p.id,p.crianca_id,c.nome,c.data_nascimento,c.turma_id,p.tipo_documento,p.status,p.updated_at ORDER BY p.updated_at DESC");
            $query->execute([$ownerId]);
            $rows = $query->fetchAll(PDO::FETCH_ASSOC);
        } else {
            $query = $pdo->prepare("SELECT p.id,p.crianca_id,c.nome,c.data_nascimento,c.turma_id,p.texto,p.usar_texto_final,p.texto_final,p.tipo_documento,p.status,p.updated_at FROM pareceres p JOIN criancas c ON c.id=p.crianca_id WHERE c.usuario_id=? ORDER BY p.updated_at DESC");
            $query->execute([$ownerId]);
            $rows = $query->fetchAll(PDO::FETCH_ASSOC);
        }
        $activityQuery=$pdo->prepare('SELECT atividade_id FROM parecer_atividades WHERE parecer_id=?');
        $blockQuery=$pdo->prepare('SELECT ordem,texto,activity_ids FROM parecer_blocos WHERE parecer_id=? ORDER BY ordem,id');
        $attachmentQuery=$summary?null:$pdo->prepare('SELECT ordem,contexto,arquivo,mime_type FROM parecer_anexos WHERE parecer_id=? ORDER BY ordem,id');
        $result=[]; foreach($rows as $row){$activityIds=[];$entries=[];if($summary){$activityIds=array_fill(0,max(0,(int)($row['activity_count']??0)),0);}else{$activityQuery->execute([$row['id']]);$activityIds=array_map('intval',$activityQuery->fetchAll(PDO::FETCH_COLUMN));$blockQuery->execute([$row['id']]);foreach($blockQuery->fetchAll(PDO::FETCH_ASSOC) as $block){$ids=json_decode((string)($block['activity_ids']??'[]'),true);$entries[(int)$block['ordem']]=['activityIds'=>is_array($ids)?array_map('intval',$ids):[],'photoNote'=>(string)($block['texto']??''),'photos'=>[]];}if($attachmentQuery){$attachmentQuery->execute([$row['id']]);foreach($attachmentQuery->fetchAll(PDO::FETCH_ASSOC) as $file){$key=(int)($file['ordem']??0);if(!isset($entries[$key]))$entries[$key]=['activityIds'=>[],'photoNote'=>(string)($file['contexto']??''),'photos'=>[]];$entries[$key]['photos'][]='data:'.$file['mime_type'].';base64,'.base64_encode($file['arquivo']);}}}ksort($entries);$result[]=['id'=>(int)$row['id'],'databaseId'=>(int)$row['id'],'studentId'=>'db-'.$row['crianca_id'],'name'=>$row['nome'],'birthDate'=>$row['data_nascimento'],'classId'=>(int)$row['turma_id'],'text'=>$row['texto'],'useFinalText'=>(bool)($row['usar_texto_final']??0),'finalText'=>(string)($row['texto_final']??''),'documentType'=>$row['tipo_documento']==='portfolio'?'portfolio':'parecer','activityIds'=>$activityIds,'entries'=>array_values($entries),'hasFullData'=>!$summary,'status'=>$row['status']==='concluido'?'done':'draft','deliveredAt'=>$row['status']==='concluido'?$row['updated_at']:null];}
        echo json_encode($result, JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($resource === 'reports' && $_SERVER['REQUEST_METHOD'] === 'DELETE') {
        $reportId = (int) ($_GET['id'] ?? 0);
        if ($reportId <= 0) throw new RuntimeException('Rascunho inválido.');
        $delete = $pdo->prepare("DELETE p FROM pareceres p JOIN criancas c ON c.id=p.crianca_id WHERE p.id = ? AND p.status = 'rascunho' AND c.usuario_id=?");
        $delete->execute([$reportId, $ownerId]);
        if ($delete->rowCount() === 0) throw new RuntimeException('Rascunho não encontrado ou já entregue.');
        echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($resource === 'send-report-email' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
        $reportId = (int) ($input['reportId'] ?? 0);
        if ($reportId <= 0) throw new RuntimeException('Documento invalido para envio.');
        $recipientEmail = trim((string) ($input['recipientEmail'] ?? ''));
        if ($recipientEmail === '' || !filter_var($recipientEmail, FILTER_VALIDATE_EMAIL)) {
            throw new RuntimeException('Informe um e-mail valido para receber o documento.');
        }
        $reportQuery = $pdo->prepare("SELECT p.id,p.texto,p.tipo_documento,p.status,c.nome,c.turma_id,t.nome AS turma_nome,pa.nome AS periodo_nome,u.email AS professora_email FROM pareceres p JOIN criancas c ON c.id=p.crianca_id LEFT JOIN turmas t ON t.id=c.turma_id LEFT JOIN periodos_avaliativos pa ON pa.id=p.periodo_id JOIN usuarios u ON u.id=c.usuario_id WHERE p.id=? AND c.usuario_id=? LIMIT 1");
        $reportQuery->execute([$reportId, $ownerId]);
        $report = $reportQuery->fetch(PDO::FETCH_ASSOC);
        if (!$report) throw new RuntimeException('Documento nao encontrado.');
        if (($report['status'] ?? '') !== 'concluido') throw new RuntimeException('Somente pareceres concluidos podem ser enviados por e-mail.');
        $blockQuery = $pdo->prepare('SELECT ordem,texto FROM parecer_blocos WHERE parecer_id=? ORDER BY ordem,id');
        $blockQuery->execute([$reportId]);
        $blocks = $blockQuery->fetchAll(PDO::FETCH_ASSOC);
        $attachmentQuery = $pdo->prepare('SELECT ordem,arquivo,mime_type FROM parecer_anexos WHERE parecer_id=? ORDER BY ordem,id');
        $attachmentQuery->execute([$reportId]);
        $attachments = $attachmentQuery->fetchAll(PDO::FETCH_ASSOC);
        $escape = static function (string $value): string {
            return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        };
        $documentLabel = ($report['tipo_documento'] ?? '') === 'portfolio' ? 'Portfolio' : 'Parecer pedagogico';
        $studentName = (string) ($report['nome'] ?? '');
        $periodName = (string) ($report['periodo_nome'] ?? 'periodo avaliativo');
        $customMessage = trim((string) ($input['message'] ?? ''));
        if ($customMessage === '') {
            $customMessage = "Segue {$documentLabel} referente ao {$periodName} da crianca {$studentName}.";
        }
        $html = '<h2>' . $escape($documentLabel . ' - ' . $studentName) . '</h2>';
        $html .= '<p>' . nl2br($escape($customMessage)) . '</p>';
        $html .= '<p><strong>Aluno:</strong> ' . $escape($studentName) . '<br><strong>Turma:</strong> ' . $escape((string) ($report['turma_nome'] ?? 'Turma nao informada')) . '</p>';
        foreach (preg_split('/\n{2,}/', trim((string) ($report['texto'] ?? ''))) as $paragraph) {
            if (trim($paragraph) !== '') $html .= '<p>' . nl2br($escape(trim($paragraph))) . '</p>';
        }
        foreach ($blocks as $block) {
            $note = trim((string) ($block['texto'] ?? ''));
            if ($note !== '') $html .= '<p><strong>Vivencias registradas:</strong><br>' . nl2br($escape($note)) . '</p>';
        }
        $boundary = '__AIPROF_' . bin2hex(random_bytes(8));
        $inlineParts = '';
        $imageIndex = 1;
        foreach ($attachments as $attachment) {
            $mime = preg_match('#^image/[\w.+-]+$#', (string) ($attachment['mime_type'] ?? '')) ? (string) $attachment['mime_type'] : 'application/octet-stream';
            if (!str_starts_with($mime, 'image/')) continue;
            $cid = 'parecer-img-' . $imageIndex . '@aiprof';
            $html .= '<p><img src="cid:' . $cid . '" alt="Imagem do parecer" style="max-width:520px;width:100%;height:auto"></p>';
            $inlineParts .= "--{$boundary}\r\n";
            $inlineParts .= "Content-Type: {$mime}; name=\"imagem-{$imageIndex}\"\r\n";
            $inlineParts .= "Content-Transfer-Encoding: base64\r\n";
            $inlineParts .= "Content-ID: <{$cid}>\r\n";
            $inlineParts .= "Content-Disposition: inline; filename=\"imagem-{$imageIndex}\"\r\n\r\n";
            $inlineParts .= chunk_split(base64_encode((string) $attachment['arquivo'])) . "\r\n";
            $imageIndex++;
        }
        $subject = $documentLabel . ' - ' . $studentName;
        $headers = "MIME-Version: 1.0\r\n";
        $headers .= "From: Ai Prof <no-reply@aiprof.local>\r\n";
        $replyTo = filter_var((string) ($report['professora_email'] ?? ''), FILTER_VALIDATE_EMAIL) ? (string) $report['professora_email'] : 'no-reply@aiprof.local';
        $headers .= "Reply-To: {$replyTo}\r\n";
        $headers .= "Content-Type: multipart/related; boundary=\"{$boundary}\"; type=\"text/html\"; charset=UTF-8\r\n";
        $body = "--{$boundary}\r\n";
        $body .= "Content-Type: text/html; charset=UTF-8\r\n";
        $body .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
        $body .= '<!doctype html><html><body style="font-family:Arial,sans-serif;color:#253c31">' . $html . '<p>Enviado por Ai Prof.</p></body></html>' . "\r\n";
        $body .= $inlineParts;
        $body .= "--{$boundary}--\r\n";
        if (!function_exists('mail') || !mail($recipientEmail, $subject, $body, $headers)) {
            throw new RuntimeException('Nao foi possivel enviar o e-mail. Verifique a configuracao de envio de e-mail do servidor.');
        }
        echo json_encode(['ok' => true, 'message' => 'Documento enviado para ' . $recipientEmail . '.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($resource === 'reports' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
        if (!empty($input['deliverId'])) { $update=$pdo->prepare("UPDATE pareceres p JOIN criancas c ON c.id=p.crianca_id SET p.status='concluido' WHERE p.id=? AND c.usuario_id=?");$update->execute([(int)$input['deliverId'],$ownerId]);if($update->rowCount()===0)throw new RuntimeException('Parecer não encontrado para entrega.');echo json_encode(['ok'=>true,'id'=>(int)$input['deliverId']]);exit; }
        if (!empty($input['reopenId'])) { $update=$pdo->prepare("UPDATE pareceres p JOIN criancas c ON c.id=p.crianca_id SET p.status='rascunho' WHERE p.id=? AND c.usuario_id=?");$update->execute([(int)$input['reopenId'],$ownerId]);if($update->rowCount()===0)throw new RuntimeException('Parecer não encontrado para reabertura.');echo json_encode(['ok'=>true,'id'=>(int)$input['reopenId']]);exit; }
        $editorMode = (string) ($input['imageEditorMode'] ?? 'none');
        if (!in_array($editorMode, ['none', 'manual', 'ai'], true) || !$canUseEditor($editorMode, $loadCurrentUser())) {
            http_response_code(403);
            throw new RuntimeException('Editor de imagem nao liberado para este usuario.');
        }
        $student = $input['student'] ?? [];
        $name = trim((string) ($student['name'] ?? ''));
        $classId = (int) ($student['classId'] ?? 1);
        $text = trim((string) ($input['text'] ?? ''));
        $documentType = ($input['documentType'] ?? '') === 'portfolio' ? 'portfolio' : 'parecer';
        if ($name === '' || ($text === '' && empty($input['draft']))) throw new RuntimeException('Dados do parecer inválidos.');
        $pdo->beginTransaction();
        $classCheck = $pdo->prepare('SELECT id FROM turmas WHERE id = ? AND usuario_id=?'); $classCheck->execute([$classId,$ownerId]);
        if (!$classCheck->fetchColumn()) { $classCheck=$pdo->prepare('SELECT id FROM turmas WHERE usuario_id=? ORDER BY id LIMIT 1');$classCheck->execute([$ownerId]);$classId=(int)$classCheck->fetchColumn(); }
        $birth = !empty($student['birthDate']) ? $student['birthDate'] : null;
        $child = $pdo->prepare('SELECT id FROM criancas WHERE nome = ? AND turma_id = ? AND usuario_id=? LIMIT 1'); $child->execute([$name, $classId, $ownerId]);
        $childId = (int) $child->fetchColumn();
        if (!$childId) { $insertChild=$pdo->prepare('INSERT INTO criancas (usuario_id,turma_id,nome,data_nascimento) VALUES (?,?,?,?)'); $insertChild->execute([$ownerId,$classId,$name,$birth]); $childId=(int)$pdo->lastInsertId(); }
        $periodQuery=$pdo->prepare('SELECT id FROM periodos_avaliativos WHERE ativo=1 AND usuario_id=? ORDER BY id DESC LIMIT 1');$periodQuery->execute([$ownerId]);$periodId=(int)$periodQuery->fetchColumn();
        if (!$periodId) { $periodQuery=$pdo->prepare('SELECT id FROM periodos_avaliativos WHERE usuario_id=? ORDER BY id DESC LIMIT 1');$periodQuery->execute([$ownerId]);$periodId=(int)$periodQuery->fetchColumn(); }
        $useFinalText = !empty($input['useFinalText']) ? 1 : 0;
        $finalText = trim((string) ($input['finalText'] ?? ''));
        $upsert=$pdo->prepare("INSERT INTO pareceres (crianca_id,periodo_id,texto,usar_texto_final,texto_final,tipo_documento,status) VALUES (?,?,?,?,?,?,'rascunho') ON DUPLICATE KEY UPDATE texto=VALUES(texto),usar_texto_final=VALUES(usar_texto_final),texto_final=VALUES(texto_final),tipo_documento=VALUES(tipo_documento),status=IF(status='concluido','concluido','rascunho')"); $upsert->execute([$childId,$periodId,$text,$useFinalText,$finalText,$documentType]);
        $reportId=(int)$pdo->lastInsertId(); if(!$reportId){$find=$pdo->prepare('SELECT id FROM pareceres WHERE crianca_id=? AND periodo_id=? AND tipo_documento=?');$find->execute([$childId,$periodId,$documentType]);$reportId=(int)$find->fetchColumn();}
        $ownedActivities=[];
        $activityOwnerCheck=$pdo->prepare('SELECT id FROM atividades WHERE id=? AND usuario_id=?');
        foreach(($input['activityIds']??[]) as $activityId){$activityId=(int)$activityId;$activityOwnerCheck->execute([$activityId,$ownerId]);if($activityOwnerCheck->fetchColumn())$ownedActivities[]=$activityId;}
        $pdo->prepare('DELETE FROM parecer_atividades WHERE parecer_id=?')->execute([$reportId]);
        $link=$pdo->prepare('INSERT IGNORE INTO parecer_atividades (parecer_id,atividade_id) VALUES (?,?)'); foreach(array_unique($ownedActivities) as $activityId){$link->execute([$reportId,$activityId]);}
        $pdo->prepare('DELETE FROM parecer_blocos WHERE parecer_id=?')->execute([$reportId]);
        $addBlock=$pdo->prepare('INSERT INTO parecer_blocos (parecer_id,ordem,texto,activity_ids) VALUES (?,?,?,?)');
        foreach(array_values($input['entries']??[]) as $index=>$entry){$ids=array_values(array_intersect(array_map('intval',$entry['activityIds']??[]),$ownedActivities));$addBlock->execute([$reportId,$index,(string)($entry['photoNote']??''),json_encode($ids)]);}
        $pdo->prepare('DELETE FROM parecer_anexos WHERE parecer_id=?')->execute([$reportId]);
        $add=$pdo->prepare('INSERT INTO parecer_anexos (parecer_id,ordem,contexto,arquivo,mime_type) VALUES (?,?,?,?,?)');
        foreach(array_values($input['entries']??[]) as $index=>$entry){foreach(($entry['photos']??[]) as $url){if(preg_match('#^data:([\w/+.-]+);base64,(.+)$#',$url,$m)){ $bin=base64_decode($m[2],true); if($bin!==false && strlen($bin)<=5*1024*1024)$add->execute([$reportId,$index,(string)($entry['photoNote']??''),$bin,$m[1]]); }}}
        $pdo->commit(); echo json_encode(['id'=>$reportId],JSON_UNESCAPED_UNICODE); exit;
    }
    if ($resource !== 'activities') {
        throw new RuntimeException('Recurso não encontrado.');
    }

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $query = $pdo->prepare('SELECT id, titulo, campo_experiencia, observacoes, DATE_FORMAT(data_atividade, "%d de %M") AS data FROM atividades WHERE usuario_id=? ORDER BY data_atividade DESC, id DESC');
        $query->execute([$ownerId]);
        $rows = $query->fetchAll(PDO::FETCH_ASSOC);
        $photoQuery = $pdo->prepare('SELECT mime_type, arquivo FROM atividade_fotos WHERE atividade_id = ? ORDER BY id');
        foreach ($rows as &$activity) {
            $photoQuery->execute([$activity['id']]);
            $activity['photos'] = array_map(
                static function (array $photo): string {
                    return 'data:' . $photo['mime_type'] . ';base64,' . base64_encode($photo['arquivo']);
                },
                $photoQuery->fetchAll(PDO::FETCH_ASSOC)
            );
            $activity = [
                'id' => (int) $activity['id'], 'title' => $activity['titulo'],
                'area' => $activity['campo_experiencia'], 'note' => $activity['observacoes'],
                'date' => $activity['data'], 'photos' => $activity['photos']
            ];
        }
        echo json_encode($rows, JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
        $activityId = (int) ($_GET['id'] ?? 0);
        if ($activityId <= 0) throw new RuntimeException('Atividade inválida.');

        $activityOwner = $pdo->prepare('SELECT id FROM atividades WHERE id=? AND usuario_id=?');
        $activityOwner->execute([$activityId, $ownerId]);
        if (!$activityOwner->fetchColumn()) throw new RuntimeException('Atividade nao encontrada.');

        $directUsage = $pdo->prepare('SELECT COUNT(*) FROM parecer_atividades pa JOIN atividades a ON a.id=pa.atividade_id WHERE pa.atividade_id=? AND a.usuario_id=?');
        $directUsage->execute([$activityId, $ownerId]);
        $usageCount = (int) $directUsage->fetchColumn();

        if ($usageCount === 0) {
            $blockUsageQuery = $pdo->prepare('SELECT pb.activity_ids FROM parecer_blocos pb JOIN pareceres p ON p.id=pb.parecer_id JOIN criancas c ON c.id=p.crianca_id WHERE c.usuario_id=?');
            $blockUsageQuery->execute([$ownerId]);
            $blockUsage = $blockUsageQuery->fetchAll(PDO::FETCH_COLUMN);
            foreach ($blockUsage as $jsonIds) {
                $ids = json_decode((string) $jsonIds, true);
                if (is_array($ids) && in_array($activityId, array_map('intval', $ids), true)) {
                    $usageCount = 1;
                    break;
                }
            }
        }

        if ($usageCount > 0) throw new RuntimeException('Esta atividade está vinculada a um parecer ou portfólio e não pode ser excluída.');

        $pdo->beginTransaction();
        $pdo->prepare('DELETE FROM atividade_fotos WHERE atividade_id=?')->execute([$activityId]);
        $delete = $pdo->prepare('DELETE FROM atividades WHERE id=? AND usuario_id=?');
        $delete->execute([$activityId, $ownerId]);
        if ($delete->rowCount() === 0) throw new RuntimeException('Atividade não encontrada.');
        $pdo->commit();
        echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        throw new RuntimeException('Método não permitido.');
    }

    $input = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
    $editorMode = (string) ($input['imageEditorMode'] ?? 'none');
    if (!in_array($editorMode, ['none', 'manual', 'ai'], true) || !$canUseEditor($editorMode, $loadCurrentUser())) {
        http_response_code(403);
        throw new RuntimeException('Editor de imagem nao liberado para este usuario.');
    }
    $title = trim((string) ($input['title'] ?? ''));
    $area = trim((string) ($input['area'] ?? ''));
    $note = trim((string) ($input['note'] ?? ''));
    $photos = $input['photos'] ?? [];
    if ($title === '' || $area === '' || !is_array($photos) || count($photos) > 30) {
        http_response_code(422);
        throw new RuntimeException('Dados da atividade inválidos.');
    }

    $activityId = (int) ($input['id'] ?? 0);
    $pdo->beginTransaction();
    if ($activityId > 0) {
        $update = $pdo->prepare('UPDATE atividades SET titulo=?, campo_experiencia=?, observacoes=? WHERE id=? AND usuario_id=?');
        $update->execute([$title, $area, $note, $activityId, $ownerId]);
        $exists = $pdo->prepare('SELECT id FROM atividades WHERE id=? AND usuario_id=?');
        $exists->execute([$activityId, $ownerId]);
        if (!$exists->fetchColumn()) throw new RuntimeException('Atividade não encontrada.');
        $pdo->prepare('DELETE FROM atividade_fotos WHERE atividade_id=?')->execute([$activityId]);
    } else {
        $classId=(int)($input['classId']??0);$classCheck=$pdo->prepare('SELECT id FROM turmas WHERE id=? AND usuario_id=?');$classCheck->execute([$classId,$ownerId]);if(!$classCheck->fetchColumn()){$classCheck=$pdo->prepare('SELECT id FROM turmas WHERE usuario_id=? ORDER BY id LIMIT 1');$classCheck->execute([$ownerId]);$classId=(int)$classCheck->fetchColumn();}
        $periodId=(int)($input['periodId']??0);$periodCheck=$pdo->prepare('SELECT id FROM periodos_avaliativos WHERE id=? AND usuario_id=?');$periodCheck->execute([$periodId,$ownerId]);if(!$periodCheck->fetchColumn()){$periodCheck=$pdo->prepare('SELECT id FROM periodos_avaliativos WHERE ativo=1 AND usuario_id=? ORDER BY id DESC LIMIT 1');$periodCheck->execute([$ownerId]);$periodId=(int)$periodCheck->fetchColumn();}
        $insert = $pdo->prepare('INSERT INTO atividades (usuario_id,turma_id, periodo_id, titulo, campo_experiencia, observacoes, data_atividade) VALUES (?, ?, ?, ?, ?, ?, CURDATE())');
        $insert->execute([$ownerId, $classId, $periodId, $title, $area, $note]);
        $activityId = (int) $pdo->lastInsertId();
    }
    $insertPhoto = $pdo->prepare('INSERT INTO atividade_fotos (atividade_id, arquivo, mime_type) VALUES (?, ?, ?)');
    foreach ($photos as $dataUrl) {
        if (!is_string($dataUrl) || !preg_match('#^data:([\w/+.-]+);base64,(.+)$#', $dataUrl, $matches)) {
            throw new RuntimeException('Formato de imagem inválido.');
        }
        $binary = base64_decode($matches[2], true);
        if ($binary === false || strlen($binary) > 5 * 1024 * 1024) {
            throw new RuntimeException('A imagem deve ter até 5 MB.');
        }
        $insertPhoto->execute([$activityId, $binary, $matches[1]]);
    }
    $pdo->commit();
    http_response_code((int) ($input['id'] ?? 0) > 0 ? 200 : 201);
    echo json_encode(['id' => $activityId], JSON_UNESCAPED_UNICODE);
} catch (Throwable $error) {
    try {
        if (isset($pdo) && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
    } catch (Throwable $ignored) {
        // A conexão pode cair em uma falha do servidor; a API ainda deve devolver JSON.
    }
    if (http_response_code() === 200) {
        http_response_code(500);
    }
    echo json_encode(['error' => $error->getMessage()], JSON_UNESCAPED_UNICODE);
}
