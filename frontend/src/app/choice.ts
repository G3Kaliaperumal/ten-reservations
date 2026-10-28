import {
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { Choice } from './models';
import { Icon } from './icon';

@Component({
  selector: 'app-choice',
  imports: [Icon],
  templateUrl: './choice.html',
})
export class ChoiceSelect {
  controlId = input.required<string>();
  label = input.required<string>();
  kind = input<'member' | 'experience'>('member');
  choices = input.required<Choice[]>();
  value = model<number | null>(null);
  error = input('');
  disabled = input(false);
  opened = signal(false);
  search = signal('');
  active = signal(0);
  opensUp = signal(false);
  selected = computed(() => this.choices().find((choice) => choice.id === this.value()));
  filtered = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    return this.choices().filter((choice) =>
      `${choice.label} ${choice.detail} ${choice.badge}`.toLocaleLowerCase().includes(query),
    );
  });
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  open(): void {
    if (this.disabled() || this.opened()) return;
    this.search.set('');
    this.active.set(
      Math.max(
        0,
        this.choices().findIndex((choice) => choice.id === this.value()),
      ),
    );
    const rect = this.host.nativeElement.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    this.opensUp.set(below < 300 && rect.top > below);
    this.opened.set(true);
  }
  close(): void {
    this.opened.set(false);
    this.search.set('');
  }
  toggle(): void {
    if (this.opened()) this.close();
    else {
      this.host.nativeElement.querySelector('input')?.focus();
      this.open();
    }
  }
  searchInput(event: Event): void {
    if (!this.opened()) this.open();
    this.search.set((event.target as HTMLInputElement).value);
    this.active.set(0);
  }
  choose(choice: Choice): void {
    if (choice.disabled || this.disabled()) return;
    this.value.set(choice.id);
    this.close();
  }
  key(event: KeyboardEvent): void {
    if (event.key === 'Escape' || event.key === 'Tab') {
      this.close();
      if (event.key === 'Escape') event.preventDefault();
      return;
    }
    if (event.key === 'Enter' && this.opened()) {
      event.preventDefault();
      const choice = this.filtered()[this.active()];
      if (choice) this.choose(choice);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    if (['Home', 'End'].includes(event.key) && !this.opened()) return;
    event.preventDefault();
    if (!this.opened()) {
      this.open();
      return;
    }
    const last = this.filtered().length - 1;
    this.active.set(
      Math.max(
        0,
        Math.min(
          last,
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : this.active() + (event.key === 'ArrowDown' ? 1 : -1),
        ),
      ),
    );
    requestAnimationFrame(() =>
      this.host.nativeElement
        .querySelector<HTMLElement>('.choice-option.is-active')
        ?.scrollIntoView?.({ block: 'nearest' }),
    );
  }
  blur(event: FocusEvent): void {
    if (!this.host.nativeElement.contains(event.relatedTarget as Node | null)) this.close();
  }
  @HostListener('document:pointerdown', ['$event']) outside(event: Event): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.close();
  }
}
