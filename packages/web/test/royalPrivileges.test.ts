import { describe, expect, it } from 'vitest';
import type { BudgetBreakdown } from '@vampyre/engine';
import { createDemoPort } from '../src/screen/demo';
import type { DraftAction } from '../src/screen/model';
import { royalPrivilegeInfo, royalPrivilegeWarnings } from '../src/screen/viewPort';

let n = 0;
const bleed = (): DraftAction => ({ uid: `rp${++n}`, actionId: 'bleed', performer: { kind: 'vampire' }, params: {}, paramLabels: {} });
const bleeds = (k: number) => Array.from({ length: k }, bleed);
const budget = (over: Partial<BudgetBreakdown> = {}): BudgetBreakdown => ({
  base: 4,
  royalPrivileges: 0,
  sabbatScheme: 0,
  bonus: 0,
  cap: null,
  total: 4,
  ...over,
});

describe('Royal Privileges i analysen', () => {
  it('Prince har 2, inga spenderas utan extras', () => {
    const a = createDemoPort('prince').analyze([]);
    expect(a.royalPrivileges).toEqual({ available: 2, spending: 0, maxUseful: 2, needed: 0 });
    expect(a.apTotal).toBe(4);
  });

  it('spenderad Royal Privilege ger +1 AP och låter en femte action lämnas in', async () => {
    const port = createDemoPort('prince');
    const five = bleeds(5);
    expect(port.analyze(five).canConfirm).toBe(false);
    expect(port.analyze(five).royalPrivileges.needed).toBe(1);
    const a = port.analyze(five, { royalPrivilegesToSpend: 1 });
    expect([a.apUsed, a.apTotal]).toEqual([5, 5]);
    expect(a.canConfirm).toBe(true);
    expect(a.warnings).toEqual([]);
    expect(await port.confirm(five, { royalPrivilegesToSpend: 1 })).toEqual({ ok: true, errors: [] });
    expect(port.isLocked()).toBe(true);
  });

  it('motorn avvisar inlämningen utan Royal Privilege', async () => {
    const res = await createDemoPort('prince').confirm(bleeds(5));
    expect(res.ok).toBe(false);
  });

  it('fler än man har är ett fel', () => {
    const a = createDemoPort('prince').analyze([], { royalPrivilegesToSpend: 3 });
    expect(a.canConfirm).toBe(false);
    expect(a.errors.join()).toMatch(/Royal Privileges/);
  });

  it('varnar när en spenderad Royal Privilege inte behövs', () => {
    const a = createDemoPort('prince').analyze(bleeds(4), { royalPrivilegesToSpend: 1 });
    expect(a.canConfirm).toBe(true);
    expect(a.warnings).toContain('You are spending 1 Royal Privileges but the list needs 0');
  });

  it('spelare utan Royal Privileges får available 0', () => {
    expect(createDemoPort('innerCircle').analyze([]).royalPrivileges.available).toBe(0);
  });
});

describe('royalPrivilegeInfo med tak', () => {
  it('utan tak är alla användbara', () => {
    expect(royalPrivilegeInfo(2, 0, budget(), 6)).toEqual({ available: 2, spending: 0, maxUseful: 2, needed: 2 });
  });

  it('torpor (tak 1) gör dem oanvändbara och varnar', () => {
    const info = royalPrivilegeInfo(2, 1, budget({ cap: 1, total: 1 }), 1);
    expect(info).toMatchObject({ maxUseful: 0, needed: 0 });
    expect(royalPrivilegeWarnings(info)[0]).toMatch(/Only 0 of 1/);
  });

  it('tak över grundbudgeten släpper igenom upp till taket', () => {
    expect(royalPrivilegeInfo(2, 0, budget({ base: 2, cap: 3, total: 2 }), 4)).toMatchObject({ maxUseful: 1, needed: 1 });
  });
});
