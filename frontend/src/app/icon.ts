import { Component, input } from '@angular/core';

@Component({
  selector: 'app-icon',
  template:
    '<svg aria-hidden="true" viewBox="0 0 24 24">@for (path of paths[name()] || paths["info"]; track $index) {<path [attr.d]="path"/>}</svg>',
  styles: ':host { display: inline-flex; align-items: center; flex-shrink: 0; }',
})
export class Icon {
  name = input('info');
  paths: Record<string, string[]> = {
    grid: ['M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z'],
    ticket: ['M4 5h16v5a2 2 0 0 0 0 4v5H4v-5a2 2 0 0 0 0-4V5Z', 'M15 5v3m0 3v2m0 3v3'],
    search: ['M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0ZM16 16l5 5'],
    arrow: ['M4 12h16m-6-6 6 6-6 6'],
    cancel: ['M4 8V4m0 0h4M4 4l4 4a8 8 0 1 1-2 8'],
    shield: ['m12 2 7 4v6c0 5-7 9-7 9S5 17 5 12V6l7-4Z', 'm8 11 3 3 5-6'],
    check: ['m5 12 4 4L19 6'],
    copy: ['M8 8h12v13H8z', 'M16 8V3H3v13h5'],
    close: ['m6 6 12 12M18 6 6 18'],
    caret: ['m6 9 6 6 6-6'],
    sparkle: ['m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z'],
    info: ['M12 10v6m0-10v1', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'],
  };
}
