using PharmacyV2.Models.People;
using PharmacyV2.Models.Product;
using PharmacyV2.Models.Purchase;
using PharmacyV2.Models.SaleInvoice;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PharmacyV2.Models.Product;
//Main Table for Product
public class Product
{
    [Key]
    public int Id { get; set; }                  //1
    [MaxLength(50)]
    public string? ProductCode { get; set; }        //Napa-500

    [Required, MaxLength(200)]
    public string ProductName { get; set; } = string.Empty;      //Napa 500mg Tablet (Brand Name)
    public string Strength { get; set; } = string.Empty;         //500mg

    // Generic/composition name, e.g. "Paracetamol" — this is what the
    // Brand Search page (P2) matches against alongside ProductName, the
    // same way medex.com.bd lets you search "Paracetamol" and see every
    // brand (A-One, Ace, Napa...) that shares that generic.
    [MaxLength(200)]
    public string? GenericName { get; set; }

    [MaxLength(50)]
    public string? Barcode { get; set; }

    // "Allopathic" or "Herbal" — mirrors medex.com.bd's Browse menu split
    // (Brand Names / Generics both come in Allopathic and Herbal flavors).
    // Kept as a plain string rather than an enum column so existing rows
    // default cleanly to "Allopathic" without a data migration.
    [MaxLength(20)]
    public string BrandType { get; set; } = "Allopathic";

    // Company (manufacturer) as a proper lookup so it's filterable on the
    // Brand Search page, instead of only living as free text on
    // ProductDetails.Manufacturer.
    public int? CompanyId { get; set; }
    public Company? Company { get; set; }

    // Dosage form (Tablet, Syrup, Injection, Suppository, ...) — also
    // filterable on the Brand Search page.
    public int? DosageFormId { get; set; }
    public DosageForm? DosageForm { get; set; }

    // A product may be linked to the catalogue variant that supplied its
    // name, strength, company and dosage form. Null keeps all old rows valid.
    public int? ProductVariantId { get; set; }
    public ProductVariant? ProductVariant { get; set; }

    public int? ProductCategoryId { get; set; }
    public ProductCategory? ProductCategory { get; set; }

    public int UnitId { get; set; }
    public Unit Unit { get; set; } = null!;              //pcs 
    //dropdown box showing all units of the product, 

    [Column(TypeName = "decimal(18,2)")]
    public decimal UnitPrice { get; set; }               //5 tk per pcs 

    [Column(TypeName = "decimal(18,2)")]
    public decimal PurchasePrice { get; set; }          //4.5 tk per pcs

    [Column(TypeName = "decimal(18,2)")]
    public decimal? DistributorPrice { get; set; }       //4.0 tk per pcs

    [Column(TypeName = "decimal(18,2)")]
    public decimal? SalePrice { get; set; }           // Sale Price

    [MaxLength(500)]
    public string? ImagePath { get; set; }

    // true "image" data type — raw bytes, base64 in JSON. ImagePath above is
    // kept for backward compatibility (external/static file path).
    public byte[]? ProductImage { get; set; }

    [MaxLength(100)]
    public string? ProductImageContentType { get; set; }

    // "date" data type on the master record.
    public DateTime RegisteredDate { get; set; } = DateTime.UtcNow;

    // ----- boolean -----
    // Nullable, defaults to null (not true/false) so existing rows and any
    // caller that doesn't supply it keep working without a migration error
    // or a NOT NULL violation.
    public bool? IsActive { get; set; } = null;

    public int StockQuantity { get; set; } = 0;

    public int MinStockQty { get; set; } = 100;

    public int MaxStockQty { get; set; } = 10000;
    public int PurchaseQty { get; set; } = 0;

    public ICollection<ProductStock> ProductStocks { get; set; } = new List<ProductStock>();
    public ICollection<ProductRak> ProductRaks { get; set; } = new List<ProductRak>();
    public ICollection<SaleItem> SaleItems { get; set; } = new List<SaleItem>();
    public ICollection<PurchaseOrderItem> PurchaseItems { get; set; } = new List<PurchaseOrderItem>();
    public ProductDetails? ProductDetails { get; set; }
    public ICollection<ProductPrice> ProductPrices { get; set; } = new List<ProductPrice>();

    // Every supplier this product is linked to, many-to-many via
    // SupplierProduct, each with its own per-unit purchase/sale price.
    public ICollection<SupplierProduct> SupplierProducts { get; set; } = new List<SupplierProduct>();
}
