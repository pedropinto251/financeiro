# Financeiro — Controlo de Gastos e Ganhos

Aplicação Node.js/Express para gestão financeira pessoal, com foco em simplicidade operacional e registo rigoroso de movimentos. Inclui login local, dashboard, budgets por categoria, objetivos e partilha por grupo.

## Visão Geral
- Gestão de receitas e despesas com categorias.
- Período mensal personalizado por utilizador (ex.: dia 8 → dia 8, com ajuste para próximo dia útil).
- Budgets por categoria.
- Objetivos com alocações e controlo de saldo disponível.
- Anexos em movimentos, com conversão automática de imagens para PDF.
- Relatórios Excel por mês (ciclo personalizado) ou por ano (civil).
- Wishlist/planeamento de compras com integração em despesas.
- Partilha de finanças por grupo.

## Funcionalidades
- Login local com sessões.
- Dashboard com saldo, gastos por categoria e objetivos.
- Categorias de receita/despesa.
- Budgets por categoria.
- Movimentos com anexos.
- Conversão de imagens para PDF no upload.
- Objetivos e alocações.
- Wishlist com estados e compra registada.
- Exportação de relatórios Excel.
- Partilha entre utilizadores do mesmo grupo.

## Requisitos
- Node.js 18+ (recomendado)
- MySQL 8+

## Instalação
1. Instalar dependências:
   `npm install`
2. Criar `.env` (opcional):
   ```env
   PORT=3000
   SESSION_SECRET=...
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=...
   DB_NAME=loja
   JWT_SECRET=... (opcional)
   ```
3. Criar a base de dados:
   `db/schema.sql`

## Execução
- Produção: `npm start`
- Desenvolvimento: `npm run dev`

## Criação de Utilizador
```
node scripts/create-sim-user.js "Nome" email@dominio.com senha admin
```

## Relatórios (Excel)
- Mês (ciclo do utilizador): `GET /reports/export?period=month&month=YYYY-MM`
- Ano (civil): `GET /reports/export?period=year&year=YYYY`

## Ciclo Mensal Personalizado
Configuração por utilizador (admin):
- `ciclo_dia` (1–31)
- `ciclo_proximo_util` (ajusta para o próximo dia útil se cair em fim‑de‑semana)

Exemplo:
- Dia 8 → Dia 8
- Se o dia 8 cair ao sábado/domingo, o ciclo começa no próximo dia útil.


## Estrutura Rápida
- `controllers/` lógica de rotas e renderização
- `models/` acesso à base de dados
- `services/` utilitários de negócio (períodos, conversões, etc.)
- `views/` templates EJS
- `routes/` definição de rotas

## Notas
- Anexos de imagem são convertidos para PDF no upload.
- O período mensal no dashboard e nos relatórios respeita o ciclo configurado por utilizador.
