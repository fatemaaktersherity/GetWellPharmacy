import { Component, OnInit, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { ProductBrandListItem, BrandType } from '../../../core/models/api.models';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';

// P3: "List of Brand Names" — every brand, alphabetical, with an A-Z strip
// to jump to a letter. Mirrors medex.com.bd/brands.
@Component({
  selector: 'app-brand-list',
  standalone: true,
  imports: [PaginationComponent, ReactiveFormsModule, RouterLink, MatCardModule, MatButtonModule, MatIconModule, MatChipsModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule],
  templateUrl: './brand-list.component.html',
  styleUrl: './brand-list.component.scss'
})
export class BrandListComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  readonly letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  activeLetter: string | null = null;
  activeType: BrandType | null = null;
  brands: ProductBrandListItem[] = [];
  readonly searchControl = new FormControl('', { nonNullable: true });
  page = 1;
  pageSize = 10;
  loading = false;
  hasMore = true;

  get visibleBrands(): ProductBrandListItem[] {
    return this.searchControl.value.trim()
      ? this.filteredBrands.slice((this.page - 1) * this.pageSize, this.page * this.pageSize)
      : this.filteredBrands;
  }

  get paginationTotalItems(): number {
    if (this.searchControl.value.trim()) return this.filteredBrands.length;
    return this.hasMore ? this.page * this.pageSize + 1 : (this.page - 1) * this.pageSize + this.brands.length;
  }

  get filteredBrands(): ProductBrandListItem[] {
    const term = this.searchControl.value.trim().toLocaleLowerCase();
    if (!term) return this.brands;
    return this.brands.filter(brand => [
      brand.productName,
      brand.strength,
      brand.genericName || '',
      brand.dosageFormName || '',
      brand.companyName || ''
    ].join(' ').toLocaleLowerCase().includes(term));
  }

  ngOnInit(): void {
    this.searchControl.valueChanges.pipe(debounceTime(250), distinctUntilChanged()).subscribe(() => {
      this.page = 1;
      this.load(true);
    });
    // Supports being deep-linked from the Browse menu, e.g.
    // /brands?type=Herbal for "Brand Names (Herbal)" — subscribed (not just
    // read once) so re-clicking a Browse menu item while already on this
    // page still updates the tab, since Angular reuses the component
    // instance for same-route navigations.
    this.route.queryParamMap.subscribe(params => {
      const type = params.get('type');
      this.activeType = type === 'Allopathic' || type === 'Herbal' ? type : null;
      this.page = 1;
      this.load(true);
    });
  }

  selectLetter(letter: string | null): void {
    this.activeLetter = letter;
    this.page = 1;
    this.load(true);
  }

  selectType(type: BrandType | null): void {
    this.activeType = type;
    this.page = 1;
    this.load(true);
  }

  load(reset: boolean): void {
    this.loading = true;
    // During text search, request the full matching alphabet/type set so the
    // result is not restricted to the first visible page of brand cards.
    const requestedPageSize = this.searchControl.value.trim() ? 5000 : this.pageSize;
    this.api.getBrandList(this.activeLetter ?? undefined, this.activeType ?? undefined, this.page, requestedPageSize).subscribe({
      next: rows => {
        this.brands = reset ? rows : [...this.brands, ...rows];
        this.hasMore = !this.searchControl.value.trim() && rows.length === this.pageSize;
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  setPageIndex(index: number): void {
    const nextPage = index + 1;
    if (nextPage === this.page) return;
    this.page = nextPage;
    if (!this.searchControl.value.trim()) this.load(true);
  }

  setPageSize(size: number): void {
    this.pageSize = size;
    this.page = 1;
    if (!this.searchControl.value.trim()) this.load(true);
  }

  imageUrl(path?: string): string | null { return this.api.assetUrl(path); }
}
