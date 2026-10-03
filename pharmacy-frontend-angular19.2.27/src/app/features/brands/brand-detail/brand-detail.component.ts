import { Component, OnInit, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { ApiService } from '../../../core/services/api.service';
import { Product, ProductPackaging } from '../../../core/models/api.models';

// Brand detail page — a single brand's full record, styled after
// medex.com.bd's brand page (picture 5): pack image, generic/strength/
// company, unit & strip price, "Also available as" (other strengths of the
// same generic), and an Indications/Details panel from ProductDetails.
@Component({
  selector: 'app-brand-detail',
  standalone: true,
  imports: [DecimalPipe, RouterLink, MatCardModule, MatButtonModule, MatIconModule, MatChipsModule],
  templateUrl: './brand-detail.component.html',
  styleUrl: './brand-detail.component.scss'
})
export class BrandDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);

  product?: Product;
  productCategoryLabel: string | null = null;
  alternateStrengths: Product[] = [];
  loading = true;
  notFound = false;

  get isProductDetail(): boolean {
    return this.route.snapshot.routeConfig?.path === 'products/:id';
  }

  // If we arrived here from a company's medicine list (company-products
  // page passes ?companyId=...), "Back" should return there instead of
  // the generic all-products list.
  get fromCompanyId(): number | null {
    const id = Number(this.route.snapshot.queryParamMap.get('companyId'));
    return id ? id : null;
  }

  get backLink(): (string | number)[] {
    if (this.fromCompanyId) return ['/companies', this.fromCompanyId, 'products'];
    return [this.isProductDetail ? '/products' : '/brands'];
  }

  get backLabel(): string {
    if (this.fromCompanyId) return 'company medicines';
    return this.isProductDetail ? 'products' : 'brands';
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const id = Number(params.get('id'));
      if (id) this.load(id);
    });
  }

  load(id: number): void {
    this.loading = true;
    this.notFound = false;
    this.api.getProduct(id).subscribe({
      next: p => {
        this.product = p;
        this.productCategoryLabel = this.formatCategory(
          p.productCategoryParentName,
          p.productCategoryName,
        );
        this.loading = false;
        if (!this.productCategoryLabel && p.productCategoryId) {
          this.api.getProductCategories().subscribe(categories => {
            const category = categories.find(c => c.id === p.productCategoryId);
            if (category) {
              this.productCategoryLabel = this.formatCategory(
                category.parentCategoryName,
                category.name,
              );
            }
          });
        }
        if (!this.productCategoryLabel && !p.productCategoryId && p.productGroupId) {
          this.api.getProductGroup(p.productGroupId).subscribe(group => {
            this.productCategoryLabel = this.formatCategory(
              group.parentCategoryName,
              group.categoryName,
            );
          });
        }
        this.loadAlternateStrengths(p);
      },
      error: () => { this.loading = false; this.notFound = true; }
    });
  }

  imageUrl(path?: string | null): string | null {
    return this.api.assetUrl(path);
  }

  // "Also available as" — other brands sharing the same generic name,
  // excluding this one, same as medex.com.bd's brand page.
  private loadAlternateStrengths(p: Product): void {
    if (!p.genericName) { this.alternateStrengths = []; return; }
    this.api.searchProductBrands({ search: p.genericName, pageSize: 50 }).subscribe(rows => {
      this.alternateStrengths = rows.filter(r => r.id !== p.id && r.genericName === p.genericName);
    });
  }

  // Show every configured sellable packaging (Bottle, Strip, Box...) with
  // its own saved price. A packaging price is not derived from base quantity.
  get packPrices(): ProductPackaging[] {
    return this.product?.prices ?? [];
  }

  packagingLabel(pack: ProductPackaging): string {
    return pack.displayName?.trim() || `${pack.baseQuantity} ${pack.unitName || 'pack'}`;
  }

  private formatCategory(parentName?: string | null, name?: string | null): string | null {
    if (!name?.trim()) return null;
    return parentName?.trim() ? `${parentName.trim()} / ${name.trim()}` : name.trim();
  }
}
