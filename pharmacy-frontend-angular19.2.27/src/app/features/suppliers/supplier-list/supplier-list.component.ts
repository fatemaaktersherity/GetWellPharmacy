import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, SlicePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../../core/services/api.service';
import { Supplier } from '../../../core/models/api.models';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';

@Component({
  selector: 'app-supplier-list',
  standalone: true,
  imports: [CommonModule, SlicePipe, PaginationComponent, ReactiveFormsModule, RouterLink, MatCardModule, MatButtonModule, MatIconModule, MatTableModule, MatFormFieldModule, MatInputModule, MatSnackBarModule],
  templateUrl: './supplier-list.component.html',
  styleUrl: './supplier-list.component.scss'
})
export class SupplierListComponent implements OnInit {
    private readonly confirmDialog = inject(ConfirmDialogService);

  private readonly api = inject(ApiService);
  private readonly snackbar = inject(MatSnackBar);
  suppliers: Supplier[] = [];
  pageIndex = 0; pageSize = 10;
  readonly searchControl = new FormControl('', { nonNullable: true });
  get filteredSuppliers(): Supplier[] {
    const term = this.searchControl.value.trim().toLocaleLowerCase();
    if (!term) return this.suppliers;
    return this.suppliers.filter(supplier => [supplier.supplierName, supplier.supplierTypeName, supplier.phone || '', supplier.email || '', supplier.address || '', supplier.isActive ? 'active' : 'inactive']
      .join(' ').toLocaleLowerCase().includes(term));
  }
  ngOnInit(): void { this.load(); }
  load(): void { this.api.getSuppliers().subscribe({ next: (d) => this.suppliers = d, error: () => this.snackbar.open('Failed to load suppliers', 'Close', { duration: 5000 }) }); }
  async delete(id: number) { if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: 'Are you sure?', confirmText: 'Continue', danger: true })) return; this.api.deleteSupplier(id).subscribe({ next: () => { this.snackbar.open('Deleted', 'Close', { duration: 3000 }); this.load(); }, error: () => this.snackbar.open('Failed', 'Close', { duration: 5000 }) }); }
  uploadLogo(id: number, event: Event): void { const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return; this.api.uploadSupplierLogo(id, file).subscribe({ next: () => { this.snackbar.open('Supplier logo uploaded', 'Close', { duration: 3000 }); this.load(); }, error: () => this.snackbar.open('Could not upload supplier logo.', 'Close', { duration: 5000 }) }); }
  async deleteLogo(id: number) { if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: 'Remove this supplier logo?', confirmText: 'Continue', danger: true })) return; this.api.deleteSupplierLogo(id).subscribe({ next: () => { this.snackbar.open('Logo removed', 'Close', { duration: 3000 }); this.load(); }, error: () => this.snackbar.open('Could not remove logo.', 'Close', { duration: 5000 }) }); }
  logoUrl(path?: string): string | null { return this.api.assetUrl(path); }
}
