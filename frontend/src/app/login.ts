import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Api, errorMessage, safeReturnUrl } from './api';
@Component({ selector: 'app-login', imports: [FormsModule], templateUrl: './login.html' })
export class Login implements OnInit {
  private api = inject(Api);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  username = '';
  password = '';
  busy = signal(false);
  error = signal('');
  async ngOnInit(): Promise<void> {
    try {
      if ((await this.api.session()).authenticated)
        await this.router.navigateByUrl(
          safeReturnUrl(this.route.snapshot.queryParamMap.get('next')),
        );
    } catch {
      this.api.sessionStore.user.set(null);
    }
  }
  async submit(): Promise<void> {
    if (this.busy()) return;
    if (!this.username.trim() || !this.password) {
      this.error.set('Enter your username and password.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.signIn(this.username.trim(), this.password);
      this.password = '';
      await this.router.navigateByUrl(safeReturnUrl(this.route.snapshot.queryParamMap.get('next')));
    } catch (error) {
      this.password = '';
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
