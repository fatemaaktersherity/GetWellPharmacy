import { Component, inject } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { CompanyAssetCreate, CompanyAssetDetail, DEPRECIATION_METHODS } from "../../../core/models/api.models";

export interface AssetFormDialogData { asset?: CompanyAssetDetail }

@Component({
  selector: "app-asset-form-dialog",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
  ],
  templateUrl: "./asset-form-dialog.component.html",
  styleUrl: "./asset-form-dialog.component.scss",
})
export class AssetFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<AssetFormDialogComponent, CompanyAssetCreate>);
  readonly data = inject<AssetFormDialogData>(MAT_DIALOG_DATA, { optional: true }) ?? {};
  readonly isEdit = !!this.data.asset;
  readonly depreciationMethods = DEPRECIATION_METHODS;

    readonly form = this.fb.nonNullable.group({
    name: [this.data.asset?.name ?? "", Validators.required],
    value: [this.data.asset?.value ?? 0, [Validators.required, Validators.min(0.01)]],
    acquiredDate: [this.data.asset?.acquiredDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10), Validators.required],
    salvageValue: [this.data.asset?.salvageValue ?? 0, [Validators.min(0)]],
    usefulLifeYears: [this.data.asset?.usefulLifeYears ?? 5, [Validators.min(0)]],
    depreciationRatePercent: [this.data.asset?.depreciationRatePercent ?? 0, [Validators.min(0), Validators.max(100)]],
    depreciationMethod: [this.data.asset?.depreciationMethod ?? 0, Validators.required],
    description: [this.data.asset?.description ?? ""],
    isActive: [this.data.asset?.isActive ?? true],
  });

  close(): void {
    this.dialogRef.close();
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.dialogRef.close({
      name: v.name,
      value: v.value,
      acquiredDate: v.acquiredDate,
      salvageValue: v.salvageValue,
      usefulLifeYears: v.usefulLifeYears,
      depreciationRatePercent: v.depreciationRatePercent,
      depreciationMethod: v.depreciationMethod,
      description: v.description || undefined,
      isActive: v.isActive,
    });
  }
}