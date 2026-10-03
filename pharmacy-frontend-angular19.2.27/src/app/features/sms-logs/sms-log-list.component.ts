import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { Component, inject, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { debounceTime } from 'rxjs/operators';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { SmsLog } from '../../core/models/api.models';

@Component({
  selector: 'app-sms-log-list',
  standalone: true,
  imports: [
    DatePipe, ReactiveFormsModule, MatCardModule, MatButtonModule, MatIconModule,
    MatTableModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatTooltipModule, MatSnackBarModule,
  ],
  templateUrl: './sms-log-list.component.html',
  styleUrl: './sms-log-list.component.scss',
})
export class SmsLogListComponent implements OnInit {
    private readonly confirmDialog = inject(ConfirmDialogService);

  private readonly api = inject(ApiService);
  private readonly snack = inject(MatSnackBar);
  readonly auth = inject(AuthService);

  logs: SmsLog[] = [];
  loading = false;
  readonly cols = ['sentAt', 'phoneNumber', 'message', 'status', 'response', 'actions'];

  readonly filterForm = new FormGroup({
    phoneNumber: new FormControl<string>('', { nonNullable: true }),
    // null = "any"; true/false are both meaningful selections.
    isSuccess: new FormControl<boolean | null>(null),
    fromDate: new FormControl<string>('', { nonNullable: true }),
    toDate: new FormControl<string>('', { nonNullable: true }),
  });

  /** Retention window for the purge action, in days. */
  readonly purgeDaysControl = new FormControl<number>(90, { nonNullable: true });

  get successCount(): number { return this.logs.filter(l => l.isSuccess).length; }
  get failureCount(): number { return this.logs.length - this.successCount; }

  ngOnInit(): void {
    this.load();
    this.filterForm.valueChanges.pipe(debounceTime(300)).subscribe(() => this.load());
  }

  load(): void {
    const f = this.filterForm.getRawValue();
    this.loading = true;
    this.api.getSmsLogs({
      phoneNumber: f.phoneNumber || undefined,
      isSuccess: f.isSuccess ?? undefined,
      // <input type="date"> gives yyyy-MM-dd; the backend binds it to DateTime.
      fromDate: f.fromDate || undefined,
      toDate: f.toDate || undefined,
      take: 500,
    }).subscribe({
      next: rows => { this.logs = rows; this.loading = false; },
      error: () => { this.loading = false; },   // message shown by errorInterceptor
    });
  }

  clearFilters(): void {
    this.filterForm.reset({ phoneNumber: '', isSuccess: null, fromDate: '', toDate: '' });
  }

  async deleteLog(log: SmsLog) {
    if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: `Delete the log entry for ${log.phoneNumber}?`, confirmText: 'Continue', danger: true })) return;
    this.api.deleteSmsLog(log.id).subscribe({
      next: () => {
        this.snack.open('Log entry deleted.', 'Close', { duration: 3000 });
        this.load();
      },
    });
  }

  async purge() {
    const days = Number(this.purgeDaysControl.value);
    if (!days || days < 1) {
      this.snack.open('Enter a retention period of at least 1 day.', 'Close', { duration: 4000 });
      return;
    }
    if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: `Permanently delete every SMS log older than ${days} days? This cannot be undone.`, confirmText: 'Continue', danger: true })) return;

    this.api.purgeSmsLogs(days).subscribe({
      next: result => {
        this.snack.open(
          `${result.deleted} log ${result.deleted === 1 ? 'entry' : 'entries'} removed.`,
          'Close',
          { duration: 5000 },
        );
        this.load();
      },
    });
  }
}