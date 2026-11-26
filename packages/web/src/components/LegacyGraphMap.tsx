import type { FactionKey, MapModel, MapPiece, RoundInfo } from '../screen/model';
import { MAP_HEIGHT, MAP_WIDTH } from '../screen/mapModel';

const FACTION_LABEL: Record<FactionKey, string> = { camarilla: 'Camarilla', anarch: 'Anarch', sabbat: 'Sabbat' };
const R = 34;

function pieceTitle(p: MapPiece): string {
  const what = p.kind === 'vampire' ? 'Vampire' : `Minion${p.minionType ? ` (${p.minionType})` : ''}`;
  return p.own ? `${p.name}: your ${what.toLowerCase()}` : `${p.name}: ${what.toLowerCase()} owned by ${p.ownerName}`;
}

export function LegacyGraphMap({ map, round }: { map: MapModel; round: RoundInfo }) {
  const byId = new Map(map.cities.map((c) => [c.id, c]));
  return (
    <div className="map-wrap">
      <svg className="game-map" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} role="img" aria-label="Map">
        <g className="links">
          {map.links.map(([a, b]) => {
            const ca = byId.get(a);
            const cb = byId.get(b);
            if (!ca || !cb) return null;
            return <line key={`${a}-${b}`} x1={ca.x} y1={ca.y} x2={cb.x} y2={cb.y} data-testid={`link-${a}-${b}`} />;
          })}
        </g>
        {map.cities.map((c) => (
          <g key={c.id} className="city" data-testid={`city-${c.id}`} data-faction={c.faction ?? 'none'}>
            <title>{`${c.name}: ${c.faction ? FACTION_LABEL[c.faction] : 'no controller'}`}</title>
            <circle cx={c.x} cy={c.y} r={R} className={`faction-${c.faction ?? 'none'}`} />
            <text x={c.x} y={c.y + R + 22} className="city-name">
              {c.name}
            </text>
            {c.pieces.map((p, i) => {
              const offset = (i - (c.pieces.length - 1) / 2) * 30;
              return (
                <g
                  key={`${p.kind}-${p.id}`}
                  className={`piece piece-${p.kind}${p.own ? ' own' : ''}`}
                  data-testid={`piece-${p.id}`}
                  transform={`translate(${c.x + offset}, ${c.y - R - 8})`}
                >
                  <title>{pieceTitle(p)}</title>
                  <circle r={13} />
                  <text y={5}>{p.kind === 'vampire' ? 'V' : 'M'}</text>
                </g>
              );
            })}
          </g>
        ))}
      </svg>
      <div className="round-badge">
        Round {round.round} of {round.maxRounds}
      </div>
      <ul className="map-legend" aria-label="Legend">
        {(Object.keys(FACTION_LABEL) as FactionKey[]).map((f) => (
          <li key={f}>
            <span className={`swatch faction-${f}`} /> {FACTION_LABEL[f]}
          </li>
        ))}
        <li>
          <span className="swatch faction-none" /> No controller
        </li>
      </ul>
    </div>
  );
}
