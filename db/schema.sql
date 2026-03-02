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
	ciclo_dia INT NOT NULL DEFAULT 1,
	ciclo_proximo_util TINYINT(1) NOT NULL DEFAULT 0,
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
	data_ocorrencia DATETIME NOT NULL,
	descricao TEXT,
	fonte VARCHAR(255),
	status ENUM('active','void') NOT NULL DEFAULT 'active',
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

CREATE TABLE IF NOT EXISTS finance_goals (
	id INT AUTO_INCREMENT PRIMARY KEY,
	finance_group_id INT NOT NULL,
	nome VARCHAR(255) NOT NULL,
	valor_objetivo DECIMAL(12,2) NOT NULL DEFAULT 0,
	data_objetivo DATE NULL,
	estado ENUM('active','completed') NOT NULL DEFAULT 'active',
	data_criado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT fk_goal_group FOREIGN KEY (finance_group_id)
		REFERENCES finance_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_goal_allocations (
	id INT AUTO_INCREMENT PRIMARY KEY,
	finance_group_id INT NOT NULL,
	goal_id INT NOT NULL,
	user_id INT NOT NULL,
	valor DECIMAL(12,2) NOT NULL,
	data_alocacao DATE NOT NULL,
	nota TEXT,
	data_criado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT fk_goal_alloc_group FOREIGN KEY (finance_group_id)
		REFERENCES finance_groups(id) ON DELETE CASCADE,
	CONSTRAINT fk_goal_alloc_goal FOREIGN KEY (goal_id)
		REFERENCES finance_goals(id) ON DELETE CASCADE,
	CONSTRAINT fk_goal_alloc_user FOREIGN KEY (user_id)
		REFERENCES simulador_utilizadores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_wishlist_items (
	id INT AUTO_INCREMENT PRIMARY KEY,
	finance_group_id INT NOT NULL,
	nome VARCHAR(255) NOT NULL,
	descricao TEXT,
	imagem_url VARCHAR(500),
	link_url VARCHAR(500),
	preco DECIMAL(12,2),
	data_alvo DATE,
	estado ENUM('planned','purchased') NOT NULL DEFAULT 'planned',
	data_compra DATE NULL,
	data_criado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT fk_wishlist_group FOREIGN KEY (finance_group_id)
		REFERENCES finance_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_wishlist_projects (
	id INT AUTO_INCREMENT PRIMARY KEY,
	finance_group_id INT NOT NULL,
	nome VARCHAR(255) NOT NULL,
	nota TEXT,
	data_criado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT fk_wishlist_project_group FOREIGN KEY (finance_group_id)
		REFERENCES finance_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_wishlist_lists (
	id INT AUTO_INCREMENT PRIMARY KEY,
	finance_group_id INT NOT NULL,
	project_id INT NOT NULL,
	nome VARCHAR(255) NOT NULL,
	data_criado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT fk_wishlist_list_group FOREIGN KEY (finance_group_id)
		REFERENCES finance_groups(id) ON DELETE CASCADE,
	CONSTRAINT fk_wishlist_list_project FOREIGN KEY (project_id)
		REFERENCES finance_wishlist_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_wishlist_items_v2 (
	id INT AUTO_INCREMENT PRIMARY KEY,
	finance_group_id INT NOT NULL,
	project_id INT NOT NULL,
	list_id INT NOT NULL,
	nome VARCHAR(255) NOT NULL,
	descricao TEXT,
	imagem_path VARCHAR(500),
	link_url VARCHAR(500),
	preco DECIMAL(12,2),
	data_alvo DATE,
	estado ENUM('planned','purchased') NOT NULL DEFAULT 'planned',
	data_compra DATE NULL,
	transaction_id INT NULL,
	data_criado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT fk_wishlist_item_group FOREIGN KEY (finance_group_id)
		REFERENCES finance_groups(id) ON DELETE CASCADE,
	CONSTRAINT fk_wishlist_item_project FOREIGN KEY (project_id)
		REFERENCES finance_wishlist_projects(id) ON DELETE CASCADE,
	CONSTRAINT fk_wishlist_item_list FOREIGN KEY (list_id)
		REFERENCES finance_wishlist_lists(id) ON DELETE CASCADE,
	CONSTRAINT fk_wishlist_item_tx FOREIGN KEY (transaction_id)
		REFERENCES finance_transactions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_wishlist_shares (
	id INT AUTO_INCREMENT PRIMARY KEY,
	owner_group_id INT NOT NULL,
	project_id INT NOT NULL,
	list_id INT NULL,
	shared_with_user_id INT NOT NULL,
	permission ENUM('view','edit','mark','delete','all') NOT NULL DEFAULT 'view',
	data_criado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	UNIQUE KEY uq_wishlist_share (project_id, list_id, shared_with_user_id),
	CONSTRAINT fk_share_group FOREIGN KEY (owner_group_id)
		REFERENCES finance_groups(id) ON DELETE CASCADE,
	CONSTRAINT fk_share_project FOREIGN KEY (project_id)
		REFERENCES finance_wishlist_projects(id) ON DELETE CASCADE,
	CONSTRAINT fk_share_list FOREIGN KEY (list_id)
		REFERENCES finance_wishlist_lists(id) ON DELETE CASCADE,
	CONSTRAINT fk_share_user FOREIGN KEY (shared_with_user_id)
		REFERENCES simulador_utilizadores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
