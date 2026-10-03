import { Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ExpiredProductStockRead } from '../../../core/models/api.models';

@Component({
  selector: 'app-disposal-rejection-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>Reject Disposal Request</h2>
    <mat-dialog-content>
      <p>Reject the disposal request for {{ data.productName }} (batch {{ data.batchNumber }})?</p>
      <mat-form-field appearance="outline" class="reason-field">
        <mat-label>Reason (optional)</mat-label>
        <textarea matInput [formControl]="reason" rows="3"></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="dialogRef.close()">Cancel</button>
      <button mat-flat-button color="warn" type="button" (click)="dialogRef.close(reason.value.trim())">Reject</button>
    </mat-dialog-actions>
  `,
  styles: [`.reason-field { width: 100%; } mat-dialog-content p { margin-top: 0; }`],
})
export class DisposalRejectionDialogComponent {
  readonly data = inject<ExpiredProductStockRead>(MAT_DIALOG_DATA);
  readonly dialogRef = inject(MatDialogRef<DisposalRejectionDialogComponent, string | undefined>);
  readonly reason = new FormControl('', { nonNullable: true });
}
