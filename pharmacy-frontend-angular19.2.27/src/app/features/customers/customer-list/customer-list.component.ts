import { Component, inject, OnInit } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { Customer } from '../../../core/models/api.models';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';

@Component({
  selector: 'app-customer-list',
  standalone: true,
  imports: [SlicePipe, PaginationComponent, ReactiveFormsModule, RouterLink, MatCardModule, MatTableModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSnackBarModule],
  templateUrl: './customer-list.component.html',
  styleUrl: './customer-list.component.scss'
})
export class CustomerListComponent implements OnInit {
  private readonly api: ApiService = inject(ApiService);
  private readonly snackbar: MatSnackBar = inject(MatSnackBar);
  private readonly confirmDialog: ConfirmDialogService = inject(ConfirmDialogService);

  customers: Customer[] = [];
  pageIndex = 0; pageSize = 10;
  readonly searchControl = new FormControl('', { nonNullable: true });

  get filteredCustomers(): Customer[] {
    const term = this.searchControl.value.trim().toLocaleLowerCase();
    if (!term) return this.customers;
    return this.customers.filter(customer => [customer.firstName || '', customer.lastName || '', customer.phone || '', customer.email || '', customer.customerTypeName, customer.isActive ? 'active' : 'inactive']
      .join(' ').toLocaleLowerCase().includes(term));
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.getCustomers().subscribe({
      next: c => this.customers = c,
      error: () => this.snackbar.open('Could not load customers.', 'Close', { duration: 5000 })
    });
  }

  formatAddresses(customer: Customer): string[] {
    return (customer.addresses ?? []).map(address =>
      `${address.label ? `${address.label}: ` : ''}${address.addressLine}${address.city ? `, ${address.city}` : ''}${address.isDefault ? ' (Default)' : ''}`
    );
  }

  delete(id: number): void {
    this.confirmDialog.confirmDelete('customer').subscribe((confirmed: boolean) => {
      if (!confirmed) return;
      this.api.deleteCustomer(id).subscribe({
        next: () => {
          this.snackbar.open('Customer deleted', 'Close', { duration: 3000 });
          this.load();
        },
        error: (e: any) => this.snackbar.open(e.error?.message || 'Could not delete customer.', 'Close', { duration: 5000 })
      });
    });
  }

  uploadPhoto(id: number, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.api.uploadCustomerPhoto(id, file).subscribe({
      next: () => { this.snackbar.open('Customer photo uploaded', 'Close', { duration: 3000 }); this.load(); },
      error: () => this.snackbar.open('Could not upload customer photo.', 'Close', { duration: 5000 })
    });
  }

  photoUrl(path?: string): string | null {
    return this.api.assetUrl(path);
  }
}
