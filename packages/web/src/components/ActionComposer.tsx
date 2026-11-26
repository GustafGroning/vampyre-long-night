/**
 * Den tomma bannern längst ned i listan. Klick öppnar en dropdown med alla
 * actions; kräver actionen val följer ett val i taget (dropdown, flerval, tal
 * eller text) tills motorn säger att actionen är klar.
 */
import { useState } from 'react';
import type { ActionChoice, DraftAction, ParamValue, Params, PlayerScreenPort, TargetStep } from '../screen/model';

type Building = { choice: ActionChoice; params: Params; labels: Record<string, string> };
type Mode = { kind: 'closed' } | { kind: 'choosing' } | ({ kind: 'building' } & Building);

interface Props {
  port: PlayerScreenPort;
  draft: readonly DraftAction[];
  onAdd: (choice: ActionChoice, params: Params, labels: Record<string, string>) => void;
}

function choiceText(c: ActionChoice): string {
  const cost = c.costVaries ? 'varies' : `${c.cost} blood`;
  const income = c.income ? `, +${c.income} blood` : '';
  const off = c.disabledReason ? ` (${c.disabledReason})` : '';
  return `${c.name} – ${cost}${income}${off}`;
}

function StepInput({ step, onDone }: { step: TargetStep; onDone: (value: ParamValue | ParamValue[], label: string) => void }) {
  const [text, setText] = useState(step.kind === 'number' ? String(step.min) : '');
  const [picked, setPicked] = useState<ParamValue[]>([]);

  if (step.kind === 'select' && !step.multiple) {
    return (
      <select
        autoFocus
        aria-label={step.label}
        defaultValue=""
        onChange={(e) => {
          const o = step.options.find((x) => String(x.value) === e.target.value);
          if (o) onDone(o.value, o.label);
        }}
      >
        <option value="" disabled>
          {step.label}…
        </option>
        {step.options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
            {o.hint ? ` (${o.hint})` : ''}
          </option>
        ))}
      </select>
    );
  }

  if (step.kind === 'select') {
    const { min, max } = step.multiple!;
    const ok = picked.length >= min && picked.length <= max;
    return (
      <fieldset className="multi-step">
        <legend>
          {step.label} ({min === max ? min : `${min}–${max}`})
        </legend>
        {step.options.map((o) => {
          const on = picked.includes(o.value);
          return (
            <label key={String(o.value)}>
              <input
                type="checkbox"
                checked={on}
                disabled={!on && picked.length >= max}
                onChange={() => setPicked((p) => (on ? p.filter((v) => v !== o.value) : [...p, o.value]))}
              />
              {o.label}
            </label>
          );
        })}
        <button
          type="button"
          disabled={!ok}
          onClick={() =>
            onDone(
              picked,
              step.options
                .filter((o) => picked.includes(o.value))
                .map((o) => o.label)
                .join(' + ') || 'none',
            )
          }
        >
          OK
        </button>
      </fieldset>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step.kind === 'number') {
      const n = Number(text);
      if (Number.isInteger(n) && n >= step.min && n <= step.max && (n - step.min) % step.step === 0) onDone(n, String(n));
    } else if (text.trim()) {
      onDone(text.trim(), `”${text.trim()}”`);
    }
  };
  return (
    <form className="number-step" onSubmit={submit}>
      {step.kind === 'number' ? (
        <input
          autoFocus
          type="number"
          aria-label={step.label}
          min={step.min}
          max={step.max}
          step={step.step}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      ) : (
        <input
          autoFocus
          type="text"
          aria-label={step.label}
          placeholder={step.maxWords ? `at most ${step.maxWords} words` : undefined}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      )}
      <button type="submit">OK</button>
    </form>
  );
}

export function ActionComposer({ port, draft, onAdd }: Props) {
  const [mode, setMode] = useState<Mode>({ kind: 'closed' });

  const advance = (b: Building) => {
    const step = port.nextStep(draft, b.choice.actionId, b.choice.performer, b.params);
    if (step === null) {
      onAdd(b.choice, b.params, b.labels);
      setMode({ kind: 'closed' });
    } else {
      setMode({ kind: 'building', ...b });
    }
  };

  if (mode.kind === 'closed') {
    return (
      <button type="button" className="action-banner empty" onClick={() => setMode({ kind: 'choosing' })}>
        + Add action
      </button>
    );
  }

  const cancel = (
    <button type="button" className="link-button" onClick={() => setMode({ kind: 'closed' })}>
      Cancel
    </button>
  );

  if (mode.kind === 'choosing') {
    const choices = port.actionChoices(draft);
    const groups = new Map<string, ActionChoice[]>();
    for (const c of choices) {
      const g = c.performerKind === 'vampire' ? c.performerName : `${c.performerName} (minion)`;
      groups.set(g, [...(groups.get(g) ?? []), c]);
    }
    return (
      <div className="action-banner composing">
        <select
          autoFocus
          aria-label="Choose action"
          defaultValue=""
          onChange={(e) => {
            const choice = choices.find((c) => c.key === e.target.value);
            if (choice) advance({ choice, params: {}, labels: {} });
          }}
        >
          <option value="" disabled>
            Choose action…
          </option>
          {[...groups].map(([name, list]) => (
            <optgroup key={name} label={name}>
              {list.map((c) => (
                <option key={c.key} value={c.key} disabled={c.disabledReason !== undefined}>
                  {choiceText(c)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {cancel}
      </div>
    );
  }

  const { choice, params, labels } = mode;
  const step = port.nextStep(draft, choice.actionId, choice.performer, params);
  if (!step) return null;
  return (
    <div className="action-banner composing">
      <span className="composing-name">
        {choice.name}
        {choice.performerKind === 'minion' ? ` (${choice.performerName})` : ''}
      </span>
      <StepInput
        key={`${choice.key}:${step.param}`}
        step={step}
        onDone={(value, label) =>
          advance({ choice, params: { ...params, [step.param]: value }, labels: { ...labels, [step.param]: label } })
        }
      />
      {cancel}
    </div>
  );
}
