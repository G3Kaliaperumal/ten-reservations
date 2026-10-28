import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient, withXsrfConfiguration } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { Api, SessionStore, errorMessage, safeReturnUrl } from './api';
import { staffGuard } from './app.routes';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';

describe('Django session and CSRF integration', () => {
  let api: Api;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withXsrfConfiguration({ cookieName: 'csrftoken', headerName: 'X-CSRFToken' }),
        ),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    api = TestBed.inject(Api);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    try {
      http.verify();
    } finally {
      document.cookie = 'csrftoken=; max-age=0; path=/';
      TestBed.resetTestingModule();
    }
  });
  it('bootstraps CSRF, signs in, and uses the rotated token for the next write', async () => {
    document.cookie = 'csrftoken=before-login; path=/';
    const signIn = api.signIn('desk', 'test-only-credential');
    http.expectOne('/api/csrf').flush({ csrf_token: 'masked' });
    const login = await vi.waitFor(() => http.expectOne('/api/auth/login'));
    expect(login.request.headers.get('X-CSRFToken')).toBe('before-login');
    expect(login.request.body).toEqual({ username: 'desk', password: 'test-only-credential' });
    document.cookie = 'csrftoken=rotated; path=/';
    login.flush({ authenticated: true, user: { username: 'desk', is_staff: true } });
    await signIn;
    expect(api.sessionStore.user()?.username).toBe('desk');
    const booking = api.book(2, 1);
    http.expectOne('/api/csrf').flush({});
    const request = await vi.waitFor(() => http.expectOne('/book'));
    expect(request.request.headers.get('X-CSRFToken')).toBe('rotated');
    expect(request.request.body).toEqual({ member_id: 2, item_id: 1 });
    request.flush({ booking_reference: 'reference', status: 'active' });
    await booking;
  });
  it('clears the local user only after sign-out succeeds', async () => {
    api.sessionStore.user.set({ username: 'desk', is_staff: true });
    const logout = api.signOut();
    http.expectOne('/api/csrf').flush({});
    const request = await vi.waitFor(() => http.expectOne('/api/auth/logout'));
    expect(api.sessionStore.user()).not.toBeNull();
    request.flush({ signed_out: true });
    await logout;
    expect(api.sessionStore.user()).toBeNull();
  });
  it('does not retry an uncertain booking request', async () => {
    const booking = api.book(2, 1);
    const rejected = expect(booking).rejects.toBeInstanceOf(HttpErrorResponse);
    http.expectOne('/api/csrf').flush({});
    (await vi.waitFor(() => http.expectOne('/book'))).flush(
      {},
      { status: 500, statusText: 'Failed' },
    );
    await rejected;
    http.expectNone('/book');
    expect(errorMessage(new HttpErrorResponse({ status: 500 }), true)).toContain(
      'Check recent bookings',
    );
  });
});

describe('Staff navigation', () => {
  afterEach(() => TestBed.resetTestingModule());
  it.each(['https://evil.invalid', '//evil.invalid', '/accounts/login/', '/\\evil.invalid'])(
    'rejects unsafe return URL %s',
    (value) => {
      expect(safeReturnUrl(value)).toBe('/');
    },
  );
  it('preserves an internal booking link', () =>
    expect(safeReturnUrl('/bookings/?item=1')).toBe('/bookings/?item=1'));
  it('denies navigation on an unavailable or unauthenticated session', async () => {
    const session = { session: vi.fn().mockResolvedValue({ authenticated: false }) };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Api, useValue: session }],
    });
    const result = await TestBed.runInInjectionContext(() =>
      staffGuard({} as ActivatedRouteSnapshot, { url: '/bookings/' } as RouterStateSnapshot),
    );
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toContain('/accounts/login');
    session.session.mockRejectedValueOnce(new Error('offline'));
    const offline = await TestBed.runInInjectionContext(() =>
      staffGuard({} as ActivatedRouteSnapshot, { url: '/' } as RouterStateSnapshot),
    );
    expect(offline).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(SessionStore).user()).toBeNull();
  });
  it('allows a verified staff session', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Api, useValue: { session: () => Promise.resolve({ authenticated: true }) } },
      ],
    });
    const result = await TestBed.runInInjectionContext(() =>
      staffGuard({} as ActivatedRouteSnapshot, { url: '/' } as RouterStateSnapshot),
    );
    expect(result).toBe(true);
  });
});
