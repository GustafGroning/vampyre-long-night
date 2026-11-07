/**
 * De 14 disciplinerna (SPEC A5). Själva disciplinaktionerna (bas och (M)) hör till
 * aktionskatalogen, som byggs i rond-/aktionsstegen.
 */
import type { Discipline } from '../state/enums.js';

export interface DisciplineDefinition {
  readonly key: Discipline;
  readonly name: string;
}

export const DISCIPLINE_DEFINITIONS: Readonly<Record<Discipline, DisciplineDefinition>> = {
  animalism: { key: 'animalism', name: 'Animalism' },
  auspex: { key: 'auspex', name: 'Auspex' },
  celerity: { key: 'celerity', name: 'Celerity' },
  chimerstry: { key: 'chimerstry', name: 'Chimerstry' },
  dementation: { key: 'dementation', name: 'Dementation' },
  dominate: { key: 'dominate', name: 'Dominate' },
  fortitude: { key: 'fortitude', name: 'Fortitude' },
  obfuscate: { key: 'obfuscate', name: 'Obfuscate' },
  oblivion: { key: 'oblivion', name: 'Oblivion' },
  potence: { key: 'potence', name: 'Potence' },
  presence: { key: 'presence', name: 'Presence' },
  protean: { key: 'protean', name: 'Protean' },
  thaumaturgy: { key: 'thaumaturgy', name: 'Thaumaturgy' },
  vicissitude: { key: 'vicissitude', name: 'Vicissitude' },
};
