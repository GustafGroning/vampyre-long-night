import { RegionMap } from './RegionMap';
import { LegacyGraphMap } from './LegacyGraphMap';
import { hasDemoRegionGeometry } from './regionGeometry';
import type { MapModel, RoundInfo } from '../screen/model';

/** Only the five-city demo gets the new illustrative SVG map.
 * Other campaigns retain the existing node/link view until real geometry exists. */
export function GameMap({ map, round }: { map: MapModel; round: RoundInfo }) {
  return hasDemoRegionGeometry(map.cities.map(city => city.id))
    ? <RegionMap map={map} round={round} />
    : <LegacyGraphMap map={map} round={round} />;
}
