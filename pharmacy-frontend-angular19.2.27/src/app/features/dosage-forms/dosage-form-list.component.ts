import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { Component, OnInit, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { ApiService } from '../../core/services/api.service';
import { DosageForm } from '../../core/models/api.models';
import { PaginationComponent } from '../../shared/pagination/pagination.component';

// "Dosage Forms" management page — the lookup behind Product.DosageFormId
// and the Brand Search "Dosage form" filter. Add/edit/delete here (same
// as the Companies page), on top of the quick inline "+" add already on
// the Product form.
@Component({
  selector: 'app-dosage-form-list',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSnackBarModule, MatTableModule, PaginationComponent],
  templateUrl: './dosage-form-list.component.html',
  styleUrl: './dosage-form-list.component.scss'
})
export class DosageFormListComponent implements OnInit {
    private readonly confirmDialog = inject(ConfirmDialogService);

  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly snackbar = inject(MatSnackBar);

  dosageForms: DosageForm[] = [];
  editingForm?: DosageForm;
  loading = true;
  saving = false;
  pageIndex = 0;
  pageSize = 10;

  get pagedDosageForms(): DosageForm[] {
    const start = this.pageIndex * this.pageSize;
    return this.dosageForms.slice(start, start + this.pageSize);
  }

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]]
  });

  readonly columns = ['name', 'products', 'actions'];

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.api.getDosageForms().subscribe({
      next: rows => { this.dosageForms = rows; this.loading = false; },
      error: err => { this.loading = false; this.showError(err); }
    });
  }

  save(): void {
    if (this.form.invalid || this.saving) return;
    this.saving = true;
    const name = this.form.getRawValue().name;
    const request: Observable<unknown> = this.editingForm
      ? this.api.updateDosageForm(this.editingForm.id, name)
      : this.api.createDosageForm(name);

    request.subscribe({
      next: () => {
        this.snackbar.open(this.editingForm ? 'Dosage form updated.' : 'Dosage form added.', 'Close', { duration: 3000 });
        this.cancelEdit();
        this.load();
      },
      error: (err: unknown) => { this.saving = false; this.showError(err); }
    });
  }

  edit(dosageForm: DosageForm): void {
    this.editingForm = dosageForm;
    this.form.setValue({ name: dosageForm.name });
  }

  cancelEdit(): void {
    this.editingForm = undefined;
    this.saving = false;
    this.form.reset({ name: '' });
  }

  async delete(dosageForm: DosageForm) {
    if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: `Delete dosage form "${dosageForm.name}"?`, confirmText: 'Continue', danger: true })) return;
    this.api.deleteDosageForm(dosageForm.id).subscribe({
      next: () => {
        if (this.editingForm?.id === dosageForm.id) this.cancelEdit();
        this.snackbar.open('Dosage form deleted.', 'Close', { duration: 3000 });
        this.load();
      },
      error: err => this.showError(err)
    });
  }

  private showError(err: unknown): void {
    const message = (err as { error?: { message?: string } })?.error?.message || 'Unable to save the dosage form.';
    this.snackbar.open(message, 'Close', { duration: 5000 });
  }
}
