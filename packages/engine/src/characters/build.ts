/**
 * Validering och härledning av ett karaktärsbygge (gd:654–861, SPEC A3/B7).
 *
 * `validateCharacterBuild` returnerar alla fel, så att ett UI kan visa dem
 * medan spelaren bygger. `deriveCharacter` ger det färdiga resultatet som
 * kampanjstarten gör om till en `PlayerSetup`.
 */
import type { Content } from '../content/index.js';
import type { ExpUpgradeKey } from '../content/expUpgrades.js';
import type { StartingPackage } from '../content/titles.js';
import {
  CLANS,
  DISCIPLINES,
  DISGUISE_TITLES,
  TITLES,
  type Clan,
  type Discipline,
  type DisciplineLevel,
  type DisguiseTitle,
  type Faction,
  type MinionLevel,
  type MinionType,
  type Stat,
  type Title,
} from '../state/enums.js';
import type { StartingCityUpgrade } from '../state/create.js';
import type { Disguise } from '../state/types.js';
import type { CharacterBuild, CreationIssue, CreationResult, MinionPick } from './types.js';

/** Titlar spelare kan välja i V1. Justicar byggs om av designern (K2). */
export const V1_CREATABLE_TITLES: readonly Title[] = ['inner_circle', 'prince', 'baron', 'archbishop'];

export const CHARACTER_NAME_MAX = 60;
export const CHARACTER_CONCEPT_MAX = 2000;

export interface CharacterRulesOptions {
  /** Titlar som får väljas. Standard: `V1_CREATABLE_TITLES`. */
  readonly allowedTitles?: readonly Title[];
}

/** Färdig karaktär: allt som behövs för att placera den i en kampanj. */
export interface DerivedCharacter {
  readonly name: string;
  readonly clan: Clan;
  readonly faction: Faction;
  readonly title: Title;
  readonly disguise: Disguise | null;
  readonly blood: number;
  readonly disciplines: Readonly<Partial<Record<Discipline, DisciplineLevel>>>;
  /** Permanenta stat-bonusar, en rad per källa och stat (S7). */
  readonly statBonuses: readonly { readonly stat: Stat; readonly amount: number; readonly source: string }[];
  readonly minions: readonly { readonly name: string; readonly type: MinionType; readonly level: MinionLevel }[];
  /** Titelns slumpartefakter plus My treasure-köp. Dras vid kampanjstart. */
  readonly randomArtifacts: number;
  readonly startingVp: number;
  readonly royalPrivileges: number;
  readonly expSpent: number;
  /** Titeln börjar med en stad (Prince, Baron, förklädd Archbishop). */
  readonly startsWithCity: boolean;
  readonly startingCityUpgrades: readonly StartingCityUpgrade[];
}

/**
 * Startpaketet för en titel. En Archbishop använder förklädnadens paket (SPEC A3).
 * `null` om titeln saknar paket eller förklädnaden saknas.
 */
export function startingPackageFor(
  content: Content,
  title: Title,
  disguise: DisguiseTitle | null,
): StartingPackage | null {
  if (title === 'archbishop') return disguise === null ? null : content.titles[disguise].startingPackage;
  return content.titles[title].startingPackage;
}

const STAT_SOURCE_CREATION = 'creation:stat_upgrade';

function clanDisciplines(content: Content, clan: Clan): readonly Discipline[] {
  return content.clans[clan].disciplines;
}

/** Validerar ett bygge. Tom lista = giltigt. */
export function validateCharacterBuild(
  build: CharacterBuild,
  content: Content,
  options: CharacterRulesOptions = {},
): CreationIssue[] {
  const r = analyse(build, content, options);
  return r.ok ? [] : [...r.issues];
}

/** Validerar och räknar fram den färdiga karaktären. */
export function deriveCharacter(
  build: CharacterBuild,
  content: Content,
  options: CharacterRulesOptions = {},
): CreationResult<DerivedCharacter> {
  return analyse(build, content, options);
}

function analyse(
  build: CharacterBuild,
  content: Content,
  options: CharacterRulesOptions,
): CreationResult<DerivedCharacter> {
  const issues: CreationIssue[] = [];
  const add = (path: string, message: string): void => {
    issues.push({ path, message });
  };
  const allowedTitles = options.allowedTitles ?? V1_CREATABLE_TITLES;

  // --- Namn och koncept -----------------------------------------------------
  const name = build.name.trim();
  if (name.length === 0) add('name', 'namnet får inte vara tomt');
  if (name.length > CHARACTER_NAME_MAX) add('name', `namnet får vara högst ${CHARACTER_NAME_MAX} tecken`);
  if (build.concept.length > CHARACTER_CONCEPT_MAX) {
    add('concept', `konceptet får vara högst ${CHARACTER_CONCEPT_MAX} tecken`);
  }

  // --- Klan, titel och förklädnad -------------------------------------------
  // Utan giltig klan eller titel går resten inte att kontrollera. Fel i namnet
  // ska inte dölja resten (UI:t visar alla fel medan spelaren bygger).
  const before = issues.length;
  if (!CLANS.includes(build.clan)) add('clan', `okänd klan "${build.clan}"`);
  if (!TITLES.includes(build.title)) add('title', `okänd titel "${build.title}"`);
  else if (!allowedTitles.includes(build.title)) add('title', `titeln ${build.title} går inte att välja`);
  if (build.title === 'archbishop') {
    if (build.disguise === null) add('disguise', 'en Archbishop måste välja förklädnad (Prince eller Baron)');
    else if (!DISGUISE_TITLES.includes(build.disguise)) add('disguise', `ogiltig förklädnad "${build.disguise}"`);
  } else if (build.disguise !== null) {
    add('disguise', 'bara en Archbishop har förklädnad');
  }
  if (issues.length > before) return { ok: false, issues };

  const pkg = startingPackageFor(content, build.title, build.disguise);
  if (pkg === null) {
    add('title', `titeln ${build.title} saknar startpaket`);
    return { ok: false, issues };
  }
  const isTremere = build.clan === 'tremere';

  // --- Discipliner som karaktären har --------------------------------------
  const owned = new Set<Discipline>(clanDisciplines(content, build.clan));
  const learn = (d: Discipline, path: string): void => {
    if (!DISCIPLINES.includes(d)) add(path, `okänd disciplin "${d}"`);
    else if (owned.has(d)) add(path, `har redan ${d}`);
    else owned.add(d);
  };

  // --- Minions --------------------------------------------------------------
  const minions: { name: string; type: MinionType; level: MinionLevel }[] = [];
  const checkMinion = (pick: MinionPick, types: readonly MinionType[], level: MinionLevel, path: string): void => {
    const minionName = pick.name.trim();
    if (minionName.length === 0) add(`${path}.name`, 'minionen måste ha ett namn');
    if (minionName.length > CHARACTER_NAME_MAX) add(`${path}.name`, `namnet får vara högst ${CHARACTER_NAME_MAX} tecken`);
    if (!types.includes(pick.type)) add(`${path}.type`, `${pick.type} är inte tillåten här (${types.join('/')})`);
    if (isTremere && level === 3) add(path, 'Tremere kan inte ha LV3-minions (The broken pyramid)');
    minions.push({ name: minionName, type: pick.type, level });
  };

  const pkgIndex = build.minions.packageIndex;
  const minionPackage = pkg.minionOptions[pkgIndex];
  if (!Number.isInteger(pkgIndex) || minionPackage === undefined) {
    add('minions.packageIndex', `minionpaket ${pkgIndex} finns inte (0–${pkg.minionOptions.length - 1})`);
  } else if (build.minions.picks.length !== minionPackage.length) {
    add('minions.picks', `paketet har ${minionPackage.length} platser, fick ${build.minions.picks.length} val`);
  } else {
    minionPackage.forEach((slot, i) => {
      const pick = build.minions.picks[i] as MinionPick;
      checkMinion(pick, slot.types, slot.level, `minions.picks[${i}]`);
    });
  }

  // --- Startuppgraderingar (2 av 4) -----------------------------------------
  let blood = pkg.blood;
  const statBonuses = new Map<string, { stat: Stat; amount: number; source: string }>();
  const addStat = (stat: Stat, source: string): void => {
    const key = `${source}|${stat}`;
    const cur = statBonuses.get(key);
    if (cur) cur.amount += 1;
    else statBonuses.set(key, { stat, amount: 1, source });
  };
  const cityUpgrades: StartingCityUpgrade[] = [];

  const upgradeCount = Math.min(2, pkg.upgradeOptions.length);
  if (build.startingUpgrades.length !== upgradeCount) {
    add('startingUpgrades', `välj exakt ${upgradeCount} startuppgraderingar, fick ${build.startingUpgrades.length}`);
  }
  const usedOptions = new Set<number>();
  build.startingUpgrades.forEach((choice, i) => {
    const path = `startingUpgrades[${i}]`;
    const opt = pkg.upgradeOptions[choice.option];
    if (!Number.isInteger(choice.option) || opt === undefined) {
      add(`${path}.option`, `alternativ ${choice.option} finns inte`);
      return;
    }
    if (usedOptions.has(choice.option)) {
      add(`${path}.option`, `alternativ ${choice.option} är redan valt`);
      return;
    }
    usedOptions.add(choice.option);
    if (opt.kind !== choice.kind) {
      add(`${path}.kind`, `alternativ ${choice.option} är ${opt.kind}, inte ${choice.kind}`);
      return;
    }
    switch (choice.kind) {
      case 'extra_discipline':
        learn(choice.discipline, `${path}.discipline`);
        break;
      case 'stat':
        if (opt.kind === 'stat' && !opt.stats.includes(choice.stat)) {
          add(`${path}.stat`, `${choice.stat} är inte tillåten (${opt.stats.join('/')})`);
        } else addStat(choice.stat, STAT_SOURCE_CREATION);
        break;
      case 'minion':
        if (opt.kind === 'minion') checkMinion(choice.minion, opt.types, opt.level, `${path}.minion`);
        break;
      case 'blood':
        if (opt.kind === 'blood') blood += opt.amount;
        break;
      case 'city_blood_flow':
        if (opt.kind === 'city_blood_flow') cityUpgrades.push({ kind: 'blood_flow', amount: opt.amount });
        break;
      case 'city_intercept':
        if (opt.kind === 'city_intercept') cityUpgrades.push({ kind: 'intercept', amount: opt.amount });
        break;
      case 'city_special':
        if (opt.kind === 'city_special' && !opt.specials.includes(choice.special)) {
          add(`${path}.special`, `${choice.special} är inte tillåten (${opt.specials.join('/')})`);
        } else cityUpgrades.push({ kind: 'special', key: choice.special });
        break;
    }
  });

  // EXP-köpta discipliner lärs in före bemästring, oavsett ordning i listan (K7).
  build.expPurchases.forEach((p, i) => {
    if (p.upgrade === 'extra_discipline') learn(p.discipline, `expPurchases[${i}].discipline`);
  });

  // --- Bemästrade discipliner från titeln ----------------------------------
  const mastered = new Set<Discipline>();
  const master = (d: Discipline, path: string): void => {
    if (!owned.has(d)) add(path, `kan inte bemästra ${d}: karaktären har den inte`);
    else if (mastered.has(d)) add(path, `${d} är redan bemästrad`);
    else mastered.add(d);
  };
  if (build.masteredDisciplines.length !== pkg.masteredDisciplines) {
    add(
      'masteredDisciplines',
      `titeln ger ${pkg.masteredDisciplines} bemästrade discipliner, fick ${build.masteredDisciplines.length}`,
    );
  }
  build.masteredDisciplines.forEach((d, i) => master(d, `masteredDisciplines[${i}]`));

  // --- EXP ----------------------------------------------------------------
  let expSpent = 0;
  let treasures = 0;
  const statPurchases = new Map<ExpUpgradeKey, number>();
  build.expPurchases.forEach((p, i) => {
    const path = `expPurchases[${i}]`;
    const def = content.expUpgrades[p.upgrade];
    if (def === undefined) {
      add(`${path}.upgrade`, `okänd uppgradering "${String(p.upgrade)}"`);
      return;
    }
    expSpent += def.cost;
    switch (p.upgrade) {
      case 'extra_discipline':
        break; // redan inlärd ovan
      case 'mastered_discipline':
        master(p.discipline, `${path}.discipline`);
        break;
      case 'my_treasure':
        treasures += 1;
        break;
      default: {
        if (def.stat === null) break;
        const n = (statPurchases.get(p.upgrade) ?? 0) + 1;
        statPurchases.set(p.upgrade, n);
        if (n > def.stat.maxPurchases) add(path, `${def.name} kan köpas högst ${def.stat.maxPurchases} gånger`);
        else addStat(def.stat.stat, `exp:${p.upgrade}`);
      }
    }
  });
  if (expSpent !== pkg.startingExp) {
    add('expPurchases', `all start-EXP måste spenderas: titeln ger ${pkg.startingExp}, köpen kostar ${expSpent}`);
  }
  if (expSpent > content.rules.expLifetimeCap) {
    add('expPurchases', `högst ${content.rules.expLifetimeCap} EXP per kampanj`);
  }

  if (issues.length > 0) return { ok: false, issues };

  const disciplines: Partial<Record<Discipline, DisciplineLevel>> = {};
  for (const d of DISCIPLINES) if (owned.has(d)) disciplines[d] = mastered.has(d) ? 'mastered' : 'basic';

  const disguise: Disguise | null =
    build.title === 'archbishop' && build.disguise !== null
      ? { title: build.disguise, faction: content.titles[build.disguise].faction as Disguise['faction'] }
      : null;

  return {
    ok: true,
    value: {
      name,
      clan: build.clan,
      faction: content.titles[build.title].faction,
      title: build.title,
      disguise,
      blood,
      disciplines,
      statBonuses: [...statBonuses.values()],
      minions,
      randomArtifacts: pkg.randomArtifacts + treasures,
      startingVp: pkg.vp,
      royalPrivileges: pkg.royalPrivileges,
      expSpent,
      startsWithCity: pkg.startsWithCity,
      startingCityUpgrades: cityUpgrades,
    },
  };
}
