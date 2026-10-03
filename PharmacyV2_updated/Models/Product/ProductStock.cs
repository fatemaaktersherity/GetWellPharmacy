using PharmacyV2.Models.Branch;
using PharmacyV2.Models.People;
using PharmacyV2.Models.Product;
using PharmacyV2.Models.Purchase;
using PharmacyV2.Models.SaleInvoice;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PharmacyV2.Models.Product
{
    // This class represents the stock of a product in a specific warehouse, including details such as batch number, quantity, expiry date, and related entities like supplier and purchase invoice.
    public class ProductStock
    {
        [Key]
        public int Id { get; set; }

        public int ProductId { get; set; }
        public Product Product { get; set; } = null!;
        public int WarehouseId { get; set; }
        public Warehouse Warehouse { get; set; } = null!;
        public int? ProductRakId { get; set; }
        public ProductRak? ProductRak { get; set; }

        public string BatchNumber { get; set; } = null!; // part of composite UNIQUE (ProductId, BatchNumber)

        [Column(TypeName = "decimal(18,2)")]
        public decimal Quantity { get; set; } = 0;

        public DateOnly ExpiryDate { get; set; }
        public DateOnly? ManufacturingDate { get; set; }
        [Column(TypeName = "decimal(18,2)")]
        public decimal AvailableQuantity { get; set; } = 0;
        public int? SupplierId { get; set; }
        public Supplier? Supplier { get; set; }
        public int? PurchaseInvoiceId { get; set; }
        public PurchaseInvoice? PurchaseInvoice { get; set; }

        public DateOnly ReceivedDate { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal UnitCost { get; set; }

        [Timestamp]
        public byte[] RowVersion { get; set; } = Array.Empty<byte>();

        public ICollection<SaleItem> SaleItems { get; set; } = new List<SaleItem>();
        public ICollection<StockTransferItem> StockTransferItems { get; set; } = new List<StockTransferItem>();
        public ICollection<ExpiredProductStock> ExpiredProducts { get; set; } = new List<ExpiredProductStock>();
    }
}
