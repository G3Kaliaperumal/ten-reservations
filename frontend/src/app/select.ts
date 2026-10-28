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
import { Icon } from './icon';

export interface SelectOption {
  value: string;
  label: string;
  detail?: string;
}

@Component({
  selector: 'app-select',
  imports: [Icon],
  template: `
    <div class="compact-select-field">
      <label [for]="controlId()">{{ label() }}</label>
      <div class="choice compact-choice" [class.is-open]="opened()" (focusout)="blur($event)">
        <button
          type="button"
          class="choice-control"
          role="combobox"
          [id]="controlId()"
          aria-haspopup="listbox"
          [attr.aria-expanded]="opened()"
          [attr.aria-controls]="controlId() + '-list'"
          [attr.aria-activedescendant]="
            opened() && options().length ? controlId() + '-option-' + active() : null
          "
          [disabled]="disabled() || options().length < 2"
          (click)="toggle()"
          (keydown)="key($event)"
        >
          <span class="compact-choice-label">{{ selected()?.label || 'Choose' }}</span
          ><app-icon name="caret" />
        </button>
        <div class="choice-menu" [class.opens-up]="opensUp()" [hidden]="!opened()">
          <div
            class="choice-options"
            role="listbox"
            [id]="controlId() + '-list'"
            [attr.aria-label]="label() + ' choices'"
          >
            @for (option of options(); track option.value; let index = $index) {
              <div
                class="choice-option"
                role="option"
                [id]="controlId() + '-option-' + index"
                [attr.aria-selected]="option.value === value()"
                [class.is-active]="active() === index"
                (pointerdown)="$event.preventDefault()"
                (click)="choose(option)"
              >
                <div class="choice-text">
                  <span class="choice-option-label">{{ option.label }}</span>
                  @if (option.detail) {
                    <span class="choice-option-detail">{{ option.detail }}</span>
                  }
                </div>
                @if (option.value === value()) {
                  <app-icon name="check" />
                }
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class SelectControl {
  controlId = input.required<string>();
  label = input.required<string>();
  options = input.required<readonly SelectOption[]>();
  disabled = input(false);
  value = model('');
  opened = signal(false);
  active = signal(0);
  opensUp = signal(false);
  selected = computed(() => this.options().find((option) => option.value === this.value()));
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  open(): void {
    if (this.disabled() || this.options().length < 2 || this.opened()) return;
    this.active.set(
      Math.max(
        0,
        this.options().findIndex((option) => option.value === this.value()),
      ),
    );
    const rect = this.host.nativeElement.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    this.opensUp.set(below < 240 && rect.top > below);
    this.opened.set(true);
  }
  close(): void {
    this.opened.set(false);
  }
  toggle(): void {
    if (this.opened()) this.close();
    else this.open();
  }
  choose(option: SelectOption): void {
    if (this.disabled()) return;
    this.value.set(option.value);
    this.close();
  }
  key(event: KeyboardEvent): void {
    if (event.key === 'Escape' || event.key === 'Tab') {
      this.close();
      if (event.key === 'Escape') event.preventDefault();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!this.opened()) this.open();
      else {
        const option = this.options()[this.active()];
        if (option) this.choose(option);
      }
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (!this.opened()) {
      this.open();
      return;
    }
    const last = this.options().length - 1;
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
