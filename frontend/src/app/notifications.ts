import { Component, Injectable, OnDestroy, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Booking } from './models';
import { Icon } from './icon';

export interface Notification {
  id: number;
  booking: Booking;
  description: string;
}

@Injectable({ providedIn: 'root' })
export class Notifications implements OnDestroy {
  private document = inject(DOCUMENT);
  value = signal<Notification | null>(null);
  feedback = signal('');
  copiedReference = signal<string | null>(null);
  private timer?: ReturnType<typeof setTimeout>;
  private copyTimer?: ReturnType<typeof setTimeout>;
  private copySequence = 0;
  private sequence = 0;
  show(booking: Booking, description: string): void {
    this.dismiss();
    this.value.set({ id: ++this.sequence, booking, description });
    this.timer = setTimeout(() => this.dismiss(), 5000);
  }
  dismiss(): void {
    clearTimeout(this.timer);
    if (this.document.querySelector('.booking-toast')?.contains(this.document.activeElement)) {
      const heading = this.document.querySelector<HTMLElement>('.page-heading h1');
      heading?.setAttribute('tabindex', '-1');
      heading?.focus({ preventScroll: true });
      heading?.addEventListener('blur', () => heading.removeAttribute('tabindex'), { once: true });
    }
    this.value.set(null);
  }
  ngOnDestroy(): void {
    this.dismiss();
    clearTimeout(this.copyTimer);
    this.copySequence++;
  }
  async copy(reference: string): Promise<void> {
    const sequence = ++this.copySequence;
    clearTimeout(this.copyTimer);
    this.copiedReference.set(null);
    this.feedback.set('');
    try {
      await navigator.clipboard.writeText(reference);
      if (sequence !== this.copySequence) return;
      this.copiedReference.set(reference);
      this.feedback.set('Copied!');
      this.copyTimer = setTimeout(() => this.copiedReference.set(null), 2000);
    } catch {
      if (sequence !== this.copySequence) return;
      this.feedback.set('Select the booking reference to copy it manually.');
    }
  }
}

@Component({
  selector: 'app-notifications',
  imports: [Icon],
  template: `
    @for (notice of notices.value() ? [notices.value()!] : []; track notice.id) {
      <section
        #toast
        class="booking-toast is-timed"
        [class.booking-toast-cancelled]="notice.booking.status === 'cancelled'"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span class="toast-icon"
          ><app-icon [name]="notice.booking.status === 'cancelled' ? 'cancel' : 'check'"
        /></span>
        <div class="toast-content">
          <h2>
            {{
              notice.booking.status === 'cancelled'
                ? 'Booking cancelled'
                : 'Your booking is confirmed'
            }}
          </h2>
          <p>
            {{ notice.description }}
            @if (notice.booking.status === 'cancelled') {
              One place has been returned to inventory.
            }
          </p>
          <div class="toast-reference">
            <code>{{ notice.booking.booking_reference }}</code
            ><button
              type="button"
              class="copy-button"
              aria-label="Copy booking reference"
              title="Copy booking reference"
              (click)="notices.copy(notice.booking.booking_reference)"
            >
              <app-icon name="copy" />
              @if (notices.copiedReference() === notice.booking.booking_reference) {
                <span class="copy-feedback" aria-hidden="true">Copied!</span>
              }
            </button>
          </div>
          <small>Reference saved with the booking.</small>
        </div>
        <button
          type="button"
          class="toast-close"
          aria-label="Dismiss notification"
          (click)="dismiss()"
        >
          <app-icon name="close" />
        </button>
        <span class="toast-timer" aria-hidden="true"></span>
      </section>
    }
    <span class="sr-only" role="status" aria-live="polite">{{ notices.feedback() }}</span>
  `,
})
export class NotificationView {
  notices = inject(Notifications);
  dismiss(): void {
    this.notices.dismiss();
  }
}
