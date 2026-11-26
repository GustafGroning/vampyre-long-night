import { useState } from 'react';
import type { FactionKey, MapCity, MapModel, MapPiece, RoundInfo } from '../screen/model';
import {
  REGION_COLORS, REGION_NODE_POSITIONS, REGION_PATHS, REGION_VIEWBOX,
  type DemoRegionId,
} from './regionGeometry';
import { RegionModal } from './RegionModal';

const FACTION_LABEL: Record<FactionKey, string> = { camarilla: 'Camarilla', anarch: 'Anarch', sabbat: 'Sabbat' };
const NODE_RADIUS = 26;
const REGION_ORDER: readonly DemoRegionId[] = ['east', 'south', 'north', 'isle', 'west'];

function pieceTitle(p: MapPiece): string {
  const what = p.kind === 'vampire' ? 'Vampire' : `Minion${p.minionType ? ` (${p.minionType})` : ''}`;
  return p.own ? `${p.name}: your ${what.toLowerCase()}` : `${p.name}: ${what.toLowerCase()} owned by ${p.ownerName}`;
}

export function RegionMap({ map, round }: { map: MapModel; round: RoundInfo }) {
  const [hoveredCityId, setHoveredCityId] = useState<DemoRegionId | null>(null);
  const [selectedCityId, setSelectedCityId] = useState<DemoRegionId | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const cities = new Map(map.cities.map(city => [city.id, city]));
  const selectedCity = selectedCityId ? cities.get(selectedCityId) : undefined;

  function selectRegion(id: DemoRegionId) {
    setSelectedCityId(id);
    setHoveredCityId(null);
    setModalOpen(true);
  }

  function closeRegion() {
    setModalOpen(false);
    setSelectedCityId(null);
    setHoveredCityId(null);
  }

  return (
    <div className="map-wrap region-map-wrap">
      <svg className="game-map region-game-map" viewBox={REGION_VIEWBOX} role="group" aria-label="Interactive map with five regions">
        <g className="territory-shapes" aria-hidden="true">
          {REGION_ORDER.map(id => (
            <path
              key={id}
              id={`region-${id}`}
              d={REGION_PATHS[id]}
              fill={REGION_COLORS[id]}
              className="region-shape"
              data-testid={`territory-${id}`}
              data-selected={selectedCityId === id ? 'true' : 'false'}
              data-hovered={hoveredCityId === id ? 'true' : 'false'}
            />
          ))}
        </g>
        {/* Connections come from map.links, not territorial adjacency. Keep all lines behind nodes.
            South-Isle is curved beneath the mainland to reach the detached island shape. */}
        <g className="links region-links" aria-hidden="true" pointerEvents="none">
          {map.links.map(([a, b]) => {
            const from = REGION_NODE_POSITIONS[a as DemoRegionId];
            const to = REGION_NODE_POSITIONS[b as DemoRegionId];
            if (!from || !to) return null;
            const isSouthIsle = (a === 'south' && b === 'isle') || (a === 'isle' && b === 'south');
            return isSouthIsle
              ? <path
                  key={`${a}-${b}`}
                  d={`M ${REGION_NODE_POSITIONS.south.x} ${REGION_NODE_POSITIONS.south.y} Q 430 785 ${REGION_NODE_POSITIONS.isle.x} ${REGION_NODE_POSITIONS.isle.y}`}
                  data-testid={`link-${a}-${b}`}
                />
              : <line key={`${a}-${b}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} data-testid={`link-${a}-${b}`} />;
          })}
        </g>
        {/* Draw highlights after all territory fills so the full outline stays visible. */}
        {selectedCityId && (
          <path
            className="region-selected-outline" d={REGION_PATHS[selectedCityId]}
            data-testid="selected-region-outline" pointerEvents="none" fill="none"
          />
        )}
        {hoveredCityId && hoveredCityId !== selectedCityId && (
          <path className="region-hover-outline" d={REGION_PATHS[hoveredCityId]} pointerEvents="none" fill="none" />
        )}
        {map.cities.map(city => (
          <CityNode
            key={city.id} city={city} id={city.id as DemoRegionId}
            onOpen={() => selectRegion(city.id as DemoRegionId)}
            onEnter={() => setHoveredCityId(city.id as DemoRegionId)}
            onLeave={() => setHoveredCityId(current => current === city.id ? null : current)}
            selected={selectedCityId === city.id}
          />
        ))}
      </svg>
      <div className="round-badge">Round {round.round} of {round.maxRounds}</div>
      <ul className="map-legend" aria-label="Legend">
        {(Object.keys(FACTION_LABEL) as FactionKey[]).map(f => (
          <li key={f}><span className={`swatch faction-${f}`} /> {FACTION_LABEL[f]}</li>
        ))}
        <li><span className="swatch faction-none" /> No controller</li>
      </ul>
      {modalOpen && selectedCity && (
        <RegionModal city={selectedCity} onClose={closeRegion} />
      )}
    </div>
  );
}

function CityNode({ city, id, selected, onOpen, onEnter, onLeave }: {
  city: MapCity;
  id: DemoRegionId;
  selected: boolean;
  onOpen: () => void;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const { x, y } = REGION_NODE_POSITIONS[id];
  return (
    <g
      className={`city region-node${selected ? ' is-selected' : ''}`}
      data-testid={`city-${city.id}`}
      data-faction={city.faction ?? 'none'}
      role="button"
      tabIndex={0}
      aria-label={`Show information about ${city.name}`}
      aria-pressed={selected}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onBlur={onLeave}
      onClick={onOpen}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <title>{`${city.name}: ${city.faction ? FACTION_LABEL[city.faction] : 'no controller'}`}</title>
      <circle cx={x} cy={y} r={NODE_RADIUS + 7} className="region-node-focus-ring" />
      <circle cx={x} cy={y} r={NODE_RADIUS} className={`region-node-circle faction-${city.faction ?? 'none'}`} />
      <text x={x} y={y + NODE_RADIUS + 31} className="region-node-name">{city.name}</text>
      {city.pieces.map((piece, i) => {
        const offset = (i - (city.pieces.length - 1) / 2) * 29;
        return (
          <g
            key={`${piece.kind}-${piece.id}`}
            className={`piece piece-${piece.kind}${piece.own ? ' own' : ''}`}
            data-testid={`piece-${piece.id}`}
            transform={`translate(${x + offset}, ${y - NODE_RADIUS - 15})`}
          >
            <title>{pieceTitle(piece)}</title>
            <circle r={13} />
            <text y={5}>{piece.kind === 'vampire' ? 'V' : 'M'}</text>
          </g>
        );
      })}
    </g>
  );
}
