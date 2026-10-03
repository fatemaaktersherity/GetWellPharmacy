import { Component, inject, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../../core/services/api.service';
import { Employee, EmployeeDocument } from '../../../core/models/api.models';

@Component({
  selector: 'app-employee-details',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, RouterLink, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatListModule, MatSnackBarModule],
  templateUrl: './employee-details.component.html',
  styleUrl: './employee-details.component.scss'
})
export class EmployeeDetailsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);

  employee: Employee | null = null;
  documents: EmployeeDocument[] = [];
  loading = true;
  savingDocument = false;
  showAddDocumentForm = false;

  readonly documentForm = this.fb.group({
    documentTitle: ['', Validators.required],
    documentNumber: [''],
    issueDate: [new Date().toISOString().slice(0, 10), Validators.required],
    expiryDate: [''],
    isVerified: [false]
  });

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      this.router.navigate(['/employees']);
      return;
    }
    this.load(id);
  }

  private load(id: number): void {
    this.loading = true;
    this.api.getEmployee(id).subscribe({
      next: employee => {
        this.employee = employee;
        this.api.getEmployeeDocuments(id).subscribe({
          next: documents => { this.documents = documents; this.loading = false; },
          error: () => { this.loading = false; this.snackbar.open('Could not load employee documents.', 'Close', { duration: 5000 }); }
        });
      },
      error: () => {
        this.loading = false;
        this.snackbar.open('Could not load this employee.', 'Close', { duration: 5000 });
        this.router.navigate(['/employees']);
      }
    });
  }

  photoUrl(path?: string): string | null {
    return this.api.assetUrl(path);
  }

  addDocument(): void {
    if (!this.employee || this.documentForm.invalid) {
      this.documentForm.markAllAsTouched();
      return;
    }
    const raw = this.documentForm.getRawValue();
    this.savingDocument = true;
    this.api.addEmployeeDocument(this.employee.id, {
      documentTitle: raw.documentTitle!,
      documentNumber: raw.documentNumber || undefined,
      issueDate: raw.issueDate!,
      expiryDate: raw.expiryDate || undefined,
      isVerified: raw.isVerified ?? false
    }).subscribe({
      next: () => {
        this.savingDocument = false;
        this.showAddDocumentForm = false;
        this.documentForm.reset({ issueDate: new Date().toISOString().slice(0, 10), isVerified: false });
        this.snackbar.open('Document added', 'Close', { duration: 3000 });
        this.load(this.employee!.id);
      },
      error: (error: any) => {
        this.savingDocument = false;
        this.snackbar.open(error.error?.message || 'Could not add document.', 'Close', { duration: 5000 });
      }
    });
  }
}
