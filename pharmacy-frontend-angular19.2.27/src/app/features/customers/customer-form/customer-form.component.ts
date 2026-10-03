import { Component, inject, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../../core/services/api.service';
import { CustomerAddress } from '../../../core/models/api.models';

@Component({
  selector: 'app-customer-form', standalone: true,
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule, MatSlideToggleModule, MatSnackBarModule],
  templateUrl: './customer-form.component.html', styleUrl: './customer-form.component.scss'
})
export class CustomerFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackbar = inject(MatSnackBar);

  customerTypes: { id: number; name: string }[] = [];
  photo?: File;
  preview?: string;
  existingPhotoUrl?: string | null;
  saving = false;
  loading = false;
  addresses: CustomerAddress[] = [];
  showAddAddressForm = false;
  readonly addressForm = this.fb.group({
    label: ['', Validators.required],
    addressLine: ['', Validators.required],
    city: [''],
    isDefault: [false]
  });

  // Edit mode is on whenever the route has an :id (e.g. /customers/edit/5).
  customerId: number | null = null;
  get isEditMode(): boolean { return this.customerId !== null; }

  readonly form = this.fb.group({
    firstName: ['', Validators.required],
    lastName: [''],
    phone: [''],
    email: ['', Validators.email],
    customerTypeId: [null as number | null, Validators.required],
    creditLimit: [0, Validators.min(0)],
    isActive: [true]
  });

  ngOnInit(): void {
    this.api.getCustomerTypes().subscribe({
      next: types => this.customerTypes = types,
      error: () => this.snackbar.open('Could not load customer types.', 'Close', { duration: 5000 })
    });

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.customerId = Number(idParam);
      this.loadCustomer(this.customerId);
    }
  }

  private loadCustomer(id: number): void {
    this.loading = true;
    this.api.getCustomer(id).subscribe({
      next: customer => {
        this.form.patchValue({
          firstName: customer.firstName ?? '',
          lastName: customer.lastName ?? '',
          phone: customer.phone ?? '',
          email: customer.email ?? '',
          customerTypeId: customer.customerTypeId ?? null,
          creditLimit: customer.creditLimit ?? 0,
          isActive: customer.isActive
        });
        this.addresses = customer.addresses ?? [];
        this.existingPhotoUrl = this.api.assetUrl(customer.photoPath);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.snackbar.open('Could not load this customer.', 'Close', { duration: 5000 });
        this.router.navigate(['/customers']);
      }
    });
  }

  selectPhoto(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.photo = file;
    const reader = new FileReader();
    reader.onload = () => this.preview = String(reader.result);
    reader.readAsDataURL(file);
  }

  addAddress(): void {
    if (this.addressForm.invalid) {
      this.addressForm.markAllAsTouched();
      return;
    }
    const raw = this.addressForm.getRawValue();
    this.addresses = [...this.addresses, {
      id: 0,
      label: raw.label!,
      addressLine: raw.addressLine!,
      city: raw.city || undefined,
      isDefault: raw.isDefault ?? false
    }];
    this.addressForm.reset({ isDefault: false });
    this.showAddAddressForm = false;
  }

  removeAddress(index: number): void {
    this.addresses = this.addresses.filter((_, i) => i !== index);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.snackbar.open('Please fill in all required fields (First name, Customer type) before saving.', 'Close', { duration: 5000 });
      return;
    }
    this.saving = true;

    const payload = {
      ...this.form.getRawValue(),
      addresses: this.addresses.map(address => ({ ...address, id: address.id || undefined }))
    } as any;

    if (this.isEditMode) {
      this.api.updateCustomer(this.customerId!, payload).subscribe({
        next: () => {
          if (!this.photo) { this.finish('Customer updated'); return; }
          this.api.uploadCustomerPhoto(this.customerId!, this.photo).subscribe({
            next: () => this.finish('Customer updated'),
            error: () => { this.saving = false; this.snackbar.open('Customer updated, but photo upload failed.', 'Close', { duration: 5000 }); }
          });
        },
        error: error => { this.saving = false; this.snackbar.open(error?.error?.message || 'Could not update customer.', 'Close', { duration: 5000 }); }
      });
      return;
    }

    this.api.createCustomer(payload).subscribe({
      next: customer => {
        if (!this.photo) { this.finish('Customer created'); return; }
        this.api.uploadCustomerPhoto(customer.customerId, this.photo).subscribe({
          next: () => this.finish('Customer created'),
          error: () => { this.saving = false; this.snackbar.open('Customer created, but photo upload failed.', 'Close', { duration: 5000 }); }
        });
      },
      error: error => { this.saving = false; this.snackbar.open(error?.error?.message || 'Could not create customer.', 'Close', { duration: 5000 }); }
    });
  }

  private finish(message: string): void {
    this.snackbar.open(message, 'Close', { duration: 3000 });
    this.router.navigate(['/customers']);
  }
}
