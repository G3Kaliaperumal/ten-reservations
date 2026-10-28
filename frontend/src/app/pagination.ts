import { Component, computed, input, output } from '@angular/core';
import { SelectControl, SelectOption } from './select';
import { bookingPageSize, bookingPageSizes } from './page-sizes';
import { Pagination } from './models';

@Component({
  selector: 'app-pagination',
  imports: [SelectControl],
  template: `
    <nav class="pagination" [attr.aria-label]="noun() + ' pagination'">
      <p class="page-summary" role="status">
        Showing {{ data().start_index }}–{{ data().end_index }} of {{ data().total_count }}
        {{ noun() }}
      </p>
      @if (data().total_count > 0) {
        <app-select
          [controlId]="controlId()"
          label="Per page"
          [options]="sizes()"
          [value]="selectedSize()"
          [disabled]="busy()"
          (valueChange)="sizeChange.emit($event)"
        />
      }
      <div class="pagination-navigation">
        <button
          type="button"
          aria-label="Previous page"
          [disabled]="busy() || !data().has_previous"
          (click)="pageChange.emit(data().page - 1)"
        >
          Previous
        </button>
        @for (page of pages(); track page) {
          <button
            type="button"
            [attr.aria-label]="'Page ' + page"
            [attr.aria-current]="page === data().page ? 'page' : null"
            [disabled]="busy()"
            (click)="pageChange.emit(page)"
          >
            {{ page }}
          </button>
        }
        <button
          type="button"
          aria-label="Next page"
          [disabled]="busy() || !data().has_next"
          (click)="pageChange.emit(data().page + 1)"
        >
          Next
        </button>
      </div>
      <span class="page-position">Page {{ data().page }} of {{ data().total_pages }}</span>
    </nav>
  `,
})
export class PaginationControl {
  data = input.required<Pagination>();
  noun = input('bookings');
  controlId = input('page-size');
  busy = input(false);
  pageChange = output<number>();
  sizeChange = output<string>();
  sizeOptions = input<readonly SelectOption[] | null>(null);
  sizeValue = input<string | null>(null);
  sizes = computed(() => this.sizeOptions() ?? bookingPageSizes(this.data().total_count));
  selectedSize = computed(
    () =>
      this.sizeValue() ??
      String(bookingPageSize(Math.min(this.data().page_size, this.data().total_count))),
  );
  pages = computed(() => {
    const { page, total_pages } = this.data();
    const first = Math.max(1, Math.min(page - 2, total_pages - 4));
    return Array.from({ length: Math.min(5, total_pages) }, (_, index) => first + index);
  });
}
