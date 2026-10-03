import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../../core/services/api.service';
import { ActivityLog } from '../../../core/models/api.models';

@Component({
  selector: 'app-activity-log', standalone: true,
  imports: [DatePipe, MatCardModule, MatIconModule, MatTableModule, MatSnackBarModule],
  templateUrl: './activity-log.component.html', styleUrl: './activity-log.component.scss',
})
export class ActivityLogComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snack = inject(MatSnackBar);
  logs: ActivityLog[] = [];
  loading = true;
  readonly columns = ['occurredAtUtc', 'user', 'roleName', 'ipAddress', 'userAgent'];

  /** SQL Server DateTime values may arrive without a Z suffix; treat those as UTC. */
  asLocalDate(utcValue: string): Date {
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(utcValue);
    return new Date(hasTimezone ? utcValue : `${utcValue}Z`);
  }

  ngOnInit(): void {
    // Records this already-active session once by its JWT session id, then
    // loads the history. This backfills sessions created before tracking existed.
    this.api.recordCurrentActivitySession().subscribe({
      next: () => this.load(),
      error: () => this.load(),
    });
  }

  private load(): void {
    this.api.getActivityLogs(500).subscribe({
      next: rows => { this.logs = rows; this.loading = false; },
      error: () => { this.loading = false; this.snack.open('Unable to load activity history.', 'Close', { duration: 4000 }); },
    });
  }
}
