import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { Component, inject, OnInit } from "@angular/core";
import { SlicePipe } from "@angular/common";
import { Observable } from "rxjs";
import {
  ReactiveFormsModule,
  FormBuilder,
  FormControl,
  Validators,
} from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatTableModule } from "@angular/material/table";
import { ApiService } from "../../core/services/api.service";
import { Unit } from "../../core/models/api.models";
import { PaginationComponent } from "../../shared/pagination/pagination.component";

@Component({
  selector: "app-unit-list",
  standalone: true,
  imports: [
    SlicePipe, PaginationComponent,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSnackBarModule,
    MatTableModule,
  ],
  templateUrl: "./unit-list.component.html",
  styleUrl: "./unit-list.component.scss",
})
export class UnitListComponent implements OnInit {
    private readonly confirmDialog = inject(ConfirmDialogService);

  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly snackbar = inject(MatSnackBar);

  units: Unit[] = [];
  pageIndex = 0; pageSize = 10;
  editingUnit?: Unit;
  saving = false;
  readonly form = this.fb.nonNullable.group({
    name: ["", [Validators.required, Validators.maxLength(50)]],
  });
  readonly searchControl = new FormControl("", { nonNullable: true });

  get filteredUnits(): Unit[] {
    const term = this.searchControl.value.trim().toLocaleLowerCase();
    if (!term) return this.units;
    return this.units.filter((u) =>
      u.unitName.toLocaleLowerCase().includes(term),
    );
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.getUnits().subscribe({
      next: (units) => (this.units = units),
      error: (err) => this.showError(err),
    });
  }

  save(): void {
    if (this.form.invalid || this.saving) return;
    this.saving = true;
    const request: Observable<unknown> = this.editingUnit
      ? this.api.updateUnit(this.editingUnit.unitId, this.form.getRawValue())
      : this.api.createUnit(this.form.getRawValue());

    request.subscribe({
      next: () => {
        this.snackbar.open(
          this.editingUnit ? "Unit updated." : "Unit created.",
          "Close",
          { duration: 3000 },
        );
        this.cancelEdit();
        this.load();
      },
      error: (err: unknown) => {
        this.saving = false;
        this.showError(err);
      },
    });
  }

  edit(unit: Unit): void {
    this.editingUnit = unit;
    this.form.setValue({ name: unit.unitName });
  }

  cancelEdit(): void {
    this.editingUnit = undefined;
    this.saving = false;
    this.form.reset({ name: "" });
  }

  async delete(unit: Unit) {
    if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: `Delete unit "${unit.unitName}"?`, confirmText: 'Continue', danger: true })) return;
    this.api.deleteUnit(unit.unitId).subscribe({
      next: () => {
        if (this.editingUnit?.unitId === unit.unitId) this.cancelEdit();
        this.snackbar.open("Unit deleted.", "Close", { duration: 3000 });
        this.load();
      },
      error: (err) => this.showError(err),
    });
  }

  private showError(err: unknown): void {
    const message =
      (err as { error?: { message?: string } })?.error?.message ||
      "Unable to save the unit.";
    this.snackbar.open(message, "Close", { duration: 5000 });
  }
}
