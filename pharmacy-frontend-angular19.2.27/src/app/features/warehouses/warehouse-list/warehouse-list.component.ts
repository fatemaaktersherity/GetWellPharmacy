import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, SlicePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../../core/services/api.service';
import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { WarehouseFull } from '../../../core/models/api.models';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';

@Component({
    selector: 'app-warehouse-list',
    standalone: true,
    imports: [CommonModule, SlicePipe, PaginationComponent, ReactiveFormsModule, RouterLink, MatCardModule, MatButtonModule, MatIconModule, MatTableModule, MatFormFieldModule, MatInputModule, MatSnackBarModule],
    templateUrl: './warehouse-list.component.html',
    styleUrl: './warehouse-list.component.scss'
})
export class WarehouseListComponent implements OnInit {
    private readonly api: ApiService = inject(ApiService);
    private readonly snackbar: MatSnackBar = inject(MatSnackBar);
    private readonly confirmDialog: ConfirmDialogService = inject(ConfirmDialogService);
    warehouses: WarehouseFull[] = [];
    photoUrls: Record<number, string> = {};
    pageIndex = 0; pageSize = 10;
    cols = ['photo', 'name', 'type', 'address', 'capacity', 'status', 'actions'];
    readonly searchControl = new FormControl('', { nonNullable: true });

    get filteredWarehouses(): WarehouseFull[] {
        const term = this.searchControl.value.trim().toLocaleLowerCase();
        if (!term) return this.warehouses;
        return this.warehouses.filter(w => [w.name, w.warehouseTypeName, w.address || '', w.isActive ? 'active' : 'inactive']
            .join(' ').toLocaleLowerCase().includes(term));
    }

    ngOnInit(): void { this.load(); }

    load(): void {
        this.api.getWarehousesFull().subscribe({
            next: (d) => {
                Object.values(this.photoUrls).forEach(url => URL.revokeObjectURL(url));
                this.photoUrls = {};
                this.warehouses = d;
                // Fetch the photo endpoint for every warehouse. Some existing
                // records predate HasPhoto being populated consistently, so
                // that flag cannot be the only source of truth for display.
                d.forEach(w => this.api.getWarehousePhoto(w.id).subscribe({
                    next: blob => {
                        if (blob.size > 0) this.photoUrls[w.id] = URL.createObjectURL(blob);
                    }
                }));
            },
            error: () => this.snackbar.open('Failed to load warehouses', 'Close', { duration: 5000 })
        });
    }

    delete(id: number): void {
        this.confirmDialog.confirm({
            title: 'Delete warehouse',
            message: 'Delete this warehouse? This only works if it has no stock, racks, purchases or transfers.',
            confirmText: 'Delete',
            danger: true
        }).subscribe((confirmed: boolean) => {
            if (!confirmed) return;
            this.api.deleteWarehouse(id).subscribe({
                next: () => { this.snackbar.open('Deleted', 'Close', { duration: 3000 }); this.load(); },
                error: (e: any) => this.snackbar.open(e.error?.message || 'Failed to delete', 'Close', { duration: 5000 })
            });
        });
    }

    photoUrl(w: WarehouseFull): string | null { return this.photoUrls[w.id] ?? null; }
}
