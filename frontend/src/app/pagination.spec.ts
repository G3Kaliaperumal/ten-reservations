import { TestBed } from '@angular/core/testing';
import { PaginationControl } from './pagination';
import { Pagination } from './models';
const page: Pagination = {
  page: 1,
  page_size: 5,
  total_count: 23,
  total_pages: 5,
  has_next: true,
  has_previous: false,
  start_index: 1,
  end_index: 5,
};
describe('Content-aware server pagination controls', () => {
  afterEach(() => TestBed.resetTestingModule());
  async function setup(data = page) {
    const fixture = TestBed.createComponent(PaginationControl);
    fixture.componentRef.setInput('data', data);
    await fixture.whenStable();
    return fixture;
  }
  it('keeps navigation and current result counts', async () => {
    const fixture = await setup();
    const changed = vi.fn();
    fixture.componentInstance.pageChange.subscribe(changed);
    expect(fixture.nativeElement.textContent).toContain('Showing 1–5 of 23 bookings');
    expect(fixture.nativeElement.querySelector('[aria-label="Previous page"]').disabled).toBe(true);
    fixture.nativeElement.querySelector('[aria-label="Next page"]').click();
    expect(changed).toHaveBeenCalledWith(2);
  });
  it('offers useful sizes through the styled menu and emits the selection', async () => {
    const fixture = await setup();
    const changed = vi.fn();
    fixture.componentInstance.sizeChange.subscribe(changed);
    fixture.nativeElement.querySelector('[role="combobox"]').click();
    await fixture.whenStable();
    const options: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('[role="option"]'),
    );
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      '55 bookings per page',
      '1010 bookings per page',
      '1515 bookings per page',
    ]);
    options.find((option) => option.textContent?.trim().startsWith('15'))!.click();
    expect(changed).toHaveBeenCalledWith('15');
  });
  it('retains a selected size when recreating the view', async () => {
    const fixture = await setup({ ...page, page_size: 15, end_index: 15, total_pages: 2 });
    expect(fixture.nativeElement.querySelector('[role="combobox"]').textContent).toContain('15');
  });
  it('offers 5 and 10 when six records match', async () => {
    const fixture = await setup({ ...page, total_count: 6, total_pages: 2 });
    expect(fixture.componentInstance.sizes().map((option) => option.label)).toEqual(['5', '10']);
  });
  it('retains 10 when the server clamps its effective size to six results', async () => {
    const fixture = await setup({
      ...page,
      page_size: 6,
      total_count: 6,
      end_index: 6,
      total_pages: 1,
      has_next: false,
    });
    expect(fixture.nativeElement.querySelector('[role="combobox"]').textContent?.trim()).toBe('10');
  });
  it('hides page-size selection for an empty result', async () => {
    const fixture = await setup({
      ...page,
      total_count: 0,
      total_pages: 1,
      start_index: 0,
      end_index: 0,
      has_next: false,
    });
    expect(fixture.nativeElement.querySelector('[role="combobox"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[aria-label="Next page"]').disabled).toBe(true);
  });
});
