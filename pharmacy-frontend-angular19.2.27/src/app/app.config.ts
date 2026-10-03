import { ApplicationConfig } from "@angular/core";
import { DATE_PIPE_DEFAULT_OPTIONS } from "@angular/common";
import { provideRouter, RouteReuseStrategy, withRouterConfig } from "@angular/router";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async";
import { routes } from "./app.routes";
import { jwtInterceptor } from "./core/interceptors/jwt.interceptor";
import { errorInterceptor } from "./core/interceptors/error.interceptor";
import { utcDateTimeInterceptor } from "./core/interceptors/utc-datetime.interceptor";
import { LiveRefreshRouteReuseStrategy } from "./core/services/live-refresh-route-reuse.strategy";

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: DATE_PIPE_DEFAULT_OPTIONS, useValue: { timezone: "+0600" } },
    provideRouter(routes, withRouterConfig({ onSameUrlNavigation: "reload" })),
    { provide: RouteReuseStrategy, useClass: LiveRefreshRouteReuseStrategy },

    provideHttpClient(withInterceptors([jwtInterceptor, utcDateTimeInterceptor, errorInterceptor])),

    provideAnimationsAsync(),
  ],
};
