CREATE DATABASE IF NOT EXISTS sistema_pareceres
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE sistema_pareceres;

CREATE TABLE IF NOT EXISTS usuarios (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  telefone VARCHAR(30) NULL,
  perfil ENUM('master','cliente') NOT NULL DEFAULT 'cliente',
  permissoes JSON NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  image_editor_permission ENUM('none','manual','ai','both') NOT NULL DEFAULT 'none',
  billing_plan VARCHAR(80) NOT NULL DEFAULT 'Basico',
  billing_cycle ENUM('monthly','annual') NOT NULL DEFAULT 'monthly',
  billing_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  billing_payment_method ENUM('pix','card','both','manual') NOT NULL DEFAULT 'both',
  billing_status ENUM('trial','pending','active','overdue','canceled','exempt') NOT NULL DEFAULT 'pending',
  billing_next_due_date DATE NULL,
  billing_notes TEXT NULL,
  mercado_pago_customer_id VARCHAR(120) NULL,
  mercado_pago_subscription_id VARCHAR(120) NULL,
  mercado_pago_last_payment_id VARCHAR(120) NULL,
  senha_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS turmas (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NULL,
  nome VARCHAR(120) NOT NULL,
  etapa VARCHAR(80) NOT NULL,
  turno VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_turmas_usuario (usuario_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS periodos_avaliativos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NULL,
  nome VARCHAR(120) NOT NULL,
  data_inicio DATE NULL,
  data_fim DATE NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_periodos_usuario (usuario_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS campos_experiencia (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(180) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value MEDIUMTEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS billing_payments (
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
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS criancas (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NULL,
  turma_id BIGINT UNSIGNED NOT NULL,
  nome VARCHAR(160) NOT NULL,
  data_nascimento DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_criancas_usuario (usuario_id),
  CONSTRAINT fk_criancas_turma FOREIGN KEY (turma_id) REFERENCES turmas(id)
) ENGINE=InnoDB;

ALTER TABLE criancas ADD COLUMN IF NOT EXISTS foto MEDIUMBLOB NULL;
ALTER TABLE criancas ADD COLUMN IF NOT EXISTS foto_mime VARCHAR(100) NULL;

CREATE TABLE IF NOT EXISTS atividades (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NULL,
  turma_id BIGINT UNSIGNED NOT NULL,
  periodo_id BIGINT UNSIGNED NULL,
  titulo VARCHAR(180) NOT NULL,
  campo_experiencia VARCHAR(180) NOT NULL,
  observacoes TEXT NOT NULL,
  data_atividade DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_atividades_usuario (usuario_id),
  CONSTRAINT fk_atividades_turma FOREIGN KEY (turma_id) REFERENCES turmas(id),
  CONSTRAINT fk_atividades_periodo FOREIGN KEY (periodo_id) REFERENCES periodos_avaliativos(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS atividade_fotos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  atividade_id BIGINT UNSIGNED NOT NULL,
  arquivo MEDIUMBLOB NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_atividade_fotos_atividade FOREIGN KEY (atividade_id) REFERENCES atividades(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pareceres (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  crianca_id BIGINT UNSIGNED NOT NULL,
  periodo_id BIGINT UNSIGNED NOT NULL,
  texto TEXT NOT NULL,
  tipo_documento ENUM('parecer','portfolio') NOT NULL DEFAULT 'parecer',
  status ENUM('rascunho','concluido') NOT NULL DEFAULT 'rascunho',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pareceres_crianca FOREIGN KEY (crianca_id) REFERENCES criancas(id),
  CONSTRAINT fk_pareceres_periodo FOREIGN KEY (periodo_id) REFERENCES periodos_avaliativos(id),
  UNIQUE KEY uq_parecer_crianca_periodo_tipo (crianca_id, periodo_id, tipo_documento)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS parecer_atividades (
  parecer_id BIGINT UNSIGNED NOT NULL,
  atividade_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (parecer_id, atividade_id),
  CONSTRAINT fk_parecer_atividades_parecer FOREIGN KEY (parecer_id) REFERENCES pareceres(id) ON DELETE CASCADE,
  CONSTRAINT fk_parecer_atividades_atividade FOREIGN KEY (atividade_id) REFERENCES atividades(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS parecer_blocos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  parecer_id BIGINT UNSIGNED NOT NULL,
  ordem INT UNSIGNED NOT NULL DEFAULT 0,
  texto TEXT NULL,
  activity_ids TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_parecer_blocos_parecer FOREIGN KEY (parecer_id) REFERENCES pareceres(id) ON DELETE CASCADE,
  INDEX idx_parecer_blocos_parecer_ordem (parecer_id, ordem)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS parecer_anexos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  parecer_id BIGINT UNSIGNED NOT NULL,
  ordem INT UNSIGNED NOT NULL DEFAULT 0,
  contexto TEXT NULL,
  arquivo MEDIUMBLOB NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_parecer_anexos_parecer FOREIGN KEY (parecer_id) REFERENCES pareceres(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO turmas (id, nome, etapa, turno)
SELECT 1, 'Jardim II A', 'Educação Infantil', 'Manhã'
WHERE NOT EXISTS (SELECT 1 FROM turmas WHERE id = 1);

INSERT INTO turmas (nome, etapa, turno)
SELECT 'Maternal Único', 'Educação Infantil', 'Integral'
WHERE NOT EXISTS (SELECT 1 FROM turmas WHERE nome = 'Maternal Único');

INSERT INTO turmas (nome, etapa, turno)
SELECT 'Maternal Manhã', 'Educação Infantil', 'Manhã'
WHERE NOT EXISTS (SELECT 1 FROM turmas WHERE nome = 'Maternal Manhã');

INSERT INTO turmas (nome, etapa, turno)
SELECT 'Maternal Tarde', 'Educação Infantil', 'Tarde'
WHERE NOT EXISTS (SELECT 1 FROM turmas WHERE nome = 'Maternal Tarde');

INSERT INTO periodos_avaliativos (id, nome, data_inicio, data_fim, ativo)
SELECT 1, '1º semestre de 2026', '2026-02-01', '2026-06-30', 1
WHERE NOT EXISTS (SELECT 1 FROM periodos_avaliativos WHERE id = 1);

INSERT INTO campos_experiencia (nome) VALUES
('O eu, o outro e o nós'),
('Corpo, gestos e movimentos'),
('Traços, sons, cores e formas'),
('Escuta, fala, pensamento e imaginação'),
('Espaços, tempos, quantidades, relações e transformações')
ON DUPLICATE KEY UPDATE nome=VALUES(nome);

INSERT INTO usuarios (nome,email,telefone,perfil,permissoes,ativo,senha_hash)
SELECT 'Usuario Master', 'ana.martins@aiprof.local', NULL, 'master', NULL, 1, '$2y$10$WmVRYZTpX/ROvY8ze1fIR.PEerPxEnsSqHev/72Lr8KIpDY.t08r6'
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE email='ana.martins@aiprof.local');
