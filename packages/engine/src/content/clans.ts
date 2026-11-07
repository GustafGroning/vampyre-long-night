/**
 * De 14 klanerna (gd:746–845). Boon- och curse-texterna är regeltext; den
 * mekaniska effekten implementeras av motorn utifrån `key`.
 */
import type { Clan, Discipline } from '../state/enums.js';

export interface ClanTrait {
  readonly key: string;
  readonly name: string;
  readonly text: string;
}

export interface ClanDefinition {
  readonly key: Clan;
  readonly name: string;
  readonly disciplines: readonly [Discipline, Discipline, Discipline];
  readonly boon: ClanTrait;
  readonly curse: ClanTrait;
}

export const CLAN_DEFINITIONS: Readonly<Record<Clan, ClanDefinition>> = {
  banu_haqim: {
    key: 'banu_haqim',
    name: 'Banu Haqim',
    disciplines: ['celerity', 'obfuscate', 'thaumaturgy'],
    boon: { key: 'assassins', name: 'Assassins', text: 'If this vampire gets an ambush, give them +2 strength also.' },
    curse: {
      key: 'bloodlust',
      name: 'Bloodlust',
      text: 'This vampire has -1 strength. Lose this curse after you have committed diablerie.',
    },
  },
  brujah: {
    key: 'brujah',
    name: 'Brujah',
    disciplines: ['celerity', 'potence', 'presence'],
    boon: {
      key: 'brujah_debate',
      name: 'Brujah debate',
      text: 'If you have won a combat all faction actions you perform this and next turn gets -10 cost.',
    },
    curse: {
      key: 'frenzy',
      name: 'Frenzy',
      text: 'At the end of each round there is a 25% chance that you attack a random vampire or minion in the same city as you.',
    },
  },
  ministry: {
    key: 'ministry',
    name: 'The Ministry',
    disciplines: ['obfuscate', 'protean', 'presence'],
    boon: { key: 'seduction', name: 'Seduction', text: 'Eye and Archon minions get -1 intercept against you.' },
    curse: { key: 'decadence', name: 'Decadence', text: 'Lose 5 Blood at the end of every turn.' },
  },
  gangrel: {
    key: 'gangrel',
    name: 'Gangrel',
    disciplines: ['animalism', 'fortitude', 'protean'],
    boon: { key: 'apex_predators', name: 'Apex predators', text: 'This vampire gets +1 to all hunt rolls.' },
    curse: {
      key: 'more_beast_than_man',
      name: 'More beast than man',
      text: "This vampire can't negotiate if they lose combat.",
    },
  },
  hecata: {
    key: 'hecata',
    name: 'Hecata',
    disciplines: ['auspex', 'fortitude', 'oblivion'],
    boon: { key: 'necromancers', name: 'Necromancers', text: 'If this vampire loses a minion, they gain a lvl 1 Ghoul.' },
    curse: { key: 'a_cursed_kiss', name: 'A cursed kiss', text: 'Recruiting a minion costs +10 blood.' },
  },
  lasombra: {
    key: 'lasombra',
    name: 'Lasombra',
    disciplines: ['dominate', 'oblivion', 'potence'],
    boon: {
      key: 'masters_of_shadows',
      name: 'Masters of shadows',
      text: "If this vampire uses the Oblivion discipline choose another action that gains Undetectable. This triggers only once per round. An action that has Can't be hidden cannot become Undetectable.",
    },
    curse: {
      key: 'over_ambitious',
      name: 'Over ambitious',
      text: "If this vampire has less blood than it did last turn, they can't use trifle.",
    },
  },
  malkavian: {
    key: 'malkavian',
    name: 'Malkavian',
    disciplines: ['auspex', 'dementation', 'obfuscate'],
    boon: { key: 'prophecy_of_madness', name: 'Prophecy of madness!', text: 'Gets a unique bit of information every round.' },
    curse: {
      key: 'madness_of_prophecy',
      name: 'Madness of prophecy!',
      text: 'At the end of every round there is a 25% chance that this vampire moves to a random adjacent city.',
    },
  },
  nosferatu: {
    key: 'nosferatu',
    name: 'Nosferatu',
    disciplines: ['animalism', 'obfuscate', 'potence'],
    boon: {
      key: 'always_listening',
      name: 'Always listening',
      text: 'When a Nosferatu uses the Obfuscate, Hide or In the shadows action, they gain +1 Intercept for the rest of the round.',
    },
    curse: { key: 'monstrous', name: 'Monstrous', text: 'The Move action costs +5 blood.' },
  },
  ravnos: {
    key: 'ravnos',
    name: 'Ravnos',
    disciplines: ['chimerstry', 'fortitude', 'animalism'],
    boon: {
      key: 'master_thieves',
      name: 'Master thieves',
      text: 'Gain +1 Stealth on Hunt for blood and Steal artifact actions.',
    },
    curse: {
      key: 'a_need_for_speed',
      name: 'A need for speed',
      text: 'If this vampire did not move, lose 5 blood at the end of round.',
    },
  },
  salubri: {
    key: 'salubri',
    name: 'Salubri',
    disciplines: ['auspex', 'dominate', 'fortitude'],
    boon: {
      key: 'healers_and_scholars',
      name: 'Healers and scholars',
      text: 'If this vampire performs the Awaken from torpor action, gain 2 ticks instead of 1.',
    },
    curse: { key: 'hated_by_kindred', name: 'Hated by kindred', text: 'You can only make one Gift action each turn.' },
  },
  toreador: {
    key: 'toreador',
    name: 'Toreador',
    disciplines: ['auspex', 'celerity', 'presence'],
    boon: { key: 'socialites', name: 'Socialites', text: 'All faction actions cost 5 blood less.' },
    curse: {
      key: 'obsession',
      name: 'Obsession',
      text: 'At the start of the game the GM generates a random obsession. The obsession can be an artifact, city or even a minion. If this vampire does not own or control their obsession they lose 10 blood at the end of every turn.',
    },
  },
  tremere: {
    key: 'tremere',
    name: 'Tremere',
    disciplines: ['auspex', 'dominate', 'thaumaturgy'],
    boon: {
      key: 'blood_mage',
      name: 'Blood mage',
      text: "If you only make one Thaumaturgy action during a round, it won't cost an action.",
    },
    curse: { key: 'the_broken_pyramid', name: 'The broken pyramid', text: "Can't have Lvl 3 minions." },
  },
  tzimisce: {
    key: 'tzimisce',
    name: 'Tzimisce',
    disciplines: ['animalism', 'dominate', 'vicissitude'],
    boon: {
      key: 'flesh_artist',
      name: 'Flesh artist',
      text: "If this vampire burns another vampire's minion gain 10/20/30 blood, depending on Lvl.",
    },
    curse: {
      key: 'bound_by_earth',
      name: 'Bound by earth',
      text: 'If this vampire ends their turn and is not in their domain, they lose 10 blood.',
    },
  },
  ventrue: {
    key: 'ventrue',
    name: 'Ventrue',
    disciplines: ['dominate', 'fortitude', 'presence'],
    boon: { key: 'ventrue_wealth', name: 'Ventrue wealth', text: 'Gain 10 blood every turn.' },
    curse: { key: 'picky_eater', name: 'Picky eater', text: 'Get -10 blood on every Bleed action.' },
  },
};
