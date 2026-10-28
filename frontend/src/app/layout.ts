import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Api, SessionStore, errorMessage } from './api';
import { Icon } from './icon';
import { Notifications, NotificationView } from './notifications';
@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, NotificationView],
  templateUrl: './layout.html',
})
export class Layout {
  session = inject(SessionStore);
  private api = inject(Api);
  private router = inject(Router);
  private notices = inject(Notifications);
  signingOut = signal(false);
  error = signal('');
  get bookingPage(): boolean {
    return this.router.url.startsWith('/bookings');
  }
  async signOut(): Promise<void> {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    this.error.set('');
    try {
      await this.api.signOut();
      this.notices.dismiss();
      await this.router.navigateByUrl('/accounts/login/');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.signingOut.set(false);
    }
  }
}
