import { TestBed } from '@angular/core/testing';
import { Notifications, NotificationView } from './notifications';
import { Booking } from './models';

const booking: Booking = {
  booking_reference: '83aebea1-2af1-4cc4-8d16-d45bb10ed902',
  member_id: 2,
  item_id: 1,
  booked_at: '2026-10-29T00:00:00Z',
  cancelled_at: null,
  status: 'active',
};
afterEach(() => TestBed.resetTestingModule());

describe('Five-second booking notifications', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it('shows Copied! only after clipboard success and clears it after two seconds', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const writeText = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const service = TestBed.inject(Notifications);
    const copying = service.copy(booking.booking_reference);
    expect(service.copiedReference()).toBeNull();
    finish();
    await copying;
    expect(writeText).toHaveBeenCalledExactlyOnceWith(booking.booking_reference);
    expect(service.feedback()).toBe('Copied!');
    expect(service.copiedReference()).toBe(booking.booking_reference);
    vi.advanceTimersByTime(1999);
    expect(service.copiedReference()).toBe(booking.booking_reference);
    vi.advanceTimersByTime(1);
    expect(service.copiedReference()).toBeNull();
  });
  it('does not report Copied! when clipboard access fails', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) },
    });
    const service = TestBed.inject(Notifications);
    await service.copy(booking.booking_reference);
    expect(service.copiedReference()).toBeNull();
    expect(service.feedback()).toBe('Select the booking reference to copy it manually.');
  });
  it('expires after exactly five seconds', () => {
    vi.useFakeTimers();
    const service = TestBed.inject(Notifications);
    service.show(booking, 'Bali for Emily.');
    vi.advanceTimersByTime(4999);
    expect(service.value()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(service.value()).toBeNull();
  });
  it('allows early dismissal and restarts the timer for a newer notification', () => {
    vi.useFakeTimers();
    const service = TestBed.inject(Notifications);
    service.show(booking, 'First');
    vi.advanceTimersByTime(4000);
    service.show(booking, 'Second');
    vi.advanceTimersByTime(1000);
    expect(service.value()?.description).toBe('Second');
    service.dismiss();
    expect(service.value()).toBeNull();
  });
  it('renders the cancellation state and a working close button', async () => {
    const fixture = TestBed.createComponent(NotificationView);
    const service = TestBed.inject(Notifications);
    service.show(
      { ...booking, status: 'cancelled', cancelled_at: '2026-10-29T00:01:00Z' },
      'Bali for Emily.',
    );
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Booking cancelled');
    const copy = vi.spyOn(service, 'copy').mockResolvedValue();
    const copyButton: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[aria-label="Copy booking reference"]',
    );
    expect(copyButton.querySelector('svg')).not.toBeNull();
    copyButton.click();
    expect(copy).toHaveBeenCalledExactlyOnceWith(booking.booking_reference);
    fixture.nativeElement.querySelector('[aria-label="Dismiss notification"]').click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="status"].booking-toast')).toBeNull();
  });
  it('moves keyboard focus to the page heading before a notification disappears', async () => {
    const fixture = TestBed.createComponent(NotificationView);
    const pageHeading = document.createElement('header');
    pageHeading.className = 'page-heading';
    const heading = document.createElement('h1');
    heading.textContent = 'Member bookings';
    pageHeading.appendChild(heading);
    document.body.appendChild(pageHeading);
    try {
      const service = TestBed.inject(Notifications);
      service.show(booking, 'Bali for Emily.');
      await fixture.whenStable();
      fixture.nativeElement.querySelector('[aria-label="Dismiss notification"]').focus();
      service.dismiss();
      await fixture.whenStable();
      expect(document.activeElement).toBe(heading);
      expect(fixture.nativeElement.querySelector('.booking-toast')).toBeNull();
    } finally {
      pageHeading.remove();
    }
  });
});
