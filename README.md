# App minimal: Login + Home

Aplicacao Node.js/Express com login local e uma pagina inicial protegida.

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
3) Garantir tabela `simulador_utilizadores` (ver `db/schema.sql`).

## Run
- `npm start`

## Criar utilizador
```
node scripts/create-sim-user.js "Nome" email@dominio.com senha admin
```
