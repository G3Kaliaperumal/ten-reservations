import { Pipe, PipeTransform } from '@angular/core';
import { formatDate } from '@angular/common';

/** A database calendar date must not shift with the browser's timezone. */
@Pipe({ name: 'dateOnly' })
export class DateOnlyPipe implements PipeTransform {
  transform(value: string): string {
    return formatDate(`${value}T00:00:00Z`, 'd MMM yyyy', 'en', 'UTC');
  }
}
