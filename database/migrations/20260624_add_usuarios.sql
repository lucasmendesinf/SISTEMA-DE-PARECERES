CREATE TABLE IF NOT EXISTS usuarios (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  telefone VARCHAR(30) NULL,
  perfil ENUM('master','cliente') NOT NULL DEFAULT 'cliente',
  permissoes JSON NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  image_editor_permission ENUM('none','manual','ai','both') NOT NULL DEFAULT 'none',
  senha_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT IGNORE INTO usuarios (nome,email,telefone,perfil,permissoes,ativo,senha_hash)
VALUES ('Usuario Master','ana.martins@aiprof.local',NULL,'master',NULL,1,'$2y$10$WmVRYZTpX/ROvY8ze1fIR.PEerPxEnsSqHev/72Lr8KIpDY.t08r6');
