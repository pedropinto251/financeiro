# Controlo de Gastos e Ganhos

Aplicacao Node.js/Express com login local, dashboard financeiro, categorias, budgets e documentos protegidos.

## Funcionalidades
- Login local
- Dashboard com saldo mensal, gasto por categoria e evolucao 6 meses
- Criacao de categorias (despesa/receita)
- Definicao de budgets mensais por categoria
- Registo de movimentos (despesa/receita) com documento
- Financas partilhadas (duas contas ligadas ao mesmo grupo)

## Setup
1) `npm install`
2) Criar `.env` (opcional):
```
PORT=3000
SESSION_SECRET=...
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=...
DB_NAME=loja
```
3) Criar a base de dados com `db/schema.sql`.

## Run
- `npm start`

## Criar utilizador
```
node scripts/create-sim-user.js "Nome" email@dominio.com senha admin
```
