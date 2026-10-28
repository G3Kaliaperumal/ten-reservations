import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Api, errorMessage } from './api';
import { InventoryResponse, InventoryStatus } from './models';
import { Icon } from './icon';
import { DateOnlyPipe } from './date-only';
import { PaginationControl } from './pagination';
import { inventoryPageSizes } from './page-sizes';
@Component({
  selector: 'app-inventory',
  imports: [DateOnlyPipe, SlicePipe, FormsModule, RouterLink, Icon, PaginationControl],
  templateUrl: './inventory.html',
})
export class Inventory {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private sequence = 0;
  private destroy = inject(DestroyRef);
  query = '';
  page = 1;
  private grid = viewChild<ElementRef<HTMLElement>>('inventoryLayout');
  private ready = false;
  columns = signal(3);
  rows = signal<2 | 3>(2);
  get pageSize(): number {
    return this.columns() * this.rows();
  }
  sizeOptions = computed(() =>
    inventoryPageSizes(this.columns(), this.data()?.pagination.total_count ?? 0),
  );
  sizeValue = computed(() =>
    (this.data()?.pagination.total_count ?? 0) <= this.columns() * 2 ? '2' : String(this.rows()),
  );
  appliedQuery = signal('');
  status = signal<InventoryStatus>('all');
  data = signal<InventoryResponse | null>(null);
  loading = signal(true);
  error = signal('');
  readonly filters: { key: InventoryStatus; label: string }[] = [
    { key: 'all', label: 'All experiences' },
    { key: 'available', label: 'Available' },
    { key: 'low_stock', label: 'Low stock' },
    { key: 'expired', label: 'Expired' },
    { key: 'sold_out', label: 'Sold out' },
  ];
  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.query = (params.get('q') || '').trim().slice(0, 200);
      this.appliedQuery.set(this.query);
      this.status.set(
        (params.get('status') ||
          (params.get('available') === '1' ? 'available' : 'all')) as InventoryStatus,
      );
      this.page = Number(params.get('page') || 1);
      this.rows.set(params.get('rows') === '3' ? 3 : 2);
      if (this.ready) void this.load();
    });
    afterNextRender(() => {
      const element = this.grid()?.nativeElement;
      if (!element) return;
      const measure = () => {
        if (this.destroy.destroyed) return;
        const columns = Math.max(
          1,
          Number(getComputedStyle(element).getPropertyValue('--inventory-columns')) || 3,
        );
        if (!this.ready) {
          this.columns.set(columns);
          this.ready = true;
          void this.load();
        } else if (columns !== this.columns()) {
          this.columns.set(columns);
          if (this.page !== 1) void this.navigate({ page: 1 });
          else void this.load();
        }
      };
      measure();
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        this.destroy.onDestroy(() => observer.disconnect());
      }
    });
  }
  async load(): Promise<void> {
    const sequence = ++this.sequence;
    this.loading.set(true);
    this.error.set('');
    try {
      const data = await this.api.inventory(
        this.appliedQuery(),
        this.status(),
        this.page,
        this.pageSize,
      );
      if (sequence === this.sequence && !this.destroy.destroyed) this.data.set(data);
    } catch (error) {
      if (sequence === this.sequence) this.error.set(errorMessage(error));
    } finally {
      if (sequence === this.sequence) this.loading.set(false);
    }
  }
  async apply(): Promise<void> {
    if (this.query.trim() === this.appliedQuery() && this.page === 1) await this.load();
    else await this.navigate({ q: this.query.trim() || null, page: 1 });
  }
  async quickFilter(status: InventoryStatus): Promise<void> {
    if (status === this.status() && this.page === 1 && this.query.trim() === this.appliedQuery())
      await this.load();
    else
      await this.navigate({
        status: status === 'all' ? null : status,
        q: this.query.trim() || null,
        available: null,
        page: 1,
      });
  }
  pageChange(page: number): void {
    void this.navigate({ page });
  }
  sizeChange(rows: string): void {
    void this.navigate({ rows: rows === '3' ? '3' : null, page_size: null, page: 1 });
  }
  private async navigate(queryParams: Record<string, string | number | null>): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }
}
