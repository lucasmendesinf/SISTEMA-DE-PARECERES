<?php
declare(strict_types=1);

// Load the real API closures without bootstrapping a database or calling a provider.
function apiClosure(string $name): string
{
    $tokens = token_get_all(file_get_contents(__DIR__ . '/../api.php'));
    foreach ($tokens as $index => $token) {
        if (!is_array($token) || $token[0] !== T_VARIABLE || $token[1] !== '$' . $name) continue;
        $next = $index + 1;
        while (is_array($tokens[$next]) && $tokens[$next][0] === T_WHITESPACE) $next++;
        if ($tokens[$next] !== '=') continue;
        $code = '';
        $depth = 0;
        $hasBody = false;
        for ($i = $index; $i < count($tokens); $i++) {
            $part = $tokens[$i];
            $code .= is_array($part) ? $part[1] : $part;
            if ($part === '{' || (is_array($part) && in_array($part[0], [T_CURLY_OPEN, T_DOLLAR_OPEN_CURLY_BRACES], true))) {
                $depth++;
                $hasBody = true;
            }
            if ($part === '}') $depth--;
            if ($part === ';' && $hasBody && $depth === 0) return $code;
        }
    }
    throw new RuntimeException('API closure not found: ' . $name);
}

$checks = 0;
function checkSame($expected, $actual, string $label): void
{
    global $checks;
    if ($expected !== $actual) throw new RuntimeException($label . ': ' . var_export($actual, true));
    $checks++;
}

set_error_handler(static function (int $severity, string $message, string $file, int $line): void {
    throw new ErrorException($message, 0, $severity, $file, $line);
});

$pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->sqliteCreateFunction('NOW', static fn(): string => date('Y-m-d H:i:s'));
$pdo->exec("CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY, nome TEXT, email TEXT, telefone TEXT, perfil TEXT,
    permissoes TEXT DEFAULT '[]', ativo INTEGER DEFAULT 1, image_editor_permission TEXT,
    billing_plan TEXT DEFAULT 'Basico', billing_cycle TEXT DEFAULT 'monthly',
    billing_cycle_id INTEGER DEFAULT 1, billing_amount REAL DEFAULT 14.90,
    billing_status TEXT, billing_next_due_date TEXT, billing_payment_method TEXT DEFAULT 'both',
    billing_trial_days INTEGER DEFAULT 7, terms_accepted_at TEXT, terms_version TEXT, terms_ip TEXT,
    mercado_pago_last_payment_id TEXT, mercado_pago_subscription_id TEXT
)");
$pdo->exec("CREATE TABLE billing_cycles (id INTEGER PRIMARY KEY, month_count INTEGER)");
$pdo->exec("INSERT INTO billing_cycles VALUES (1,1)");
$pdo->exec("CREATE TABLE billing_payments (
    id INTEGER PRIMARY KEY, usuario_id INTEGER, type TEXT, status TEXT, amount REAL,
    due_date TEXT, paid_at TEXT, description TEXT, external_id TEXT
)");
$termsVersion = 'test-terms';
$currentUser = null;
$billingSelect = 'billing_plan,billing_cycle,billing_cycle_id,billing_amount,billing_status,billing_next_due_date,billing_payment_method,billing_trial_days';
foreach (['billingDateFrom', 'billingIsCovered', 'billingAlertFor', 'billingLockFor', 'publicUser', 'billingRequiresPayment', 'paymentMethodsAvailable', 'loadCurrentUser', 'auditBillingAccess', 'nextBillingDate', 'activatePaidUser'] as $name) {
    eval(apiClosure($name));
}

$base = ['id' => 1, 'nome' => 'Cliente de teste', 'email' => 'isento@example.test', 'perfil' => 'cliente', 'billing_status' => 'exempt', 'billing_amount' => 14.90, 'billing_trial_days' => 7];
$dates = [null, '0000-00-00'];
foreach ([-30, -8, -6, -1, 0, 1, 5, 30] as $days) $dates[] = (new DateTimeImmutable('today'))->modify("{$days} days")->format('Y-m-d');
foreach ($dates as $date) {
    $row = $base + ['billing_next_due_date' => $date];
    checkSame(true, $billingIsCovered($row), 'Exempt has access regardless of due date');
    checkSame(null, $billingAlertFor($row), 'No billing alert');
    checkSame(null, $billingLockFor($row), 'No billing lock');
    checkSame(false, $billingRequiresPayment($row), 'Login requires no payment');
    checkSame([], $paymentMethodsAvailable($publicUser($row)['billing']), 'No payment methods');
    checkSame('exempt', $auditBillingAccess($row)['billing_status'], 'Audit preserves exemption');
}
$stale = $publicUser($base + ['billing_warning' => 'Old warning', 'billing_alert' => ['message' => 'Old invoice'], 'billing_lock' => ['locked' => true]]);
foreach (['billingWarning', 'billingAlert', 'billingLock'] as $key) checkSame(null, $stale[$key], 'Drops stale ' . $key);

$oldDue = (new DateTimeImmutable('today'))->modify('-30 days')->format('Y-m-d');
foreach (['pending', 'overdue', 'active', 'trial'] as $status) {
    $row = array_replace($base, ['billing_status' => $status, 'billing_next_due_date' => $oldDue]);
    checkSame(true, $billingLockFor($row)['locked'], 'Non-exempt overdue access stays locked');
    checkSame('danger', $billingAlertFor($row)['level'], 'Non-exempt keeps invoice alert');
}
$trial = array_replace($base, ['billing_status' => 'trial', 'billing_next_due_date' => date('Y-m-d', strtotime('+7 days'))]);
checkSame(null, $billingLockFor($trial), 'Valid trial remains open');
checkSame(null, $billingAlertFor($trial), 'Valid trial has no early alert');
checkSame(['pix', 'card'], $paymentMethodsAvailable(['status' => 'active', 'paymentMethod' => 'both']), 'Paid plans keep methods');

$insert = $pdo->prepare('INSERT INTO usuarios (id,nome,email,perfil,billing_status,billing_next_due_date) VALUES (?,?,?,?,?,?)');
$insert->execute([1, 'Isento', 'isento@example.test', 'cliente', 'exempt', $oldDue]);
$insert->execute([2, 'Pagante', 'pagante@example.test', 'cliente', 'pending', $oldDue]);
$_SESSION = ['user_id' => 1];
$loaded = $loadCurrentUser();
checkSame('exempt', $loaded['billing_status'], 'Logged user keeps exemption');
checkSame(null, $loaded['billing_lock'], 'No server resource lock for logged exempt');

$loadBillingCycle = $legacyCycleFromMonths = static function () { throw new RuntimeException('Unexpected plan change'); };
eval(apiClosure('applyBillingChoice'));
checkSame($loaded, $applyBillingChoice($loaded, ['cycleId' => 2, 'plan' => 'Other']), 'Stale checkout cannot change exempt plan');
$mercadoPagoRequest = $billingCycleFrequency = $billingCycleType = $getMercadoPagoSettings = $validBackUrl = $currentPublicUrl = static function () { throw new RuntimeException('Unexpected provider call'); };
eval(apiClosure('createMercadoPagoPayment'));
foreach (['pix', 'card'] as $method) {
    try {
        $createMercadoPagoPayment($loaded, $method);
        throw new RuntimeException('Payment should not be created');
    } catch (RuntimeException $error) {
        checkSame('Esta conta esta isenta de pagamento.', $error->getMessage(), 'Reject exempt payment before provider call');
    }
}

$confirmation = $activatePaidUser(1, 'old-payment');
checkSame('exempt', $confirmation['status'], 'Old confirmation does not revoke exemption');
checkSame($oldDue, $confirmation['nextDueDate'], 'Old confirmation does not change exempt due date');
checkSame(1, (int) $pdo->query("SELECT COUNT(*) FROM billing_payments WHERE external_id='old-payment' AND status='approved'")->fetchColumn(), 'Preserves received payment history');
$activatePaidUser(1, 'old-payment');
checkSame(1, (int) $pdo->query("SELECT COUNT(*) FROM billing_payments WHERE external_id='old-payment'")->fetchColumn(), 'Repeated confirmation does not duplicate history');
$confirmation = $activatePaidUser(2, 'normal-payment');
checkSame('active', $confirmation['status'], 'Normal payment still activates account');
checkSame($nextBillingDate(1, $oldDue), $confirmation['nextDueDate'], 'Normal payment still renews due date');

echo "OK: {$checks} billing exemption checks (isolated in-memory database)\n";
