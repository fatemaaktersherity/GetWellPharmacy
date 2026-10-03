import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { Component, Input, Output, EventEmitter, OnInit, inject, SimpleChanges, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button'; import { MatCardModule } from '@angular/material/card'; import { MatFormFieldModule } from '@angular/material/form-field'; import { MatIconModule } from '@angular/material/icon'; import { MatInputModule } from '@angular/material/input'; import { MatSelectModule } from '@angular/material/select'; import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar'; import { MatTableModule } from '@angular/material/table'; import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/services/api.service'; import { DosageForm, ProductGroupDetail, ProductVariant } from '../../core/models/api.models';
@Component({ selector: 'app-product-group-detail', standalone: true, imports: [CommonModule, ReactiveFormsModule, RouterLink, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule, MatSnackBarModule, MatTableModule, MatTooltipModule], templateUrl: './product-group-detail.component.html', styleUrl: './product-group-detail.component.scss' })
export class ProductGroupDetailComponent implements OnInit, OnChanges {
  // When embedded inline (e.g. an expanded row on the Product Groups list),
  // the host passes the group id directly instead of us reading it from the
  // route — that's what lets this same component work both as its own page
  // (/product-groups/:id) and as an inline section on the list page.
    private readonly confirmDialog = inject(ConfirmDialogService);

  @Input() groupId?: number;
  @Input() embedded = false;
  @Output() closeSection = new EventEmitter<void>();

  private readonly api = inject(ApiService); private readonly route = inject(ActivatedRoute); private readonly fb = inject(FormBuilder); private readonly snackbar = inject(MatSnackBar); group?: ProductGroupDetail; dosageForms: DosageForm[] = []; editing?: ProductVariant; saving = false; readonly columns = ['strength', 'dosage', 'actions']; readonly strengthUnits = ['mg', 'mcg', 'g', 'ml', 'IU', '%']; readonly form = this.fb.group({ strengthValue: ['', [Validators.required, Validators.maxLength(80)]], strengthUnit: ['mg', Validators.required], dosageFormId: [null as number | null, Validators.required] });
  ngOnInit(): void { this.api.getDosageForms().subscribe(x => this.dosageForms = x); this.load(); }
  ngOnChanges(changes: SimpleChanges): void { if (changes['groupId'] && !changes['groupId'].firstChange) this.load(); }
  private currentGroupId(): number { return this.groupId ?? Number(this.route.snapshot.paramMap.get('id')); }
  load(): void { const id = this.currentGroupId(); this.api.getProductGroup(id).subscribe({ next: x => this.group = x, error: e => this.error(e) }); }
  save(): void { if (!this.group || this.form.invalid || this.saving) return; this.saving = true; const data = { strength: `${this.form.controls.strengthValue.value!.trim()} ${this.form.controls.strengthUnit.value}`.trim(), dosageFormId: this.form.controls.dosageFormId.value! }; const done = () => { this.snackbar.open(this.editing ? 'Variant updated.' : 'Variant added.', 'Close', { duration: 3000 }); this.cancel(); this.load(); }; const failed = (e: unknown) => { this.saving = false; this.error(e); }; if (this.editing) this.api.updateProductVariant(this.group.id, this.editing.id, data).subscribe({ next: done, error: failed }); else this.api.createProductVariant(this.group.id, data).subscribe({ next: done, error: failed }); }
  edit(variant: ProductVariant): void { const match = variant.strength.trim().match(/^(.*?)(?:\s+(mg|mcg|g|ml|IU|%))?$/i); this.editing = variant; this.form.setValue({ strengthValue: match?.[1] || variant.strength, strengthUnit: match?.[2] || 'mg', dosageFormId: variant.dosageFormId }); }
  cancel(): void { this.editing = undefined; this.saving = false; this.form.reset({ strengthValue: '', strengthUnit: 'mg', dosageFormId: null }); }
  async delete(variant: ProductVariant) { if (!this.group || !await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: `Delete ${variant.strength} ${variant.dosageFormName}?`, confirmText: 'Continue', danger: true })) return; this.api.deleteProductVariant(this.group.id, variant.id).subscribe({ next: () => { this.snackbar.open('Variant deleted.', 'Close', { duration: 3000 }); this.load(); }, error: e => this.error(e) }); }
  private error(err: unknown): void { this.snackbar.open((err as { error?: { message?: string } })?.error?.message || 'Unable to save variant.', 'Close', { duration: 5000 }); }
}
