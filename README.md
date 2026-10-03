# GetWell Pharmacy

A full-stack pharmacy management web application with an **ASP.NET** backend and an **Angular 19** frontend.

## Project Structure

```
GetWellPharmacy/
├── PharmacyV2_updated/                  # Backend (ASP.NET)
└── pharmacy-frontend-angular19.2.27/    # Frontend (Angular 19)
```

## Tech Stack

| Layer     | Technology                       |
| --------- | -------------------------------- |
| Frontend  | Angular 19, TypeScript, HTML, CSS |
| Backend   | ASP.NET (C#)                     |
| Database  | SQL Server *(update if different)* |
| Tools     | Visual Studio, VS Code, Git      |

## Features

- Medicine / product management (add, edit, delete, search)
- Stock and inventory tracking
- Customer and order management
- Sales and billing
- User authentication and role-based access
- Responsive user interface

> Edit this list to match the features you actually built.

## Prerequisites

Make sure these are installed:

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) (LTS) and npm
- [Angular CLI](https://angular.dev/tools/cli): `npm install -g @angular/cli`
- [.NET SDK](https://dotnet.microsoft.com/download) and Visual Studio
- SQL Server (or the database your project uses)

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/fatemaaktersherity/GetWellPharmacy.git
cd GetWellPharmacy
```

### 2. Run the backend

1. Open the `PharmacyV2_updated` folder in Visual Studio (open the `.sln` file).
2. Update the database connection string in `appsettings.json`:
   ```json
   "ConnectionStrings": {
     "DefaultConnection": "Server=YOUR_SERVER;Database=GetWellPharmacy;Trusted_Connection=True;TrustServerCertificate=True;"
   }
   ```
3. Apply database migrations (if using Entity Framework):
   ```bash
   dotnet ef database update
   ```
4. Run the project (press **F5** or use `dotnet run`).

### 3. Run the frontend

```bash
cd pharmacy-frontend-angular19.2.27
npm install
ng serve
```

Open your browser at **http://localhost:4200**.

> Make sure the API base URL in the Angular environment file matches the address where your backend is running.

## Usage

1. Start the backend server.
2. Start the Angular frontend.
3. Log in and begin managing the pharmacy.

## Screenshots

*Add screenshots of your application here.*

```markdown
![Home Page](screenshots/home.png)
```

## Author

**Fatema Akter Sherity**
GitHub: [@fatemaaktersherity](https://github.com/fatemaaktersherity)

## License

This project is for educational purposes. Add a license here if you plan to share it publicly.
