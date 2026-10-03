using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PharmacyV2.Migrations;

[DbContext(typeof(Data.PharmacyDbContext))]
[Migration("20260928173000_SetAdovasBrandTypeHerbal")]
public partial class SetAdovasBrandTypeHerbal : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(@"
            UPDATE Products
            SET BrandType = N'Herbal'
            WHERE ProductName LIKE N'Adovas%'
              AND BrandType <> N'Herbal';
        ");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(@"
            UPDATE Products
            SET BrandType = N'Allopathic'
            WHERE ProductName LIKE N'Adovas%'
              AND BrandType = N'Herbal';
        ");
    }
}
