import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { map } from 'rxjs';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-damage-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, MatCardModule, MatFormFieldModule, MatSelectModule, MatInputModule, MatButtonModule, MatSnackBarModule],
  template: `<div class="page-header"><h1>{{id ? 'Edit Damage Report' : 'Report Damaged Medicine'}}</h1><p>Every damage report stays pending until an Admin or Manager approves it. Stock is removed only after approval.</p></div><mat-card><mat-card-content><form [formGroup]="form" (ngSubmit)="save()"><mat-form-field><mat-label>Stock Batch</mat-label><mat-select formControlName="productStockId" (selectionChange)="onStockChanged()">@for (s of stocks; track s.id) {<mat-option [value]="s.id">{{s.productName}} — {{s.batchNumber}} (Available: {{s.availableQuantity}} {{s.unitName}})</mat-option>}</mat-select></mat-form-field>@if (selectedStock) {<mat-form-field><mat-label>Damage packaging</mat-label><mat-select formControlName="packagingUnitId">@for (p of packagingOptions; track p.unitId) {<mat-option [value]="p.unitId">{{p.unitName}} ({{p.baseQuantity}} {{selectedStock.unitName}})</mat-option>}</mat-select></mat-form-field><mat-form-field><mat-label>Damaged packages</mat-label><input matInput type="number" min="0.01" formControlName="packageQuantity"><mat-hint>Reported quantity: {{baseQuantity}} {{selectedStock.unitName}}.</mat-hint></mat-form-field>}<mat-form-field><mat-label>Damage Reason</mat-label><input matInput formControlName="note"></mat-form-field><button mat-raised-button color="primary" [disabled]="form.invalid">{{id ? 'Update Report' : 'Save Report'}}</button><a mat-button [routerLink]="returnLink">Cancel</a></form></mat-card-content></mat-card>`
})
export class DamageFormComponent implements OnInit {
  private fb = inject(FormBuilder); private api = inject(ApiService); private route = inject(ActivatedRoute); private router = inject(Router); private snackbar = inject(MatSnackBar);
  id?: number; stocks: any[] = []; returnLink = '/damage';
  form = this.fb.group({ productStockId: [null as number | null, Validators.required], packagingUnitId: [null as number | null, Validators.required], packageQuantity: [1, [Validators.required, Validators.min(.01)]], note: ['', Validators.required] });
  get selectedStock(): any { return this.stocks.find(s => s.id === this.form.controls.productStockId.value); }
  get packagingOptions(): any[] { const s = this.selectedStock; return s ? [{ unitId: s.unitId, unitName: s.unitName, baseQuantity: 1 }, ...(s.packagings || [])] : []; }
  get baseQuantity(): number { const selected = this.packagingOptions.find(p => p.unitId === this.form.controls.packagingUnitId.value); return (+this.form.controls.packageQuantity.value! || 0) * (selected?.baseQuantity || 1); }
  ngOnInit(): void {
    this.returnLink = this.route.snapshot.queryParamMap.get('returnTo') === '/damage/pending-approvals'
      ? '/damage/pending-approvals'
      : '/damage';
    this.api.getSellableStocks().subscribe(s => {
      this.stocks = s;
      if (this.id) this.onStockChanged();
    });
    const id = this.route.snapshot.paramMap.get('id');
    if (id) { this.id = +id; this.api.getDisposalRecord(this.id).subscribe(r => {
      if (r.disposalMethod !== 'Damaged' || r.approvalStatus !== 'PendingApproval') {
        this.snackbar.open('Only pending damage reports can be edited.', 'Close', { duration: 4000 });
        this.router.navigateByUrl(this.returnLink);
        return;
      }
      this.form.patchValue({ productStockId: r.productStockId, packageQuantity: r.quantity, note: r.note || '' });
      this.onStockChanged();
    }); }
  }
  onStockChanged(): void { this.form.controls.packagingUnitId.setValue(this.selectedStock?.unitId || null); }
  save(): void {
    if (this.form.invalid) return;
    const raw = this.form.getRawValue();
    const body = { productStockId: raw.productStockId!, quantity: this.baseQuantity, note: raw.note || undefined, disposalMethod: 'Damaged' };
    const save$ = this.id
      ? this.api.updateDisposal(this.id, body).pipe(map(() => undefined))
      : this.api.createDisposal(body).pipe(map(() => undefined));
    save$.subscribe({
      next: () => {
        this.snackbar.open(this.id ? 'Damage report updated; approval is still required.' : 'Damage report saved and is awaiting approval.', 'Close', { duration: 4500 });
        this.router.navigateByUrl(this.id ? this.returnLink : '/damage');
      },
      error: (e: any) => this.snackbar.open(e.error?.message || 'Could not save damage report.', 'Close', { duration: 5000 }),
    });
  }
}
