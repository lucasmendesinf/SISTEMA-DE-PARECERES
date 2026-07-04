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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
