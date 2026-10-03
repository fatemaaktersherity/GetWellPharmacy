import { HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { map } from 'rxjs/operators';

const naiveDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

function markNaiveDateTimesAsUtc(value: unknown): unknown {
  if (typeof value === 'string') {
    return naiveDateTime.test(value) ? `${value}Z` : value;
  }
  if (Array.isArray(value)) return value.map(markNaiveDateTimesAsUtc);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, markNaiveDateTimesAsUtc(item)]),
    );
  }
  return value;
}

/** SQL Server DateTime columns lose DateTimeKind; API timestamps without an
 * explicit offset are UTC instants. Add the UTC marker before date formatting. */
export const utcDateTimeInterceptor: HttpInterceptorFn = (
  _req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => next(_req).pipe(
  map((event: HttpEvent<unknown>) => event instanceof HttpResponse
    ? event.clone({ body: markNaiveDateTimesAsUtc(event.body) })
    : event),
);
