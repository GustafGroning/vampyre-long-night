/**
 * "My vampires" (P18): kontots vampyrer utan kampanj. Lista, ny, ändra, ta bort.
 * Servern äger backloggen (P17); listan laddas om från svaret efter varje ändring.
 */
import { useEffect, useState } from 'react';
import { DEFAULT_CONTENT, type CharacterBuild, type CharacterSheet } from '@vampyre/engine';
import type { ApiClient } from '../server/apiClient';
import { CharacterBuilder, newBuild } from './CharacterBuilder';

const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

type Editing = { kind: 'new' } | { kind: 'edit'; sheet: CharacterSheet } | null;

export function CharacterList({ api }: { api: ApiClient }) {
  const [characters, setCharacters] = useState<CharacterSheet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  /** Borttagning kan inte ångras, så den kräver ett andra klick. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const content = DEFAULT_CONTENT;

  useEffect(() => {
    api
      .call({ op: 'characters' })
      .then((r) => setCharacters(r.characters))
      .catch((e: unknown) => setError(message(e)));
  }, [api]);

  const save = async (build: CharacterBuild) => {
    try {
      const res = await api.call({
        op: 'character_save',
        build,
        ...(editing?.kind === 'edit' ? { characterId: editing.sheet.id } : {}),
      });
      if (!res.ok) return res.issues;
      setCharacters(res.characters);
      setEditing(null);
      return null;
    } catch (e) {
      return message(e);
    }
  };

  const remove = async (sheet: CharacterSheet) => {
    try {
      setCharacters((await api.call({ op: 'character_delete', characterId: sheet.id })).characters);
      setConfirming(null);
      setError(null);
    } catch (e) {
      setError(message(e));
    }
  };

  if (editing) {
    return (
      <section aria-label={editing.kind === 'new' ? 'New vampire' : `Edit ${editing.sheet.build.name}`}>
        <h2>{editing.kind === 'new' ? 'New vampire' : `Edit ${editing.sheet.build.name}`}</h2>
        <CharacterBuilder
          initial={editing.kind === 'new' ? newBuild(content) : editing.sheet.build}
          content={content}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      </section>
    );
  }

  return (
    <section aria-label="My vampires">
      <h2>My vampires</h2>
      {error && <p role="alert">{error}</p>}
      {!characters && !error && <p>Loading…</p>}
      {characters && characters.length === 0 && <p>You have no vampires yet.</p>}
      {characters && characters.length > 0 && (
        <ul className="character-list">
          {characters.map((c) => {
            const title = content.titles[c.build.title].name;
            const disguise = c.build.disguise ? ` (disguised as ${content.titles[c.build.disguise].name})` : '';
            return (
              <li key={c.id}>
                <strong>{c.build.name}</strong> {content.clans[c.build.clan].name}, {title}
                {disguise}{' '}
                <button type="button" onClick={() => setEditing({ kind: 'edit', sheet: c })}>
                  Edit
                </button>{' '}
                {confirming === c.id ? (
                  <>
                    <button type="button" onClick={() => void remove(c)}>
                      Yes, remove {c.build.name}
                    </button>{' '}
                    <button type="button" onClick={() => setConfirming(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirming(c.id)} aria-label={`Remove ${c.build.name}`}>
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" onClick={() => setEditing({ kind: 'new' })}>
        + New vampire
      </button>
    </section>
  );
}
