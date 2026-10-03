using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;

namespace PharmacyV2.Controllers
{
    [Authorize(Roles = "Admin,Manager,Cashier")]
    [Route("api/[controller]")]
    [ApiController]
    public class ReportsController : ControllerBase
    {
        private readonly PharmacyDbContext _db;
        public ReportsController(PharmacyDbContext db) { _db = db; }

        [HttpGet("sales")]
        public async Task<IActionResult> SalesReport(
            [FromQuery] DateTime? from,
            [FromQuery] DateTime? to,
            [FromQuery] bool expiredOnly = false)
        {
            var q = _db.Sales
                .Include(s => s.Customer)
                .Include(s => s.Items).ThenInclude(i => i.ProductStocks)
                .Include(s => s.Items).ThenInclude(i => i.ProductStocks).ThenInclude(ps => ps.Product)
                .Include(s => s.Items).ThenInclude(i => i.Unit)
                .AsQueryable();

            if (from.HasValue) q = q.Where(s => s.SaleDate >= from.Value);
            if (to.HasValue) q = q.Where(s => s.SaleDate < to.Value.AddDays(1));

            var sales = await q.OrderByDescending(s => s.SaleDate).ToListAsync();

            if (expiredOnly)
            {
                // This report is item-level: show only the expired batch lines,
                // never the other (non-expired) products on the same invoice.
                var expiredItems = sales
                    .SelectMany(s => s.Items
                        .Where(i => i.ProductStocks.ExpiryDate < DateOnly.FromDateTime(s.SaleDate))
                        .Select(i => new
                        {
                            s.InvoiceNo,
                            SaleDate = s.SaleDate,
                            CustomerName = s.Customer != null ? s.Customer.FirstName + " " + s.Customer.LastName : "Walk-in",
                            ProductName = i.ProductStocks.Product.ProductName,
                            BatchNumber = i.ProductStocks.BatchNumber,
                            ExpiryDate = i.ProductStocks.ExpiryDate,
                            Quantity = i.Quantity,
                            Unit = i.Unit.Name,
                            i.UnitPrice,
                            LineTotal = i.TotalPrice,
                            s.PaymentMethod,
                            IsPaid = s.IsPaid ?? false,
                            s.IsVoided,
                            IsExpiredStockSale = true
                        }))
                    .OrderByDescending(row => row.SaleDate)
                    .ToList();

                return Ok(expiredItems);
            }

            var rows = sales.Select(s =>
            {
                var saleDateOnly = DateOnly.FromDateTime(s.SaleDate);
                var isExpiredStockSale = s.Items.Any(i => i.ProductStocks.ExpiryDate < saleDateOnly);
                return new
                {
                    s.InvoiceNo,
                    SaleDate = s.SaleDate,
                    CustomerName = s.Customer != null ? (s.Customer.FirstName + " " + s.Customer.LastName) : "Walk-in",
                    s.TotalAmount,
                    s.Discount,
                    NetAmount = s.TotalAmount - s.Discount,
                    s.PaymentMethod,
                    IsPaid = s.IsPaid ?? false,
                    s.IsVoided,
                    IsExpiredStockSale = isExpiredStockSale
                };
            });

            return Ok(rows.ToList());
        }

        // GET api/reports/product-sales?from=&to=&companyId=
        [HttpGet("product-sales")]
        public async Task<IActionResult> ProductSalesReport([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int? companyId)
        {
            var q = from si in _db.SaleItems
                    join s in _db.Sales on si.SaleId equals s.SaleId
                    join ps in _db.ProductStocks on si.ProductStockId equals ps.Id
                    join p in _db.Products on ps.ProductId equals p.Id
                    where !s.IsVoided
                    select new { si, s, p };

            if (from.HasValue) q = q.Where(x => x.s.SaleDate >= from.Value);
            if (to.HasValue) q = q.Where(x => x.s.SaleDate < to.Value.AddDays(1));
            if (companyId.HasValue) q = q.Where(x => x.p.CompanyId == companyId.Value);

            var rows = await q.GroupBy(x => new { x.p.Id, x.p.ProductCode, x.p.ProductName })
                .Select(g => new
                {
                    ProductCode = g.Key.ProductCode,
                    ProductName = g.Key.ProductName,
                    QuantitySold = g.Sum(x => x.si.Quantity),
                    TotalRevenue = g.Sum(x => x.si.TotalPrice)
                })
                .OrderByDescending(x => x.TotalRevenue)
                .ToListAsync();
            return Ok(rows);
        }

        // GET api/reports/profit?from=&to=&productId=
        [HttpGet("profit")]
        public async Task<IActionResult> ProfitReport([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int? productId)
        {
            var q = from si in _db.SaleItems
                    join s in _db.Sales on si.SaleId equals s.SaleId
                    join ps in _db.ProductStocks on si.ProductStockId equals ps.Id
                    join p in _db.Products on ps.ProductId equals p.Id
                    where !s.IsVoided
                    select new { si, s, ps, p };

            if (from.HasValue) q = q.Where(x => x.s.SaleDate >= from.Value);
            if (to.HasValue) q = q.Where(x => x.s.SaleDate < to.Value.AddDays(1));
            if (productId.HasValue) q = q.Where(x => x.p.Id == productId.Value);

            var rows = await q.GroupBy(x => new { x.p.Id, x.p.ProductName })
                .Select(g => new
                {
                    ProductName = g.Key.ProductName,
                    QuantitySold = g.Sum(x => x.si.Quantity),
                    Revenue = g.Sum(x => x.si.TotalPrice),
                    Cost = g.Sum(x => x.si.Quantity * x.ps.UnitCost),
                    Profit = g.Sum(x => x.si.TotalPrice) - g.Sum(x => x.si.Quantity * x.ps.UnitCost)
                })
                .OrderByDescending(x => x.Profit)
                .ToListAsync();
            return Ok(rows);
        }

        // GET api/reports/stock-valuation?warehouseId=
        [HttpGet("stock-valuation")]
        public async Task<IActionResult> StockValuationReport([FromQuery] int? warehouseId)
        {
            var q = _db.ProductStocks.Include(ps => ps.Product).Include(ps => ps.Warehouse)
                .Where(ps => ps.AvailableQuantity > 0);
            if (warehouseId.HasValue) q = q.Where(ps => ps.WarehouseId == warehouseId.Value);

            var rows = await q.OrderBy(ps => ps.Product.ProductName)
                .Select(ps => new
                {
                    ProductName = ps.Product.ProductName,
                    ps.BatchNumber,
                    WarehouseName = ps.Warehouse.Name,
                    Quantity = ps.AvailableQuantity,
                    ps.UnitCost,
                    StockValue = ps.AvailableQuantity * ps.UnitCost,
                    ExpiryDate = ps.ExpiryDate.ToString()
                })
                .ToListAsync();
            return Ok(rows);
        }

        // GET api/reports/expiry?warehouseId=
        [HttpGet("expiry")]
        public async Task<IActionResult> ExpiryReport([FromQuery] int? warehouseId)
        {
            var today = DateOnly.FromDateTime(DateTime.Today);
            var horizon = today.AddDays(90);

            var q = _db.ProductStocks.Include(ps => ps.Product).Include(ps => ps.Warehouse)
                .Where(ps => ps.AvailableQuantity > 0 && ps.ExpiryDate <= horizon);
            if (warehouseId.HasValue) q = q.Where(ps => ps.WarehouseId == warehouseId.Value);

            var rows = await q.OrderBy(ps => ps.ExpiryDate)
                .Select(ps => new
                {
                    ProductName = ps.Product.ProductName,
                    ps.BatchNumber,
                    WarehouseName = ps.Warehouse.Name,
                    Quantity = ps.AvailableQuantity,
                    ExpiryDate = ps.ExpiryDate.ToString(),
                    Status = ps.ExpiryDate < today ? "Expired" : "Near Expiry"
                })
                .ToListAsync();
            return Ok(rows);
        }

        // GET api/reports/reorder?companyId=
        [HttpGet("reorder")]
        public async Task<IActionResult> ReorderReport([FromQuery] int? companyId)
        {
            var q = _db.Products.Where(p => p.StockQuantity <= p.MinStockQty);
            if (companyId.HasValue) q = q.Where(p => p.CompanyId == companyId.Value);

            var rows = await q.OrderBy(p => p.ProductName)
                .Select(p => new
                {
                    p.ProductCode,
                    p.ProductName,
                    p.StockQuantity,
                    p.MinStockQty,
                    ShortBy = p.MinStockQty - p.StockQuantity
                })
                .ToListAsync();
            return Ok(rows);
        }

        // GET api/reports/customer-dues?customerId=
        [HttpGet("customer-dues")]
        public async Task<IActionResult> CustomerDuesReport([FromQuery] int? customerId)
        {
            var salesQ = _db.Sales.Where(s => !s.IsVoided && s.CustomerId != null);
            if (customerId.HasValue) salesQ = salesQ.Where(s => s.CustomerId == customerId.Value);

            var billed = await salesQ.GroupBy(s => s.CustomerId)
                .Select(g => new { CustomerId = g.Key, Billed = g.Sum(s => s.TotalAmount - s.Discount) })
                .ToListAsync();

            var paidByCustomer = await _db.SalePayments
                .Join(_db.Sales, sp => sp.SaleId, s => s.SaleId, (sp, s) => new { sp, s })
                .Where(x => x.s.CustomerId != null)
                .GroupBy(x => x.s.CustomerId)
                .Select(g => new { CustomerId = g.Key, Paid = g.Sum(x => x.sp.Amount) })
                .ToListAsync();

            var customers = await _db.Customers.ToDictionaryAsync(c => c.CustomerId);

            var rows = billed.Select(b =>
            {
                var paid = paidByCustomer.FirstOrDefault(x => x.CustomerId == b.CustomerId)?.Paid ?? 0;
                customers.TryGetValue(b.CustomerId!.Value, out var c);
                return new
                {
                    CustomerName = c != null ? (c.FirstName + " " + c.LastName) : "Unknown",
                    Phone = c?.Phone,
                    TotalBilled = b.Billed,
                    TotalPaid = paid,
                    Due = b.Billed - paid
                };
            })
            .Where(x => x.Due > 0)
            .OrderByDescending(x => x.Due)
            .ToList();

            return Ok(rows);
        }

        // GET api/reports/supplier-dues?supplierId=
        [HttpGet("supplier-dues")]
        public async Task<IActionResult> SupplierDuesReport([FromQuery] int? supplierId)
        {
            var q = _db.PurchaseInvoices.Include(pi => pi.Supplier).Where(pi => pi.Due > 0);
            if (supplierId.HasValue) q = q.Where(pi => pi.SupplierId == supplierId.Value);

            var rows = await q.GroupBy(pi => new { pi.SupplierId, SupplierName = pi.Supplier!.SupplierName, pi.Supplier!.Phone })
                .Select(g => new
                {
                    SupplierName = g.Key.SupplierName,
                    Phone = g.Key.Phone,
                    TotalInvoiced = g.Sum(pi => pi.Total),
                    TotalDue = g.Sum(pi => pi.Due)
                })
                .OrderByDescending(x => x.TotalDue)
                .ToListAsync();
            return Ok(rows);
        }

        // GET api/reports/prescription-register?from=&to=&doctorId=
        [HttpGet("prescription-register")]
        public async Task<IActionResult> PrescriptionRegisterReport([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int? doctorId)
        {
            var q = _db.Prescriptions.Include(pr => pr.Doctor).Include(pr => pr.Customer).Include(pr => pr.Items).AsQueryable();
            if (from.HasValue) q = q.Where(pr => pr.PrescriptionDate >= from.Value);
            if (to.HasValue) q = q.Where(pr => pr.PrescriptionDate < to.Value.AddDays(1));
            if (doctorId.HasValue) q = q.Where(pr => pr.DoctorId == doctorId.Value);

            var rows = await q.OrderByDescending(pr => pr.PrescriptionDate)
                .Select(pr => new
                {
                    PrescriptionDate = pr.PrescriptionDate,
                    DoctorName = pr.Doctor.Name,
                    CustomerName = pr.Customer.FirstName + " " + pr.Customer.LastName,
                    pr.Diagnosis,
                    ItemCount = pr.Items.Count
                })
                .ToListAsync();
            return Ok(rows);
        }

        // GET api/reports/purchases?from=&to=&supplierId=
        [HttpGet("purchases")]
        public async Task<IActionResult> PurchaseReport([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int? supplierId)
        {
            var q = _db.PurchaseInvoices.Include(pi => pi.Supplier).AsQueryable();
            if (from.HasValue) q = q.Where(pi => pi.PurchaseDate >= from.Value);
            if (to.HasValue) q = q.Where(pi => pi.PurchaseDate < to.Value.AddDays(1));
            if (supplierId.HasValue) q = q.Where(pi => pi.SupplierId == supplierId.Value);

            var rows = await q.OrderByDescending(pi => pi.PurchaseDate)
                .Select(pi => new
                {
                    pi.InvoiceNo,
                    PurchaseDate = pi.PurchaseDate,
                    SupplierName = pi.Supplier != null ? pi.Supplier.SupplierName : "N/A",
                    pi.Total,
                    pi.Due,
                    pi.PaymentStatus
                })
                .ToListAsync();
            return Ok(rows);
        }

        // GET api/reports/returns?from=&to=
        [HttpGet("returns")]
        public async Task<IActionResult> ReturnsReport([FromQuery] DateTime? from, [FromQuery] DateTime? to)
        {
            var saleQ = _db.SaleReturns.Where(r => !r.IsDeleted).AsQueryable();
            var purchQ = _db.PurchaseReturns.AsQueryable();
            if (from.HasValue) { saleQ = saleQ.Where(r => r.ReturnDate >= from.Value); purchQ = purchQ.Where(r => r.ReturnDate >= from.Value); }
            if (to.HasValue) { saleQ = saleQ.Where(r => r.ReturnDate < to.Value.AddDays(1)); purchQ = purchQ.Where(r => r.ReturnDate < to.Value.AddDays(1)); }

            var saleReturns = await saleQ.Select(r => new
            {
                Type = "Sale Return",
                r.ReturnNo,
                ReturnDate = r.ReturnDate,
                Amount = r.ReturnTotal,
                r.Reason
            }).ToListAsync();

            var purchReturns = await purchQ.Select(r => new
            {
                Type = "Purchase Return",
                r.ReturnNo,
                ReturnDate = r.ReturnDate,
                Amount = r.ReturnTotal,
                r.Reason
            }).ToListAsync();

            var rows = saleReturns.Concat(purchReturns).OrderByDescending(r => r.ReturnDate).ToList();
            return Ok(rows);
        }

        // GET api/reports/expiry-loss?from=&to=
        [HttpGet("expiry-loss")]
        public async Task<IActionResult> ExpiryLossReport([FromQuery] DateTime? from, [FromQuery] DateTime? to)
        {
            var q = _db.ExpiredProductStocks.Include(e => e.Product).AsQueryable();
            if (from.HasValue) q = q.Where(e => e.DisposalDate >= from.Value);
            if (to.HasValue) q = q.Where(e => e.DisposalDate < to.Value.AddDays(1));

            var rows = await q.OrderByDescending(e => e.DisposalDate)
                .Select(e => new
                {
                    DisposalDate = e.DisposalDate,
                    ProductName = e.Product.ProductName,
                    e.Quantity,
                    e.UnitCost,
                    e.TotalCost,
                    e.DisposalMethod,
                    e.ApprovalStatus
                })
                .ToListAsync();
            return Ok(rows);
        }
    }
}
