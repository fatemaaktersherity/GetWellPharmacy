import { ActivatedRouteSnapshot, RouteReuseStrategy } from '@angular/router';

/** Recreate routed screens on a live refresh so their normal loaders run again. */
export class LiveRefreshRouteReuseStrategy implements RouteReuseStrategy {
  shouldDetach(): boolean { return false; }
  store(): void { }
  shouldAttach(): boolean { return false; }
  retrieve(): null { return null; }
  shouldReuseRoute(_future: ActivatedRouteSnapshot, _current: ActivatedRouteSnapshot): boolean { return false; }
}
