import { Component, inject } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { CompanyLiabilityCreate, CompanyLiabilityDetail, LIABILITY_TYPES } from "../../../core/models/api.models";

export interface LiabilityFormDialogData { liability?: CompanyLiabilityDetail }

@Component({
  selector: "app-liability-form-dialog",
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: "./liability-form-dialog.component.html",
  styleUrl: "./liability-form-dialog.component.scss",
})
export class LiabilityFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<LiabilityFormDialogComponent, CompanyLiabilityCreate>);
  readonly data = inject<LiabilityFormDialogData>(MAT_DIALOG_DATA, { optional: true }) ?? {};
  readonly isEdit = !!this.data.liability;
  readonly liabilityTypes = LIABILITY_TYPES;

   readonly form = this.fb.nonNullable.group({
    name: [this.data.liability?.name ?? "", Validators.required],
    liabilityType: [this.data.liability?.liabilityType ?? 0, Validators.required],
    amount: [this.data.liability?.amount ?? 0, [Validators.required, Validators.min(0.01)]],
    liabilityDate: [this.data.liability?.liabilityDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10), Validators.required],
    dueDate: [this.data.liability?.dueDate?.slice(0, 10) ?? ""],
    interestRate: [this.data.liability?.interestRate ?? 0, [Validators.min(0), Validators.max(100)]],
    description: [this.data.liability?.description ?? ""],
    isActive: [this.data.liability?.isActive ?? true],
  });

  close(): void { this.dialogRef.close(); }
  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    this.dialogRef.close({
      name: v.name, liabilityType: v.liabilityType, amount: v.amount,
      liabilityDate: v.liabilityDate, dueDate: v.dueDate || undefined,
      interestRate: v.interestRate, description: v.description || undefined, isActive: v.isActive,
    });
  }
}