using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PharmacyV2.Migrations;

[DbContext(typeof(Data.PharmacyDbContext))]
[Migration("20260928180000_RemovePurchaseOrderPartiallyReceived")]
public partial class RemovePurchaseOrderPartiallyReceived : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // PO receipt progress now belongs exclusively to PurchaseInvoices.
        // Convert every order already linked to an invoice, regardless of
        // its old PO status; reset orphaned legacy PartiallyReceived orders
        // to Checked so they can still be invoiced.
        migrationBuilder.Sql(@"
            UPDATE po
            SET Status = CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM PurchaseInvoices invoice
                    WHERE invoice.PurchaseOrderId = po.Id
                ) THEN 3 -- Converted
                ELSE 2 -- Checked
            END
            FROM PurchaseOrders po
            WHERE po.Status = 5
               OR EXISTS (
                    SELECT 1
                    FROM PurchaseInvoices invoice
                    WHERE invoice.PurchaseOrderId = po.Id
               );
        ");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Intentionally irreversible: restoring PartiallyReceived would
        // reintroduce the PO status this migration removes.
    }
}
