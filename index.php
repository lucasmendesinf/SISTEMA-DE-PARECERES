<?php
// Portal Pareceres — aplicação local, sem dependências externas.
session_start();
if (empty($_SESSION['user_id'])) {
  header('Location: login.php');
  exit;
}
$bootstrapUser = [
  'id' => (int) $_SESSION['user_id'],
  'name' => 'Usuário logado',
  'role' => 'cliente',
  'permissions' => [],
];
if (!empty($_SESSION['bootstrap_user']) && is_array($_SESSION['bootstrap_user'])) {
  $sessionBootstrap = $_SESSION['bootstrap_user'];
  $bootstrapUser = [
    'id' => (int) ($sessionBootstrap['id'] ?? $_SESSION['user_id']),
    'name' => (string) ($sessionBootstrap['name'] ?? 'Usuário logado'),
    'email' => (string) ($sessionBootstrap['email'] ?? ''),
    'phone' => (string) ($sessionBootstrap['phone'] ?? ''),
    'role' => (string) ($sessionBootstrap['role'] ?? 'cliente'),
    'permissions' => is_array($sessionBootstrap['permissions'] ?? null) ? array_values(array_filter($sessionBootstrap['permissions'], 'is_string')) : [],
  ];
}
try {
  $config = require __DIR__ . '/config.php';
  $pdo = new PDO(
    "mysql:host={$config['host']};port={$config['port']};dbname={$config['database']};charset=utf8mb4",
    $config['username'],
    $config['password'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
  );
  $query = $pdo->prepare('SELECT id,nome,email,telefone,perfil,permissoes FROM usuarios WHERE id=? LIMIT 1');
  $query->execute([(int) $_SESSION['user_id']]);
  $row = $query->fetch(PDO::FETCH_ASSOC);
  if ($row) {
    $permissions = json_decode((string) ($row['permissoes'] ?? '[]'), true);
    $bootstrapUser = [
      'id' => (int) $row['id'],
      'name' => (string) $row['nome'],
      'email' => (string) ($row['email'] ?? ''),
      'phone' => (string) ($row['telefone'] ?? ''),
      'role' => (string) ($row['perfil'] ?? 'cliente'),
      'permissions' => is_array($permissions) ? array_values(array_filter($permissions, 'is_string')) : [],
    ];
    $_SESSION['bootstrap_user'] = $bootstrapUser;
  }
} catch (Throwable $ignored) {
  // A API ainda valida a sessao; aqui e apenas para evitar atraso visual no primeiro carregamento.
}
$initials = static function (string $name): string {
  $parts = preg_split('/\s+/', trim($name)) ?: [];
  $letters = '';
  foreach (array_slice(array_filter($parts), 0, 2) as $part) {
    $letters .= preg_match('/./u', $part, $match) ? $match[0] : substr($part, 0, 1);
  }
  return strtoupper($letters ?: 'AP');
};
$canSee = static function (string $view) use ($bootstrapUser): bool {
  if (($bootstrapUser['role'] ?? 'cliente') === 'master') return true;
  if ($view === 'inicio' || $view === 'configuracoes') return true;
  $permissions = $bootstrapUser['permissions'] ?? [];
  $map = [
    'criancas' => 'alunos',
    'turmas' => 'turmas',
    'periodos' => 'periodos',
    'atividades' => 'atividades',
    'pareceres' => 'pareceres',
  ];
  if ($view === 'pareceres' && in_array('portfolio', $permissions, true)) return true;
  return isset($map[$view]) && in_array($map[$view], $permissions, true);
};
$isMaster = ($bootstrapUser['role'] ?? 'cliente') === 'master';
$profileRole = $isMaster ? 'Master' : 'Professora';
$escape = static fn($value): string => htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
?><!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ai Prof. | Educação Infantil</title>
  <meta name="theme-color" content="#196b52">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Ai Prof.">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <link rel="manifest" href="manifest.json">
  <link rel="apple-touch-icon" href="assets/pwa/icon-192.png">
  <link rel="stylesheet" href="style.css?v=20260709-camera-touch-only-1">
  <link rel="stylesheet" href="mobile-menu.css?v=20260709-sidebar-scroll-1">
  <link rel="stylesheet" href="activity-pagination.css">
  <link rel="stylesheet" href="report-type-badge.css">
  <link rel="stylesheet" href="experience-fields.css">
  <link rel="stylesheet" href="brand-logo.css">
  <link rel="stylesheet" href="user-profile.css?v=20260716-trial-plan-choice-1">
  <link rel="stylesheet" href="billing-lock.css?v=20260703-billing-lock-3">
  <link rel="stylesheet" href="marketing-notice.css?v=20260702-marketing-notice-list-1">
  <link rel="stylesheet" href="terms-consent.css?v=20260716-terms-link-1">
  <link rel="stylesheet" href="google-drive-integration.css?v=20260716-drive-choice-1">
  <link rel="stylesheet" href="master-users.css?v=20260705-billing-cycles-1">
  <link rel="stylesheet" href="finance-admin.css?v=20260703-finance-due-filter-1">
  <link rel="stylesheet" href="image-editors.css?v=20260709-activity-photo-picker-front-1">
  <link rel="stylesheet" href="document-style.css?v=20260706-paragraph-indent-1">
  <link rel="stylesheet" href="tutorial-videos.css?v=20260706-video-before-onboarding-2">
  <link rel="stylesheet" href="document-image-zoom.css?v=20260702-document-image-zoom-front-1">
  <link rel="stylesheet" href="onboarding.css?v=20260703-initial-setup-lock-1">
  <style>.sidebar-bottom .help{display:none!important}</style>
  <style>.image-previews{display:flex;gap:8px;flex-wrap:wrap}.image-previews img,.activity-photos img{width:64px;height:64px;object-fit:cover;border-radius:7px;border:1px solid #e7ebe8}.activity-photos{display:flex;gap:6px;margin-top:14px;flex-wrap:wrap}.review-box .activity-photos{display:grid;grid-template-columns:repeat(2,minmax(0,229px));justify-content:center;gap:20px;margin:22px auto 30px;align-items:start;max-width:515px;overflow:hidden}.review-box .activity-photos img{width:100%;height:auto;max-height:409px;border-radius:0;object-fit:contain;border:0;display:block}.ai-adjust{border:0;background:none;color:#236b52;font:500 11px 'DM Sans',sans-serif;padding:7px 0 0;cursor:pointer}.ai-adjust:hover{text-decoration:underline}.linked-activities{border:1px solid #e7ebe8;border-radius:7px;max-height:210px;overflow:auto}.linked-activity{display:flex;align-items:center;gap:9px;padding:9px;border-bottom:1px solid #edf0ed;cursor:pointer}.linked-activity:last-child{border:0}.linked-activity input{width:auto}.linked-activity span{display:grid;gap:2px;flex:1}.linked-activity small{color:#73817b;font-size:11px}.linked-activity img{width:38px;height:38px;object-fit:cover;border-radius:5px}dialog.wizard{width:min(850px,calc(100% - 40px));max-width:850px}dialog.wizard::backdrop{background:rgba(20,28,25,.8)}.wizard-step{color:#236b52;font-size:11px;font-weight:700;letter-spacing:.8px}.wizard textarea{min-height:300px;font-size:15px;line-height:1.65}.review-box{background:#fff;border:1px solid #e7ebe8;border-radius:9px;padding:42px 57px;max-height:430px;overflow-y:auto;overflow-x:hidden;font-family:Arial,sans-serif;font-size:16px;line-height:1.5;text-align:justify}.review-box p{margin:0 0 18px;text-indent:1.25cm}.document-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:38px;font:600 9px Arial,sans-serif;color:#3980d4;text-align:left;white-space:pre-line}.document-header img{max-width:145px;max-height:80px;object-fit:contain;margin-left:20px}.document-student{display:flex;gap:22px;justify-content:space-between;align-items:flex-start;margin-bottom:30px;font:10pt Arial,sans-serif;text-align:left}.document-student p{margin:0 0 7px;text-indent:0}.document-student img{width:128px;height:148px;object-fit:cover;border:1px solid #25342e}.editable-paragraph,.editable-entry{position:relative;border-radius:8px;padding:7px 9px;margin:0 -9px 8px}.editable-paragraph:hover,.editable-entry:hover{background:#f7faf7}.editable-paragraph>button,.entry-actions button,.review-toolbar button,.wizard-photo-item button{font:600 11px 'DM Sans',sans-serif}.editable-paragraph>button{display:block;margin:-10px 0 12px auto;border:0;background:none;color:#236b52;cursor:pointer}.entry-actions{display:flex;justify-content:center;gap:8px;margin:-10px 0 20px}.entry-actions button{border:1px solid #d4dfd7;background:white;color:#236b52;border-radius:999px;padding:6px 10px;cursor:pointer}.review-toolbar{display:flex;gap:10px;justify-content:flex-end;margin:0 0 12px}.wizard-photo-item{position:relative}.wizard-photo-item button{position:absolute;right:-6px;top:-7px;width:22px;height:22px;border:0;border-radius:50%;background:#b74343;color:#fff;cursor:pointer;line-height:1}.file-links{display:flex;gap:8px;margin-top:5px}.file-links a{font-size:12px;color:#236b52;text-decoration:none}.dropzone{border:2px dashed #a8c6b3;border-radius:10px;padding:24px;text-align:center;color:#4b7760;background:#f4faf5;cursor:pointer}.dropzone.drag{background:#e4f1e9;border-color:#236b52}.dropzone input{display:none}.dropzone strong{display:block;color:#236b52;margin-bottom:3px}</style>
</head>
<body data-role="<?= $escape($bootstrapUser['role']) ?>">
  <aside class="sidebar" aria-label="Menu principal">
    <button class="mobile-menu-close" id="closeMenu" type="button" aria-label="Fechar menu">×</button>
    <div class="brand"><img class="brand-logo" src="assets/ai-prof-logo-transparent.png" alt="Ai Prof."></div>
    <p class="school">REDE MUNICIPAL DE ENSINO</p>
    <nav>
      <button class="nav-item active" data-view="inicio"><span>⌂</span> Início</button>
      <?php if ($canSee('criancas')): ?><button class="nav-item" data-view="criancas"><span>♙</span> Alunos</button><?php endif; ?>
      <?php if ($canSee('turmas')): ?><button class="nav-item" data-view="turmas"><span>♧</span> Turmas</button><?php endif; ?>
      <?php if ($canSee('periodos')): ?><button class="nav-item" data-view="periodos"><span>◷</span> Períodos</button><?php endif; ?>
      <?php if ($canSee('atividades')): ?><button class="nav-item" data-view="atividades"><span>▣</span> Atividades</button><?php endif; ?>
      <?php if ($canSee('pareceres')): ?><button class="nav-item" data-view="pareceres"><span>▤</span> Pareceres</button><?php endif; ?>
      <button class="nav-item" data-view="tutoriais"><span>▶</span> Tutoriais</button>
      <button class="nav-item" data-view="configuracoes"><span>⚙</span> Configurações</button>
      <?php if ($isMaster): ?><button class="nav-item" data-view="informativoMarketing"><span aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11v2a2 2 0 0 0 2 2h2l4 5v-5h2l7 3V6l-7 3H5a2 2 0 0 0-2 2Z"/><path d="M17 9.5v5"/><path d="M7 15v4"/></svg></span> Informativo</button><?php endif; ?>
      <?php if ($isMaster): ?><button class="nav-item" data-view="usuarios"><span>@</span> Usuarios</button><?php endif; ?>
      <?php if ($isMaster): ?><button class="nav-item" data-view="financeiro"><span>$</span> Financeiro</button><?php endif; ?>
    </nav>
    <div class="sidebar-bottom"><a class="help" href="https://wa.me/5541996310725" target="_blank" rel="noopener noreferrer">◌ Suporte</a><div class="profile" aria-haspopup="true" aria-expanded="false"><div class="avatar"><?= $escape($initials($bootstrapUser['name'])) ?></div><div><strong><?= $escape($bootstrapUser['name']) ?></strong><small><?= $escape($profileRole) ?></small></div></div><div class="profile-menu" hidden><button type="button" id="sidebarProfileButton">Meus dados</button><button type="button" id="sidebarLogoutButton" class="danger">Sair do sistema</button></div></div>
  </aside>
  <button class="mobile-menu-overlay" id="mobileMenuOverlay" type="button" aria-label="Fechar menu"></button>
  <a class="floating-help" href="https://wa.me/5541996310725" target="_blank" rel="noopener noreferrer" aria-label="Abrir suporte pelo WhatsApp" title="Suporte">?</a>

  <main>
    <header><div><button class="crumb" id="menuButton">☰</button><span id="headerTitle">Visão geral</span></div><div class="term">1º semestre de 2026</div></header>

    <section id="inicio" class="view active">
      <div class="welcome"><div><p class="eyebrow">SEGUNDA-FEIRA, 22 DE JUNHO</p><h1>Bom dia, professora! <span>☀</span></h1><p>Vamos acompanhar as descobertas da sua turma hoje?</p></div><button class="primary" type="button" data-new-document="true">+ Gerar Documento Pedagógico</button></div>
      <div class="stats">
        <article><span class="stat-icon lilac">♙</span><div><b id="studentCount">0</b><p>Alunos na turma</p></div></article>
        <article><span class="stat-icon orange">▣</span><div><b id="activityCount">0</b><p>Atividades registradas</p></div></article>
        <article><span class="stat-icon green">✓</span><div><b id="reportCount">0</b><p>Pareceres concluídos</p></div></article>
      </div>
      <div class="grid-two"><section class="panel"><div class="panel-head"><div><h2>Próximos pareceres</h2><p>Alunos que ainda aguardam parecer neste período</p></div><button class="text-button" data-go="pareceres">Ver todos</button></div><div id="pendingList" class="simple-list"></div></section><section class="panel highlight"><p class="eyebrow">DICA PEDAGÓGICA</p><h2>Registre pequenas conquistas</h2><p>Uma observação breve após cada atividade torna o parecer mais sensível, completo e fiel ao percurso de cado aluno.</p><button class="text-button" data-go="atividades">Registrar atividade →</button></section></div>
    </section>

    <section id="criancas" class="view"><div class="page-title"><div><p class="eyebrow">TURMA JARDIM II A</p><h1>Alunos</h1><p>Organize o acompanhamento individual da sua turma.</p></div><button class="primary" id="addStudent">+ Novo aluno</button></div><div class="panel"><div class="toolbar"><input id="studentSearch" placeholder="Buscar aluno..." type="search"><span id="studentsTotal"></span></div><div id="studentsList" class="card-list"></div></div></section>

    <section id="turmas" class="view"><div class="page-title"><div><p class="eyebrow">ORGANIZAÇÃO ESCOLAR</p><h1>Turmas</h1><p>Cadastre as turmas para organizar os alunos e seus pareceres.</p></div><button class="primary" id="addClass">+ Nova turma</button></div><div class="panel"><div id="classesList" class="card-list"></div></div></section>

    <section id="periodos" class="view"><div class="page-title"><div><p class="eyebrow">ORGANIZAÇÃO ESCOLAR</p><h1>Períodos avaliativos</h1><p>Defina os períodos que serão usados nos pareceres pedagógicos.</p></div><button class="primary" id="addPeriod">+ Novo período</button></div><div class="panel"><div id="periodsList" class="card-list"></div></div></section>

    <section id="atividades" class="view"><div class="page-title"><div><p class="eyebrow">MEMÓRIAS DA TURMA</p><h1>Atividades</h1><p>Registros que ajudam a construir pareceres mais significativos.</p></div><button class="primary" id="addActivity">+ Registrar atividade</button></div><div class="toolbar"><input id="activitySearch" type="search" placeholder="Buscar atividade..."></div><div id="activitiesList" class="activity-grid"></div><div id="emptyActivities" class="empty-state"><span>▣</span><h2>A turma ainda não tem atividades registradas</h2><p>Registre vivências, propostas e observações para usá-las na geração dos pareceres.</p><button class="primary" id="emptyAddActivity">Registrar primeira atividade</button></div></section>

    <section id="pareceres" class="view"><div class="page-title"><div><p class="eyebrow">1º SEMESTRE DE 2026</p><h1>Pareceres e Portfólios</h1><p>Crie, revise e compartilhe os registros da turma.</p></div><button class="primary" id="openGenerator">+ Novo documento</button></div><div class="notice"><span>✦</span><div><strong>Seu olhar é essencial</strong><p>Escreva livremente o parecer. Se desejar, use a opção discreta de IA para ajustar o texto que você produziu.</p></div></div><div class="panel"><div class="tabs"><button class="tab active" data-filter="all">Todos</button><button class="tab" data-filter="draft">Em elaboração</button><button class="tab" data-filter="done">Concluídos</button></div><div id="reportsList" class="report-list"></div></div></section>
    <section id="tutoriais" class="view"><div class="page-title"><div><p class="eyebrow">CENTRAL DE AJUDA</p><h1>Tutoriais</h1><p>Pesquise por titulo e assista ao video que explica a duvida.</p></div></div><div id="tutorialAdminPanel"></div><div class="panel tutorial-search-panel"><div class="toolbar"><input id="tutorialSearch" type="search" placeholder="Pesquisar tutorial por titulo..."><span id="tutorialTotal"></span></div><div id="tutorialList" class="tutorial-grid"></div></div></section>
    <section id="configuracoes" class="view"><div class="page-title"><div><p class="eyebrow">PERFIL DA PROFESSORA</p><h1>Configurações do Cabeçalho</h1><p>Personalize o cabeçalho exibido nos pareceres gerados.</p></div></div><div class="panel"><div class="form-grid"><div class="field"><label>Nome da rede ou secretaria</label><input id="headerNetwork" placeholder="Ex.: Secretaria Municipal de Educação"></div><div class="field"><label>Unidade escolar</label><input id="headerSchool" placeholder="Ex.: CMEI Nome da Unidade"></div><div class="field"><label>Endereço e contato</label><textarea id="headerContact" rows="3" placeholder="Endereço, telefone e e-mail"></textarea></div><div class="field"><label>Logo institucional</label><input id="headerLogo" type="file" accept="image/*"><div id="headerLogoPreview" class="image-previews"></div></div></div><div class="form-actions"><button class="primary" id="saveHeaderSettings">Salvar configurações</button></div></div><div class="panel mercado-pago-panel"><div class="profile-subtitle"><h3>Mercado Pago</h3><p>Cadastre as credenciais usadas para Pix e cartão recorrente.</p></div><div class="form-grid"><div class="field"><label>Access Token</label><input id="mpAccessToken" type="password" autocomplete="off" placeholder="Cole o Access Token"></div><div class="field"><label>Public Key</label><input id="mpPublicKey" autocomplete="off" placeholder="Cole a Public Key"></div><div class="field"><label>Webhook Secret</label><input id="mpWebhookSecret" type="password" autocomplete="off" placeholder="Opcional"></div><div class="field"><label>URL de sucesso</label><input id="mpSuccessUrl" placeholder="http://localhost/Pareceres/login.php?payment=success"></div><div class="field"><label>URL de falha</label><input id="mpFailureUrl" placeholder="http://localhost/Pareceres/login.php?payment=failure"></div></div><p id="mpSettingsStatus" class="profile-message"></p><div class="form-actions"><button class="primary" id="saveMercadoPagoSettings" type="button">Salvar Mercado Pago</button></div></div></section>
  </main>

  <dialog id="modal"><form method="dialog" id="modalForm" novalidate><button class="close" type="button" formnovalidate aria-label="Fechar" onclick="event.preventDefault();event.stopPropagation();this.closest('dialog').close();return false;">×</button><div id="modalContent"></div></form></dialog>
  <script>window.PortalBootstrapUser = <?= json_encode($bootstrapUser, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>;</script>
  <script src="app.js?v=20260715-keep-current-menu-1"></script>
  <script src="document-type.js?v=20260704-pdf-image-compress-1"></script>
  <script src="mobile-menu.js"></script>
  <script src="draft-delete.js"></script>
  <script src="periods.js"></script>
  <script src="activity-pagination.js"></script>
  <script src="classes-student-edit.js"></script>
  <script src="activities-edit.js?v=20260709-mobile-camera-only-1"></script>
  <script src="experience-fields.js?v=20260709-mobile-camera-only-1"></script>
  <script src="modal-controls.js?v=20260715-onboarding-draft-1"></script>
  <script src="report-type-badge.js"></script>
  <script src="report-editor.js?v=20260715-deliver-keeps-done-1"></script>
  <script src="performance-optimizations.js"></script>
  <script src="document-style-settings.js?v=20260716-force-docx-font-1"></script>
  <script src="mercado-pago-settings.js?v=20260702-initial-setup-1"></script>
  <script src="billing-cycles.js?v=20260705-billing-cycles-1"></script>
  <script src="text-ai-review.js?v=20260703-portuguese-review-3"></script>
  <script src="document-button-fix.js"></script>
  <script src="director-email.js?v=20260706-document-style-save-1"></script>
  <script src="marketing-notice.js?v=20260702-informativo-label-1"></script>
  <script src="terms-consent.js?v=20260716-terms-link-1"></script>
  <script src="auth-profile.js?v=20260716-fast-admin-menu-1"></script>
  <script src="google-drive-integration.js?v=20260716-drive-choice-1"></script>
  <script src="tutorial-videos.js?v=20260706-video-before-onboarding-2"></script>
  <script src="onboarding.js?v=20260715-onboarding-draft-1"></script>
  <script src="master-users.js?v=20260716-fast-admin-menu-1"></script>
  <script src="finance-admin.js?v=20260716-fast-admin-menu-1"></script>
  <script src="image-editor-permissions.js?v=20260702-combined-image-editor-1"></script>
  <script src="manual-image-editor.js?v=20260709-activity-photos-30-1"></script>
  <script src="ai-face-editor.js?v=20260702-combined-image-editor-1"></script>
  <script src="image-editor-flow.js?v=20260709-activity-photos-30-1"></script>
  <script src="document-image-zoom.js?v=20260702-document-image-zoom-front-1"></script>
  <script src="pwa.js?v=20260705-pwa-1"></script>
</body>
</html>
