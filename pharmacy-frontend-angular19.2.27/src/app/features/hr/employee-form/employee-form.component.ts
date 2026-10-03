import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../../core/services/api.service';
import { Department } from '../../../core/models/api.models';

@Component({
  selector: 'app-employee-form', standalone: true,
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule, MatSlideToggleModule, MatSnackBarModule],
  templateUrl: './employee-form.component.html', styleUrl: './employee-form.component.scss'
})
export class EmployeeFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackbar = inject(MatSnackBar);

  departments: Department[] = [];
  photo?: File;
  preview?: string;
  existingPhotoUrl?: string | null;
  saving = false;
  loading = false;

  // Edit mode is on whenever the route has an :id (e.g. /employees/edit/5).
  employeeId: number | null = null;
  get isEditMode(): boolean { return this.employeeId !== null; }

  readonly form = this.fb.group({
    fullName: ['', Validators.required],
    email: ['', Validators.email],
    departmentId: [null as number | null, Validators.required],
    salary: [0, [Validators.required, Validators.min(0)]],
    hireDate: [new Date().toISOString().slice(0, 10), Validators.required],
    isActive: [true]
  });

  ngOnInit(): void {
    this.api.getDepartments().subscribe({
      next: departments => this.departments = departments,
      error: () => this.snackbar.open('Could not load departments.', 'Close', { duration: 5000 })
    });

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.employeeId = Number(idParam);
      this.loadEmployee(this.employeeId);
    }
  }

  private loadEmployee(id: number): void {
    this.loading = true;
    this.api.getEmployee(id).subscribe({
      next: employee => {
        this.form.patchValue({
          fullName: employee.fullName,
          email: employee.email ?? '',
          departmentId: employee.departmentId,
          salary: employee.salary ?? 0,
          hireDate: employee.hireDate ? employee.hireDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
          isActive: employee.isActive
        });
        this.existingPhotoUrl = this.api.assetUrl(employee.photoPath);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.snackbar.open('Could not load this employee.', 'Close', { duration: 5000 });
        this.router.navigate(['/employees']);
      }
    });
  }

  selectPhoto(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.photo = file;
    const reader = new FileReader();
    reader.onload = () => this.preview = String(reader.result);
    reader.readAsDataURL(file);
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving = true;

    const payload = this.form.getRawValue() as any;

    if (this.isEditMode) {
      this.api.updateEmployee(this.employeeId!, payload).subscribe({
        next: () => {
          if (!this.photo) { this.finish('Employee updated'); return; }
          this.api.uploadEmployeePhoto(this.employeeId!, this.photo).subscribe({
            next: () => this.finish('Employee updated'),
            error: () => { this.saving = false; this.snackbar.open('Employee updated, but photo upload failed.', 'Close', { duration: 5000 }); }
          });
        },
        error: error => { this.saving = false; this.snackbar.open(error?.error?.message || 'Could not update employee.', 'Close', { duration: 5000 }); }
      });
      return;
    }

    this.api.createEmployee(payload).subscribe({
      next: employee => {
        if (!this.photo) { this.finish('Employee created'); return; }
        this.api.uploadEmployeePhoto(employee.id, this.photo).subscribe({
          next: () => this.finish('Employee created'),
          error: () => { this.saving = false; this.snackbar.open('Employee created, but photo upload failed.', 'Close', { duration: 5000 }); }
        });
      },
      error: error => { this.saving = false; this.snackbar.open(error?.error?.message || 'Could not create employee.', 'Close', { duration: 5000 }); }
    });
  }

  private finish(message: string): void {
    this.snackbar.open(message, 'Close', { duration: 3000 });
    this.router.navigate(['/employees']);
  }
}