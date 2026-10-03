import { Component, OnInit, inject } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PurchaseInvoice } from '../../../core/models/api.models';
import { ApiService } from '../../../core/services/api.service';
import { PaymentMethodService } from '../../payment-methods/payment-method.service';
import { PaymentMethod } from '../../payment-methods/payment-method.service';


@Component({
  selector: 'app-purchase-payment',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, ReactiveFormsModule, RouterLink, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule, MatSnackBarModule],
  templateUrl: './purchase-payment.component.html',
  styleUrl: './purchase-payment.component.scss'
})
export class PurchasePaymentComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);
  private readonly paymentMethodService = inject(PaymentMethodService);

  purchase?: PurchaseInvoice;
  paymentMethods: PaymentMethod[] = [];
  saving = false;
  readonly form = this.fb.nonNullable.group({
    paidNo: ['', Validators.required],
    paidDate: [new Date().toISOString().slice(0, 10), Validators.required],
    paymentMethod: ['Cash', Validators.required],
    amount: [0, [Validators.required, Validators.min(0.01)]]
  });

  ngOnInit(): void {
    this.paymentMethodService.getAll().subscribe(methods => {
      this.paymentMethods = methods.filter(method => method.isActive);
      if (!this.paymentMethods.some(method => method.name === this.form.controls.paymentMethod.value) && this.paymentMethods.length) {
        this.form.controls.paymentMethod.setValue(this.paymentMethods[0].name);
      }
    });
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) { this.router.navigate(['/purchases']); return; }
    this.api.getPurchaseInvoice(id).subscribe({
      next: purchase => {
        if (purchase.due <= 0) {
          this.snackbar.open('This purchase is already fully paid.', 'Close', { duration: 3500 });
          this.router.navigate(['/purchases']);
          return;
        }
        this.purchase = purchase;
        this.form.patchValue({ paidNo: `SP-${Date.now()}`, amount: purchase.due });
      },
      error: () => this.router.navigate(['/purchases'])
    });
  }

  submit(): void {
    if (!this.purchase || this.form.invalid) { this.form.markAllAsTouched(); return; }
    const value = this.form.getRawValue();
    if (value.amount > this.purchase.due) {
      this.form.controls.amount.setErrors({ exceedsDue: true });
      return;
    }
    this.saving = true;
    this.api.recordSupplierPayment({
      paidNo: value.paidNo.trim(),
      paidDate: new Date(`${value.paidDate}T12:00:00`).toISOString(),
      paymentMethod: value.paymentMethod,
      supplierId: this.purchase.supplierId,
      details: [{ purchaseInvoiceId: this.purchase.id, paidAmount: value.amount }]
    }).subscribe({
      next: () => {
        this.snackbar.open('Supplier payment recorded successfully.', 'Close', { duration: 3500 });
        this.router.navigate(['/purchases']);
      },
      error: error => {
        this.saving = false;
        this.snackbar.open(error?.error?.message || 'Could not record supplier payment.', 'Close', { duration: 6000 });
      }
    });
  }
}
