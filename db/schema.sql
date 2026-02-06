CREATE TABLE IF NOT EXISTS finance_groups (
	id INT AUTO_INCREMENT PRIMARY KEY,
	nome VARCHAR(255) NOT NULL,
	data_criado TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS simulador_utilizadores (
	id INT AUTO_INCREMENT PRIMARY KEY,
	nome VARCHAR(255) NOT NULL,
	email VARCHAR(255) NOT NULL UNIQUE,
	password_hash VARCHAR(255) NOT NULL,
	role ENUM('admin','user') NOT NULL DEFAULT 'user',
	ativo TINYINT(1) NOT NULL DEFAULT 1,
	finance_group_id INT NULL,
	data_criado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT fk_user_finance_group FOREIGN KEY (finance_group_id)
		REFERENCES finance_groups(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_categories (
	id INT AUTO_INCREMENT PRIMARY KEY,
	finance_group_id INT NOT NULL,
	nome VARCHAR(255) NOT NULL,
	tipo ENUM('expense','income') NOT NULL DEFAULT 'expense',
	data_criado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT fk_category_group FOREIGN KEY (finance_group_id)
		REFERENCES finance_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_budgets (
	id INT AUTO_INCREMENT PRIMARY KEY,
	finance_group_id INT NOT NULL,
	categoria_id INT NOT NULL,
	mes DATE NOT NULL,
	valor DECIMAL(12,2) NOT NULL DEFAULT 0,
	data_criado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	UNIQUE KEY uq_budget_group_cat_month (finance_group_id, categoria_id, mes),
	CONSTRAINT fk_budget_group FOREIGN KEY (finance_group_id)
		REFERENCES finance_groups(id) ON DELETE CASCADE,
	CONSTRAINT fk_budget_category FOREIGN KEY (categoria_id)
		REFERENCES finance_categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_transactions (
	id INT AUTO_INCREMENT PRIMARY KEY,
	finance_group_id INT NOT NULL,
	user_id INT NOT NULL,
	tipo ENUM('expense','income') NOT NULL,
	categoria_id INT NULL,
	valor DECIMAL(12,2) NOT NULL,
	data_ocorrencia DATE NOT NULL,
	descricao TEXT,
	fonte VARCHAR(255),
	data_criado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT fk_tx_group FOREIGN KEY (finance_group_id)
		REFERENCES finance_groups(id) ON DELETE CASCADE,
	CONSTRAINT fk_tx_user FOREIGN KEY (user_id)
		REFERENCES simulador_utilizadores(id) ON DELETE CASCADE,
	CONSTRAINT fk_tx_category FOREIGN KEY (categoria_id)
		REFERENCES finance_categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_documents (
	id INT AUTO_INCREMENT PRIMARY KEY,
	finance_group_id INT NOT NULL,
	transaction_id INT NOT NULL,
	user_id INT NOT NULL,
	original_name VARCHAR(255) NOT NULL,
	file_path VARCHAR(500) NOT NULL,
	mime_type VARCHAR(120),
	file_size INT,
	data_criado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT fk_doc_group FOREIGN KEY (finance_group_id)
		REFERENCES finance_groups(id) ON DELETE CASCADE,
	CONSTRAINT fk_doc_tx FOREIGN KEY (transaction_id)
		REFERENCES finance_transactions(id) ON DELETE CASCADE,
	CONSTRAINT fk_doc_user FOREIGN KEY (user_id)
		REFERENCES simulador_utilizadores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
