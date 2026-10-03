import { Component, inject } from "@angular/core";
import { DecimalPipe } from "@angular/common";
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { ChartOfAccount, JournalEntryCreate } from "../../../core/models/api.models";

export interface JournalEntryDialogData { chartOfAccounts: ChartOfAccount[]; }

@Component({
  selector: "app-journal-entry-dialog",
  standalone: true,
  imports: [DecimalPipe, ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: "./journal-entry-dialog.component.html",
  styleUrl: "./journal-entry-dialog.component.scss",
})
export class JournalEntryDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<JournalEntryDialogComponent, JournalEntryCreate>);
  readonly data = inject<JournalEntryDialogData>(MAT_DIALOG_DATA);
  readonly accounts = this.data.chartOfAccounts;

  readonly form = this.fb.nonNullable.group({
    voucherNo: [""],
    transactionDate: [new Date().toISOString().slice(0, 10)],
    description: [""],
    lines: this.fb.array([this.newLine(), this.newLine()]),
  });

  private newLine() {
    return this.fb.nonNullable.group({
      chartOfAccountId: [null as number | null, Validators.required],
      debitAmount: [0, [Validators.min(0)]],
      creditAmount: [0, [Validators.min(0)]],
      description: [""],
    });
  }

  get lines(): FormArray { return this.form.controls.lines; }
  addLine(): void { this.lines.push(this.newLine()); }
  removeLine(i: number): void { if (this.lines.length > 2) this.lines.removeAt(i); }
  get totalDebit(): number { return this.lines.controls.reduce((sum, c: any) => sum + (+c.value.debitAmount || 0), 0); }
  get totalCredit(): number { return this.lines.controls.reduce((sum, c: any) => sum + (+c.value.creditAmount || 0), 0); }
  get isBalanced(): boolean { return this.totalDebit > 0 && Math.abs(this.totalDebit - this.totalCredit) < 0.005; }

  close(): void { this.dialogRef.close(); }
  save(): void {
    if (this.form.invalid || !this.isBalanced) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    this.dialogRef.close({
      voucherNo: v.voucherNo || undefined,
      transactionDate: v.transactionDate || undefined,
      description: v.description || undefined,
      lines: v.lines.map((l) => ({
        chartOfAccountId: l.chartOfAccountId,
        debitAmount: +l.debitAmount || 0,
        creditAmount: +l.creditAmount || 0,
        description: l.description || undefined,
      })),
    });
  }
}