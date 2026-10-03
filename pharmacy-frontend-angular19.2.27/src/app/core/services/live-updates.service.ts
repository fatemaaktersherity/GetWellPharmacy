import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Keeps read-only screens current when another request changes server data. */
@Injectable({ providedIn: 'root' })
export class LiveUpdatesService {
  private readonly router = inject(Router);
  private stream?: EventSource;
  private lastRefresh = 0;
  private readonly changeSubject = new Subject<{ resource: string; changedAt: string }>();
  readonly changes$ = this.changeSubject.asObservable();

  constructor() {
    this.connect();
    window.addEventListener('storage', event => {
      if (event.key === 'pharmacy_token') this.connect();
    });
  }

  private connect(): void {
    this.stream?.close();
    const token = localStorage.getItem('pharmacy_token');
    if (!token) return;
    const url = `${environment.apiUrl}/live/stream?access_token=${encodeURIComponent(token)}`;
    this.stream = new EventSource(url);
    this.stream.addEventListener('data-changed', event => {
      try {
        const change = JSON.parse((event as MessageEvent<string>).data) as { resource?: string; changedAt?: string };
        if (change.resource) {
          this.changeSubject.next({ resource: change.resource, changedAt: change.changedAt ?? new Date().toISOString() });
        }
      } catch {
        // Ignore malformed events and keep the live connection available.
      }
      this.refreshCurrentView();
    });
  }

  private refreshCurrentView(): void {
    const now = Date.now();
    if (now - this.lastRefresh < 500) return;
    const path = this.router.url.split(/[?#]/, 1)[0].replace(/\/$/, '');
    // Keep in-progress forms intact; lists and detail pages refresh on return.
    if (/(^|\/)(new|edit)(\/|$)/i.test(path) || /\/payment$/i.test(path) || path === '/change-password') return;
    this.lastRefresh = now;
    void this.router.navigateByUrl(this.router.url);
  }
}
