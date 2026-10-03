using PharmacyV2.Models.Product;
using PharmacyV2.Models.Purchase;
using PharmacyV2.Models.Payment;
using System.ComponentModel.DataAnnotations;

namespace PharmacyV2.Models.People
{
    public class Supplier
    {
        public int SupplierId { get; set; }

        [Required, MaxLength(100)]
        public string SupplierName { get; set; } = null!;

        [MaxLength(100)]
        public string? ContactPerson { get; set; }

        [MaxLength(20)]
        public string? Phone { get; set; }

        [MaxLength(100)]
        public string? Email { get; set; }

        [MaxLength(200)]
        public string? Address { get; set; }

        public DateTime CreatedAt { get; set; }
        public bool Distributor { get; set; } = false;

        // ----- number -----
        [System.ComponentModel.DataAnnotations.Schema.Column(TypeName = "decimal(18,2)")]
        public decimal OpeningBalance { get; set; } = 0;

        // ----- image -----
        public byte[]? Logo { get; set; }

        [MaxLength(100)]
        public string? LogoContentType { get; set; }

        [MaxLength(200)]
        public string? LogoPath { get; set; }

        // ----- relational data (dropdown) -----
        public int SupplierTypeId { get; set; }
        public SupplierType SupplierType { get; set; } = null!;

        public int? CompanyId { get; set; }
        public Company? Company { get; set; }

        // ----- details side of the master-details pair -----
        public ICollection<SupplierContact> Contacts { get; set; } = new List<SupplierContact>();

        public ICollection<ProductStock> ProductStocks { get; set; } = new List<ProductStock>();
        public ICollection<PurchaseOrder> PurchaseOrders { get; set; } = new List<PurchaseOrder>();
        public ICollection<PurchaseInvoice> Purchases { get; set; } = new List<PurchaseInvoice>();
        public ICollection<SupplierPayment> Payments { get; set; } = new List<SupplierPayment>();

        // The actual Supplier <-> Product many-to-many: every product this
        // supplier is linked to, each with its own per-unit pricing.
        public ICollection<SupplierProduct> SupplierProducts { get; set; } = new List<SupplierProduct>();
    }
}
