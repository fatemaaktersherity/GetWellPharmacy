import { Component, OnInit, inject } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../core/services/api.service';
import { BrandType } from '../../core/models/api.models';
import { PaginationComponent } from '../../shared/pagination/pagination.component';

interface GenericGroup {
  genericName: string;
  brandType: BrandType;
  brandCount: number;
}

// "Generics" browse page — the medex.com.bd-style Generics (Allopathic /
// Herbal) list from the Browse menu. There's no dedicated Generic entity in
// this schema, so this is derived client-side from Product.GenericName —
// every distinct generic name, grouped, with a count of brands under it.
@Component({
  selector: 'app-generic-list',
  standalone: true,
  imports: [RouterLink, MatCardModule, MatButtonToggleModule, MatIconModule, PaginationComponent],
  templateUrl: './generic-list.component.html',
  styleUrl: './generic-list.component.scss'
})
export class GenericListComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  activeType: BrandType | null = null;
  groups: GenericGroup[] = [];
  loading = false;
  pageIndex = 0;
  pageSize = 10;

  get pagedGroups(): GenericGroup[] {
    const start = this.pageIndex * this.pageSize;
    return this.groups.slice(start, start + this.pageSize);
  }

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      const type = params.get('type');
      this.activeType = type === 'Allopathic' || type === 'Herbal' ? type : null;
      this.pageIndex = 0;
      this.load();
    });
  }

  selectType(type: BrandType | null): void {
    this.activeType = type;
    this.pageIndex = 0;
    this.load();
  }

  load(): void {
    this.loading = true;
    this.api.searchProductBrands({ brandType: this.activeType ?? undefined, pageSize: 200 }).subscribe({
      next: rows => {
        const byName = new Map<string, GenericGroup>();
        for (const r of rows) {
          if (!r.genericName) continue;
          const key = r.genericName;
          const existing = byName.get(key);
          if (existing) existing.brandCount++;
          else byName.set(key, { genericName: r.genericName, brandType: r.brandType ?? 'Allopathic', brandCount: 1 });
        }
        this.groups = [...byName.values()].sort((a, b) => a.genericName.localeCompare(b.genericName));
        this.pageIndex = 0;
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }
}
