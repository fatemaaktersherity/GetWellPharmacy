using PharmacyV2.Models.Product;

namespace PharmacyV2.Models.SaleInvoice
{
    public class SaleItem
    {
        public int SaleItemId { get; set; }

        public int SaleId { get; set; }
        public Sale Sale { get; set; } = null!;

        public int ProductStockId { get; set; }
        public ProductStock ProductStocks { get; set; } = null!;

        // Moved here from Sale (header) so each line item can be sold in a
        // different unit — e.g. one medicine as "Strip", another as "Bottle",
        // within the same invoice. Same pattern as PurchaseInvoiceItem.UnitId
        // and SaleReturnItem.UnitId.
        public int UnitId { get; set; }
        public Unit Unit { get; set; } = null!;

        public int Quantity { get; set; } // CHECK (QUANTITY > 0)

        public decimal BaseQuantity { get; set; } = 1;

        public decimal UnitPrice { get; set; }

        // GENERATED ALWAYS AS (QUANTITY * UNIT_PRICE) VIRTUAL -> SQL Server computed column
        // EF Core treats this as database-generated; do not set it from code.
        public decimal TotalPrice { get; private set; }
    }
}
