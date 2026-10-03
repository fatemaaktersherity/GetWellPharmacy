import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { Component, inject, OnInit } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { Observable } from 'rxjs';
import { ReactiveFormsModule, FormBuilder, FormControl, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { Doctor } from '../../core/models/api.models';
import { PaginationComponent } from '../../shared/pagination/pagination.component';

@Component({
    selector: 'app-doctor-list',
    standalone: true,
    imports: [SlicePipe, PaginationComponent, ReactiveFormsModule, RouterLink, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatCheckboxModule, MatSnackBarModule, MatTableModule],
    templateUrl: './doctor-list.component.html',
    styleUrl: './doctor-list.component.scss'
})
export class DoctorListComponent implements OnInit {
      private readonly confirmDialog = inject(ConfirmDialogService);

  private readonly api = inject(ApiService);
    private readonly fb = inject(FormBuilder);
    private readonly snackbar = inject(MatSnackBar);

    doctors: Doctor[] = [];
    pageIndex = 0; pageSize = 10;
    editingDoctor?: Doctor;
    saving = false;

    readonly form = this.fb.nonNullable.group({
        name: ['', [Validators.required, Validators.maxLength(150)]],
        specialization: [''],
        registrationNo: [''],
        hospital: [''],
        phone: [''],
        email: [''],
        address: [''],
        isActive: [true]
    });

    readonly columns = ['name', 'specialization', 'hospital', 'phone', 'prescriptions', 'status', 'actions'];
    readonly searchControl = new FormControl('', { nonNullable: true });

    get filteredDoctors(): Doctor[] {
        const term = this.searchControl.value.trim().toLocaleLowerCase();
        if (!term) return this.doctors;
        return this.doctors.filter(d => [d.name, d.specialization, d.hospital, d.phone, d.isActive ? 'active' : 'inactive']
            .join(' ').toLocaleLowerCase().includes(term));
    }

    ngOnInit(): void { this.load(); }

    load(): void {
        this.api.getDoctors().subscribe({
            next: doctors => this.doctors = doctors,
            error: () => this.snackbar.open('Could not load doctors.', 'Close', { duration: 5000 })
        });
    }

    save(): void {
        if (this.form.invalid || this.saving) return;
        this.saving = true;
        const value = this.form.getRawValue();
        const request: Observable<unknown> = this.editingDoctor
            ? this.api.updateDoctor(this.editingDoctor.doctorId, value)
            : this.api.createDoctor(value);

        request.subscribe({
            next: () => {
                this.snackbar.open(this.editingDoctor ? 'Doctor updated.' : 'Doctor added.', 'Close', { duration: 3000 });
                this.cancelEdit();
                this.load();
            },
            error: (err: any) => { this.saving = false; this.snackbar.open(err.error?.message || 'Could not save doctor.', 'Close', { duration: 6000 }); }
        });
    }

    edit(doctor: Doctor): void {
        this.editingDoctor = doctor;
        this.form.setValue({
            name: doctor.name,
            specialization: doctor.specialization ?? '',
            registrationNo: doctor.registrationNo ?? '',
            hospital: doctor.hospital ?? '',
            phone: doctor.phone ?? '',
            email: doctor.email ?? '',
            address: doctor.address ?? '',
            isActive: doctor.isActive
        });
    }

    cancelEdit(): void {
        this.editingDoctor = undefined;
        this.saving = false;
        this.form.reset({ name: '', specialization: '', registrationNo: '', hospital: '', phone: '', email: '', address: '', isActive: true });
    }

    async delete(doctor: Doctor) {
        if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: `Delete Dr. ${doctor.name}?`, confirmText: 'Continue', danger: true })) return;
        this.api.deleteDoctor(doctor.doctorId).subscribe({
            next: () => { this.snackbar.open('Doctor deleted.', 'Close', { duration: 3000 }); this.load(); },
            error: (err: any) => this.snackbar.open(err.error?.message || 'Could not delete doctor.', 'Close', { duration: 6000 })
        });
    }
}
