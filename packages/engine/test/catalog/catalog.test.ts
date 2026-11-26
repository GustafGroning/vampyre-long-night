import { describe, expect, it } from 'vitest';
import {
  ACTION_CATALOG,
  analyzeDraft,
  analyzeSubmission,
  buildPlayerView,
  listAvailableActions,
  nextParam,
  openRound,
  resolveRound,
  startGame,
  submitActions,
  type GameState,
  type Json,
  type MinionId,
  type Mutable,
  type PlayerId,
  type PlayerView,
  type SubmittedAction,
} from '../../src/index.js';
import { cloneJson } from '../../src/state/json.js';
import { content, P, sampleState } from '../fixtures.js';

const started = (): GameState => startGame(sampleState());
const viewOf = (state: GameState, id: PlayerId): PlayerView => buildPlayerView(state, content, id);
const minionId = (state: GameState, name: string): MinionId =>
  Object.values(state.minions).find((m) => m.name === name)!.id;

const v = (actionId: string, params?: { [k: string]: Json }, key?: string): SubmittedAction => ({
  actionId,
  performer: { kind: 'vampire' },
  ...(params ? { params } : {}),
  ...(key ? { key } : {}),
});
const mi = (actionId: string, id: MinionId, params?: { [k: string]: Json }): SubmittedAction => ({
  actionId,
  performer: { kind: 'minion', minionId: id },
  ...(params ? { params } : {}),
});
const draft = (actions: SubmittedAction[], royalPrivilegesToSpend = 0) => ({ actions, royalPrivilegesToSpend });
const menuIds = (view: PlayerView, performer: 'vampire' | MinionId = 'vampire') =>
  listAvailableActions(view, content, [], {})
    .filter((i) => (performer === 'vampire' ? i.performer.kind === 'vampire' : i.performer.kind === 'minion' && i.performer.minionId === performer))
    .map((i) => i.actionId);
const optionValues = (view: PlayerView, list: SubmittedAction[], index: number) =>
  nextParam(view, content, list, index)?.options?.map((o) => o.value);

describe('menyn: vad spelaren kan välja', () => {
  const state = started();

  it('titel- och sektaktioner följer effektiv titel och sekt', () => {
    const inner = menuIds(viewOf(state, P.inner));
    expect(inner).toEqual(expect.arrayContaining(['bottomless_wealth_of_the_camarilla', 'reward_loyalty', 'control_the_masquerade']));
    expect(inner).not.toContain('build_my_kingdom');

    const prince = menuIds(viewOf(state, P.prince));
    expect(prince).toEqual(expect.arrayContaining(['build_my_kingdom', 'expansion', 'go_anarch']));
    expect(prince).not.toContain('bottomless_wealth_of_the_camarilla');

    // Dold Archbishop förklädd som Prince: Archbishop + Sabbat + förklädnadens (R6).
    const bishop = menuIds(viewOf(state, P.bishop));
    expect(bishop).toEqual(expect.arrayContaining(['build_the_base', 'call_a_crusade', 'sabbat_sabotage', 'build_my_kingdom']));
    expect(bishop).not.toContain('conquer_in_the_name_of_cain');

    const untitled = menuIds(viewOf(state, P.untitled));
    expect(untitled).toContain('conquer_new_territory');
    expect(untitled).not.toContain('anarch_revolt');
    expect(prince).not.toContain('conquer_new_territory');
  });

  it('discipline-aktioner kräver disciplinen, (M) kräver bemästrad', () => {
    const prince = menuIds(viewOf(state, P.prince)); // auspex basic, fortitude basic, oblivion mastered
    expect(prince).toEqual(expect.arrayContaining(['auspex', 'fortitude', 'oblivion', 'oblivion_m']));
    expect(prince).not.toContain('auspex_m');
    expect(prince).not.toContain('fortitude_m');
    expect(prince).not.toContain('celerity');
  });

  it('en rad per minion, bara aktioner för minionens typ', () => {
    const view = viewOf(state, P.inner);
    const ron = menuIds(view, minionId(state, 'Ron'));
    const jenny = menuIds(view, minionId(state, 'Jenny'));
    expect(ron).toEqual(expect.arrayContaining(['minion_move', 'bleed_the_enemy', 'partner_in_crime']));
    expect(ron).not.toContain('keep_an_eye_on_them');
    expect(jenny).toEqual(expect.arrayContaining(['minion_move', 'keep_an_eye_on_them']));
    expect(jenny).not.toContain('bleed_the_enemy');
    expect(menuIds(viewOf(state, P.prince), minionId(state, 'Enzo Romano'))).toEqual(['build_on_the_masters_kingdom']);
  });

  it('artefaktaktioner bara för artefakter man bär; Ring of Tremere har ingen egen ännu', () => {
    expect(menuIds(viewOf(state, P.inner))).toContain('artifact_black_gloves');
    expect(menuIds(viewOf(state, P.justicar)).filter((id) => id.startsWith('artifact_'))).toEqual([]);
  });

  it('aktioner utan giltiga mål just nu markeras som ej tillgängliga', () => {
    const baron = listAvailableActions(viewOf(state, P.baron), content, [], {});
    const sail = baron.find((i) => i.actionId === 'sail')!;
    expect(sail.available).toBe(false); // West är ingen hamn
    expect(sail.reason).toMatch(/No valid choices/);
  });

  it('kostnad, inkomst och Trifle i menyn', () => {
    const inner = listAvailableActions(viewOf(state, P.inner), content, [], {});
    const wealth = inner.find((i) => i.actionId === 'bottomless_wealth_of_the_camarilla')!;
    expect([wealth.cost, wealth.income, wealth.costVaries]).toEqual([0, 250, false]);
    expect(inner.find((i) => i.actionId === 'bleed')!.income).toBeNull();
    expect(inner.find((i) => i.actionId === 'move')).toMatchObject({ cost: 10, costVaries: false, trifle: false });
    const justicarMove = listAvailableActions(viewOf(state, P.justicar), content, [], {}).find((i) => i.actionId === 'move')!;
    expect(justicarMove).toMatchObject({ cost: 5, trifle: true });
    expect(inner.find((i) => i.actionId === 'grow_in_power')!.costVaries).toBe(true);
    expect(inner.find((i) => i.actionId === 'give')!.freeSlot).toBe(true);
  });
});

describe('målval steg för steg', () => {
  const state = started();

  it('Move ger bara grannstäder, räknat från platsen efter tidigare Move i listan', () => {
    const view = viewOf(state, P.prince); // i North
    expect(optionValues(view, [v('move')], 0)).toEqual(['east', 'south', 'west']);
    const list = [v('move', { to: 'east' }), v('move')];
    expect(optionValues(view, list, 1)).toEqual(['north', 'south']);
    // Gränssnittet kan fråga innan aktionen läggs i listan: lägg den sist.
    const req = nextParam(view, content, list, 1)!;
    expect(req).toMatchObject({ key: 'to', kind: 'city' });
    expect(req.options![0]).toEqual({ value: 'north', label: 'North' });
  });

  it('Sail: hamnar i samma havsregion utan storm', () => {
    const view = viewOf(state, P.prince); // North: north_sea
    expect(optionValues(view, [v('sail')], 0)).toEqual(['south']);
    const stormy = cloneJson(state) as Mutable<GameState>;
    stormy.seaRegions['north_sea' as keyof typeof stormy.seaRegions]!.storm = { untilEndOfRound: stormy.round };
    expect(optionValues(viewOf(stormy as GameState, P.prince), [v('sail')], 0)).toEqual([]);
  });

  it('minionens Move räknas från minionens egen position', () => {
    const id = minionId(state, 'Gang'); // Baron West, minion i West
    expect(optionValues(viewOf(state, P.baron), [mi('minion_move', id)], 0)).toEqual(['north', 'south']);
  });

  it('mål "i samma stad" läcker inga positioner: alla andra vampyrer och andras minions', () => {
    const before = optionValues(viewOf(state, P.prince), [v('attack')], 0);
    const moved = cloneJson(state) as Mutable<GameState>;
    moved.players[P.baron]!.location = 'north' as never;
    moved.players[P.inner]!.location = 'isle' as never;
    const after = optionValues(viewOf(moved as GameState, P.prince), [v('attack')], 0);
    expect(after).toEqual(before);
    expect(before).toContain(P.baron);
    expect(before).not.toContain(P.prince);
    expect(before).not.toContain(minionId(state, 'Enzo Romano')); // egen minion
    expect(before).toContain(minionId(state, 'Ron'));
  });

  it('senare val beror på tidigare: Expansion frågar efter minions bara vid contest', () => {
    const view = viewOf(state, P.prince);
    const pay = [v('expansion', { city: 'east', mode: 'pay' })];
    expect(nextParam(view, content, pay, 0)).toBeNull();
    const contest = [v('expansion', { city: 'east', mode: 'contest' })];
    expect(nextParam(view, content, contest, 0)).toMatchObject({ key: 'minions', multiple: { min: 0, max: 99 } });
  });

  it('Build the Base: städer med förklädnadens sekt; Sabbat-baser syns bara för Sabbat', () => {
    expect(optionValues(viewOf(state, P.bishop), [v('build_the_base')], 0)).toEqual(['east', 'north']);
  });

  it('(M)Presence: välj en faction action utan titel, sedan dess val', () => {
    const view = viewOf(state, P.inner);
    const list = [v('presence_m')];
    const actions = optionValues(view, list, 0)!;
    expect(actions).toContain('search');
    expect(actions).not.toContain('reward_loyalty');
    const chosen = [v('presence_m', { action: 'search' })];
    expect(nextParam(view, content, chosen, 0)).toMatchObject({ key: 'city', kind: 'city' });
    const done = analyzeDraft(view, content, draft([v('presence_m', { action: 'search', city: 'north' })]), {});
    expect(done.entries[0]).toMatchObject({ complete: true, cost: 20 });
  });

  it('varje aktion i katalogen går att bygga klart (alla val har alternativ eller intervall)', () => {
    const stuck: string[] = [];
    for (const def of Object.values(ACTION_CATALOG)) {
      let built = false;
      for (const pid of Object.values(P)) {
        for (const variant of ['plain', 'torpor', 'exposed'] as const) {
          const view = superView(viewOf(state, pid), variant);
          const performers =
            def.performer === 'vampire'
              ? [{ kind: 'vampire' as const }]
              : view.me.minions.map((m) => ({ kind: 'minion' as const, minionId: m.id }));
          for (const performer of performers) {
            if (buildable(view, { actionId: def.id, performer, params: {}, key: 'self' })) built = true;
          }
        }
        if (built) break;
      }
      if (!built) stuck.push(def.id);
    }
    expect(stuck).toEqual([]);
  });
});

/** Vyn med allt (vyn är ren data, så testet kan bygga den direkt): alla discipliner bemästrade, alla artefakter, Sabbat-baser, problem, contest och en zombie. */
function superView(base: PlayerView, variant: 'plain' | 'torpor' | 'exposed'): PlayerView {
  const view = cloneJson(base) as PlayerView;
  for (const d of Object.keys(content.disciplines)) (view.me.disciplines as Record<string, string>)[d] = 'mastered';
  // Plain: alla utom Fog Flute, så att Steal an Artifact har något att stjäla.
  view.me.artifacts = Object.keys(content.artifacts).filter((k) => variant !== 'plain' || k !== 'fog_flute').map((k, i) => ({
    id: `artifact-x${i}` as never,
    definition: k as never,
    boundDiscipline: null,
    holder: { kind: 'player' },
  }));
  view.sabbat = { bases: { north: { level: 3, builtRound: 0 }, east: { level: 1, builtRound: 0 } } as never };
  for (const c of view.cities) {
    c.problems = [{ id: `feature-p-${c.id}` as never, key: 'p', name: 'Problem', createdRound: 0, expiresAfterRound: null }];
    c.specials = [{ id: `feature-s-${c.id}` as never, key: 's', name: 'Special', createdRound: 0, expiresAfterRound: null }];
    c.contestants = [{ playerId: view.me.id, sinceRound: 0 }];
  }
  view.players = view.players.map((p) => ({ ...p, bloodHunt: true }));
  view.me.blood = 10_000;
  view.me.modifiers = [{ stat: 'strength', amount: 1, source: 'x', expiresAfterRound: null }];
  const first = view.me.minions[0];
  if (first) view.me.minions.push({ ...first, id: 'minion-zombie' as never, origin: { kind: 'vestment_zombie', artifactId: 'artifact-x8' as never } });
  if (variant === 'exposed') view.me.disguise = null;
  if (variant === 'torpor') {
    view.me.status = 'torpor';
    view.me.torpor = { progress: 0, required: 3, sinceRound: 0 };
  }
  return view;
}

/** Fyller i första giltiga alternativ för varje val. Senare entries finns för buffar som pekar framåt. */
function buildable(view: PlayerView, action: SubmittedAction): boolean {
  const later: SubmittedAction[] = [
    { actionId: 'bleed', performer: { kind: 'vampire' }, key: 'later-personal' },
    { actionId: 'buy_votes', performer: { kind: 'vampire' }, params: { blood: 10 }, key: 'later-faction' },
    ...view.me.minions.slice(0, 1).map((m) => ({ actionId: 'hide_and_spy', performer: { kind: 'minion' as const, minionId: m.id }, key: 'later-minion' })),
  ];
  const list = [action, ...later];
  for (let step = 0; step < 20; step++) {
    const req = nextParam(view, content, list, 0);
    if (!req) break;
    let value: Json | undefined;
    if (req.kind === 'number') value = req.range!.min;
    else if (req.kind === 'text') value = 'when anyone enters the city';
    else if (req.multiple) value = (req.options ?? []).slice(0, Math.max(req.multiple.min, 1)).map((o) => o.value);
    else value = req.options?.[0]?.value;
    if (value === undefined || (Array.isArray(value) && req.multiple && value.length < req.multiple.min)) return false;
    action.params![req.key] = value;
  }
  const entry = analyzeDraft(view, content, draft(list), {}).entries[0]!;
  return entry.complete && entry.errors.length === 0;
}

describe('utkastanalys: AP, kostnad, inkomst och fel', () => {
  const state = started();

  it('X/Y action points räknar bara vampyrens slots; över budget kan sparas men inte bekräftas', () => {
    const view = viewOf(state, P.prince); // budget 4
    const four = [v('move', { to: 'east' }), v('bleed'), v('move', { to: 'north' }), v('bleed')];
    const ok = analyzeDraft(view, content, draft(four), {});
    expect(ok.ap).toEqual({ used: 4, total: 4 });
    expect(ok.canConfirm).toBe(true);
    expect(ok.totalCost).toBe(20);

    const five = analyzeDraft(view, content, draft([...four, v('watchful_eyes')]), {});
    expect(five.ap).toEqual({ used: 5, total: 4 });
    expect(five.canConfirm).toBe(false);
    expect(five.entries[4]!.errors.map((e) => e.code)).toEqual(['over_budget']);
    // Royal Privileges höjer budgeten.
    expect(analyzeDraft(view, content, draft([...four, v('watchful_eyes')], 1), {}).canConfirm).toBe(true);
  });

  it('minionaktioner räknas per minion, inte i AP; Anarch Mission ger en till', () => {
    const view = viewOf(state, P.baron);
    const rat = minionId(state, 'Rat');
    const once = analyzeDraft(view, content, draft([v('bleed'), mi('bleed_the_enemy', rat)]), {});
    expect(once.ap.used).toBe(1);
    expect(once.minionActions.find((m) => m.minionId === rat)).toEqual({ minionId: rat, used: 1, allowed: 1 });
    expect(once.entries[1]!.ap).toBe(0);

    const twice = analyzeDraft(view, content, draft([mi('bleed_the_enemy', rat), mi('bleed_the_enemy', rat)]), {});
    expect(twice.errors.map((e) => e.code)).toEqual(['minion_over_budget']);

    const mission = analyzeDraft(
      view,
      content,
      draft([v('anarch_mission', { minionId: rat }), mi('bleed_the_enemy', rat), mi('bleed_the_enemy', rat)]),
      {},
    );
    expect(mission.ok).toBe(true);
    expect(mission.minionActions.find((m) => m.minionId === rat)).toMatchObject({ used: 2, allowed: 2 });
  });

  it('Trifle och gratisaktioner: 0 AP', () => {
    const view = viewOf(state, P.justicar);
    const a = analyzeDraft(
      view,
      content,
      draft([v('move', { to: 'east' }), v('give', { recipient: P.prince, blood: 30, minions: [], artifacts: [] })]),
      {},
    );
    expect(a.entries.map((e) => [e.ap, e.trifleFree, e.freeSlot, e.cost])).toEqual([
      [0, true, false, 5],
      [0, false, true, 30],
    ]);
    expect(a.ap.used).toBe(0);
    expect(a.totalCost).toBe(35);
  });

  it('inkomst bara när den är deterministisk', () => {
    const inner = analyzeDraft(viewOf(state, P.inner), content, draft([v('bottomless_wealth_of_the_camarilla'), v('bleed')]), {});
    expect(inner.entries.map((e) => e.income)).toEqual([250, null]);
    expect(inner.totalIncome).toBe(250);

    const rat = minionId(state, 'Rat');
    const resist = analyzeDraft(
      viewOf(state, P.baron),
      content,
      draft([v('organize_resistance', { minionId: rat, effect1: 'gain_blood', city1: 'west' })]),
      {},
    );
    expect(resist.entries[0]).toMatchObject({ complete: true, cost: 25, income: 50 });
  });

  it('Bottomless Wealth förbjuder förflyttning samma rond', () => {
    const a = analyzeDraft(viewOf(state, P.inner), content, draft([v('bottomless_wealth_of_the_camarilla'), v('move', { to: 'north' })]), {});
    expect(a.errors.map((e) => [e.code, e.entryIndex])).toEqual([['movement_forbidden', 1]]);
  });

  it('ofullständig entry: fel "incomplete", nästa val och ingen bekräftelse', () => {
    const a = analyzeDraft(viewOf(state, P.prince), content, draft([v('move')]), {});
    expect(a.canConfirm).toBe(false);
    expect(a.entries[0]).toMatchObject({ complete: false, cost: 10, nextParam: { key: 'to' } });
    expect(a.errors.map((e) => e.code)).toEqual(['incomplete']);
  });

  it('ogiltigt mål: Move till en stad som inte är granne', () => {
    const a = analyzeDraft(viewOf(state, P.prince), content, draft([v('move', { to: 'isle' })]), {});
    expect(a.errors.map((e) => e.code)).toEqual(['invalid_params']);
  });

  it('Obfuscate pekar på en senare entry via key, så pekaren håller när ordningen ändras', () => {
    const view = viewOf(state, P.untitled); // Obfuscate basic
    const list = [v('obfuscate', { entry: 'b' }, 'a'), v('bleed', undefined, 'b')];
    expect(analyzeDraft(view, content, draft(list), {}).ok).toBe(true);
    expect(optionValues(view, [v('obfuscate', undefined, 'a'), v('bleed', undefined, 'b')], 0)).toEqual(['b']);
    // Drar spelaren Bleed före Obfuscate blir buffen ogiltig (buffar måste ligga före, gd:95).
    const swapped = [list[1]!, list[0]!];
    expect(analyzeDraft(view, content, draft(swapped), {}).errors.map((e) => e.code)).toEqual(['invalid_params']);
  });

  it('en gång per mål och rond: Build My Kingdom per stad', () => {
    const picks = ['intercept', 'stability', 'influence'];
    const a = analyzeDraft(
      viewOf(state, P.prince),
      content,
      draft([v('build_my_kingdom', { city: 'north', picks }), v('build_my_kingdom', { city: 'north', picks })]),
      {},
    );
    expect(a.entries[0]!.cost).toBe(35);
    expect(a.errors.map((e) => [e.code, e.entryIndex])).toEqual([['max_per_target', 1]]);
  });
});

describe('servern kör samma analys', () => {
  it('submitActions avvisar ogiltiga mål och godtar en kedja av Move', () => {
    const state = started();
    const window = openRound(state, { seed: 's', deadline: 1000 });
    const bad = submitActions(window, state, { playerId: P.prince, actions: [v('move', { to: 'isle' })], royalPrivilegesToSpend: 0 }, 0, { content });
    expect(bad.ok).toBe(false);
    const chain = [v('move', { to: 'east' }), v('move', { to: 'south' }), v('move', { to: 'isle' })];
    const good = submitActions(window, state, { playerId: P.prince, actions: chain, royalPrivilegesToSpend: 0 }, 0, { content });
    expect(good.ok).toBe(true);

    const server = analyzeSubmission(state, { playerId: P.prince, actions: chain, royalPrivilegesToSpend: 0, locked: false, updatedAt: 0 }, { content });
    const client = analyzeDraft(viewOf(state, P.prince), content, draft(chain), {});
    expect(server.draft).toEqual(client);
  });

  it('fas 1a drar kostnaden som analysen räknat (variabel kostnad) och stryker ofullständiga entries', () => {
    const state = started();
    const result = resolveRound(
      state,
      {
        [P.prince]: {
          playerId: P.prince,
          actions: [v('grow_in_power', { exp: 1 }), v('move')],
          royalPrivilegesToSpend: 0,
          locked: true,
          updatedAt: 0,
        },
      },
      'seed',
      { content },
    );
    expect(result.status).toBe('completed');
    const entries = Object.values(result.resolution.entries).filter((e) => e.playerId === P.prince);
    expect(entries.map((e) => [e.action.actionId, e.status, e.paid])).toEqual([
      ['grow_in_power', 'resolved', 50],
      ['move', 'rejected', 0],
    ]);
  });
});

describe('aktioner som kräver GM finns inte i motorn (docs/engine/not-fixed-actions.md)', () => {
  it('är borttagna ur katalogen', () => {
    const notFixed = [
      'wait_and_strike',
      'harpy_wait_and_strike',
      'dementation',
      'dementation_m',
      'investigate',
      'investigate_eye',
      'troublemaker',
      'orders_from_the_top',
      'hunt_for_me',
      'artifact_crown_of_malkav',
      'recruit_an_archon',
      'chimerstry',
      'chimerstry_m',
    ];
    expect(notFixed.filter((id) => id in ACTION_CATALOG)).toEqual([]);
  });
});

describe('destination för kartan härleds från moves (V16)', () => {
  const state = started();
  const entry = (playerId: PlayerId, action: SubmittedAction) =>
    ({ id: 'e1', playerId, index: 0, action, status: 'pending', paid: 0 }) as never;
  const dest = (playerId: PlayerId, action: SubmittedAction) =>
    ACTION_CATALOG[action.actionId]!.destination?.({ state, content, entry: entry(playerId, action) }) ?? null;

  it('Move, Sail och minionens Move ger vald stad; aktioner utan förflyttning har ingen', () => {
    expect(dest(P.prince, v('move', { to: 'east' }))).toBe('east');
    expect(dest(P.prince, v('sail', { to: 'south' }))).toBe('south');
    expect(dest(P.baron, mi('minion_move', minionId(state, 'Gang'), { to: 'north' }))).toBe('north');
    expect(ACTION_CATALOG['bleed']!.destination).toBeUndefined();
  });

  it('Second Tradition: målets verkliga stad vid upplösning', () => {
    const target = Object.values(state.players).find((p) => p.id !== P.prince && p.location)!;
    expect(dest(P.prince, v('second_tradition', { target: target.id, harpies: [] }))).toBe(target.location);
  });

  it('resolveRound: den som ser en Move ser vampyren i destinationen', () => {
    // Justicar står i North med Prince och får hög Intercept, så Move (stealth +2) syns.
    const watched = cloneJson(state) as Mutable<GameState>;
    const j = watched.players[P.justicar] as Mutable<GameState['players'][PlayerId]>;
    j.modifiers = [...j.modifiers, { stat: 'intercept', amount: 10, source: 'test' as never, expiresAfterRound: null, ignoresRuleOfThree: true }];
    const result = resolveRound(
      watched as GameState,
      { [P.prince]: { playerId: P.prince, actions: [v('move', { to: 'east' })], royalPrivilegesToSpend: 0, locked: true, updatedAt: 0 } },
      'seed',
      { content },
    );
    expect(result.status).toBe('completed');
    const seen = result.resolution.events.filter(
      (e) => e.kind === 'action_observed' && (e.data as { actionId?: string }).actionId === 'move' && e.data && 'at' in e.data,
    );
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((e) => (e.data as { at: string }).at === 'east')).toBe(true);
  });
});
