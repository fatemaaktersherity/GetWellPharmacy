import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Doctor, Customer, Product, PrescriptionItem } from '../../../core/models/api.models';
import { ApiService } from '../../../core/services/api.service';

@Component({
    selector: 'app-prescription-form',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, RouterLink, MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatSnackBarModule],
    templateUrl: './prescription-form.component.html',
    styleUrl: './prescription-form.component.scss'
})
export class PrescriptionFormComponent implements OnInit {
    private readonly fb = inject(FormBuilder);
    private readonly api = inject(ApiService);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly snackbar = inject(MatSnackBar);

    doctors: Doctor[] = [];
    customers: Customer[] = [];
    products: Product[] = [];

    id?: number;
    saving = false;
    imageFile?: File;
    imagePreview?: string | null;

    form = this.fb.group({
        doctorId: [null as number | null, Validators.required],
        customerId: [null as number | null, Validators.required],
        prescriptionDate: [new Date().toISOString().slice(0, 10), Validators.required],
        diagnosis: [''],
        notes: [''],
        items: this.fb.array([])
    });

    get items(): FormArray { return this.form.controls.items as FormArray; }

    ngOnInit(): void {
        this.api.getDoctors().subscribe(d => this.doctors = d);
        this.api.getCustomers().subscribe(c => this.customers = c);
        this.api.getProducts().subscribe(p => this.products = p);

        const id = this.route.snapshot.paramMap.get('id');
        if (id) {
            this.id = +id;
            this.api.getPrescription(this.id).subscribe(p => {
                this.form.patchValue({
                    doctorId: p.doctorId,
                    customerId: p.customerId,
                    prescriptionDate: p.prescriptionDate?.slice(0, 10),
                    diagnosis: p.diagnosis ?? '',
                    notes: p.notes ?? ''
                });
                this.imagePreview = this.api.assetUrl(p.imagePath);
                p.items.forEach(i => this.addItem(i));
            });
        } else {
            this.addItem();
        }
    }

    addItem(item: Partial<PrescriptionItem> = {}): void {
        this.items.push(this.fb.group({
            id: [item.id],
            productId: [item.productId ?? null],
            medicineName: [item.medicineName ?? '', Validators.required],
            dosage: [item.dosage ?? ''],
            duration: [item.duration ?? ''],
            instructions: [item.instructions ?? '']
        }));
    }

    removeItem(i: number): void { this.items.removeAt(i); }

    selectImage(event: Event): void {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;
        this.imageFile = file;
        const reader = new FileReader();
        reader.onload = () => (this.imagePreview = reader.result as string);
        reader.readAsDataURL(file);
    }

    save(): void {
        if (this.form.invalid) { this.form.markAllAsTouched(); return; }
        this.saving = true;
        const v = this.form.getRawValue();

        const payload = {
            doctorId: v.doctorId!,
            customerId: v.customerId!,
            prescriptionDate: v.prescriptionDate || undefined,
            diagnosis: v.diagnosis || undefined,
            notes: v.notes || undefined,
            items: (v.items as any[]).map(i => ({
                id: i.id || undefined,
                productId: i.productId || undefined,
                medicineName: i.medicineName,
                dosage: i.dosage || undefined,
                duration: i.duration || undefined,
                instructions: i.instructions || undefined
            }))
        };

        const afterSave = (prescriptionId: number) => {
            if (this.imageFile) {
                this.api.uploadPrescriptionImage(prescriptionId, this.imageFile).subscribe({
                    next: () => this.finishSave(),
                    error: () => { this.snackbar.open('Prescription saved, but image upload failed.', 'Close', { duration: 6000 }); this.finishSave(); }
                });
            } else {
                this.finishSave();
            }
        };

        const request = this.id
            ? this.api.updatePrescription(this.id, payload).pipe()
            : this.api.createPrescription(payload);

        if (this.id) {
            this.api.updatePrescription(this.id, payload).subscribe({
                next: () => afterSave(this.id!),
                error: (e: any) => { this.saving = false; this.snackbar.open(e.error?.message || 'Could not update prescription.', 'Close', { duration: 6000 }); }
            });
        } else {
            this.api.createPrescription(payload).subscribe({
                next: created => afterSave(created.prescriptionId),
                error: (e: any) => { this.saving = false; this.snackbar.open(e.error?.message || 'Could not create prescription.', 'Close', { duration: 6000 }); }
            });
        }
    }

    private finishSave(): void {
        this.saving = false;
        this.snackbar.open('Prescription saved.', 'Close', { duration: 3000 });
        this.router.navigate(['/prescriptions']);
    }
}