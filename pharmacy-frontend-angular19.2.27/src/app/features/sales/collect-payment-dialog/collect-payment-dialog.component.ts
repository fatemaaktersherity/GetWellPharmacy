import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { PaymentMethod, PaymentMethodService } from '../../payment-methods/payment-method.service';

export interface CollectPaymentDialogData {
    saleId: number;
    paymentMethod?: string;
    dueAmount: number;
}

export interface CollectPaymentResult {
    paymentMethod: string;
    amount: number;
}

@Component({
    selector: 'app-collect-payment-dialog',
    standalone: true,
    imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
    template: `
    <h2 mat-dialog-title>Collect Payment — Sale #{{ data.saleId }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="payment-form">
        <mat-form-field appearance="outline">
          <mat-label>Payment method</mat-label>
          <mat-select formControlName="paymentMethod">
            @for (pm of paymentMethods; track pm.id) {
              <mat-option [value]="pm.name">{{ pm.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Amount (due: {{ data.dueAmount }})</mat-label>
          <input matInput type="number" formControlName="amount" min="0.01" step="0.01" />
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="dialogRef.close(null)">Cancel</button>
      <button mat-raised-button color="primary" [disabled]="form.invalid" (click)="submit()">
        Record Payment
      </button>
    </mat-dialog-actions>
  `,
    styles: [`
    .payment-form { display: flex; flex-direction: column; gap: 4px; min-width: 320px; }
    mat-form-field { width: 100%; }
  `]
})
export class CollectPaymentDialogComponent implements OnInit {
    readonly dialogRef: MatDialogRef<CollectPaymentDialogComponent, CollectPaymentResult | null> =
        inject(MatDialogRef<CollectPaymentDialogComponent, CollectPaymentResult | null>);
    readonly data: CollectPaymentDialogData = inject<CollectPaymentDialogData>(MAT_DIALOG_DATA);
    private readonly fb: FormBuilder = inject(FormBuilder);
    private readonly paymentMethodService: PaymentMethodService = inject(PaymentMethodService);

    paymentMethods: PaymentMethod[] = [];

    readonly form: FormGroup = this.fb.group({
        paymentMethod: [this.data.paymentMethod || '', Validators.required],
        amount: [this.data.dueAmount, [Validators.required, Validators.min(0.01)]]
    });

    ngOnInit(): void {
        this.paymentMethodService.getAll().subscribe(methods => {
            this.paymentMethods = methods.filter(m => m.isActive);
            const current = this.form.controls['paymentMethod'].value;
            const stillValid = this.paymentMethods.some(m => m.name === current);
            if (!stillValid && this.paymentMethods.length) {
                this.form.controls['paymentMethod'].setValue(this.paymentMethods[0].name);
            }
        });
    }

    submit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }
        const raw = this.form.getRawValue();
        this.dialogRef.close({ paymentMethod: raw.paymentMethod, amount: Number(raw.amount) });
    }
}