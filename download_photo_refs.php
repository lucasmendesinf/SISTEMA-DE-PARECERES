<?php
// Fotos dos blocos podem chegar ao gerador do Word/PDF apenas como referencia
// ({"ref": sha256}). Assim o envio fica pequeno e a hospedagem nao recusa por tamanho
// (erro 413). As fotos reais vem do banco, somente de documentos do usuario logado.
function resolveDownloadPhotoRefs(array $entries, int $reportId): array
{
    $needsLookup = false;
    foreach ($entries as $entry) {
        foreach (($entry['photos'] ?? []) as $photo) {
            if (is_array($photo) && isset($photo['ref'])) { $needsLookup = true; break 2; }
        }
    }
    if (!$needsLookup) return $entries;

    $fail = static function (int $status, string $message): never {
        http_response_code($status);
        header('Content-Type: text/plain; charset=utf-8');
        exit($message);
    };
    if (session_status() !== PHP_SESSION_ACTIVE) @session_start();
    $userId = (int) ($_SESSION['user_id'] ?? 0);
    if ($userId <= 0) $fail(401, 'Sua sessao expirou. Entre no sistema novamente e baixe o documento.');
    if ($reportId <= 0) $fail(422, 'Documento nao identificado para baixar as fotos.');

    $config = require __DIR__ . '/config.php';
    $pdo = new PDO(
        "mysql:host={$config['host']};port={$config['port']};dbname={$config['database']};charset=utf8mb4",
        $config['username'],
        $config['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    $query = $pdo->prepare('SELECT pa.arquivo,pa.mime_type FROM parecer_anexos pa JOIN pareceres p ON p.id=pa.parecer_id JOIN criancas c ON c.id=p.crianca_id WHERE pa.parecer_id=? AND c.usuario_id=? AND SHA2(pa.arquivo,256)=? LIMIT 1');
    $cache = [];
    foreach ($entries as $entryIndex => $entry) {
        $photos = [];
        foreach (($entry['photos'] ?? []) as $photo) {
            if (!is_array($photo) || !isset($photo['ref'])) { $photos[] = $photo; continue; }
            $hash = strtolower((string) $photo['ref']);
            if (!isset($cache[$hash])) {
                $query->execute([$reportId, $userId, $hash]);
                $row = $query->fetch(PDO::FETCH_ASSOC);
                if (!$row) $fail(409, 'Uma foto do documento nao foi encontrada no servidor. Abra o documento, salve novamente e tente baixar de novo.');
                $cache[$hash] = 'data:' . $row['mime_type'] . ';base64,' . base64_encode($row['arquivo']);
            }
            $photos[] = $cache[$hash];
        }
        $entries[$entryIndex]['photos'] = $photos;
    }
    return $entries;
}
