/**
 * Huvudskärmens modell: det enda komponenterna känner till.
 *
 * Komponenterna ser aldrig `GameState` eller `PlayerView`. All data går genom
 * `PlayerScreenPort`, som i utveckling kör motorn lokalt (`localPort.ts`) och i
 * spelet pratar med servern (`serverPort.ts`; SPEC B1: motorn körs bara på servern).
 */

export type FactionKey = 'camarilla' | 'anarch' | 'sabbat';

// ---------------------------------------------------------------------------
// Resurser, vampyr, rond

export interface Resources {
  blood: number;
  vp: number;
  artifacts: number;
  minions: number;
  /** Röster i Vampiric Society (alla sekter röstar). */
  votes: number;
}

export interface VampireSummary {
  name: string;
  /** Titel som text, t.ex. "Prince of North". null = ingen titel. */
  titleLabel: string | null;
  stats: { strength: number; stealth: number; intercept: number };
}

export interface RoundInfo {
  round: number;
  maxRounds: number;
}

// ---------------------------------------------------------------------------
// Karta

export interface MapPiece {
  id: string;
  kind: 'vampire' | 'minion';
  name: string;
  /** Spelarens egen pjäs. */
  own: boolean;
  /** Ägarens namn (för andras pjäser). */
  ownerName: string;
  /** Minion-typ, t.ex. "Ghoul". */
  minionType?: string;
}

export interface MapCity {
  id: string;
  name: string;
  /** Position i kartans koordinatsystem (0–1000 × 0–700). */
  x: number;
  y: number;
  /** Kontrollerande faction som spelaren ser den. null = ingen controller. */
  faction: FactionKey | null;
  /** Bara pjäser spelaren garanterat vet är här. */
  pieces: MapPiece[];
}

export interface MapModel {
  cities: MapCity[];
  /** Oriktade kopplingar, varje par en gång. */
  links: [string, string][];
}

// ---------------------------------------------------------------------------
// Artefakter (Artifacts-fliken)

/** Vem som har en artefakt, så som spelaren garanterat vet det. */
export interface ArtifactOwner {
  /** T.ex. "You", "Lady Ashford", "Jenny (Lady Ashford's minion)", "Lying in London". */
  label: string;
  /** Spelaren själv eller en egen minion. */
  own: boolean;
  /** Hur spelaren vet det, t.ex. "You hold it" eller "Seen using it in round 2". */
  how: string;
}

/** En artefakt i kampanjens fasta lista. */
export interface ArtifactEntry {
  key: string;
  name: string;
  text: string;
  /** T.ex. "5 Blood", eller "Same as the chosen discipline". */
  cost: string;
  /** T.ex. "+1", "Undetectable", "Can't be hidden". */
  stealth: string;
  /** Vad en minion som bär den får, eller null om minions inte kan bära den. */
  minionBonus: string | null;
  /** Regelnoter: Trifle, bränns, torpor, gratisaktion. */
  notes: string[];
  /** Kända bärare. Tom = Unknown. */
  owners: ArtifactOwner[];
}

// ---------------------------------------------------------------------------
// Actions

export type PerformerRef = { kind: 'vampire' } | { kind: 'minion'; minionId: string };

export type ParamValue = string | number;
/** Ett val: ett värde, eller en lista vid flerval. */
export type Params = Record<string, ParamValue | ParamValue[]>;

/** En action som går att välja i dropdownen. */
export interface ActionChoice {
  /** Unik nyckel för (action, performer). */
  key: string;
  actionId: string;
  performer: PerformerRef;
  /** Vem som utför den, t.ex. vampyrens eller minionens namn. */
  performerName: string;
  performerKind: 'vampire' | 'minion';
  name: string;
  /** Kostnad innan val. `costVaries` = beror på valen. */
  cost: number;
  costVaries: boolean;
  /** Deterministisk inkomst, eller null. */
  income: number | null;
  /** Satt om actionen inte går att välja nu, med skälet. */
  disabledReason?: string;
}

/** Nästa val för en action under uppbyggnad. */
export type TargetStep =
  | {
      kind: 'select';
      param: string;
      label: string;
      options: { value: ParamValue; label: string; hint?: string }[];
      /** Flerval: välj min–max alternativ. */
      multiple?: { min: number; max: number };
    }
  | {
      kind: 'number';
      param: string;
      label: string;
      min: number;
      max: number;
      step: number;
    }
  | {
      kind: 'text';
      param: string;
      label: string;
      maxWords?: number;
    };

/** En färdig action i spelarens lista. */
export interface DraftAction {
  /** Lokal id för listan, stabil vid omsortering. Skickas som entryns `key`. */
  uid: string;
  actionId: string;
  performer: PerformerRef;
  params: Params;
  /** Visningstext per val, sparad när valet gjordes. */
  paramLabels: Record<string, string>;
}

export interface DraftEntryInfo {
  /** T.ex. "Move från North till East". */
  label: string;
  performerName: string;
  performerKind: 'vampire' | 'minion';
  /** Blood-kostnad, eller null om den beror på val som saknas. */
  cost: number | null;
  /** Deterministisk blood-inkomst, eller null om actionen inte ger en säker inkomst. */
  income: number | null;
  /** Fel som gäller just den här raden. */
  errors: string[];
}

/** En minions egna actions (varje minion har en action, Anarch Mission kan ge en till). */
export interface MinionActionCount {
  minionId: string;
  name: string;
  used: number;
  allowed: number;
}

/** Royal Privileges (gd:923): en Prince kan spendera 1 för en extra action i ronden. */
export interface RoyalPrivilegeInfo {
  /** Hur många spelaren har. 0 = ingen kontroll ska visas. */
  available: number;
  /** Hur många listan spenderar (redan inräknat i `apTotal`). */
  spending: number;
  /**
   * Högst så många ger faktiskt en extra action. Lägre än `available` när
   * budgeten har ett tak (torpor, Invite to the Camarilla): fler spenderade
   * förbrukas ändå vid upplösningen men ger inget.
   */
  maxUseful: number;
  /** Så många behövs för listans vampyraktioner. */
  needed: number;
}

/** Det som lämnas in med listan utöver själva actions. */
export interface DraftExtras {
  royalPrivilegesToSpend: number;
}

export interface DraftAnalysis {
  entries: DraftEntryInfo[];
  /** Bara vampyrens slots. */
  apUsed: number;
  /** Inklusive extra actions från spenderade Royal Privileges. */
  apTotal: number;
  royalPrivileges: RoyalPrivilegeInfo;
  /** En rad per egen minion, i id-ordning. */
  minionActions: MinionActionCount[];
  totalCost: number;
  totalIncome: number;
  /** Fel som inte hör till en enskild rad. */
  errors: string[];
  warnings: string[];
  canConfirm: boolean;
}

export interface ConfirmResult {
  ok: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Porten

export interface MainScreenData {
  round: RoundInfo;
  resources: Resources;
  vampire: VampireSummary;
  map: MapModel;
  /** Alla artefakter i kampanjen, med bara de bärare spelaren garanterat vet. */
  artifacts: ArtifactEntry[];
}

export interface PlayerScreenPort {
  load(): MainScreenData;
  /** Alla actions spelaren kan välja, givet listan hittills (t.ex. efter en Move). */
  actionChoices(draft: readonly DraftAction[]): ActionChoice[];
  /**
   * Nästa val för en action under uppbyggnad, eller null när actionen är klar.
   * `before` = listans actions före den nya (avgör t.ex. var vampyren står).
   */
  nextStep(
    before: readonly DraftAction[],
    actionId: string,
    performer: PerformerRef,
    params: Params,
  ): TargetStep | null;
  /** `extras` saknas = inga Royal Privileges spenderas. */
  analyze(draft: readonly DraftAction[], extras?: DraftExtras): DraftAnalysis;
  /** Lämnar in listan, med de Royal Privileges som spenderas. Servern validerar och låser. */
  confirm(draft: readonly DraftAction[], extras?: DraftExtras): Promise<ConfirmResult>;
  /** Låser upp en inlämnad lista. Listan finns kvar. */
  unlock(): Promise<void>;
  isLocked(): boolean;
  /** Listan som redan är inlämnad i ronden (efter omladdning), annars tom. */
  initialDraft(): DraftAction[];
  /** Royal Privileges i den inlämnade listan. */
  initialExtras(): DraftExtras;
}
