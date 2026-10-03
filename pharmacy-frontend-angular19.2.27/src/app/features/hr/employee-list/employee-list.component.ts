import { Component, inject, OnInit } from '@angular/core';
import { DatePipe, SlicePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { Employee, Department } from '../../../core/models/api.models';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';

@Component({
  selector: 'app-employee-list',
  standalone: true,
  imports: [DatePipe, SlicePipe, PaginationComponent, ReactiveFormsModule, RouterLink, MatCardModule, MatTableModule, MatFormFieldModule, MatSelectModule, MatInputModule, MatIconModule, MatButtonModule, MatSnackBarModule],
  templateUrl: './employee-list.component.html',
  styleUrl: './employee-list.component.scss'
})
export class EmployeeListComponent implements OnInit {
  private readonly api: ApiService = inject(ApiService);
  private readonly snackbar: MatSnackBar = inject(MatSnackBar);
  private readonly confirmDialog: ConfirmDialogService = inject(ConfirmDialogService);
  employees: Employee[] = [];
  pageIndex = 0; pageSize = 10;
  departments: Department[] = [];
  selectedDepartmentId: number | null = null;
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly displayedColumns: string[] = ['photo', 'name', 'department', 'email', 'joinDate', 'actions'];
  isLoading = true;

  get filteredEmployees(): Employee[] {
    const term = this.searchControl.value.trim().toLocaleLowerCase();
    if (!term) return this.employees;
    return this.employees.filter(employee => [employee.fullName, employee.departmentName || '', employee.email || '', employee.hireDate || '', employee.isActive ? 'active' : 'inactive']
      .join(' ').toLocaleLowerCase().includes(term));
  }

  ngOnInit(): void {
    this.api.getDepartments().subscribe(d => this.departments = d);
    this.loadEmployees();
  }

  loadEmployees(): void {
    this.isLoading = true;
    this.api.getEmployees(this.selectedDepartmentId ?? undefined).subscribe(e => {
      this.employees = e;
      this.isLoading = false;
    });
  }

  onDepartmentChange(): void {
    this.loadEmployees();
  }

  delete(id: number): void {
    this.confirmDialog.confirmDelete('employee').subscribe((confirmed: boolean) => {
      if (!confirmed) return;
      this.api.deleteEmployee(id).subscribe({
        next: () => {
          this.snackbar.open('Employee deleted', 'Close', { duration: 3000 });
          this.loadEmployees();
        },
        error: (e: any) => this.snackbar.open(e.error?.message || 'Could not delete employee.', 'Close', { duration: 5000 })
      });
    });
  }

  uploadPhoto(id: number, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.api.uploadEmployeePhoto(id, file).subscribe({
      next: () => { this.snackbar.open('Employee photo uploaded', 'Close', { duration: 3000 }); this.loadEmployees(); },
      error: () => this.snackbar.open('Could not upload employee photo.', 'Close', { duration: 5000 })
    });
  }

  photoUrl(path?: string): string | null {
    return this.api.assetUrl(path);
  }
}
