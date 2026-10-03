import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { Component, inject, OnInit } from '@angular/core';
import { DatePipe, SlicePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../../core/services/api.service';
import { Prescription } from '../../../core/models/api.models';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';

@Component({
    selector: 'app-prescription-list',
    standalone: true,
    imports: [DatePipe, SlicePipe, PaginationComponent, ReactiveFormsModule, RouterLink, MatCardModule, MatTableModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSnackBarModule],
    templateUrl: './prescription-list.component.html',
    styleUrl: './prescription-list.component.scss'
})
export class PrescriptionListComponent implements OnInit {
      private readonly confirmDialog = inject(ConfirmDialogService);

  private readonly api = inject(ApiService);
    private readonly route = inject(ActivatedRoute);
    private readonly snackbar = inject(MatSnackBar);

    prescriptions: Prescription[] = [];
    pageIndex = 0; pageSize = 10;
    doctorId?: number;
    readonly searchControl = new FormControl('', { nonNullable: true });
    readonly cols = ['date', 'doctor', 'customer', 'diagnosis', 'items', 'actions'];

    get filteredPrescriptions(): Prescription[] {
        const term = this.searchControl.value.trim().toLocaleLowerCase();
        if (!term) return this.prescriptions;
        return this.prescriptions.filter(p => [p.doctorName, p.customerName, p.diagnosis]
            .join(' ').toLocaleLowerCase().includes(term));
    }

    ngOnInit(): void {
        const doctorIdParam = this.route.snapshot.queryParamMap.get('doctorId');
        this.doctorId = doctorIdParam ? Number(doctorIdParam) : undefined;
        this.load();
    }

    load(): void {
        this.api.getPrescriptions({ doctorId: this.doctorId }).subscribe({
            next: list => this.prescriptions = list,
            error: () => this.snackbar.open('Could not load prescriptions.', 'Close', { duration: 5000 })
        });
    }

    async delete(id: number) {
        if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: 'Delete this prescription?', confirmText: 'Continue', danger: true })) return;
        this.api.deletePrescription(id).subscribe({
            next: () => { this.snackbar.open('Prescription deleted.', 'Close', { duration: 3000 }); this.load(); },
            error: () => this.snackbar.open('Could not delete prescription.', 'Close', { duration: 5000 })
        });
    }

    imageUrl(path?: string): string | null { return this.api.assetUrl(path); }
}
