import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Api } from './api';
import { Inventory } from './inventory';
import { InventoryResponse } from './models';

const data: InventoryResponse = {
  total_items: 12,
  member_count: 45,
  items: [
    {
      id: 1,
      title: 'Expired London',
      description: 'An old season',
      remaining_count: 3,
      expiration_date: '2020-01-01',
      is_expired: true,
      is_bookable: false,
      cover_url: '',
    },
  ],
  filter_counts: { all: 12, available: 0, low_stock: 0, expired: 12, sold_out: 0 },
  pagination: {
    page: 2,
    page_size: 6,
    total_count: 12,
    total_pages: 2,
    has_previous: true,
    has_next: true,
    start_index: 7,
    end_index: 12,
  },
};
describe('Inventory availability and URL-driven server filters', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });
  async function setup() {
    const api = { inventory: vi.fn().mockResolvedValue(data) };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '', component: Inventory }]),
        { provide: Api, useValue: api },
      ],
    });
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/?q=London&status=expired&page=2', Inventory);
    await vi.waitFor(() => expect(component.loading()).toBe(false));
    await harness.fixture.whenStable();
    harness.detectChanges();
    return { harness, component, api };
  }
  it('requests filtered pages from Django and never offers booking on expired cards', async () => {
    const { harness, api } = await setup();
    expect(api.inventory).toHaveBeenCalledWith('London', 'expired', 2, 6);
    const card = harness.routeNativeElement!.querySelector('.experience')!;
    expect(card.classList.contains('experience-expired')).toBe(true);
    expect(card.textContent).toContain('Expired');
    expect(card.querySelector('.book-link')).toBeNull();
    expect(card.textContent).toContain('Booking closed');
  });
  it('resets the page when applying a quick filter or changing page size', async () => {
    const { harness, component, api } = await setup();
    await component.quickFilter('available');
    await vi.waitFor(() =>
      expect(api.inventory).toHaveBeenLastCalledWith('London', 'available', 1, 6),
    );
    component.sizeChange('3');
    await vi.waitFor(() =>
      expect(api.inventory).toHaveBeenLastCalledWith('London', 'available', 1, 9),
    );
    await harness.fixture.whenStable();
  });
  it('uses the CSS column count after resizing and disconnects its observer', async () => {
    let resized = () => {};
    const disconnected = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe(): void {}
        disconnect = disconnected;
      },
    );
    const { harness, api } = await setup();
    const layout = harness.routeNativeElement!.querySelector<HTMLElement>('.inventory-results')!;
    layout.style.setProperty('--inventory-columns', '2');
    resized();
    await vi.waitFor(() =>
      expect(api.inventory).toHaveBeenLastCalledWith('London', 'expired', 1, 4),
    );
    layout.style.setProperty('--inventory-columns', '1');
    resized();
    await vi.waitFor(() =>
      expect(api.inventory).toHaveBeenLastCalledWith('London', 'expired', 1, 2),
    );
    harness.fixture.destroy();
    expect(disconnected).toHaveBeenCalledOnce();
  });
});
