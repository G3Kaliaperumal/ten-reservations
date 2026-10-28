# Angular frontend

See the main [setup guide](../README.md) for frontend/backend installation and deployment.

From the project root:

```text
npm --prefix frontend ci
npm --prefix frontend run build
npm --prefix frontend test
```

For live edits, start Django on 127.0.0.1:8000 with --insecure, then run `npm --prefix frontend start` and open http://127.0.0.1:4200/. The proxy preserves the session/CSRF model.

The built frontend can also be served through Django. Build before starting Django the first time. Output is `dist/ten-reservations/browser/`; bundles use `/static/angular/`. Original CSS/images are shared from `../bookings/static/bookings/`. Deploy the index and matching assets together.
