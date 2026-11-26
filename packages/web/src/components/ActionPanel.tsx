import { useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { addAction, moveAction, removeAction, shiftAction } from '../screen/draft';
import type { DraftAction, DraftEntryInfo, PlayerScreenPort, RoyalPrivilegeInfo } from '../screen/model';
import { ActionComposer } from './ActionComposer';

function Blood({ amount, income }: { amount: number | null; income?: boolean }) {
  return (
    <span className={income ? 'blood income' : 'blood'}>
      {income ? '+' : ''}
      {amount ?? '?'} <span aria-hidden>🩸</span>
      <span className="sr-only"> blood{income ? ' income' : ''}</span>
    </span>
  );
}

interface RowProps {
  action: DraftAction;
  info: DraftEntryInfo;
  index: number;
  count: number;
  locked: boolean;
  onRemove: () => void;
  onShift: (d: -1 | 1) => void;
}

function DraftRow({ action, info, index, count, locked, onRemove, onShift }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: action.uid,
    disabled: locked,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`action-banner filled${isDragging ? ' dragging' : ''}${info.errors.length ? ' has-error' : ''}`}
      data-testid="draft-row"
    >
      {!locked && (
        <button type="button" className="drag-handle" aria-label={`Move ${info.label}`} {...attributes} {...listeners}>
          ⠿
        </button>
      )}
      <span className="performer" title={info.performerName} aria-label={info.performerKind === 'vampire' ? 'Vampire' : `Minion ${info.performerName}`}>
        {info.performerKind === 'vampire' ? 'V' : 'M'}
      </span>
      <span className="action-label">
        {index + 1}. {info.label}
        {info.performerKind === 'minion' && <span className="performer-name"> ({info.performerName})</span>}
        {info.errors.map((e) => (
          <span key={e} className="row-error" role="alert">
            {e}
          </span>
        ))}
      </span>
      <span className="action-cost">
        <Blood amount={info.cost} />
        {info.income !== null && info.income > 0 && <Blood amount={info.income} income />}
      </span>
      {!locked && (
        <span className="row-tools">
          <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => onShift(-1)}>
            ↑
          </button>
          <button type="button" aria-label="Move down" disabled={index === count - 1} onClick={() => onShift(1)}>
            ↓
          </button>
          <button type="button" aria-label={`Remove ${info.label}`} onClick={onRemove}>
            ✕
          </button>
        </span>
      )}
    </li>
  );
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong';
}

/**
 * Royal Privileges (gd:923): +1 action per spenderad. Visas bara för den som har några.
 * Plus stoppar vid `maxUseful` (fler ger ingen action men förbrukas ändå).
 */
function RoyalPrivilegeControl({
  rp,
  locked,
  onChange,
}: {
  rp: RoyalPrivilegeInfo;
  locked: boolean;
  onChange: (n: number) => void;
}) {
  if (rp.available === 0) return null;
  return (
    <div className="royal-privileges" data-testid="royal-privileges">
      <span>
        Royal Privileges: {rp.spending}/{rp.available} spent
      </span>
      {!locked && (
        <>
          <button
            type="button"
            aria-label="Spend one fewer Royal Privilege"
            disabled={rp.spending === 0}
            onClick={() => onChange(rp.spending - 1)}
          >
            −
          </button>
          <button
            type="button"
            aria-label="Spend a Royal Privilege for an extra action"
            disabled={rp.spending >= rp.maxUseful}
            onClick={() => onChange(rp.spending + 1)}
          >
            +
          </button>
        </>
      )}
    </div>
  );
}

export function ActionPanel({ port, round }: { port: PlayerScreenPort; round: number }) {
  // Efter omladdning: den lista som redan är inlämnad i ronden.
  const [draft, setDraft] = useState<DraftAction[]>(() => port.initialDraft());
  const [locked, setLockedState] = useState(port.isLocked());
  const [confirmErrors, setConfirmErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [royalPrivilegesToSpend, setRoyalPrivilegesToSpend] = useState(() => port.initialExtras().royalPrivilegesToSpend);
  const extras = useMemo(() => ({ royalPrivilegesToSpend }), [royalPrivilegesToSpend]);
  const analysis = useMemo(() => port.analyze(draft, extras), [port, draft, extras]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) setDraft((d) => moveAction(d, String(e.active.id), String(e.over!.id)));
  };
  const net = analysis.totalCost - analysis.totalIncome;
  const overAp = analysis.apUsed > analysis.apTotal;

  return (
    <section className="action-panel" aria-label="Actions">
      <h2>Actions round {round}</h2>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={draft.map((a) => a.uid)} strategy={verticalListSortingStrategy}>
          <ol className="draft-list">
            {draft.map((a, i) => (
              <DraftRow
                key={a.uid}
                action={a}
                info={analysis.entries[i]!}
                index={i}
                count={draft.length}
                locked={locked}
                onRemove={() => setDraft((d) => removeAction(d, a.uid))}
                onShift={(delta) => setDraft((d) => shiftAction(d, a.uid, delta))}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      {!locked && (
        <ActionComposer
          port={port}
          draft={draft}
          onAdd={(choice, params, labels) => setDraft((d) => addAction(d, choice.actionId, choice.performer, params, labels))}
        />
      )}
      <div className="action-summary">
        <div className={overAp ? 'ap over' : 'ap'} data-testid="ap-used">
          {analysis.apUsed}/{analysis.apTotal} action points used
        </div>
        <RoyalPrivilegeControl rp={analysis.royalPrivileges} locked={locked} onChange={setRoyalPrivilegesToSpend} />
        {analysis.minionActions.map((m) => (
          <div
            key={m.minionId}
            className={m.used > m.allowed ? 'ap minion over' : 'ap minion'}
            data-testid={`minion-ap-${m.minionId}`}
          >
            {m.name}: {m.used}/{m.allowed}
          </div>
        ))}
        <div className="total-cost" data-testid="total-cost" title="Total cost minus guaranteed income">
          <Blood amount={net} />
        </div>
      </div>
      {[...analysis.errors, ...confirmErrors].map((e) => (
        <p key={e} className="panel-error" role="alert">
          {e}
        </p>
      ))}
      {analysis.warnings.map((w) => (
        <p key={w} className="panel-warning">
          {w}
        </p>
      ))}
      {locked ? (
        <div className="confirmed">
          <p>Actions submitted.</p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await port.unlock();
                setConfirmErrors([]);
                setLockedState(false);
              } catch (e) {
                setConfirmErrors([errorMessage(e)]);
              } finally {
                setBusy(false);
              }
            }}
          >
            Edit
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="confirm"
          disabled={!analysis.canConfirm || busy}
          title={overAp ? 'Too many actions for your action points' : undefined}
          onClick={async () => {
            setBusy(true);
            try {
              const res = await port.confirm(draft, extras);
              setConfirmErrors(res.errors);
              if (res.ok) setLockedState(true);
            } catch (e) {
              setConfirmErrors([errorMessage(e)]);
            } finally {
              setBusy(false);
            }
          }}
        >
          Confirm actions
        </button>
      )}
    </section>
  );
}
