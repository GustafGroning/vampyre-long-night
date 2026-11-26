/**
 * Spelarens backlog: karaktärer som inte är bundna till någon kampanj (K10).
 *
 * Rena funktioner som returnerar en ny backlog. Bara giltiga karaktärer sparas;
 * ett halvfärdigt bygge är UI-state. Id:n kommer från en räknare i backloggen
 * (`character-<n>`), aldrig från klockan.
 */
import type { Content } from '../content/index.js';
import { validateCharacterBuild, type CharacterRulesOptions } from './build.js';
import type { CharacterBuild, CreationIssue } from './types.js';

declare const characterBrand: unique symbol;
export type CharacterId = string & { readonly [characterBrand]: 'CharacterId' };

export interface CharacterSheet {
  readonly id: CharacterId;
  readonly build: CharacterBuild;
  /** Räknas upp vid varje ändring. En kampanj minns vilken version den kopierade. */
  readonly version: number;
}

export interface CharacterBacklog {
  /** Plattformens användar-id. Motorn tolkar det inte. */
  readonly ownerId: string;
  readonly nextId: number;
  readonly characters: Readonly<Record<CharacterId, CharacterSheet>>;
}

export type BacklogResult<T> =
  | ({ readonly ok: true; readonly backlog: CharacterBacklog } & T)
  | { readonly ok: false; readonly issues: readonly CreationIssue[] };

export function emptyBacklog(ownerId: string): CharacterBacklog {
  return { ownerId, nextId: 1, characters: {} };
}

export function getCharacter(backlog: CharacterBacklog, id: CharacterId): CharacterSheet | null {
  return backlog.characters[id] ?? null;
}

/** Karaktärerna i skapandeordning. */
export function listCharacters(backlog: CharacterBacklog): CharacterSheet[] {
  const n = (id: string): number => Number(id.slice(id.lastIndexOf('-') + 1));
  return Object.values(backlog.characters).sort((a, b) => n(a.id) - n(b.id));
}

/** Sparar en ny karaktär. Bygget valideras mot reglerna för backloggen (V1:s titlar). */
export function addCharacter(
  backlog: CharacterBacklog,
  build: CharacterBuild,
  content: Content,
  options: CharacterRulesOptions = {},
): BacklogResult<{ readonly characterId: CharacterId }> {
  const issues = validateCharacterBuild(build, content, options);
  if (issues.length > 0) return { ok: false, issues };
  const id = `character-${backlog.nextId}` as CharacterId;
  return {
    ok: true,
    characterId: id,
    backlog: {
      ...backlog,
      nextId: backlog.nextId + 1,
      characters: { ...backlog.characters, [id]: { id, build, version: 1 } },
    },
  };
}

/**
 * Ersätter bygget för en sparad karaktär. Kampanjer som redan kopierat
 * karaktären påverkas inte (K11).
 */
export function updateCharacter(
  backlog: CharacterBacklog,
  id: CharacterId,
  build: CharacterBuild,
  content: Content,
  options: CharacterRulesOptions = {},
): BacklogResult<object> {
  const current = backlog.characters[id];
  if (current === undefined) return { ok: false, issues: [{ path: 'characterId', message: `unknown character ${id}` }] };
  const issues = validateCharacterBuild(build, content, options);
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    backlog: {
      ...backlog,
      characters: { ...backlog.characters, [id]: { id, build, version: current.version + 1 } },
    },
  };
}

/** Tar bort en karaktär ur backloggen. Kampanjer som använder den behåller sin kopia. */
export function removeCharacter(backlog: CharacterBacklog, id: CharacterId): BacklogResult<object> {
  if (backlog.characters[id] === undefined) {
    return { ok: false, issues: [{ path: 'characterId', message: `unknown character ${id}` }] };
  }
  const characters = { ...backlog.characters };
  delete characters[id];
  return { ok: true, backlog: { ...backlog, characters } };
}
