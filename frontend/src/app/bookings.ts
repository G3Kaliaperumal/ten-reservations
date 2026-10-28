import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, errorMessage } from './api';
import { Booking, BookingOptions, BookingStatus, Choice, Pagination } from './models';
import { PaginationControl } from './pagination';
import { SelectControl, SelectOption } from './select';
import { bookingPageSize } from './page-sizes';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChoiceSelect } from './choice';
import { Icon } from './icon';
import { Notifications } from './notifications';
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
@Component({
  selector: 'app-bookings',
  imports: [
    DatePipe,
    TitleCasePipe,
    FormsModule,
    RouterLink,
    ChoiceSelect,
    Icon,
    PaginationControl,
    SelectControl,
  ],
  templateUrl: './bookings.html',
})
export class BookingsPage implements OnInit {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroy = inject(DestroyRef);
  private historySequence = 0;
  private routed = false;
  historyQuery = '';
  historyStatus: BookingStatus = 'all';
  readonly statusOptions: readonly SelectOption[] = [
    { value: 'all', label: 'All bookings', detail: 'Active and cancelled' },
    { value: 'active', label: 'Active', detail: 'Current reservations' },
    { value: 'cancelled', label: 'Cancelled', detail: 'Places returned to inventory' },
  ];
  selectHistoryStatus(status: string): void {
    this.historyStatus = status as BookingStatus;
  }
  historyPage = 1;
  historyPageSize = 5;
  appliedHistoryQuery = signal('');
  appliedHistoryStatus = signal<BookingStatus>('all');
  historyPagination = signal<Pagination | null>(null);
  historyLoading = signal(true);
  historyError = signal('');
  notices = inject(Notifications);
  options = signal<BookingOptions | null>(null);
  recent = signal<Booking[]>([]);
  loading = signal(true);
  loadError = signal('');
  operation = signal<'book' | 'cancel' | null>(null);
  bookMember = signal<number | null>(null);
  bookItem = signal<number | null>(null);
  cancelMember = signal<number | null>(null);
  reference = '';
  bookSubmitted = signal(false);
  cancelSubmitted = signal(false);
  bookError = signal('');
  cancelError = signal('');
  hasData = computed(() => !!this.options()?.members.length && !!this.options()?.items.length);
  hasBookableItems = computed(() => !!this.options()?.items.some((item) => item.is_bookable));
  selectedItemUnavailable = computed(
    () => !!this.options()?.items.find((item) => item.id === this.bookItem() && !item.is_bookable),
  );
  selectedMemberOverLimit = computed(
    () =>
      !!this.options()?.members.find(
        (member) =>
          member.id === this.bookMember() && member.booking_count > this.options()!.max_bookings,
      ),
  );
  members = computed<Choice[]>(() =>
    (this.options()?.members || []).map((member) => {
      const limit = this.options()?.max_bookings || 2;
      return {
        id: member.id,
        label: `${member.name} ${member.surname}`,
        detail: `Member #${member.id}`,
        badge: `${member.booking_count}/${limit} booked${member.booking_count > limit ? ' — over limit' : ''}`,
        avatar: (member.name[0] + member.surname[0]).toUpperCase(),
        tone:
          member.booking_count > limit
            ? 'exceeded'
            : member.booking_count === limit
              ? 'full'
              : 'available',
      };
    }),
  );
  items = computed<Choice[]>(() =>
    (this.options()?.items || []).map((item) => ({
      id: item.id,
      label: item.title,
      detail: `Experience #${item.id} · Expires ${item.expiration_date}`,
      badge: item.is_expired
        ? 'Expired — booking closed'
        : item.remaining_count
          ? `${item.remaining_count} remaining`
          : 'Sold out',
      avatar: '◇',
      tone: item.is_expired ? 'exceeded' : item.remaining_count ? 'available' : 'full',
      disabled: !item.is_bookable,
    })),
  );
  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.historyQuery = (params.get('q') || '').trim().slice(0, 200);
      this.historyStatus = (params.get('status') || 'all') as BookingStatus;
      this.appliedHistoryQuery.set(this.historyQuery);
      this.appliedHistoryStatus.set(this.historyStatus);
      this.historyPage = Number(params.get('page') || 1);
      this.historyPageSize = bookingPageSize(Number(params.get('page_size') || 5));
      if (this.routed) void this.loadHistory();
      this.routed = true;
    });
  }
  async ngOnInit(): Promise<void> {
    await this.refresh();
    const item = Number(this.route.snapshot.queryParamMap.get('item'));
    if (this.options()?.items.some((option) => option.id === item)) this.bookItem.set(item);
    const reference =
      this.route.snapshot.queryParamMap.get('confirmed') ||
      this.route.snapshot.queryParamMap.get('cancelled');
    if (reference && UUID_PATTERN.test(reference)) {
      try {
        const booking = await this.api.detail(reference);
        this.notices.show(booking, `${booking.item_title} for ${booking.member_name}.`);
      } catch {
        /* Invalid or inaccessible feedback never reveals data. */
      }
    }
    if (reference)
      await this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { confirmed: null, cancelled: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
  }
  async refresh(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const [options] = await Promise.all([this.api.options(), this.loadHistory()]);
      this.options.set(options);
    } catch (error) {
      this.loadError.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
  async loadHistory(): Promise<void> {
    const sequence = ++this.historySequence;
    this.historyLoading.set(true);
    this.historyError.set('');
    try {
      const result = await this.api.recent(
        this.appliedHistoryQuery(),
        this.appliedHistoryStatus(),
        this.historyPage,
        this.historyPageSize,
      );
      if (sequence === this.historySequence && !this.destroy.destroyed) {
        this.recent.set(result.bookings);
        this.historyPagination.set(result.pagination);
      }
    } catch (error) {
      if (sequence === this.historySequence) this.historyError.set(errorMessage(error));
    } finally {
      if (sequence === this.historySequence) this.historyLoading.set(false);
    }
  }
  async filterHistory(): Promise<void> {
    if (
      this.historyQuery.trim() === this.appliedHistoryQuery() &&
      this.historyStatus === this.appliedHistoryStatus() &&
      this.historyPage === 1
    )
      await this.loadHistory();
    else
      await this.navigateHistory({
        q: this.historyQuery.trim() || null,
        status: this.historyStatus === 'all' ? null : this.historyStatus,
        page: 1,
      });
  }
  clearHistory(): void {
    void this.navigateHistory({ q: null, status: null, page: 1 });
  }
  historyPageChange(page: number): void {
    void this.navigateHistory({ page });
  }
  historySizeChange(size: string): void {
    void this.navigateHistory({ page_size: bookingPageSize(Number(size)), page: 1 });
  }
  private async navigateHistory(
    queryParams: Record<string, string | number | null>,
  ): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      fragment: 'booking-history',
    });
  }
  async submitBooking(form: HTMLFormElement): Promise<void> {
    if (this.operation()) return;
    this.bookSubmitted.set(true);
    this.bookError.set('');
    if (!this.bookMember() || !this.bookItem()) {
      setTimeout(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (this.selectedItemUnavailable()) {
      this.bookError.set('This experience is expired or sold out. Choose an available experience.');
      return;
    }
    this.operation.set('book');
    try {
      const member = this.members().find((choice) => choice.id === this.bookMember())!;
      const item = this.items().find((choice) => choice.id === this.bookItem())!;
      const booking = await this.api.book(member.id, item.id);
      this.notices.show(booking, `${item.label} for ${member.label}.`);
      this.bookSubmitted.set(false);
      this.bookMember.set(null);
      this.bookItem.set(null);
      await this.refresh();
    } catch (error) {
      this.bookError.set(errorMessage(error, true));
      await this.refresh();
    } finally {
      this.operation.set(null);
    }
  }
  async submitCancellation(form: HTMLFormElement): Promise<void> {
    if (this.operation()) return;
    this.cancelSubmitted.set(true);
    this.cancelError.set('');
    if (!this.cancelMember() || !UUID_PATTERN.test(this.reference.trim())) {
      if (!UUID_PATTERN.test(this.reference.trim()))
        this.cancelError.set('Enter a valid booking reference (UUID).');
      setTimeout(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    this.operation.set('cancel');
    try {
      const booking = await this.api.cancel(this.cancelMember()!, this.reference.trim());
      const member = this.members().find((choice) => choice.id === booking.member_id);
      const item = this.items().find((choice) => choice.id === booking.item_id);
      this.notices.show(
        booking,
        `${item?.label || 'Experience #' + booking.item_id} for ${member?.label || 'member #' + booking.member_id}.`,
      );
      this.cancelSubmitted.set(false);
      this.reference = '';
      await this.refresh();
    } catch (error) {
      this.cancelError.set(errorMessage(error, true));
      await this.refresh();
    } finally {
      this.operation.set(null);
    }
  }
  validReference(): boolean {
    return UUID_PATTERN.test(this.reference.trim());
  }
}
