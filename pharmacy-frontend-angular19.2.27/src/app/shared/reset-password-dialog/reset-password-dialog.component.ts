import { Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ResetPasswordDialogData {
    userFullName: string;
}

function passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
    const newPassword = control.get('newPassword')?.value;
    const confirmNewPassword = control.get('confirmNewPassword')?.value;
    return newPassword === confirmNewPassword ? null : { passwordsMismatch: true };
}

@Component({
    selector: 'app-reset-password-dialog',
    standalone: true,
    imports: [
        ReactiveFormsModule, MatDialogModule, MatFormFieldModule,
        MatInputModule, MatButtonModule, MatIconModule
    ],
    template: `
    <h2 mat-dialog-title>Reset Password</h2>
    <mat-dialog-content>
      <p>Set a new password for <strong>{{ data.userFullName }}</strong>.</p>
      <form [formGroup]="form">
        <mat-form-field appearance="outline">
          <mat-label>New Password</mat-label>
          <input matInput type="password" formControlName="newPassword">
          @if (form.get('newPassword')?.hasError('minlength')) {
            <mat-hint>At least 6 characters.</mat-hint>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Confirm New Password</mat-label>
          <input matInput type="password" formControlName="confirmNewPassword">
        </mat-form-field>

        @if (form.hasError('passwordsMismatch') && form.get('confirmNewPassword')?.touched) {
          <p class="error">Passwords do not match.</p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="dialogRef.close(null)">Cancel</button>
      <button mat-raised-button color="primary" [disabled]="form.invalid" (click)="submit()">
        Reset Password
      </button>
    </mat-dialog-actions>
  `,
    styles: [`
    mat-form-field { width: 100%; }
    .error { color: #d32f2f; font-size: 0.9rem; margin: 0 0 8px; }
  `]
})
export class ResetPasswordDialogComponent {
    readonly dialogRef = inject(MatDialogRef<ResetPasswordDialogComponent, string | null>);
    readonly data = inject<ResetPasswordDialogData>(MAT_DIALOG_DATA);
    private readonly fb = inject(FormBuilder);

    readonly form = this.fb.nonNullable.group({
        newPassword: ['', [Validators.required, Validators.minLength(6)]],
        confirmNewPassword: ['', Validators.required]
    }, { validators: passwordsMatchValidator });

    submit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }
        this.dialogRef.close(this.form.getRawValue().newPassword);
    }
}