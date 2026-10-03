import { Component, HostListener, inject, signal } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatBadgeModule } from '@angular/material/badge';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { LiveUpdatesService } from '../../core/services/live-updates.service';

const SIDENAV_COLLAPSED_KEY = 'sidenavCollapsed';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    AsyncPipe, RouterOutlet, RouterLink, RouterLinkActive,
    MatSidenavModule, MatToolbarModule, MatListModule,
    MatIconModule, MatButtonModule, MatMenuModule, MatDividerModule,
    MatTooltipModule, MatBadgeModule
  ],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss'
})
export class MainLayoutComponent {
  private readonly liveUpdates = inject(LiveUpdatesService);
  readonly auth = inject(AuthService);
  readonly router = inject(Router);
  private readonly api = inject(ApiService);

  /** Count for the sidebar's "Products" low-stock badge. Fetched once on
   *  load — good enough for a nav hint, doesn't need to be live. */
  readonly lowStockCount = signal(0);
  readonly expandedSections = signal<Record<string, boolean>>({
    catalog: true,
    sales: true,
    stock: true,
    people: true,
    reports: true,
    admin: true,
  });

  /**
   * "Hide" option for the sidebar: collapses it to icon-only rather than
   * fully removing it (the toolbar's menu button already does a full
   * hide/show via drawer.toggle()). Persisted so it stays collapsed across
   * page loads/navigation.
   */
  readonly collapsed = signal(localStorage.getItem(SIDENAV_COLLAPSED_KEY) === 'true');

  /** Below this width the sidenav becomes an overlay (mode="over") that
   *  starts closed, instead of squeezing the page content — this is what
   *  makes the layout actually usable on a phone/tablet. */
  private static readonly MOBILE_BREAKPOINT = 768;
  readonly isMobile = signal(
    typeof window !== 'undefined' && window.innerWidth < MainLayoutComponent.MOBILE_BREAKPOINT,
  );

  @HostListener('window:resize')
  onResize(): void {
    this.isMobile.set(window.innerWidth < MainLayoutComponent.MOBILE_BREAKPOINT);
  }

  constructor() {
    this.api.getLowStockProducts().subscribe({
      next: (products) => this.lowStockCount.set(products.length),
      error: () => { }, // badge just stays hidden if this fails
    });
  }

  toggleCollapsed(): void {
    this.collapsed.update((v) => !v);
    localStorage.setItem(SIDENAV_COLLAPSED_KEY, String(this.collapsed()));
  }

  toggleSection(section: string): void {
    this.expandedSections.update((sections) => ({
      ...sections,
      [section]: !(sections[section] ?? true),
    }));
  }

  isSectionExpanded(section: string): boolean {
    return this.expandedSections()[section] ?? true;
  }

  logout(): void {
    this.auth.logout();
  }

  can(...roles: string[]): boolean {
    return this.auth.hasRole(...roles);
  }

  dashboardLink(): string {
    return this.auth.dashboardUrl();
  }
}
