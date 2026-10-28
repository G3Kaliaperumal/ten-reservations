import { SelectOption } from './select';

/** Round legacy or server-clamped sizes to an allowed booking page capacity. */
export function bookingPageSize(size: number): number {
  if (!Number.isFinite(size) || size < 1) return 5;
  return size <= 5 ? 5 : size <= 10 ? 10 : 15;
}

/** Include the next useful capacity, with no exact-total choices or sizes over 15. */
export function bookingPageSizes(total: number): SelectOption[] {
  if (total <= 0) return [];
  return [5, 10, 15]
    .filter((count) => count <= bookingPageSize(total))
    .map((count) => ({
      value: String(count),
      label: String(count),
      detail: `${count} bookings per page`,
    }));
}

/** Page sizes follow the rendered grid's columns, rather than a fixed card count. */
export function inventoryPageSizes(columns: number, total: number): SelectOption[] {
  if (total <= 0) return [];
  const two = columns * 2;
  const three = columns * 3;
  const options: SelectOption[] = [
    {
      value: '2',
      label: total <= two ? `All ${total}` : `${two} · 2 rows`,
      detail: total <= two ? 'All matching experiences' : `${columns} experiences per row`,
    },
  ];
  if (total > two)
    options.push({
      value: '3',
      label: total <= three ? `All ${total}` : `${three} · 3 rows`,
      detail: total <= three ? 'All matching experiences' : `${columns} experiences per row`,
    });
  return options;
}
