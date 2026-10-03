using PharmacyV2.Models.Branch;
using PharmacyV2.Models.Other;
using PharmacyV2.Models.Product;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.RegularExpressions;

namespace PharmacyV2.Models.Product
{
    public class ExpiredProductStock
    {
        [Key]
        public int Id { get; set; }

        public int ProductId { get; set; }
        public Product Product { get; set; } = null!;
        public int ProductStockId { get; set; }
        public ProductStock ProductStock { get; set; } = null!;

        public int WarehouseId { get; set; }
        public Warehouse Warehouse { get; set; } = null!;


        [Column(TypeName = "decimal(18,2)")]
        public decimal Quantity { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal UnitCost { get; set; }
        [Column(TypeName = "decimal(18,2)")]
        public decimal TotalCost { get; set; }

        [MaxLength(100)]
        public string DisposalMethod { get; set; } = "Returned";

        public DateTime DisposalDate { get; set; } = DateTime.Now;

        // Who requested this disposal. Always set — this is the "maker" in
        // the maker-checker (dual sign-off) flow for write-offs above the
        // approval threshold.
        public int RequestedByUserId { get; set; }
        public AppUser RequestedBy { get; set; } = null!;

        // Who approved (or rejected) it. Null while ApprovalStatus is
        // PendingApproval. Must be a different user than RequestedByUserId
        // — enforced in the controller, not here.
        public int? ApprovedByUserId { get; set; }
        public AppUser? ApprovedBy { get; set; }
        public DateTime? ApprovedDate { get; set; }

        // Approved | PendingApproval | Rejected. Stock is only deducted and
        // the ledger entry only posted once status becomes Approved — either
        // immediately (below the approval threshold) or via the approve
        // endpoint (above it).
        [MaxLength(30)]
        public string ApprovalStatus { get; set; } = "Approved";

        [MaxLength(500)]
        public string? RejectionReason { get; set; }

        [MaxLength(500)]
        public string? Note { get; set; }
    }
}