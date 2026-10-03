import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormControl, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../../core/services/api.service';
import { Product } from '../../../core/models/api.models';

@Component({
  selector: 'app-price-list',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, ReactiveFormsModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule, MatInputModule, MatTableModule, MatFormFieldModule, MatSnackBarModule],
  templateUrl: './price-list.component.html',
  styleUrl: './price-list.component.scss'
})
export class PriceListComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snackbar = inject(MatSnackBar);
  products: Product[] = [];
  editingId: number | null = null;
  editingProduct: Partial<Product> = {};
  readonly searchControl = new FormControl('', { nonNullable: true });
  ngOnInit(): void { this.load(); this.searchControl.valueChanges.pipe(debounceTime(300), distinctUntilChanged()).subscribe(value => this.load(value)); }
  load(search = ''): void { this.api.getProducts(search).subscribe(p => this.products = p); }
  startEdit(product: Product): void { this.editingId = product.id; this.editingProduct = { ...product }; }
  cancelEdit(): void { this.editingId = null; this.editingProduct = {}; }
  savePrice(productId: number): void { if (this.editingId !== productId) return; const updates = { unitPrice: this.editingProduct.unitPrice, purchasePrice: this.editingProduct.purchasePrice, salePrice: this.editingProduct.salePrice || this.editingProduct.unitPrice }; this.api.updateProduct(productId, updates).subscribe({ next: () => { this.snackbar.open('Updated', 'Close', { duration: 3000 }); this.load(this.searchControl.value); this.cancelEdit(); }, error: (err) => this.snackbar.open('Error: ' + (err.error?.message || 'Unknown'), 'Close', { duration: 5000 }) }); }
}
