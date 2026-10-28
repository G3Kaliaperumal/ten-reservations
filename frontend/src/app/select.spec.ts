import { TestBed } from '@angular/core/testing';
import { SelectControl } from './select';

describe('Shared compact dropdowns', () => {
  afterEach(() => TestBed.resetTestingModule());
  async function setup() {
    const fixture = TestBed.createComponent(SelectControl);
    fixture.componentRef.setInput('controlId', 'status');
    fixture.componentRef.setInput('label', 'Status');
    fixture.componentRef.setInput('options', [
      { value: 'all', label: 'All bookings' },
      { value: 'active', label: 'Active' },
      { value: 'cancelled', label: 'Cancelled' },
    ]);
    fixture.componentRef.setInput('value', 'all');
    await fixture.whenStable();
    return fixture;
  }
  it('labels the control and commits a keyboard selection', async () => {
    const fixture = await setup();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('[role="combobox"]');
    expect(button.labels?.[0]?.textContent).toBe('Status');
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.value()).toBe('active');
    expect(button.textContent).toContain('Active');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
  it('closes on Escape without changing the saved value', async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;
    component.open();
    component.active.set(2);
    component.key(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.value()).toBe('all');
    expect(component.opened()).toBe(false);
  });
  it('does not open when there is only one useful option', async () => {
    const fixture = await setup();
    fixture.componentRef.setInput('options', [{ value: '2', label: 'All 2' }]);
    fixture.componentRef.setInput('value', '2');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(true);
    fixture.componentInstance.open();
    expect(fixture.componentInstance.opened()).toBe(false);
  });
});
