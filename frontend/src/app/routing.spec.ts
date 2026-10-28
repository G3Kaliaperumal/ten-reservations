import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { UrlSerializer, provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { AppUrlSerializer } from './url-serializer';
import { Login } from './login';
import { Api } from './api';

describe('Django and Angular UI route compatibility', () => {
  afterEach(() => TestBed.resetTestingModule());
  it.each(['/accounts/login/', '/accounts/login/?next=%2Fbookings%2F'])(
    'renders sign-in for %s',
    async (url) => {
      TestBed.configureTestingModule({
        providers: [
          provideRouter(routes),
          { provide: UrlSerializer, useClass: AppUrlSerializer },
          { provide: Api, useValue: { session: () => Promise.resolve({ authenticated: false }) } },
        ],
      });
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(url, Login);
      expect(harness.routeNativeElement?.textContent).toContain('Welcome back.');
    },
  );
  it('normalizes paths without modifying encoded query parameters', () => {
    const serializer = new AppUrlSerializer();
    expect(serializer.serialize(serializer.parse('/bookings/?item=1'))).toBe('/bookings?item=1');
    expect(serializer.serialize(serializer.parse('/'))).toBe('/');
    expect(serializer.parse('/accounts/login/?next=%2Fbookings%2F').queryParams['next']).toBe(
      '/bookings/',
    );
  });
});
