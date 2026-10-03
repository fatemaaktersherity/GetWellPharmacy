import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';
import { PurchaseReturn } from '../../../core/models/api.models';
import { PurchaseReturnPrintService } from '../../../core/services/purchase-return-print.service';
import { PaymentMethod, PaymentMethodService } from '../../payment-methods/payment-method.service';

@Component({
  selector: 'app-purchase-return-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatCardModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatIconModule],
  template: `
    <mat-card *ngIf="ret">
      <mat-card-header>
        <mat-card-title>Purchase Return {{ ret.returnNo }}</mat-card-title>
        <mat-card-subtitle>From Purchase Invoice #{{ ret.purchaseInvoiceId }} — {{ ret.returnDate | date }}</mat-card-subtitle>
        <div class="header-actions" *ngIf="totalReceived() > 0">
          <button mat-stroked-button type="button" (click)="printReturn()"><mat-icon>print</mat-icon> Print</button>
        </div>
      </mat-card-header>
      <mat-card-content>
        <p *ngIf="ret.reason"><b>Reason:</b> {{ ret.reason }}</p>
        <p><b>Status:</b> {{ ret.isCompleted ? 'Fully credited' : 'Awaiting supplier credit' }}</p>

        <h4>Items</h4>
        <p class="hint">Items are fixed once a return is created — correcting a mistake means deleting this return and creating a new one, not editing a line here.</p>
        <table class="items-table">
          <thead><tr><th>Product</th><th>Unit</th><th class="num">Qty</th><th class="num">Cost</th><th class="num">Subtotal</th></tr></thead>
          <tbody>
            <tr *ngFor="let i of ret.items">
              <td>{{ i.productName || ('Product #' + i.productId) }}</td>
              <td>{{ i.unitName || '-' }}</td>
              <td class="num">{{ i.quantity }}</td>
              <td class="num">{{ i.unitCost | number:'1.2-2' }}</td>
              <td class="num">{{ i.subTotal | number:'1.2-2' }}</td>
            </tr>
          </tbody>
        </table>

        <div class="summary">
          <div><span>Return Total</span><b>{{ ret.returnTotal | number:'1.2-2' }}</b></div>
          <div><span>Cash Refunded</span><b>{{ totalCashRefunded() | number:'1.2-2' }}</b></div>
          <div><span>Supplier Credit Confirmed</span><b>{{ totalSupplierCredit() | number:'1.2-2' }}</b></div>
          <div><span>Remaining Credit</span><b>{{ remainingCredit() | number:'1.2-2' }}</b></div>
        </div>

        <h4>Refunds &amp; Credits</h4>
        <table class="items-table" *ngIf="ret.receives.length">
          <thead><tr><th>Date</th><th>Type</th><th class="num">Amount</th><th>Note</th></tr></thead>
          <tbody>
            <tr *ngFor="let r of ret.receives">
              <td>{{ r.receivedDate | date }}</td>
              <td>{{ r.paymentMethod === 'Supplier Credit' ? 'Supplier credit (no cash)' : r.paymentMethod + ' refund' }}</td>
              <td class="num">{{ r.receivedAmount | number:'1.2-2' }}</td>
              <td>{{ r.note || '-' }}</td>
            </tr>
          </tbody>
        </table>

        <ng-container *ngIf="remainingCredit() > 0">
          <mat-form-field appearance="outline"><mat-label>Amount</mat-label>
            <input matInput type="number" min="0.01" [max]="remainingCredit()" [(ngModel)]="receiveAmount" name="receiveAmount">
          </mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Refund / credit type</mat-label>
            <mat-select [(ngModel)]="receiveMethod" name="receiveMethod">
              <mat-option *ngFor="let method of paymentMethods" [value]="method.name">{{ method.name }}</mat-option>
              <mat-option value="Supplier Credit">Supplier credit (no cash)</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Note / credit note reference</mat-label><input matInput [(ngModel)]="receiveNote" name="receiveNote"></mat-form-field>
          <button mat-flat-button color="primary" [disabled]="receiving || !receiveAmount" (click)="recordReceive()">
            {{ receiving ? 'Saving…' : 'Record Refund / Credit' }}
          </button>
          <p class="hint" *ngIf="receiveMethod === 'Supplier Credit'">Use this only when the supplier confirms a credit note or applies this amount to your account. It will not increase cash or bank balances.</p>
        </ng-container>

        <h4>Receipt</h4>
        <a class="receipt-preview-link" *ngIf="receiptUrl(ret) as url" [href]="url" target="_blank" aria-label="Open receipt image in a new tab">
          <img class="receipt-preview" [src]="url" alt="Purchase return receipt">
        </a>
        <div class="receipt-actions">
          <input type="file" accept="image/*" (change)="selectReceipt($event)">
          <span class="selected-file" *ngIf="receiptFile">{{ receiptFile.name }}</span>
          <button mat-flat-button color="primary" class="receipt-button" type="button" [disabled]="!receiptFile || savingReceipt" (click)="saveReceipt()">
            {{ savingReceipt ? 'Saving…' : 'Save Receipt' }}
          </button>
        </div>

        <p class="error" *ngIf="error">{{ error }}</p>
      </mat-card-content>
      <mat-card-actions>
        <a mat-button routerLink="/returns/purchase">Back</a>
        <button mat-button color="warn" (click)="deleteReturn()">Delete Return</button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [`
    mat-form-field { display:inline-block; width:200px; margin-right:12px; }
    .items-table { width:100%; border-collapse:collapse; margin:8px 0 16px; }
    .items-table th, .items-table td { text-align:left; padding:6px 8px; border-bottom:1px solid #ddd; }
    .num { text-align:right; }
    .summary { display:flex; gap:24px; margin:12px 0; }
    .summary div { display:flex; flex-direction:column; }
    .summary span { color:#666; font-size:12px; }
    .hint { color:#666; font-size:13px; }
    .error { color:#b00020; }
    mat-card-header { display:flex; align-items:flex-start; gap:16px; }
    .header-actions { margin-left:auto; }
    .header-actions button mat-icon { margin-right:4px; }
    .receipt-actions { display:flex; align-items:center; flex-wrap:wrap; gap:12px; }
    .receipt-button { min-width:0; height:34px; min-height:34px; margin-left:-90px; padding:0 12px; font-size:12px; line-height:32px; }
    .selected-file { color:#667085; font-size:13px; }
    .receipt-preview-link { display:inline-block; margin:0 0 14px; }
    .receipt-preview { display:block; width:240px; height:160px; max-width:100%; object-fit:contain; border:1px solid #dfe6e6; border-radius:10px; background:#f8fafc; }
  `],
})
export class PurchaseReturnDetailComponent {
    private readonly confirmDialog = inject(ConfirmDialogService);

  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly printService = inject(PurchaseReturnPrintService);
  private readonly paymentMethodService = inject(PaymentMethodService);

  ret?: PurchaseReturn;
  receiveAmount?: number;
  receiveMethod = 'Cash';
  paymentMethods: PaymentMethod[] = [];
  receiveNote = '';
  receiving = false;
  receiptFile?: File;
  savingReceipt = false;
  error = '';

  constructor() {
    this.paymentMethodService.getAll().subscribe(methods => {
      this.paymentMethods = methods.filter(method => method.isActive);
      if (!this.paymentMethods.some(method => method.name === this.receiveMethod) && this.paymentMethods.length) this.receiveMethod = this.paymentMethods[0].name;
    });
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.load(id);
  }

  private load(id: number): void {
    this.api.getPurchaseReturn(id).subscribe({
      next: (r) => (this.ret = r),
      error: () => (this.error = 'Could not load this purchase return.'),
    });
  }

  totalReceived(): number {
    return this.ret?.receives.reduce((sum, r) => sum + r.receivedAmount, 0) ?? 0;
  }

  totalCashRefunded(): number {
    return this.ret?.receives
      .filter((r) => r.paymentMethod !== 'Supplier Credit')
      .reduce((sum, r) => sum + r.receivedAmount, 0) ?? 0;
  }

  totalSupplierCredit(): number {
    return this.ret?.receives
      .filter((r) => r.paymentMethod === 'Supplier Credit')
      .reduce((sum, r) => sum + r.receivedAmount, 0) ?? 0;
  }

  remainingCredit(): number {
    return (this.ret?.returnTotal ?? 0) - this.totalReceived();
  }

  receiptUrl(ret: PurchaseReturn): string | null {
    const pathUrl = this.api.assetUrl(ret.receiptImagePath);
    if (pathUrl) return pathUrl;
    if (!ret.receiptImage) return null;
    const contentType = ret.receiptImageContentType || 'image/jpeg';
    return `data:${contentType};base64,${ret.receiptImage}`;
  }

  recordReceive(): void {
    if (!this.ret || !this.receiveAmount) return;
    this.receiving = true;
    this.api.addPurchaseReturnReceive(this.ret.id, {
      receivedAmount: this.receiveAmount,
      receivedDate: new Date().toISOString(),
      paymentMethod: this.receiveMethod,
      note: this.receiveNote || undefined,
    }).subscribe({
      next: () => {
        this.receiving = false;
        this.receiveAmount = undefined;
        this.receiveNote = '';
        this.load(this.ret!.id);
      },
      error: (e) => {
        this.receiving = false;
        this.error = e?.error?.message || 'Could not record the receive.';
      },
    });
  }

  selectReceipt(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    this.receiptFile = file;
    this.error = '';
  }

  saveReceipt(): void {
    if (!this.ret || !this.receiptFile || this.savingReceipt) return;
    this.savingReceipt = true;
    this.api.uploadPurchaseReturnReceipt(this.ret.id, this.receiptFile).subscribe({
      next: () => {
        this.savingReceipt = false;
        this.receiptFile = undefined;
        this.load(this.ret!.id);
      },
      error: () => {
        this.savingReceipt = false;
        this.error = 'Could not upload the receipt.';
      },
    });
  }

  printReturn(): void {
    if (this.ret && this.totalReceived() > 0) this.printService.print(this.ret);
  }

  async deleteReturn() {
    if (!this.ret || !await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: `Delete return ${this.ret.returnNo}? This cannot be undone.`, confirmText: 'Continue', danger: true })) return;
    this.api.deletePurchaseReturn(this.ret.id).subscribe({
      next: () => this.router.navigate(['/returns/purchase']),
      error: (e) => (this.error = e?.error?.message || 'Could not delete this return.'),
    });
  }
}
