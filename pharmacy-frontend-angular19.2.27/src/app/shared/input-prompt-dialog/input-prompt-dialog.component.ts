import { Component, inject } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

export interface InputPromptField {
  key: string;
  label: string;
  type?: 'text' | 'date' | 'number';
  value?: string;
  required?: boolean;
  options?: string[];
}

export interface InputPromptData {
  title: string;
  fields: InputPromptField[];
}

@Component({
  selector: 'app-input-prompt-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()">
      <mat-dialog-content>
        @for (field of data.fields; track field.key) {
          <mat-form-field appearance="outline" class="field">
            <mat-label>{{ field.label }}</mat-label>
            @if (field.options) {
              <mat-select [formControlName]="field.key">
                @for (option of field.options; track option) {
                  <mat-option [value]="option">{{ option }}</mat-option>
                }
              </mat-select>
            } @else {
              <input matInput [type]="field.type || 'text'" [formControlName]="field.key" />
            }
            @if (field.required && form.controls[field.key].hasError('required')) {
              <mat-error>{{ field.label }} is required.</mat-error>
            }
          </mat-form-field>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" (click)="dialogRef.close()">Cancel</button>
        <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid">Save</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: [`.field { display: block; width: 100%; } mat-dialog-content { min-width: min(320px, calc(100vw - 80px)); }`],
})
export class InputPromptDialogComponent {
  readonly data = inject<InputPromptData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject(MatDialogRef<InputPromptDialogComponent, Record<string, string> | undefined>);
  private readonly fb = inject(FormBuilder);
  readonly form: FormGroup;

  constructor() {
    const controls: Record<string, FormControl<string>> = {};
    for (const field of this.data.fields) {
      controls[field.key] = new FormControl(field.value ?? '', {
        nonNullable: true,
        validators: field.required ? [Validators.required] : [],
      });
    }
    this.form = this.fb.group(controls);
  }

  submit(): void {
    if (this.form.invalid) return;
    this.dialogRef.close(this.form.getRawValue() as Record<string, string>);
  }
}
