# Get Well Angular Frontend

Angular 19.2.27 frontend for the Get Well medical shop API.

## Requirements

- Node.js 18.19+ or 20.11+
- npm
- Get Well .NET API running on `https://localhost:7079`

## Run

```bash
npm install
npm start
```

Open `http://localhost:4200`.

## API URL

The API base URL is configured in:

`src/app/core/services/api.service.ts`

Authentication endpoints use:

`https://localhost:7079/api/auth`

Other API calls use:

`https://localhost:7079/api`

If your backend runs on another port, change `apiBaseUrl`.

## Included modules

- JWT login and route guard
- Dashboard
- Products
- Sales / POS
- Purchase invoices
- Inventory
- Suppliers
- Customers
- Employees placeholder
- General ledger placeholder
- Angular Material responsive layout
- HTTP JWT and error interceptors

## Important

The frontend expects the backend contracts described in the supplied Medical shop Angular document. The employee and ledger screens remain placeholders because the supplied source only specified their API endpoints, not their full models/UI behavior.
