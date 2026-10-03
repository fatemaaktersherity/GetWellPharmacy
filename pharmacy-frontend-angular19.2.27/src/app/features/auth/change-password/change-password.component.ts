import { Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';

function passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
    const newPassword = control.get('newPassword')?.value;
    const confirmNewPassword = control.get('confirmNewPassword')?.value;
    return newPassword === confirmNewPassword ? null : { passwordsMismatch: true };
}

@Component({
    selector: 'app-change-password',
    standalone: true,
    imports: [
        ReactiveFormsModule, MatCardModule, MatFormFieldModule, MatInputModule,
        MatButtonModule, MatIconModule
    ],
    templateUrl: './change-password.component.html',
    styleUrl: './change-password.component.scss'
})
export class ChangePasswordComponent {
    private readonly fb = inject(FormBuilder);
    private readonly auth = inject(AuthService);

    loading = false;
    errorMessage = '';
    successMessage = '';
    showCurrent = false;
    showNew = false;
    showConfirm = false;

    readonly form = this.fb.nonNullable.group({
        currentPassword: ['', Validators.required],
        newPassword: ['', [Validators.required, Validators.minLength(6)]],
        confirmNewPassword: ['', Validators.required]
    }, { validators: passwordsMatchValidator });

    onSubmit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        this.loading = true;
        this.errorMessage = '';
        this.successMessage = '';
        this.auth.changePassword(this.form.getRawValue()).subscribe({
            next: (res) => {
                this.successMessage = res.message || 'Password changed successfully.';
                this.loading = false;
                this.form.reset();
            },
            error: (err) => {
                this.errorMessage = err?.error?.message ?? 'Unable to change password.';
                this.loading = false;
            }
        });
    }

    toggleCurrent(): void { this.showCurrent = !this.showCurrent; }
    toggleNew(): void { this.showNew = !this.showNew; }
    toggleConfirm(): void { this.showConfirm = !this.showConfirm; }
}