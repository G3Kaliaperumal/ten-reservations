import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { UrlSerializer, provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { sessionInterceptor } from './api';
import { AppUrlSerializer } from './url-serializer';
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: UrlSerializer, useClass: AppUrlSerializer },
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
    provideHttpClient(
      withXsrfConfiguration({ cookieName: 'csrftoken', headerName: 'X-CSRFToken' }),
      withInterceptors([sessionInterceptor]),
    ),
  ],
};
