import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-pagination',
  standalone: true,
  templateUrl: './pagination.component.html',
  styleUrl: './pagination.component.scss'
})
export class PaginationComponent implements OnChanges {
  @Input() totalItems = 0;
  @Input() pageIndex = 0;
  @Input() pageSize = 10;
  @Input() showWhenEmpty = false;
  @Input() resetOnTotalChange = true;
  @Output() pageIndexChange = new EventEmitter<number>();
  @Output() pageSizeChange = new EventEmitter<number>();

  readonly pageSizes = [10, 25, 50, 100];

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.totalItems / this.pageSize));
  }

  get firstItem(): number {
    return this.totalItems === 0 ? 0 : this.pageIndex * this.pageSize + 1;
  }

  get lastItem(): number {
    return Math.min((this.pageIndex + 1) * this.pageSize, this.totalItems);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['totalItems'] && !changes['totalItems'].firstChange && this.resetOnTotalChange && this.pageIndex !== 0) {
      this.pageIndexChange.emit(0);
      return;
    }
    if ((changes['totalItems'] || changes['pageSize']) && this.pageIndex >= this.pageCount) {
      this.pageIndexChange.emit(Math.max(0, this.pageCount - 1));
    }
  }

  setPageSize(event: Event): void {
    const size = Number((event.target as HTMLSelectElement).value);
    if (!Number.isFinite(size) || size <= 0) return;
    this.pageSizeChange.emit(size);
    this.pageIndexChange.emit(0);
  }

  previous(): void {
    if (this.pageIndex > 0) this.pageIndexChange.emit(this.pageIndex - 1);
  }

  next(): void {
    if (this.pageIndex + 1 < this.pageCount) this.pageIndexChange.emit(this.pageIndex + 1);
  }
}
