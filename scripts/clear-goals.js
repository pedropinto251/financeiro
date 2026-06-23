// Apaga TODOS os objetivos e poupanças (alocações) — usa as env DB_* do servidor.
// Por segurança exige a flag --yes. Opcional: --group=<id> para limitar a um grupo.
//   node scripts/clear-goals.js --yes
//   node scripts/clear-goals.js --yes --group=3
require('dotenv').config();
const pool = require('../config/db');

const args = process.argv.slice(2);
const confirmed = args.includes('--yes');
const groupArg = args.find((a) => a.startsWith('--group='));
const groupId = groupArg ? Number(groupArg.split('=')[1]) : null;

(async () => {
  if (!confirmed) {
    console.log('Isto apaga objetivos + poupanças. Repete com --yes para confirmar.');
    process.exit(0);
  }
  const where = groupId ? 'WHERE finance_group_id = ?' : '';
  const params = groupId ? [groupId] : [];
  try {
    // Alocações primeiro (a FK também faz cascade ao apagar o objetivo, mas
    // limpamos explicitamente para o caso de a constraint não existir).
    const [alloc] = await pool.query(`DELETE FROM finance_goal_allocations ${where}`, params);
    const [goals] = await pool.query(`DELETE FROM finance_goals ${where}`, params);
    console.log(`✓ Apagadas ${alloc.affectedRows} poupanças e ${goals.affectedRows} objetivos${groupId ? ` (grupo ${groupId})` : ' (todos os grupos)'}.`);
  } catch (err) {
    console.error('✗ Falhou:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
