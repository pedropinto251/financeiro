'use strict';
const test = require('node:test');
const assert = require('node:assert');
const {
  getCyclePeriod, clampCycleDay, isCycleSentinel,
  CYCLE_LAST_BUSINESS, CYCLE_LAST_CALENDAR,
} = require('../services/financePeriod');
const { nextOccurrence, firstOccurrence } = require('../models/financeRecurringModel');

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('clampCycleDay limita 1..31 e preserva sentinelas', () => {
  assert.equal(clampCycleDay(0), 1);
  assert.equal(clampCycleDay(40), 31);
  assert.equal(clampCycleDay(8), 8);
  assert.equal(clampCycleDay(CYCLE_LAST_BUSINESS), CYCLE_LAST_BUSINESS);
  assert.ok(isCycleSentinel(CYCLE_LAST_CALENDAR));
  assert.ok(!isCycleSentinel(8));
});

test('ciclo de dia fixo (8) — Jun/2026', () => {
  const p = getCyclePeriod(new Date(2026, 5, 15), 8, false); // 15 Jun 2026
  assert.equal(ymd(p.start), '2026-06-08');
  assert.equal(ymd(p.end), '2026-07-07');
});

test('ciclo antes do dia fixo cai no mês anterior', () => {
  const p = getCyclePeriod(new Date(2026, 5, 3), 8, false); // 3 Jun
  assert.equal(ymd(p.start), '2026-05-08');
  assert.equal(ymd(p.end), '2026-06-07');
});

test('último dia útil — Maio 2026 (31 = domingo → 29 sex)', () => {
  const p = getCyclePeriod(new Date(2026, 5, 15), CYCLE_LAST_BUSINESS, false);
  assert.equal(ymd(p.start), '2026-05-29'); // último dia útil de Maio
  assert.equal(ymd(p.end), '2026-06-29');   // dia antes do último útil de Junho (30)
});

test('último dia do mês (civil)', () => {
  const p = getCyclePeriod(new Date(2026, 5, 15), CYCLE_LAST_CALENDAR, false);
  assert.equal(ymd(p.start), '2026-05-31');
  assert.equal(ymd(p.end), '2026-06-29');
});

test('recorrência a cada N dias', () => {
  assert.equal(nextOccurrence('2026-06-15', 'dias', 15), '2026-06-30');
  assert.equal(nextOccurrence('2026-06-30', 'dias', 15), '2026-07-15');
});

test('recorrência mensal por dia', () => {
  assert.equal(firstOccurrence('mensal', 1, 8, '2026-06-03'), '2026-06-08');
  assert.equal(firstOccurrence('mensal', 1, 8, '2026-06-20'), '2026-07-08');
  assert.equal(nextOccurrence('2026-06-08', 'mensal', 1, 8), '2026-07-08');
});
