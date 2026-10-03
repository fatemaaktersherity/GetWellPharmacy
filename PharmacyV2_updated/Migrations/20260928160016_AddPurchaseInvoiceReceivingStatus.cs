using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PharmacyV2.Migrations
{
    /// <inheritdoc />
    public partial class AddPurchaseInvoiceReceivingStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ReceivingStatus",
                table: "PurchaseInvoices",
                type: "nvarchar(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "Completed");

            migrationBuilder.Sql(@"
                UPDATE invoice
                SET ReceivingStatus = CASE
                    WHEN EXISTS (
                        SELECT 1
                        FROM PurchaseInvoiceItems item
                        WHERE item.PurchaseInvoiceId = invoice.Id
                          AND item.OrderedQty IS NOT NULL
                          AND item.ReceivedQty < item.OrderedQty
                    ) THEN 'Partially Received'
                    ELSE 'Completed'
                END
                FROM PurchaseInvoices invoice;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ReceivingStatus",
                table: "PurchaseInvoices");
        }
    }
}
