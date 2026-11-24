import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';

const at = (s) => new Date(s).getTime();
const NOW = at('2026-11-24T09:00:00');

const free = [{ id: 'f1', starts: '2026-11-24T18:00:00', ends: '2026-11-24T23:00:00', repeats: 'never' }];

test('prep block is added before a meet-up', () => {
  const b = L.blockOf({ starts: '2026-11-24T20:00:00', ends: '2026-11-24T21:00:00', prepMinutes: 60 });
  assert.equal(b.from, at('2026-11-24T19:00:00'));
});

test('clash includes prep time', () => {
  const existing = [{ id: 'a', starts: '2026-11-24T18:00:00', ends: '2026-11-24T19:30:00', prepMinutes: 0, status: 'Planned' }];
  const cand = { id: 'b', starts: '2026-11-24T20:00:00', ends: '2026-11-24T21:00:00', prepMinutes: 60 };
  assert.equal(L.enoughPrep(cand, existing, NOW).ok, false);
  cand.prepMinutes = 30;
  assert.equal(L.enoughPrep(cand, existing, NOW).ok, true);
});

test('cancelled meet-ups free up time', () => {
  const existing = [{ id: 'a', starts: '2026-11-24T18:00:00', ends: '2026-11-24T22:00:00', prepMinutes: 0, status: 'Cancelled' }];
  const cand = { id: 'b', starts: '2026-11-24T20:00:00', ends: '2026-11-24T21:00:00', prepMinutes: 60 };
  assert.equal(L.enoughPrep(cand, existing, NOW).ok, true);
});

test('not enough prep if prep would start in the past', () => {
  const cand = { id: 'b', starts: '2026-11-24T09:30:00', ends: '2026-11-24T10:00:00', prepMinutes: 60 };
  assert.equal(L.enoughPrep(cand, [], NOW).ok, false);
});

test('next free slot fits prep inside free time and avoids plans', () => {
  const meetups = [{ id: 'a', starts: '2026-11-24T19:00:00', ends: '2026-11-24T20:00:00', prepMinutes: 60, status: 'Planned' }];
  const slot = L.nextFreeSlot({ freeTimes: free, meetups, prepMinutes: 60, durationMinutes: 60, after: NOW });
  assert.equal(slot.starts, new Date('2026-11-24T21:00:00').toISOString());
});

test('weekly free time repeats', () => {
  const w = L.expandFree([{ starts: '2026-11-17T18:00:00', ends: '2026-11-17T20:00:00', repeats: 'weekly' }], NOW, NOW + 14 * L.DAY);
  assert.equal(w.length, 2);
  assert.equal(w[0].from, at('2026-11-24T18:00:00'));
});

test('plan several leaves gaps and never overlaps', () => {
  const plan = L.planSeveral({ people: [{ id: 'p1' }, { id: 'p2' }], count: 2, freeTimes: free, meetups: [], defaultPrep: 30, durationMinutes: 60, gapMinutes: 30, after: NOW });
  assert.equal(plan.length, 2);
  assert.equal(L.clashes(plan[1], [plan[0]]).length, 0);
  assert.ok(L.blockOf(plan[1]).from - L.blockOf(plan[0]).to >= 30 * L.MIN);
});

test('shared view has free times only — no names or places', () => {
  const meetups = [{ id: 'a', person: 'secret', place: 'my place', starts: '2026-11-24T19:00:00', ends: '2026-11-24T20:00:00', prepMinutes: 60, status: 'Planned' }];
  const v = L.freeBusyView({ freeTimes: free, meetups, from: NOW });
  const s = JSON.stringify(v);
  assert.ok(!s.includes('secret') && !s.includes('place'));
  assert.deepEqual(v[0], [at('2026-11-24T20:00:00'), at('2026-11-24T23:00:00')]);
});

test('routine expands weekly and fortnightly', () => {
  const r = { id: 'r', days: [2], time: '20:00', repeats: 'weekly', durationMinutes: 60, prepMinutes: 45 };
  assert.equal(L.expandRoutine(r, NOW, NOW + 14 * L.DAY).length, 2);
  const f = { ...r, repeats: 'fortnightly', anchor: '2026-11-24T00:00:00' };
  assert.equal(L.expandRoutine(f, NOW, NOW + 28 * L.DAY).length, 2);
});

test('reads screenshot text', () => {
  const text = 'Jake\nhey! 28yo, 185cm, beard\ni\'m into hiking and coffee\nfriday 8pm at my place?\nno smoking pls';
  const r = L.parseScreenshotText(text, NOW);
  assert.equal(r.person, 'Jake');
  assert.equal(new Date(r.when).getDay(), 5);
  assert.equal(new Date(r.when).getHours(), 20);
  assert.equal(r.place, 'my place');
  const cats = r.features.map((f) => f.category);
  for (const c of ['Age', 'Looks', 'Interests', 'Other']) assert.ok(cats.includes(c), c);
});

test('unsure things are flagged', () => {
  const r = L.parseScreenshotText('lol ok', NOW);
  assert.ok(r.unsure.length >= 2);
});

test('nicknames come from qualities', () => {
  const n = L.suggestNicknames([{ category: 'Looks', value: 'beard' }]);
  assert.ok(n.includes('Beardo'));
  assert.ok(L.suggestNicknames([]).length >= 3);
});

test('payload round trip', () => {
  const p = { a: 'Café ☕', n: [1, 2] };
  assert.deepEqual(L.decodePayload(L.encodePayload(p)), p);
  assert.equal(L.decodePayload('!!bad'), null);
});
