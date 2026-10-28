import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Api } from './api';
import { BookingsPage } from './bookings';
import { Booking, BookingOptions } from './models';
import { Notifications } from './notifications';

describe('Angular booking and cancellation flows', () => {
  afterEach(() => TestBed.resetTestingModule());
  const booking: Booking = {
    booking_reference: '83aebea1-2af1-4cc4-8d16-d45bb10ed902',
    member_id: 2,
    item_id: 1,
    booked_at: '2026-10-29T00:00:00Z',
    cancelled_at: null,
    status: 'active',
  };
  const options: BookingOptions = {
    members: [{ id: 2, name: 'Emily', surname: 'Johnson', booking_count: 0 }],
    items: [
      {
        id: 1,
        title: 'Bali',
        remaining_count: 2,
        expiration_date: '2030-01-01',
        is_expired: false,
        is_bookable: true,
      },
    ],
    max_bookings: 2,
  };
  let api: {
    options: ReturnType<typeof vi.fn>;
    recent: ReturnType<typeof vi.fn>;
    book: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
  beforeEach(() => {
    api = {
      options: vi.fn().mockResolvedValue(structuredClone(options)),
      recent: vi.fn().mockResolvedValue({
        bookings: [],
        pagination: {
          page: 1,
          page_size: 5,
          total_count: 0,
          total_pages: 1,
          has_next: false,
          has_previous: false,
          start_index: 0,
          end_index: 0,
        },
      }),
      book: vi.fn().mockResolvedValue(booking),
      cancel: vi.fn().mockResolvedValue({ ...booking, status: 'cancelled' }),
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Api, useValue: api }],
    });
  });
  async function setup() {
    const fixture = TestBed.createComponent(BookingsPage);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }
  it('does not call the backend for incomplete selections', async () => {
    const fixture = await setup();
    const host: HTMLElement = fixture.nativeElement;
    await fixture.componentInstance.submitBooking(host.querySelector('form')!);
    await fixture.whenStable();
    expect(api.book).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Choose a member.');
    expect(host.textContent).toContain('Choose an inventory item.');
  });
  it('books once, clears both choices, refreshes history, and offers an accessible copy icon', async () => {
    const fixture = await setup();
    const page = fixture.componentInstance;
    page.bookMember.set(2);
    page.bookItem.set(1);
    page.cancelMember.set(2);
    api.options.mockResolvedValue({
      ...options,
      members: [{ ...options.members[0], booking_count: 1 }],
    });
    api.recent.mockResolvedValue({
      bookings: [{ ...booking, member_name: 'Emily Johnson (#2)', item_title: 'Bali (#1)' }],
      pagination: {
        page: 1,
        page_size: 5,
        total_count: 1,
        total_pages: 1,
        has_next: false,
        has_previous: false,
        start_index: 1,
        end_index: 1,
      },
    });
    await page.submitBooking(fixture.nativeElement.querySelector('form'));
    await fixture.whenStable();
    expect(api.book).toHaveBeenCalledExactlyOnceWith(2, 1);
    expect(page.members()[0].badge).toBe('1/2 booked');
    expect(page.recent()).toHaveLength(1);
    expect(TestBed.inject(Notifications).value()?.booking.status).toBe('active');
    expect(page.bookMember()).toBeNull();
    expect(page.bookItem()).toBeNull();
    expect(page.cancelMember()).toBe(2);
    expect(fixture.nativeElement.querySelector('#book-member').value).toBe('');
    expect(fixture.nativeElement.querySelector('#book-item').value).toBe('');
    expect(fixture.nativeElement.querySelector('#book-member').getAttribute('aria-invalid')).toBe(
      'false',
    );
    const copy = vi.spyOn(TestBed.inject(Notifications), 'copy').mockResolvedValue();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.copy-button');
    expect(button.getAttribute('aria-label')).toBe(
      'Copy reference for Bali (#1), Emily Johnson (#2)',
    );
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button.textContent?.trim()).toBe('');
    button.click();
    expect(copy).toHaveBeenCalledExactlyOnceWith(booking.booking_reference);
  });
  it('shows server business errors and reloads stale availability', async () => {
    const fixture = await setup();
    const page = fixture.componentInstance;
    page.bookMember.set(2);
    page.bookItem.set(1);
    api.book.mockRejectedValue(
      new HttpErrorResponse({
        status: 409,
        error: {
          error: { code: 'out_of_stock', message: 'This item has no remaining availability.' },
        },
      }),
    );
    await page.submitBooking(fixture.nativeElement.querySelector('form'));
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('This item has no remaining availability.');
    expect(api.options).toHaveBeenCalledTimes(2);
    expect(TestBed.inject(Notifications).value()).toBeNull();
    expect(page.bookMember()).toBe(2);
    expect(page.bookItem()).toBe(1);
  });
  it('validates a UUID before cancellation and then refreshes the cancelled state', async () => {
    const fixture = await setup();
    const page = fixture.componentInstance;
    const form = fixture.nativeElement.querySelectorAll('form')[1];
    page.cancelMember.set(2);
    page.reference = 'invalid';
    await page.submitCancellation(form);
    expect(api.cancel).not.toHaveBeenCalled();
    page.reference = '  ' + booking.booking_reference + '  ';
    await page.submitCancellation(form);
    expect(api.cancel).toHaveBeenCalledExactlyOnceWith(2, booking.booking_reference);
    expect(TestBed.inject(Notifications).value()?.booking.status).toBe('cancelled');
    expect(page.reference).toBe('');
  });
  it('highlights an imported over-limit count without changing it', async () => {
    const fixture = await setup();
    const page = fixture.componentInstance;
    page.options.set({ ...options, members: [{ ...options.members[0], booking_count: 3 }] });
    page.bookMember.set(2);
    await fixture.whenStable();
    expect(page.members()[0].tone).toBe('exceeded');
    expect(page.members()[0].badge).toContain('3/2 booked');
    expect(fixture.nativeElement.querySelector('[data-tone="exceeded"]')?.textContent).toContain(
      'over limit',
    );
    expect(fixture.nativeElement.textContent).toContain('This imported count exceeds');
  });
  it('blocks stale expired selections while leaving cancellation available', async () => {
    const fixture = await setup();
    const page = fixture.componentInstance;
    page.options.set({
      ...options,
      items: [{ ...options.items[0], is_expired: true, is_bookable: false }],
    });
    page.bookMember.set(2);
    page.bookItem.set(1);
    await page.submitBooking(fixture.nativeElement.querySelector('form'));
    await fixture.whenStable();
    expect(api.book).not.toHaveBeenCalled();
    expect(page.items()[0].disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.booking-submit').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.cancel-submit').disabled).toBe(false);
  });
  it('requests five history records by default and sends the selected filters to the server', async () => {
    const fixture = await setup();
    const page = fixture.componentInstance;
    expect(api.recent).toHaveBeenCalledWith('', 'all', 1, 5);
    page.appliedHistoryQuery.set('Emily');
    page.appliedHistoryStatus.set('cancelled');
    page.historyPage = 2;
    page.historyPageSize = 10;
    await page.loadHistory();
    expect(api.recent).toHaveBeenLastCalledWith('Emily', 'cancelled', 2, 10);
  });
});
