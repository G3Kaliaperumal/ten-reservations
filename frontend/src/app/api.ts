import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, firstValueFrom, throwError } from 'rxjs';
import {
  Booking,
  BookingOptions,
  BookingsResponse,
  BookingStatus,
  InventoryResponse,
  InventoryStatus,
  SessionResponse,
  Staff,
} from './models';

@Injectable({ providedIn: 'root' })
export class SessionStore {
  user = signal<Staff | null>(null);
}

export const sessionInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      const authenticationRequest = request.url.startsWith('/api/auth/');
      if (
        !authenticationRequest &&
        (error.status === 401 ||
          (error.status === 403 && error.error?.error?.code === 'permission_denied'))
      ) {
        session.user.set(null);
        void router.navigate(['/accounts/login/'], {
          queryParams: { next: safeReturnUrl(router.url) },
        });
      }
      return throwError(() => error);
    }),
  );
};

export function safeReturnUrl(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  const path = value.split(/[?#]/)[0];
  return ['/', '/bookings', '/bookings/'].includes(path) ? value : '/';
}

export function errorMessage(error: unknown, mutation = false): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0 || error.status >= 500) {
      return mutation
        ? 'Could not confirm the result. Check recent bookings before trying again.'
        : 'Could not load the latest information. Check your connection and try again.';
    }
    if (error.error?.error?.code === 'csrf_failed')
      return 'Your security token has expired. Refresh this page, then try again.';
    return error.error?.error?.message || 'The request could not be completed. Please try again.';
  }
  return 'The request could not be completed. Please try again.';
}

@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  readonly sessionStore = inject(SessionStore);
  async csrf(): Promise<void> {
    await firstValueFrom(this.http.get('/api/csrf'));
  }
  async session(): Promise<SessionResponse> {
    const response = await firstValueFrom(this.http.get<SessionResponse>('/api/auth/session'));
    this.sessionStore.user.set(response.user);
    return response;
  }
  async signIn(username: string, password: string): Promise<void> {
    const response = await this.post<SessionResponse>('/api/auth/login', { username, password });
    this.sessionStore.user.set(response.user);
  }
  async signOut(): Promise<void> {
    await this.post('/api/auth/logout', {});
    this.sessionStore.user.set(null);
  }
  inventory(
    query: string,
    status: InventoryStatus = 'all',
    page = 1,
    pageSize = 6,
  ): Promise<InventoryResponse> {
    return firstValueFrom(
      this.http.get<InventoryResponse>('/api/inventory', {
        params: { q: query, status, page, page_size: pageSize },
      }),
    );
  }
  options(): Promise<BookingOptions> {
    return firstValueFrom(this.http.get<BookingOptions>('/api/booking-options'));
  }
  recent(
    query = '',
    status: BookingStatus = 'all',
    page = 1,
    pageSize = 5,
  ): Promise<BookingsResponse> {
    return firstValueFrom(
      this.http.get<BookingsResponse>('/api/bookings', {
        params: { q: query, status, page, page_size: pageSize },
      }),
    );
  }
  detail(reference: string): Promise<Booking> {
    return firstValueFrom(this.http.get<Booking>('/api/bookings/' + encodeURIComponent(reference)));
  }
  book(member_id: number, item_id: number): Promise<Booking> {
    return this.post('/book', { member_id, item_id });
  }
  cancel(member_id: number, booking_reference: string): Promise<Booking> {
    return this.post('/cancel', { member_id, booking_reference });
  }
  private async post<T>(path: string, payload: unknown): Promise<T> {
    // Bootstrap/refresh the cookie before a write; never retry a mutation automatically.
    await this.csrf();
    return firstValueFrom(this.http.post<T>(path, payload));
  }
}
