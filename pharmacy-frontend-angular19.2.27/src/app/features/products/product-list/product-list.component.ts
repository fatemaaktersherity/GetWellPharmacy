import { Component, inject, OnInit } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatSelectModule } from '@angular/material/select';
import { ApiService } from '../../../core/services/api.service';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Product } from '../../../core/models/api.models';
import { MessageDialogService } from '../../../shared/message-dialog/message-dialog.service';
import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CurrencyPipe, ReactiveFormsModule, RouterLink, MatCardModule, MatButtonModule, MatIconModule, MatInputModule, MatTableModule, MatSelectModule, MatTooltipModule, PaginationComponent],
  templateUrl: './product-list.component.html',
  styleUrl: './product-list.component.scss'
})
export class ProductListComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly messageDialog = inject(MessageDialogService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  products: Product[] = [];
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly statusControl = new FormControl<'all' | 'in-stock' | 'out'>('all', { nonNullable: true });
  readonly sortControl = new FormControl<'name' | 'stock-low' | 'stock-high' | 'price-low' | 'price-high'>('name', { nonNullable: true });
  page = 0;
  pageSize = 10;

  get filteredProducts(): Product[] {
    const status = this.statusControl.value;
    const rows = this.products.filter(product => status === 'all' ||
      (status === 'in-stock' && product.stockQuantity > 0) ||
      (status === 'out' && product.stockQuantity <= 0));
    return [...rows].sort((a, b) => {
      const price = (p: Product) => p.salePrice ?? p.unitPrice;
      switch (this.sortControl.value) {
        case 'stock-low': return a.stockQuantity - b.stockQuantity;
        case 'stock-high': return b.stockQuantity - a.stockQuantity;
        case 'price-low': return price(a) - price(b);
        case 'price-high': return price(b) - price(a);
        default: return a.productName.localeCompare(b.productName);
      }
    });
  }
  get pagedProducts(): Product[] { return this.filteredProducts.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize); }
  get totalPages(): number { return Math.max(1, Math.ceil(this.filteredProducts.length / this.pageSize)); }

  ngOnInit(): void {
    this.load();
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(value => { this.page = 0; this.load(value); });
    this.statusControl.valueChanges.subscribe(() => this.page = 0);
    this.sortControl.valueChanges.subscribe(() => this.page = 0);
  }

  private readonly router = inject(Router);

  load(search = ''): void {
    this.api.getProducts(search).subscribe(p => this.products = p);
  }

  delete(id: number): void {
    this.confirmDialog.confirmDelete('product').subscribe(confirmed => {
      if (!confirmed) return;
      this.api.deleteProduct(id).subscribe({
        next: () => this.load(this.searchControl.value),
        error: (err) => {
          const message = err?.error?.message || 'Product with available stocks cannot be deleted.';
          this.messageDialog.error(message);
        }
      });
    });
  }

  edit(id: number): void {
    this.router.navigate(['/products', id, 'edit']);
  }

  setActive(product: Product, active: boolean): void {
    const action = active ? 'activate' : 'archive';
    this.confirmDialog.confirm({
      title: active ? 'Activate product' : 'Archive product',
      message: `Do you want to ${action} "${product.productName}"?`,
      confirmText: active ? 'Activate' : 'Archive',
      danger: !active
    }).subscribe(confirmed => {
      if (!confirmed) return;
      this.api.getProduct(product.id).subscribe(full => this.api.updateProduct(product.id, { ...full, isActive: active }).subscribe({
        next: () => this.load(this.searchControl.value),
        error: () => this.messageDialog.error(`Could not ${action} this product.`)
      }));
    });
  }

  imageUrl(path?: string): string | null { return this.api.assetUrl(path); }
}
