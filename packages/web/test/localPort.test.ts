import { describe, expect, it } from 'vitest';
import { createDemoPort } from '../src/screen/demo';
import type { DraftAction } from '../src/screen/model';

const v = { kind: 'vampire' } as const;
let n = 0;
const act = (
  actionId: string,
  params: DraftAction['params'] = {},
  performer: DraftAction['performer'] = v,
  paramLabels: Record<string, string> = {},
): DraftAction => ({ uid: `t${++n}`, actionId, performer, params, paramLabels });
const move = (to: string, label: string) => act('move', { to }, v, { to: label });

describe('data från PlayerView', () => {
  it('resurser, vampyr och rond för Prince', () => {
    const d = createDemoPort('prince').load();
    // The demo Prince starts with 100 blood and earns 80 from Bleed in round 1.
    expect(d.resources).toEqual({ blood: 180, vp: 0, artifacts: 0, minions: 1, votes: 2 });
    expect(d.vampire).toEqual({ name: 'Prince Edmund Hale', titleLabel: 'Prince of North', stats: { strength: 0, stealth: 0, intercept: 1 } });
    expect(d.round).toEqual({ round: 2, maxRounds: 8 });
  });

  it('dold Archbishop ser sin sanna titel och förklädnaden', () => {
    expect(createDemoPort('hiddenArchbishop').load().vampire.titleLabel).toBe('Archbishop (som Prince)');
  });

  it('kartan: alla städer inom ritytan, kopplingar och faction som spelaren ser den', () => {
    const map = createDemoPort('prince').load().map;
    expect(map.cities.map((c) => c.id).sort()).toEqual(['east', 'isle', 'north', 'south', 'west']);
    expect(map.links).toHaveLength(6);
    for (const c of map.cities) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThanOrEqual(1000);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThanOrEqual(700);
    }
    const f = Object.fromEntries(map.cities.map((c) => [c.id, c.faction]));
    // East styrs av den dolda Archbishop som syns som Camarilla-Prince.
    expect(f).toEqual({ north: 'camarilla', west: 'anarch', east: 'camarilla', south: null, isle: null });
  });

  it('kartan visar egna pjäser och andras som sågs förra ronden', () => {
    const pieces = (k: 'prince' | 'innerCircle') =>
      createDemoPort(k)
        .load()
        .map.cities.flatMap((c) => c.pieces.map((p) => `${c.id}:${p.kind}:${p.name}:${p.own ? 'egen' : 'annan'}`))
        .sort();
    expect(pieces('prince')).toEqual(['north:minion:Enzo Romano:egen', 'north:vampire:Prince Edmund Hale:egen']);
    // Molly Finch bleedade i South förra ronden, där Inner Circle står.
    expect(pieces('innerCircle')).toEqual([
      'south:minion:Jenny Wren:egen',
      'south:minion:Ronald:egen',
      'south:vampire:Lady Margaret Ashworth:egen',
      'south:vampire:Molly Finch:annan',
    ]);
  });
});

describe('actions från motorns katalog', () => {
  it('listar vampyrens och minionernas actions, med kostnad', () => {
    const choices = createDemoPort('innerCircle').actionChoices([]);
    const find = (who: string, id: string) => choices.find((c) => c.performerName === who && c.actionId === id);
    expect(find('Lady Margaret Ashworth', 'reward_loyalty')).toMatchObject({ cost: 25, performerKind: 'vampire' });
    expect(find('Lady Margaret Ashworth', 'call_a_crusade')).toBeUndefined();
    expect(find('Ronald', 'bleed_the_enemy')).toMatchObject({ performerKind: 'minion' });
    expect(find('Jenny Wren', 'bleed_the_enemy')).toBeUndefined();
    expect(find('Lady Margaret Ashworth', 'pardon')?.disabledReason).toMatch(/Inga giltiga val/);
  });

  it('Move erbjuder grannstäder från platsen efter tidigare Move', () => {
    const port = createDemoPort('prince');
    const values = (s: ReturnType<typeof port.nextStep>) => (s?.kind === 'select' ? s.options.map((o) => o.value).sort() : null);
    expect(values(port.nextStep([], 'move', v, {}))).toEqual(['east', 'south', 'west']);
    expect(values(port.nextStep([move('south', 'South')], 'move', v, {}))).toEqual(['east', 'isle', 'north', 'west']);
    expect(port.nextStep([], 'move', v, { to: 'east' })).toBeNull();
    expect(port.nextStep([], 'bleed', v, {})).toBeNull();
  });

  it('analys: etiketter, kostnad, AP och för många actions', () => {
    const port = createDemoPort('prince');
    const draft = [act('bleed'), move('south', 'South'), move('isle', 'Isle'), act('bleed')];
    const a = port.analyze(draft);
    expect(a.entries.map((e) => e.label)).toEqual(['Bleed i North', 'Move från North till South', 'Move från South till Isle', 'Bleed i Isle']);
    expect(a.entries.map((e) => e.cost)).toEqual([0, 10, 10, 0]);
    expect(a.totalCost).toBe(20);
    expect([a.apUsed, a.apTotal]).toEqual([4, 4]);
    expect(a.canConfirm).toBe(true);
    const over = port.analyze([...draft, act('bleed')]);
    expect(over.apUsed).toBe(5);
    expect(over.canConfirm).toBe(false);
  });

  it('en Move som inte längre går efter omsortering flaggas', () => {
    const a = createDemoPort('prince').analyze([move('isle', 'Isle'), move('south', 'South')]);
    expect(a.entries[0]!.errors.length).toBeGreaterThan(0);
    expect(a.canConfirm).toBe(false);
  });

  it('deterministisk inkomst visas (Bottomless Wealth)', () => {
    const port = createDemoPort('innerCircle');
    const item = port.actionChoices([]).find((c) => c.actionId === 'bottomless_wealth_of_the_camarilla')!;
    const steps: DraftAction['params'] = {};
    for (let s = port.nextStep([], item.actionId, v, steps); s; s = port.nextStep([], item.actionId, v, steps)) {
      steps[s.param] = s.kind === 'select' ? s.options[0]!.value : s.kind === 'number' ? s.min : 'x';
    }
    const a = port.analyze([act(item.actionId, steps)]);
    expect(a.entries[0]!.income).toBeGreaterThan(0);
    expect(a.totalIncome).toBe(a.entries[0]!.income);
  });
});

describe('minionernas actions', () => {
  it('en ruta per minion, och för många actions spärrar confirm', () => {
    const port = createDemoPort('innerCircle');
    const ronald = { kind: 'minion', minionId: 'minion-1' } as const;
    const a = port.analyze([act('minion_move', { to: 'north' }, ronald, { to: 'North' })]);
    expect(a.minionActions.map((m) => [m.name, m.used, m.allowed])).toEqual([
      ['Ronald', 1, 1],
      ['Jenny Wren', 0, 1],
    ]);
    expect(a.apUsed).toBe(0);
    expect(a.entries[0]).toMatchObject({ label: 'Move från South till North', performerName: 'Ronald', cost: 5, errors: [] });
    const two = port.analyze([act('minion_move', { to: 'north' }, ronald, { to: 'North' }), act('bleed_the_enemy', {}, ronald)]);
    expect(two.minionActions[0]).toMatchObject({ used: 2, allowed: 1 });
    expect(two.canConfirm).toBe(false);
  });
});

describe('inlämning', () => {
  it('confirm låser listan och unlock låser upp', () => {
    const port = createDemoPort('prince');
    expect(port.isLocked()).toBe(false);
    expect(port.confirm([act('bleed')])).toEqual({ ok: true, errors: [] });
    expect(port.isLocked()).toBe(true);
    port.unlock();
    expect(port.isLocked()).toBe(false);
  });
});
