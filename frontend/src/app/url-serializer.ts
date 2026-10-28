import { DefaultUrlSerializer, UrlTree } from '@angular/router';

/** Accept Django's trailing-slash UI links without changing query values. */
export class AppUrlSerializer extends DefaultUrlSerializer {
  override parse(url: string): UrlTree {
    const boundary = url.search(/[?#]/);
    const path = boundary < 0 ? url : url.slice(0, boundary);
    const suffix = boundary < 0 ? '' : url.slice(boundary);
    return super.parse((path.length > 1 ? path.replace(/\/+$/, '') : path) + suffix);
  }
}
