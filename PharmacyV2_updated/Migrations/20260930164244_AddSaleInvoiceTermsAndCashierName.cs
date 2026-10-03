using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PharmacyV2.Migrations
{
    /// <inheritdoc />
    public partial class AddSaleInvoiceTermsAndCashierName : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CashierName",
                table: "Sales",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TermsAndConditions",
                table: "Sales",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CashierName",
                table: "Sales");

            migrationBuilder.DropColumn(
                name: "TermsAndConditions",
                table: "Sales");
        }
    }
}
