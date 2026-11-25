import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { createDemoPort } from '../src/screen/demo';

afterEach(cleanup);

const setup = () => {
  const user = userEvent.setup();
  render(<App port={createDemoPort('prince')} />);
  return user;
};

async function addAction(user: ReturnType<typeof userEvent.setup>, name: string, ...targets: string[]) {
  await user.click(screen.getByRole('button', { name: '+ Lägg till action' }));
  const select = screen.getByRole('combobox', { name: 'Välj action' });
  const option = within(select).getAllByRole('option').find((o) => o.textContent?.startsWith(`${name} –`));
  if (!option) throw new Error(`Ingen action ${name}`);
  await user.selectOptions(select, option);
  for (const t of targets) {
    const step = screen.getAllByRole('combobox').at(-1)!;
    await user.selectOptions(step, within(step).getByRole('option', { name: t }));
  }
}

const rows = () => screen.queryAllByTestId('draft-row');

describe('huvudskärmen', () => {
  it('visar resurser, vampyr och karta', () => {
    setup();
    expect(screen.getByText('Prince Edmund Hale')).toBeTruthy();
    expect(screen.getByText('Prince of North')).toBeTruthy();
    expect(screen.getByTestId('resource-minions').textContent).toBe('1');
    expect(screen.getByTestId('city-north').getAttribute('data-faction')).toBe('camarilla');
    expect(screen.getByText('Rond 2 av 8')).toBeTruthy();
  });

  it('börjar med en tom banner och bygger en Move i två steg', async () => {
    const user = setup();
    expect(rows()).toHaveLength(0);
    expect(screen.getByRole('button', { name: '+ Lägg till action' })).toBeTruthy();

    await addAction(user, 'Move', 'South');
    expect(rows()).toHaveLength(1);
    expect(rows()[0]!.textContent).toContain('Move från North till South');
    expect(screen.getByRole('button', { name: '+ Lägg till action' })).toBeTruthy();

    // Nästa Move utgår från South.
    await user.click(screen.getByRole('button', { name: '+ Lägg till action' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Välj action' }), 'vampire:move');
    const targets = within(screen.getByRole('combobox', { name: 'Till stad' }))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(targets).toContain('Isle');
  });

  it('action utan mål läggs direkt i listan, och kostnad och AP summeras', async () => {
    const user = setup();
    await addAction(user, 'Bleed');
    await addAction(user, 'Move', 'East');
    expect(rows()).toHaveLength(2);
    expect(screen.getByTestId('total-cost').textContent).toContain('10');
    expect(screen.getByTestId('ap-used').textContent).toMatch(/^2\/\d+ action points used$/);
  });

  it('confirm är avstängd med för många actions, och borttagning hjälper', async () => {
    const user = setup();
    const total = Number(screen.getByTestId('ap-used').textContent!.split('/')[1]!.split(' ')[0]);
    for (let i = 0; i <= total; i++) await addAction(user, 'Bleed');
    const confirm = screen.getByRole('button', { name: 'Confirm actions' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    await user.click(within(rows()[0]!).getByRole('button', { name: /Ta bort/ }));
    expect(rows()).toHaveLength(total);
    expect((screen.getByRole('button', { name: 'Confirm actions' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('ordningen går att ändra, och confirm låser listan', async () => {
    const user = setup();
    await addAction(user, 'Bleed');
    await addAction(user, 'Move', 'South');
    await user.click(within(rows()[1]!).getByRole('button', { name: 'Flytta upp' }));
    expect(rows()[0]!.textContent).toContain('Move från North till South');
    expect(rows()[1]!.textContent).toContain('Bleed i South');

    await user.click(screen.getByRole('button', { name: 'Confirm actions' }));
    expect(screen.getByText('Actions inlämnade.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '+ Lägg till action' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Ändra' }));
    expect(screen.getByRole('button', { name: '+ Lägg till action' })).toBeTruthy();
  });
});

describe('minionrutor', () => {
  it('visar en ruta per minion', () => {
    render(<App port={createDemoPort('innerCircle')} />);
    expect(screen.getByText('Ronald: 0/1')).toBeTruthy();
    expect(screen.getByText('Jenny Wren: 0/1')).toBeTruthy();
  });
});

describe('val av olika slag', () => {
  it('talval (Buy Votes) ger rätt etikett och kostnad', async () => {
    const user = setup();
    await addAction(user, 'Buy Votes');
    const input = screen.getByRole('spinbutton', { name: /Blood/ });
    await user.clear(input);
    await user.type(input, '20');
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(rows()).toHaveLength(1);
    expect(rows()[0]!.textContent).toContain('Buy Votes: 20');
    expect(screen.getByTestId('total-cost').textContent).toContain('20');
  });
});

describe('Royal Privileges', () => {
  it('Prince kan spendera en för en femte action och lämna in', async () => {
    const user = setup();
    expect(screen.getByTestId('royal-privileges').textContent).toContain('0/2 spenderas');
    for (let i = 0; i < 5; i++) await addAction(user, 'Bleed');
    const confirm = () => screen.getByRole('button', { name: 'Confirm actions' }) as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Spendera en Royal Privilege för en extra action' }));
    expect(screen.getByTestId('royal-privileges').textContent).toContain('1/2 spenderas');
    expect(screen.getByTestId('ap-used').textContent).toBe('5/5 action points used');
    expect(confirm().disabled).toBe(false);

    await user.click(confirm());
    expect(screen.getByText('Actions inlämnade.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Royal Privilege/ })).toBeNull();
  });

  it('plus stoppar vid antalet man har', async () => {
    const user = setup();
    const plus = () => screen.getByRole('button', { name: 'Spendera en Royal Privilege för en extra action' }) as HTMLButtonElement;
    await user.click(plus());
    await user.click(plus());
    expect(plus().disabled).toBe(true);
    expect(screen.getByTestId('ap-used').textContent).toBe('0/6 action points used');
    await user.click(screen.getByRole('button', { name: 'Spendera en Royal Privilege färre' }));
    expect(screen.getByTestId('ap-used').textContent).toBe('0/5 action points used');
  });

  it('visas inte för den som saknar Royal Privileges', () => {
    render(<App port={createDemoPort('innerCircle')} />);
    expect(screen.queryByTestId('royal-privileges')).toBeNull();
  });
});
