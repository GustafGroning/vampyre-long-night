import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { createDemoPort } from '../src/screen/demo';
import { hasDemoRegionGeometry, REGION_NODE_POSITIONS, REGION_PATHS } from '../src/components/regionGeometry';

afterEach(cleanup);

function setup() {
  const user = userEvent.setup();
  render(<App port={createDemoPort('prince')} />);
  return user;
}

describe('region map integration', () => {
  it('has five SVG territories and nodes with no original numeric path labels', () => {
    setup();
    expect(Object.keys(REGION_PATHS)).toHaveLength(5);
    // Illustrator's source paths contained a *second* subpath cutting out each digit.
    // The exported geometry must contain only each region's outer boundary.
    for (const path of Object.values(REGION_PATHS)) expect((path.match(/M/g) ?? []).length).toBe(1);
    for (const city of ['west', 'north', 'east', 'south', 'isle']) {
      expect(screen.getByTestId(`territory-${city}`)).toBeTruthy();
      expect(screen.getByTestId(`city-${city}`)).toBeTruthy();
    }
    const links = screen.getAllByTestId(/^link-/);
    expect(links).toHaveLength(6);
    const connections = links.map(link => link.getAttribute('data-testid')!.slice(5).split('-').sort().join('-')).sort();
    expect(connections).toEqual([
      'east-north', 'east-south', 'isle-south', 'north-south', 'north-west', 'south-west',
    ]);
    // The game engine normalizes undirected connections as lexicographically ordered IDs.
    expect(screen.getByTestId('link-isle-south').tagName.toLowerCase()).toBe('path');
    expect(screen.getByTestId('link-north-south').tagName.toLowerCase()).toBe('line');
    // No map edge should intercept clicking or focusing a city node.
    expect(links[0]!.parentElement?.getAttribute('pointer-events')).toBe('none');
  });

  it('uses the detached Isle shape and updated node coordinates from Map2.svg', () => {
    setup();
    expect(REGION_NODE_POSITIONS.isle).toEqual({ x: 730, y: 675 });
    expect(REGION_NODE_POSITIONS.isle.x).toBeGreaterThan(REGION_NODE_POSITIONS.east.x);
    expect(REGION_NODE_POSITIONS.isle.y).toBeGreaterThan(REGION_NODE_POSITIONS.south.y);
    expect(REGION_PATHS.isle).toMatch(/^M668\.4,785\.28/);
    const isle = screen.getByTestId('city-isle');
    expect(isle.querySelector('circle.region-node-circle')?.getAttribute('cx')).toBe('730');
    expect(isle.querySelector('circle.region-node-circle')?.getAttribute('cy')).toBe('675');
    expect(screen.getByTestId('link-isle-south').getAttribute('d')).toContain('Q 430 785');
  });

  it('highlights a territory when its node is hovered, then clears hover', async () => {
    const user = setup();
    const node = screen.getByTestId('city-west');
    const territory = screen.getByTestId('territory-west');
    expect(territory.getAttribute('data-hovered')).toBe('false');
    await user.hover(node);
    expect(territory.getAttribute('data-hovered')).toBe('true');
    await user.unhover(node);
    expect(territory.getAttribute('data-hovered')).toBe('false');
  });

  it('opens a region dialog and clears the selection on close', async () => {
    const user = setup();
    await user.click(screen.getByTestId('city-east'));
    const dialog = screen.getByRole('dialog', { name: 'East' });
    expect(dialog.textContent).toContain('Lorem ipsum');
    for (let i = 1; i <= 3; i++) expect(dialog.textContent).toContain(`Status ${i}`);
    expect(screen.getByTestId('territory-east').getAttribute('data-selected')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Close region information' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('territory-east').getAttribute('data-selected')).toBe('false');
    expect(screen.getByTestId('territory-east').getAttribute('data-hovered')).toBe('false');
    expect(screen.queryByTestId('selected-region-outline')).toBeNull();
    await user.click(screen.getByTestId('city-west'));
    expect(screen.getByRole('dialog', { name: 'West' })).toBeTruthy();
    expect(screen.getByTestId('territory-east').getAttribute('data-selected')).toBe('false');
    expect(screen.getByTestId('territory-west').getAttribute('data-selected')).toBe('true');
  });

  it('can use keyboard to select nodes and Escape to close the modal', async () => {
    const user = setup();
    screen.getByTestId('city-isle').focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog', { name: 'Isle' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('territory-isle').getAttribute('data-selected')).toBe('false');
    expect(screen.getByTestId('territory-isle').getAttribute('data-hovered')).toBe('false');
  });

  it('keeps the legacy map available for non-demo maps', () => {
    expect(hasDemoRegionGeometry(['north', 'west', 'east', 'south', 'isle'])).toBe(true);
    expect(hasDemoRegionGeometry(['london', 'bristol'])).toBe(false);
  });
});
