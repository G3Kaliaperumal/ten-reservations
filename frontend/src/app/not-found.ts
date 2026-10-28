import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `<div class="auth-page">
    <main class="auth-card">
      <span class="brand-mark" aria-hidden="true">ten</span>
      <h1>Page not found.</h1>
      <p>The page you requested could not be found.</p>
      <a class="button" routerLink="/">Return to inventory</a>
    </main>
  </div>`,
})
export class NotFound {}
