/**
 * Byggformuläret för en vampyr (P19): alla val synliga, motorns fel live.
 * Ingen design; bara flödet. Reglerna kontrolleras av `validateCharacterBuild`,
 * så formuläret visar vad motorn säger i stället för att ha egna regler.
 */
import { useMemo, useState } from 'react';
import {
  CLANS,
  DEFAULT_CONTENT,
  DISCIPLINES,
  DISGUISE_TITLES,
  EXP_UPGRADE_KEYS,
  STARTING_CITY_SPECIALS,
  V1_CREATABLE_TITLES,
  startingPackageFor,
  validateCharacterBuild,
  type CharacterBuild,
  type Content,
  type CreationIssue,
  type Discipline,
  type ExpPurchase,
  type MinionPick,
  type StartingPackage,
  type StartingUpgrade,
  type StartingUpgradeChoice,
  type Title,
} from '@vampyre/engine';

const STAT_NAMES: Record<string, string> = { strength: 'Strength', stealth: 'Stealth', intercept: 'Intercept' };

function defaultPicks(pkg: StartingPackage | null, index: number, old: readonly MinionPick[] = []): MinionPick[] {
  const slots = pkg?.minionOptions[index] ?? [];
  return slots.map((slot, i) => ({
    type: old[i] && slot.types.includes(old[i].type) ? old[i].type : slot.types[0]!,
    name: old[i]?.name ?? '',
  }));
}

export function newBuild(content: Content = DEFAULT_CONTENT): CharacterBuild {
  const title: Title = 'prince';
  return {
    name: '',
    concept: '',
    clan: CLANS[0],
    title,
    disguise: null,
    minions: { packageIndex: 0, picks: defaultPicks(startingPackageFor(content, title, null), 0) },
    masteredDisciplines: [],
    startingUpgrades: [],
    expPurchases: [],
  };
}

/** Standardval för ett alternativ när spelaren kryssar i det. */
function defaultChoice(option: number, opt: StartingUpgrade): StartingUpgradeChoice {
  switch (opt.kind) {
    case 'extra_discipline':
      return { option, kind: opt.kind, discipline: DISCIPLINES[0] };
    case 'stat':
      return { option, kind: opt.kind, stat: opt.stats[0]! };
    case 'minion':
      return { option, kind: opt.kind, minion: { type: opt.types[0]!, name: '' } };
    case 'city_special':
      return { option, kind: opt.kind, special: opt.specials[0]! };
    default:
      return { option, kind: opt.kind };
  }
}

function describeUpgrade(opt: StartingUpgrade, content: Content): string {
  switch (opt.kind) {
    case 'extra_discipline':
      return 'Extra discipline';
    case 'stat':
      return `+1 ${opt.stats.map((s) => STAT_NAMES[s] ?? s).join('/')}`;
    case 'minion':
      return `En LV${opt.level} minion (${opt.types.map((t) => content.minionTypes[t].name).join('/')})`;
    case 'blood':
      return `+${opt.amount} Blood`;
    case 'city_blood_flow':
      return `Staden: +${opt.amount} Blood flow`;
    case 'city_intercept':
      return `Staden: +${opt.amount} Intercept`;
    case 'city_special':
      return `Staden får en special (${opt.specials.map((k) => STARTING_CITY_SPECIALS[k]?.name ?? k).join('/')})`;
  }
}

function defaultPurchase(upgrade: ExpPurchase['upgrade']): ExpPurchase {
  return upgrade === 'extra_discipline' || upgrade === 'mastered_discipline'
    ? { upgrade, discipline: DISCIPLINES[0] }
    : { upgrade };
}

/** Disciplinerna karaktären har med de val som gjorts hittills (för listan över bemästrade). */
function ownedDisciplines(build: CharacterBuild, content: Content): Discipline[] {
  const owned = new Set<Discipline>(content.clans[build.clan]?.disciplines ?? []);
  for (const u of build.startingUpgrades) if (u.kind === 'extra_discipline') owned.add(u.discipline);
  for (const p of build.expPurchases) if (p.upgrade === 'extra_discipline') owned.add(p.discipline);
  return DISCIPLINES.filter((d) => owned.has(d));
}

function Issues({ issues, prefix }: { issues: readonly CreationIssue[]; prefix: string }) {
  const mine = issues.filter((i) => i.path === prefix || i.path.startsWith(`${prefix}.`) || i.path.startsWith(`${prefix}[`));
  if (mine.length === 0) return null;
  return (
    <ul className="build-issues" aria-label={`Fel: ${prefix}`}>
      {mine.map((i, n) => (
        <li key={n}>{i.message}</li>
      ))}
    </ul>
  );
}

export function CharacterBuilder({
  initial,
  content = DEFAULT_CONTENT,
  onSave,
  onCancel,
}: {
  initial: CharacterBuild;
  content?: Content;
  /** Returnerar serverns fel, eller null när det sparades. */
  onSave: (build: CharacterBuild) => Promise<readonly CreationIssue[] | string | null>;
  onCancel: () => void;
}) {
  const [build, setBuild] = useState<CharacterBuild>(initial);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const issues = useMemo(() => validateCharacterBuild(build, content), [build, content]);
  const pkg = startingPackageFor(content, build.title, build.disguise);
  const set = (patch: Partial<CharacterBuild>) => setBuild((b) => ({ ...b, ...patch }));

  /** Ny titel eller förklädnad = nytt startpaket; valen som hör till paketet nollställs. */
  const setPackage = (title: Title, disguise: CharacterBuild['disguise']) => {
    const next = startingPackageFor(content, title, disguise);
    set({
      title,
      disguise,
      minions: { packageIndex: 0, picks: defaultPicks(next, 0, build.minions.picks) },
      masteredDisciplines: [],
      startingUpgrades: [],
      expPurchases: [],
    });
  };

  const upgradeCount = pkg ? Math.min(2, pkg.upgradeOptions.length) : 0;
  const expSpent = build.expPurchases.reduce((n, p) => n + (content.expUpgrades[p.upgrade]?.cost ?? 0), 0);
  const owned = ownedDisciplines(build, content);

  const setUpgrade = (option: number, choice: StartingUpgradeChoice | null) => {
    const rest = build.startingUpgrades.filter((u) => u.option !== option);
    const next = choice ? [...rest, choice] : rest;
    set({ startingUpgrades: next.sort((a, b) => a.option - b.option) });
  };

  const setPurchase = (i: number, p: ExpPurchase | null) => {
    const next = [...build.expPurchases];
    if (p) next[i] = p;
    else next.splice(i, 1);
    set({ expPurchases: next });
  };

  return (
    <form
      className="character-builder"
      aria-label="Bygg vampyr"
      onSubmit={async (e) => {
        e.preventDefault();
        if (issues.length > 0) return;
        setBusy(true);
        const res = await onSave(build);
        setBusy(false);
        if (res === null) return;
        setServerError(typeof res === 'string' ? res : res.map((i) => `${i.path}: ${i.message}`).join('; '));
      }}
    >
      <fieldset>
        <legend>Vampyren</legend>
        <label>
          Namn
          <input value={build.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <Issues issues={issues} prefix="name" />
        <label>
          Koncept
          <textarea value={build.concept} onChange={(e) => set({ concept: e.target.value })} />
        </label>
        <Issues issues={issues} prefix="concept" />
        <label>
          Klan
          <select value={build.clan} onChange={(e) => set({ clan: e.target.value as CharacterBuild['clan'] })}>
            {CLANS.map((c) => (
              <option key={c} value={c}>
                {content.clans[c].name} ({content.clans[c].disciplines.map((d) => content.disciplines[d].name).join(', ')})
              </option>
            ))}
          </select>
        </label>
        <Issues issues={issues} prefix="clan" />
        <label>
          Titel
          <select
            value={build.title}
            onChange={(e) => {
              const title = e.target.value as Title;
              setPackage(title, title === 'archbishop' ? DISGUISE_TITLES[0] : null);
            }}
          >
            {V1_CREATABLE_TITLES.map((t) => (
              <option key={t} value={t}>
                {content.titles[t].name}
              </option>
            ))}
          </select>
        </label>
        <Issues issues={issues} prefix="title" />
        {build.title === 'archbishop' && (
          <label>
            Förklädnad
            <select
              value={build.disguise ?? ''}
              onChange={(e) => setPackage('archbishop', e.target.value as CharacterBuild['disguise'])}
            >
              {DISGUISE_TITLES.map((t) => (
                <option key={t} value={t}>
                  {content.titles[t].name}
                </option>
              ))}
            </select>
          </label>
        )}
        <Issues issues={issues} prefix="disguise" />
      </fieldset>

      {pkg && (
        <>
          <p>
            Startpaket: {pkg.blood} Blood, {pkg.vp} VP, {pkg.royalPrivileges} Royal Privileges, {pkg.randomArtifacts}{' '}
            artefakter{pkg.startsWithCity ? ', en stad' : ''}.
          </p>

          <fieldset>
            <legend>Minions (välj ett paket)</legend>
            {pkg.minionOptions.map((slots, i) => (
              <label key={i}>
                <input
                  type="radio"
                  name="minion-package"
                  checked={build.minions.packageIndex === i}
                  onChange={() =>
                    set({ minions: { packageIndex: i, picks: defaultPicks(pkg, i, build.minions.picks) } })
                  }
                />
                {slots
                  .map((s) => `LV${s.level} ${s.types.map((t) => content.minionTypes[t].name).join('/')}`)
                  .join(' + ')}
              </label>
            ))}
            {(pkg.minionOptions[build.minions.packageIndex] ?? []).map((slot, i) => {
              const pick = build.minions.picks[i] ?? { type: slot.types[0]!, name: '' };
              const setPick = (p: MinionPick) => {
                const picks = [...build.minions.picks];
                picks[i] = p;
                set({ minions: { ...build.minions, picks } });
              };
              return (
                <div key={i} className="minion-pick">
                  <span>Minion {i + 1} (LV{slot.level})</span>
                  {slot.types.length > 1 ? (
                    <select
                      aria-label={`Minion ${i + 1} typ`}
                      value={pick.type}
                      onChange={(e) => setPick({ ...pick, type: e.target.value as MinionPick['type'] })}
                    >
                      {slot.types.map((t) => (
                        <option key={t} value={t}>
                          {content.minionTypes[t].name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span> {content.minionTypes[slot.types[0]!].name} </span>
                  )}
                  <input
                    aria-label={`Minion ${i + 1} namn`}
                    placeholder="Namn"
                    value={pick.name}
                    onChange={(e) => setPick({ ...pick, name: e.target.value })}
                  />
                </div>
              );
            })}
            <Issues issues={issues} prefix="minions" />
          </fieldset>

          <fieldset>
            <legend>Startuppgraderingar (välj {upgradeCount})</legend>
            {pkg.upgradeOptions.map((opt, option) => {
              const choice = build.startingUpgrades.find((u) => u.option === option) ?? null;
              const index = build.startingUpgrades.findIndex((u) => u.option === option);
              return (
                <div key={option} className="upgrade-option">
                  <label>
                    <input
                      type="checkbox"
                      checked={choice !== null}
                      onChange={(e) => setUpgrade(option, e.target.checked ? defaultChoice(option, opt) : null)}
                    />
                    {describeUpgrade(opt, content)}
                  </label>
                  {choice?.kind === 'extra_discipline' && (
                    <select
                      aria-label="Extra discipline"
                      value={choice.discipline}
                      onChange={(e) => setUpgrade(option, { ...choice, discipline: e.target.value as Discipline })}
                    >
                      {DISCIPLINES.map((d) => (
                        <option key={d} value={d}>
                          {content.disciplines[d].name}
                        </option>
                      ))}
                    </select>
                  )}
                  {choice?.kind === 'stat' && opt.kind === 'stat' && (
                    <select
                      aria-label="Stat"
                      value={choice.stat}
                      onChange={(e) => setUpgrade(option, { ...choice, stat: e.target.value as typeof choice.stat })}
                    >
                      {opt.stats.map((s) => (
                        <option key={s} value={s}>
                          {STAT_NAMES[s] ?? s}
                        </option>
                      ))}
                    </select>
                  )}
                  {choice?.kind === 'minion' && opt.kind === 'minion' && (
                    <>
                      <select
                        aria-label="Extra minion typ"
                        value={choice.minion.type}
                        onChange={(e) =>
                          setUpgrade(option, { ...choice, minion: { ...choice.minion, type: e.target.value as MinionPick['type'] } })
                        }
                      >
                        {opt.types.map((t) => (
                          <option key={t} value={t}>
                            {content.minionTypes[t].name}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label="Extra minion namn"
                        placeholder="Namn"
                        value={choice.minion.name}
                        onChange={(e) => setUpgrade(option, { ...choice, minion: { ...choice.minion, name: e.target.value } })}
                      />
                    </>
                  )}
                  {choice?.kind === 'city_special' && opt.kind === 'city_special' && (
                    <select
                      aria-label="Stadens special"
                      value={choice.special}
                      onChange={(e) => setUpgrade(option, { ...choice, special: e.target.value })}
                    >
                      {opt.specials.map((s) => (
                        <option key={s} value={s}>
                          {STARTING_CITY_SPECIALS[s]?.name ?? s}: {STARTING_CITY_SPECIALS[s]?.text ?? ''}
                        </option>
                      ))}
                    </select>
                  )}
                  {index >= 0 && <Issues issues={issues} prefix={`startingUpgrades[${index}]`} />}
                </div>
              );
            })}
            <Issues issues={issues.filter((i) => i.path === 'startingUpgrades')} prefix="startingUpgrades" />
          </fieldset>

          <fieldset>
            <legend>Bemästrade discipliner (välj {pkg.masteredDisciplines})</legend>
            {owned.map((d) => (
              <label key={d}>
                <input
                  type="checkbox"
                  checked={build.masteredDisciplines.includes(d)}
                  onChange={(e) =>
                    set({
                      masteredDisciplines: e.target.checked
                        ? [...build.masteredDisciplines, d]
                        : build.masteredDisciplines.filter((x) => x !== d),
                    })
                  }
                />
                {content.disciplines[d].name}
              </label>
            ))}
            <Issues issues={issues} prefix="masteredDisciplines" />
          </fieldset>

          <fieldset>
            <legend>
              EXP: {expSpent} av {pkg.startingExp} spenderat
            </legend>
            {build.expPurchases.map((p, i) => (
              <div key={i} className="exp-purchase">
                <select
                  aria-label={`EXP-köp ${i + 1}`}
                  value={p.upgrade}
                  onChange={(e) => setPurchase(i, defaultPurchase(e.target.value as ExpPurchase['upgrade']))}
                >
                  {EXP_UPGRADE_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {content.expUpgrades[k].name} ({content.expUpgrades[k].cost} EXP)
                    </option>
                  ))}
                </select>
                {(p.upgrade === 'extra_discipline' || p.upgrade === 'mastered_discipline') && (
                  <select
                    aria-label={`EXP-köp ${i + 1} disciplin`}
                    value={p.discipline}
                    onChange={(e) => setPurchase(i, { ...p, discipline: e.target.value as Discipline })}
                  >
                    {DISCIPLINES.map((d) => (
                      <option key={d} value={d}>
                        {content.disciplines[d].name}
                      </option>
                    ))}
                  </select>
                )}
                <button type="button" onClick={() => setPurchase(i, null)}>
                  Ta bort
                </button>
                <Issues issues={issues} prefix={`expPurchases[${i}]`} />
              </div>
            ))}
            <button
              type="button"
              onClick={() => set({ expPurchases: [...build.expPurchases, defaultPurchase('unseen')] })}
            >
              + EXP-köp
            </button>
            <Issues issues={issues.filter((i) => i.path === 'expPurchases')} prefix="expPurchases" />
          </fieldset>
        </>
      )}

      {issues.length > 0 && <p role="status">{issues.length} saker kvar att rätta innan vampyren kan sparas.</p>}
      {serverError && <p role="alert">{serverError}</p>}
      <button type="submit" disabled={busy || issues.length > 0}>
        Spara vampyren
      </button>
      <button type="button" onClick={onCancel}>
        Avbryt
      </button>
    </form>
  );
}
