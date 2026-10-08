# Get Well Pharmacy

A pharmacy / medical shop management system. It covers point of sale, purchasing, inventory, expiry tracking, prescriptions, HR and accounting, with role-based access for Admin, Manager and Cashier users.

The repository contains two projects:

| Folder | What it is |
| --- | --- |
| `PharmacyV2_updated` | Backend REST API (ASP.NET Core, Entity Framework Core, SQL Server) |
| `pharmacy-frontend-angular19.2.27` | Frontend web app (Angular 19, plus a small React registration page) |

## Features

- **Authentication:** JWT login, change password, forgot password, route guards and role-based access (Admin, Manager, Cashier)
- **Registration:** public self-registration page; new users get the Cashier role and an Admin can change roles later
- **Products:** products, brands, generics, companies, product groups and categories, units, dosage forms, price history
- **Sales / POS:** sale invoices, receipts, sale returns
- **Purchasing:** purchase orders, purchase invoices, purchase returns, daily purchase requirements, supplier payments
- **Inventory:** stock, warehouses, stock transfers, damaged goods
- **Expiry management:** near-expiry and expired product lists, disposal approvals and history
- **Prescriptions:** doctors and prescriptions, including a controlled-drug register report
- **People:** customers, suppliers, employees and departments (HR)
- **Accounting:** chart of accounts, ledger, journal entries, company assets and liabilities
- **Admin tools:** users and roles, role permissions, activity log, SMS logs, payment methods
- **Reports** and printable invoices, orders and returns
- **Live updates** pushed from the API to the browser

## Tech Stack

**Backend**
- C# / ASP.NET Core Web API on .NET 10
- Entity Framework Core with SQL Server (LocalDB by default) and code-first migrations
- JWT bearer authentication
- Swagger / OpenAPI

**Frontend**
- Angular 19 with Angular Material and RxJS
- **React 19 + Vite** for the public registration page (`src/react-registration`), built into `public/register` and opened from the Register button on the Angular login screen
- TypeScript

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- SQL Server LocalDB (installed with Visual Studio) or another SQL Server instance
- [Node.js](https://nodejs.org/) 20.19+ and npm

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/fatemaaktersherity/GetWellPharmacy.git
cd GetWellPharmacy
```

### 2. Run the backend API

```bash
cd PharmacyV2_updated
```

Set the JWT signing key. It is not stored in the repository, and the app will not start without it:

```bash
dotnet user-secrets set "JwtSettings:SecretKey" "<a random string of at least 32 characters>"
```

See `PharmacyV2_updated/SECURITY.md` for details and for production setup.

If you are not using LocalDB, change `ConnectionStrings:DefaultConnection` in `appsettings.json`. Then start the API:

```bash
dotnet run
```

On startup the API applies database migrations and seeds sample data automatically.

- API: https://localhost:7079 (also http://localhost:5116)
- Swagger UI (in Development): https://localhost:7079/swagger

### 3. Run the frontend

In a second terminal:

```bash
cd pharmacy-frontend-angular19.2.27
npm install
npm start
```

Open http://localhost:4200.

The frontend expects the API at `https://localhost:7079/api`. To change it, edit `src/environments/environment.ts` (Angular app) and `src/react-registration/src/.env.development` (registration page).

### 4. Log in

The seeded admin account is:

| Username | Password |
| --- | --- |
| `admin` | `Admin@123` |

Change this password straight away, and never keep it in a production deployment.

## Working on the registration page (React)

The compiled registration page is already included in `public/register`, so `npm start` works without any extra step. If you edit the React source in `src/react-registration`, rebuild it:

```bash
npm run build:register
```

`npm run build` builds the registration page first and then the Angular app.

## Project Structure

```
GetWellPharmacy/
├── PharmacyV2_updated/                  # ASP.NET Core API
│   ├── Controllers/                     # REST endpoints
│   ├── Models/                          # Entity classes
│   ├── DTOs/                            # Request / response models
│   ├── Data/                            # DbContext and seed data
│   ├── Migrations/                      # EF Core migrations
│   └── Services/                        # Business logic (accounting posting, audit, live updates)
└── pharmacy-frontend-angular19.2.27/    # Angular app
    ├── src/app/core/                    # Services, guards, interceptors, models
    ├── src/app/features/                # Feature modules (sales, products, inventory, ...)
    ├── src/react-registration/          # React + Vite registration page (source)
    └── public/register/                 # Built registration page
```
