import { TestBed } from '@angular/core/testing';
import { ChoiceSelect } from './choice';
import { Choice } from './models';

const choices: Choice[] = [
  {
    id: 2,
    label: 'Emily Johnson',
    detail: 'Member #2',
    badge: '0/2 booked',
    avatar: 'EJ',
    tone: 'available',
  },
  {
    id: 4,
    label: 'Chloe Brown',
    detail: 'Member #4',
    badge: '2/2 booked',
    avatar: 'CB',
    tone: 'full',
  },
];
afterEach(() => TestBed.resetTestingModule());

describe('Searchable member and inventory choices', () => {
  it('does not commit a disabled expired choice', async () => {
    const fixture = TestBed.createComponent(ChoiceSelect);
    fixture.componentRef.setInput('controlId', 'expired-item');
    fixture.componentRef.setInput('label', 'Inventory item');
    const expired = { ...choices[0], badge: 'Expired', disabled: true };
    fixture.componentRef.setInput('choices', [expired]);
    fixture.componentInstance.open();
    await fixture.whenStable();
    fixture.nativeElement.querySelector('[role="option"]').click();
    fixture.componentInstance.key(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(fixture.componentInstance.value()).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[role="option"]').getAttribute('aria-disabled'),
    ).toBe('true');
  });
  async function setup() {
    const fixture = TestBed.createComponent(ChoiceSelect);
    fixture.componentRef.setInput('controlId', 'member');
    fixture.componentRef.setInput('label', 'Member');
    fixture.componentRef.setInput('choices', choices);
    await fixture.whenStable();
    return fixture;
  }
  it('searches by ID and selects through keyboard interaction', async () => {
    const fixture = await setup();
    const host: HTMLElement = fixture.nativeElement;
    const input = host.querySelector('input')!;
    input.dispatchEvent(new FocusEvent('focus'));
    input.value = '#4';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(host.querySelectorAll('[role="option"]').length).toBe(1);
    expect(host.querySelector('[role="option"]')?.textContent).toContain('Chloe Brown');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.value()).toBe(4);
    expect(input.value).toBe('Chloe Brown');
    expect(input.labels?.[0]?.textContent?.trim()).toBe('Member');
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });
  it('restores the committed choice on Escape and keeps full members cancellable', async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;
    component.choose(choices[1]);
    component.open();
    component.search.set('unknown');
    component.key(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(component.value()).toBe(4);
    expect(component.selected()?.tone).toBe('full');
    expect(fixture.nativeElement.querySelector('input').value).toBe('Chloe Brown');
  });
  it('links field errors to the focusable control and escapes source text', async () => {
    const fixture = await setup();
    fixture.componentRef.setInput('error', 'Choose a member.');
    fixture.componentRef.setInput('choices', [
      { ...choices[0], label: '<img src=x onerror=alert(1)>' },
    ]);
    fixture.componentInstance.open();
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('input')?.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector('input')?.getAttribute('aria-describedby')).toBe('member-error');
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
