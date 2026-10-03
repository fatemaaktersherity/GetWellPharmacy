using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using PharmacyV2.Models.Branch;
using PharmacyV2.Models.Other;
using PharmacyV2.Models.Payment;

namespace PharmacyV2.Data
{
    // Runtime seeder for ESSENTIAL bootstrap data only -- everything an
    // otherwise-empty database needs to be usable on day one:
    //   1) Admin/Manager/Cashier roles + starter login accounts
    //   2) Payment methods (Cash/Card/Mobile Banking) -- the purchase/sale
    //      forms' payment-method checkboxes read straight from this table.
    //   3) A starter warehouse -- WarehouseId is required on every purchase
    //      invoice and there's currently no "Manage Warehouses" screen in
    //      the frontend, so without at least one row here nobody could
    //      create a purchase until a warehouse is added via the API/Swagger.
    //
    // NOTE: no fake suppliers/customers/companies/products/purchases/sales/
    // etc. are seeded here anymore -- that's real business data you enter
    // yourself through the app. (Reference/lookup tables like SupplierType,
    // CustomerType, WarehouseType, Department, DosageForm, Unit are seeded
    // separately via HasData() in PharmacyDbContext and are untouched by
    // this file.)
    //
    // Called once from Program.cs on startup. Guarded so it never runs
    // twice against a database that's already bootstrapped.
    public static class SeedData
    {
        public static async Task SeedSampleDataAsync(PharmacyDbContext db)
        {
            // ---------- 1) Roles / Users ----------
            var adminRole = await EnsureRoleAsync(db, "Admin", "Full access");
            var managerRole = await EnsureRoleAsync(db, "Manager", "Operational management");
            var userRole = await EnsureRoleAsync(db, "Cashier", "POS / limited access");
            await MigrateLegacyUserRoleAsync(db, userRole);

            if (!await db.RolePermissions.AnyAsync(p => p.RoleId == adminRole.Id && p.Module == "Sales"))
            {
                db.RolePermissions.Add(new RolePermission { RoleId = adminRole.Id, Module = "Sales", CanView = true, CanCreate = true, CanEdit = true, CanDelete = true });
            }

            if (!await db.RolePermissions.AnyAsync(p => p.RoleId == userRole.Id && p.Module == "Sales"))
            {
                db.RolePermissions.Add(new RolePermission { RoleId = userRole.Id, Module = "Sales", CanView = true, CanCreate = true, CanEdit = false, CanDelete = false });
            }

            var passwordHasher = new Microsoft.AspNetCore.Identity.PasswordHasher<AppUser>();

            var adminUser = await db.AppUsers.FirstOrDefaultAsync(u => u.Username == "admin");
            if (adminUser is null)
            {
                adminUser = new AppUser
                {
                    Username = "admin",
                    FullName = "System Admin",
                    Email = "admin@pharmacy.local",
                    Phone = "01700000000",
                    RoleId = adminRole.Id,
                    IsActive = true
                };
                adminUser.PasswordHash = passwordHasher.HashPassword(adminUser, "Admin@123");
                db.AppUsers.Add(adminUser);
            }
            else
            {
                adminUser.RoleId = adminRole.Id;
                adminUser.IsActive = true;
                if (string.IsNullOrWhiteSpace(adminUser.PasswordHash))
                    adminUser.PasswordHash = passwordHasher.HashPassword(adminUser, "Admin@123");
            }



            await db.SaveChangesAsync();

            // ---------- 2) Payment methods ----------
            if (!await db.PaymentMethods.AnyAsync())
            {
                db.PaymentMethods.AddRange(
                    new PaymentMethod { Name = "Cash", LedgerAccountCode = "1000", IsActive = true },
                    new PaymentMethod { Name = "Card", LedgerAccountCode = "1010", IsActive = true },
                    new PaymentMethod { Name = "Mobile Banking", LedgerAccountCode = "1020", IsActive = true }
                );
                await db.SaveChangesAsync();
            }

            // ---------- 3) Starter warehouse ----------
            if (!await db.Warehouses.AnyAsync())
            {
                db.Warehouses.Add(new Warehouse { Name = "Main Warehouse", Address = "", WarehouseTypeId = 1, Capacity = 10000 });
                await db.SaveChangesAsync();
            }
        }

        private static async Task<Role> EnsureRoleAsync(PharmacyDbContext db, string name, string description)
        {
            var role = await db.Roles.FirstOrDefaultAsync(r => r.Name == name);
            if (role is not null)
            {
                role.Description ??= description;
                role.IsActive = true;
                return role;
            }

            role = new Role { Name = name, Description = description, IsActive = true };
            db.Roles.Add(role);
            await db.SaveChangesAsync();
            return role;
        }

        private static async Task MigrateLegacyUserRoleAsync(PharmacyDbContext db, Role cashierRole)
        {
            var legacyRole = await db.Roles.FirstOrDefaultAsync(r => r.Name == "User");
            // Preserve accounts when an earlier startup already created
            // Cashier alongside User, and repair any role-less accounts.
            await db.AppUsers
                .Where(u => u.RoleId == null || (legacyRole != null && u.RoleId == legacyRole.Id))
                .ExecuteUpdateAsync(update => update.SetProperty(u => u.RoleId, cashierRole.Id));

            if (legacyRole is not null)
            {
                legacyRole.IsActive = false;
                await db.SaveChangesAsync();
            }
        }
        /// <summary>
        /// One-time data-consistency pass, NOT gated behind the AppUsers.Any()
        /// check above so it also runs against a database that was already
        /// bootstrapped before PaymentMethod.LedgerAccountCode became
        /// required. Finds any active payment method saved (under the old,
        /// looser validation) with no ledger account code -- SalesController
        /// now rejects using such a method for a paid sale or a payment
        /// collection, so this surfaces the problem at startup via the log
        /// instead of as a confusing 400 the next time a cashier tries to
        /// use it. Never guesses a code on an admin's behalf; the fix is to
        /// open Payment Methods and set one (the write DTO now requires it).
        /// Called every startup -- cheap, and catches the issue immediately
        /// if a method is ever left without a code again.
        /// </summary>
        public static async Task WarnAboutUnmappedPaymentMethodsAsync(PharmacyDbContext db, ILogger logger)
        {
            var unmapped = await db.PaymentMethods.AsNoTracking()
                .Where(p => p.IsActive && (p.LedgerAccountCode == null || p.LedgerAccountCode == ""))
                .Select(p => p.Name)
                .ToListAsync();

            if (unmapped.Count > 0)
            {
                logger.LogWarning(
                    "Payment method(s) with no ledger account code: {Methods}. " +
                    "Paid sales and payment collections using these will be rejected until a code is set on the Payment Methods screen.",
                    string.Join(", ", unmapped));
            }
        }
    }
}
