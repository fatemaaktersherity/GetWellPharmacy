import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'app-near-expiry-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatCardModule, MatButtonModule, MatIconModule, MatTableModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatSnackBarModule, RouterLink],
  templateUrl: './near-expiry-list.component.html',
  styleUrl: './near-expiry-list.component.scss',
})
export class NearExpiryListComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snackbar = inject(MatSnackBar);

  items: any[] = [];
  cols = ['product', 'batch', 'expiry', 'daysLeft', 'quantity', 'warehouse'];
  readonly windowDays = new FormControl(30, { nonNullable: true });
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly windowOptions = [7, 14, 30, 60, 90];

  get filteredItems(): any[] {
    const term = this.searchControl.value.trim().toLocaleLowerCase();
    if (!term) return this.items;
    return this.items.filter((item) =>
      [item.productName, item.batchNumber, item.warehouseName].join(' ').toLocaleLowerCase().includes(term),
    );
  }

  ngOnInit(): void {
    this.load();
    this.windowDays.valueChanges.subscribe(() => this.load());
  }

  load(): void {
    this.api.getNearExpiryStocks(this.windowDays.value).subscribe({
      next: (data) => (this.items = data),
      error: () => this.snackbar.open('Could not load near-expiry stock.', 'Close', { duration: 5000 }),
    });
  }

  daysLeft(item: { daysLeft?: number; expiryDate: string }): number {
    if (item.daysLeft !== undefined) return item.daysLeft;

    // Fallback for older API responses; compare calendar dates, not timestamps.
    const [year, month, day] = item.expiryDate.slice(0, 10).split('-').map(Number);
    const expiry = Date.UTC(year, month - 1, day);
    const today = new Date();
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.max(0, Math.round((expiry - todayUtc) / 86_400_000));
  }
}
