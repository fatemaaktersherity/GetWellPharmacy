import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../../core/services/api.service';
import { WarehouseType } from '../../../core/models/api.models';

@Component({
    selector: 'app-warehouse-form',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, RouterLink, MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, MatButtonModule, MatSnackBarModule],
    templateUrl: './warehouse-form.component.html',
    styleUrl: './warehouse-form.component.scss'
})
export class WarehouseFormComponent implements OnInit {
    private readonly fb = inject(FormBuilder);
    private readonly api = inject(ApiService);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly snackbar = inject(MatSnackBar);

    form = this.fb.group({
        name: ['', [Validators.required, Validators.minLength(2)]],
        address: [''],
        capacity: [0, [Validators.required, Validators.min(0)]],
        establishedDate: [null as string | null],
        warehouseTypeId: [null as number | null, Validators.required],
        isActive: [true],
    });

    isEditMode = false;
    warehouseId?: number;
    loading = false;
    warehouseTypes: WarehouseType[] = [];

    ngOnInit(): void {
        this.api.getWarehouseTypes().subscribe(t => this.warehouseTypes = t);
        const id = this.route.snapshot.paramMap.get('id');
        if (id) {
            this.isEditMode = true;
            this.warehouseId = +id;
            this.api.getWarehouseById(this.warehouseId).subscribe(w => this.form.patchValue(w));
        }
    }

    onSubmit(): void {
        if (this.form.invalid) return;
        this.loading = true;
        const payload = this.form.getRawValue();
        const request: any = this.isEditMode && this.warehouseId
            ? this.api.updateWarehouse(this.warehouseId, payload as any)
            : this.api.createWarehouse(payload as any);

        request.subscribe({
            next: () => this.finish(),
            error: (e: any) => { this.loading = false; this.snackbar.open(e.error?.message || 'Failed to save', 'Close', { duration: 5000 }); }
        });
    }

    private finish(): void {
        this.snackbar.open(this.isEditMode ? 'Updated' : 'Created', 'Close', { duration: 3000 });
        this.router.navigate(['/warehouses']);
    }
}
