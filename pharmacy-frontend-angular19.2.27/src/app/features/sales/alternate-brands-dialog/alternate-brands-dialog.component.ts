import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { ProductStockListItem } from '../../../core/models/api.models';

export interface AlternateBrandsDialogData {
  genericName: string;
  products: ProductStockListItem[]; // already deduped, one row per Product
}

type SortKey = 'name' | 'price' | 'popularity';

// "Other companies that make this generic" — medex.com.bd's brand-comparison
// table (picture 3): sortable by Name/Price/Popularity, filterable by
// Company/Strength/Dosage form. Scoped to this shop's own sellable stock
// (there's no external drug-database, so "available brands" = what's on
// the shelf here), opened from the Sale form's "Alternate Brands" button.
@Component({
  selector: 'app-alternate-brands-dialog',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatSelectModule, MatButtonToggleModule],
  templateUrl: './alternate-brands-dialog.component.html',
  styleUrl: './alternate-brands-dialog.component.scss'
})
export class AlternateBrandsDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<AlternateBrandsDialogComponent, ProductStockListItem | undefined>);
  readonly data: AlternateBrandsDialogData = inject(MAT_DIALOG_DATA);

  readonly sortBy = signal<SortKey>('name');
  readonly companyFilter = signal<string | null>(null);
  readonly strengthFilter = signal<string | null>(null);
  readonly dosageFormFilter = signal<string | null>(null);

  readonly companies = computed(() => this.uniqueSorted(this.data.products.map(p => p.companyName)));
  readonly strengths = computed(() => this.uniqueSorted(this.data.products.map(p => p.strength)));
  readonly dosageForms = computed(() => this.uniqueSorted(this.data.products.map(p => p.dosageFormName)));

  readonly rows = computed(() => {
    let rows = this.data.products.filter(p =>
      (!this.companyFilter() || p.companyName === this.companyFilter()) &&
      (!this.strengthFilter() || p.strength === this.strengthFilter()) &&
      (!this.dosageFormFilter() || p.dosageFormName === this.dosageFormFilter())
    );

    const sortBy = this.sortBy();
    rows = [...rows].sort((a, b) => {
      if (sortBy === 'price') return a.salePrice - b.salePrice;
      if (sortBy === 'popularity') return b.popularityScore - a.popularityScore;
      return a.productName.localeCompare(b.productName);
    });
    return rows;
  });

  select(item: ProductStockListItem): void {
    this.dialogRef.close(item);
  }

  close(): void {
    this.dialogRef.close(undefined);
  }

  packSummary(item: ProductStockListItem): string {
    const alt = item.packagings.find(pkg => pkg.unitId !== item.unitId);
    if (!alt) return '';
    return `${alt.unitName} (${alt.baseQuantity} x ${item.unitName})`;
  }

  private uniqueSorted(values: (string | undefined)[]): string[] {
    return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
  }
}
