import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { Api, SessionStore, safeReturnUrl } from './api';
import { Layout } from './layout';
import { Login } from './login';
export const staffGuard: CanActivateFn = async (_route, state) => {
  const api = inject(Api);
  const session = inject(SessionStore);
  const router = inject(Router);
  try {
    if ((await api.session()).authenticated) return true;
  } catch {
    session.user.set(null);
  }
  return router.createUrlTree(['/accounts/login/'], {
    queryParams: { next: safeReturnUrl(state.url) },
  });
};
export const routes: Routes = [
  { path: 'accounts/login', component: Login, title: 'Staff sign in | Ten Reservations' },
  {
    path: '',
    component: Layout,
    canActivateChild: [staffGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./inventory').then((module) => module.Inventory),
        title: 'Inventory | Ten Reservations',
      },
      {
        path: 'bookings',
        loadComponent: () => import('./bookings').then((module) => module.BookingsPage),
        title: 'Bookings | Ten Reservations',
      },
    ],
  },
  {
    path: '**',
    loadComponent: () => import('./not-found').then((module) => module.NotFound),
    title: 'Page not found | Ten Reservations',
  },
];
