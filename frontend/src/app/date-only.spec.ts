import { DateOnlyPipe } from './date-only';

describe('Experience calendar dates', () => {
  it('preserves the exact API expiry date rather than converting a local midnight', () => {
    const pipe = new DateOnlyPipe();
    expect(pipe.transform('2030-11-19')).toBe('19 Nov 2030');
    expect(pipe.transform('2021-11-23')).toBe('23 Nov 2021');
  });
});
