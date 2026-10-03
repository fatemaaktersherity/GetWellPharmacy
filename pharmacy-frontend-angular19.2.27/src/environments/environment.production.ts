// apiUrl is relative on purpose — deploy this app behind a reverse proxy
// that forwards "/api/**" to the backend from the same origin (avoids CORS
// entirely). If your API is on a different origin, change this and rebuild.
export const environment = {
    production: true,
    apiUrl: '/api',
};