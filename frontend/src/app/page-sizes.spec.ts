import { bookingPageSize, bookingPageSizes, inventoryPageSizes } from './page-sizes';

describe('Content-aware page sizes', () => {
  it.each([
    [0, []],
    [3, ['5']],
    [5, ['5']],
    [6, ['5', '10']],
    [10, ['5', '10']],
    [11, ['5', '10', '15']],
    [15, ['5', '10', '15']],
    [101, ['5', '10', '15']],
  ])('offers only useful 5/10/15 capacities for %i bookings', (total, expected) => {
    expect(bookingPageSizes(total).map((option) => option.label)).toEqual(expected);
  });
  it('normalizes old exact-total and oversized URL values', () => {
    expect([3, 6, 11, 100, NaN].map(bookingPageSize)).toEqual([5, 10, 15, 15, 5]);
  });
  it.each([
    [3, 6, 9],
    [2, 4, 6],
    [1, 2, 3],
  ])('uses two or three rows for %i columns', (columns, two, three) => {
    expect(inventoryPageSizes(columns, 15).map((option) => option.label)).toEqual([
      `${two} · 2 rows`,
      `${three} · 3 rows`,
    ]);
  });
  it('replaces oversized grid options with the actual remaining total', () => {
    expect(inventoryPageSizes(3, 4).map((option) => option.label)).toEqual(['All 4']);
    expect(inventoryPageSizes(3, 7).map((option) => option.label)).toEqual(['6 · 2 rows', 'All 7']);
    expect(inventoryPageSizes(3, 0)).toEqual([]);
  });
});
