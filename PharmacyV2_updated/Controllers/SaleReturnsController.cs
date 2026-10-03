using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;
using PharmacyV2.DTOs;
using PharmacyV2.Models.Payment;
using PharmacyV2.Models.SaleInvoice;
using PharmacyV2.Services;
using PharmacyV2.Enums;
using System.Security.Claims;

namespace PharmacyV2.Controllers
{
    // Master-detail pair: SaleReturn -> SaleReturnItem. The models for this
    // already existed but had no controller — added here, following the
    // same header+items convention as PurchaseOrdersController.
    //
    // Create() credits stock back through the original SaleItem link (it
    // knows exactly which ProductStock batch to restore, and recomputes
    // Product.StockQuantity same as SalesController). The dedicated
    // AddItem/UpdateItem/RemoveItem detail-row endpoints below are a
    // different, SaleItem-less path (MedicineId only, no ProductStockId) —
    // there's no way to know which batch to credit/debit from those, so
    // they intentionally leave stock untouched. Prefer Create() for normal
    // returns; only reach for the detail-row endpoints when editing an
    // existing return's line items directly.
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class SaleReturnsController : ControllerBase
    {
        private readonly PharmacyDbContext _db;
        private readonly IAccountingPostingService _accounting;
        private readonly IAuditService _audit;
        public SaleReturnsController(PharmacyDbContext db, IAccountingPostingService accounting, IAuditService audit) { _db = db; _accounting = accounting; _audit = audit; }

        // GET api/salereturns?saleId=3
        [HttpGet]
        public async Task<ActionResult<IEnumerable<SaleReturnReadDto>>> GetAll([FromQuery] int? saleId)
        {
            var query = _db.SaleReturns
                .Where(r => !r.IsDeleted)
                .Include(r => r.Items).ThenInclude(i => i.Medicine)
                .Include(r => r.Items).ThenInclude(i => i.Unit).Include(r => r.Refunds)
                .AsNoTracking().AsQueryable();
            if (saleId is not null) query = query.Where(r => r.SaleId == saleId);

            var returns = await query.OrderByDescending(r => r.ReturnDate).ToListAsync();
            return Ok(await ToDtosAsync(returns));
        }

        // GET api/salereturns/5
        [HttpGet("{id:int}")]
        public async Task<ActionResult<SaleReturnReadDto>> GetById(int id)
        {
            var ret = await _db.SaleReturns
                .Include(r => r.Items).ThenInclude(i => i.Medicine)
                .Include(r => r.Items).ThenInclude(i => i.Unit).Include(r => r.Refunds)
                .AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == id);
            return ret is null ? NotFound(new ApiError($"Sale return {id} not found.")) : Ok((await ToDtosAsync(new[] { ret })).Single());
        }

        // POST api/salereturns — header + line items in one call.
        // ReturnNo must be unique; SaleId must already exist. ReturnTotal is
        // always computed server-side from the items.
        [HttpPost]
        public async Task<ActionResult<SaleReturnReadDto>> Create([FromBody] SaleReturnCreateDto dto)
        {
            if (dto.Items is not { Count: > 0 })
                return BadRequest(new ApiError("A sale return must contain at least one item."));

            await using var transaction = await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            if (await _db.SaleReturns.AnyAsync(r => r.ReturnNo == dto.ReturnNo))
                return Conflict(new ApiError($"Return number '{dto.ReturnNo}' already exists."));

            var originalSale = await _db.Sales.FirstOrDefaultAsync(s => s.SaleId == dto.SaleId);
            if (originalSale is null) return BadRequest(new ApiError($"Sale {dto.SaleId} does not exist."));

            var affectedProductIds = new List<int>();
            var ret = new SaleReturn
            {
                ReturnNo = dto.ReturnNo,
                ReturnDate = dto.ReturnDate,
                SaleId = dto.SaleId,
                Reason = dto.Reason,
                ReceiptImagePath = dto.ReceiptImagePath,
                ReceiptImage = dto.ReceiptImage,
                ReceiptImageContentType = dto.ReceiptImageContentType
            };

            // A request may contain the same sale line more than once (for
            // example, split across return units). Track quantities already
            // accepted from this request as well as quantities from earlier
            // returns so duplicate lines cannot over-return a sale line.
            var requestedBaseBySaleItem = new Dictionary<int, decimal>();
            if (dto.Items is { Count: > 0 })
            {
                foreach (var itemDto in dto.Items)
                {
                    var source = await _db.SaleItems.Include(x => x.ProductStocks).FirstOrDefaultAsync(x => x.SaleItemId == itemDto.SaleItemId && x.SaleId == dto.SaleId);
                    if (source is null) return BadRequest(new ApiError("Return item must reference an original sale item."));

                    // Return unit defaults to the sale's own unit, but a
                    // cashier may pick any other packaging configured for
                    // the product (e.g. loose Pcs out of a Strip sale).
                    int returnUnitId = itemDto.UnitId ?? source.UnitId;
                    decimal baseQtyPerReturnUnit;
                    decimal unitPriceForReturn;
                    if (returnUnitId == source.UnitId)
                    {
                        // Same unit the line was sold in — reuse the exact
                        // per-unit conversion and price the sale itself used.
                        baseQtyPerReturnUnit = source.BaseQuantity / source.Quantity;
                        unitPriceForReturn = source.UnitPrice;
                    }
                    else
                    {
                        var terms = await GetReturnTermsAsync(source.ProductStocks.ProductId, returnUnitId);
                        if (terms is null) return BadRequest(new ApiError($"Unit {returnUnitId} is not configured for this product."));
                        baseQtyPerReturnUnit = terms.Value.BaseQuantity;
                        unitPriceForReturn = terms.Value.UnitPrice;
                    }

                    var returnedBase = itemDto.Quantity * baseQtyPerReturnUnit;

                    // Validated in base units, not the original display unit
                    // — a return can now be in a different unit than the
                    // sale, so base quantity is the only common yardstick
                    // between what was sold and what's already been returned.
                    var alreadyReturnedBase = await _db.SaleReturnItems
                        .Where(x => x.SaleItemId == source.SaleItemId && !x.SaleReturn.IsDeleted)
                        .SumAsync(x => (decimal?)x.BaseQuantity) ?? 0;
                    var requestedBase = requestedBaseBySaleItem.GetValueOrDefault(source.SaleItemId);
                    if (itemDto.Quantity <= 0 || alreadyReturnedBase + requestedBase + returnedBase > source.BaseQuantity)
                        return Conflict(new ApiError("Return quantity exceeds the original sold quantity."));
                    requestedBaseBySaleItem[source.SaleItemId] = requestedBase + returnedBase;

                    source.ProductStocks.AvailableQuantity += returnedBase;
                    affectedProductIds.Add(source.ProductStocks.ProductId);

                    ret.Items.Add(new SaleReturnItem
                    {
                        SaleItemId = source.SaleItemId,
                        MedicineId = source.ProductStocks.ProductId,
                        UnitId = returnUnitId,
                        Quantity = itemDto.Quantity,
                        BaseQuantity = returnedBase,
                        SalesPrice = unitPriceForReturn,
                        SubTotal = itemDto.Quantity * unitPriceForReturn
                    });
                }
            }

            var netSaleTotal = originalSale.TotalAmount - originalSale.Discount;
            // Spread the invoice discount over returned lines so refund
            // credit never exceeds the amount the customer actually owed/paid.
            var saleNetFactor = originalSale.TotalAmount > 0m ? netSaleTotal / originalSale.TotalAmount : 1m;
            foreach (var item in ret.Items)
            {
                item.SalesPrice = decimal.Round(item.SalesPrice * saleNetFactor, 2, MidpointRounding.AwayFromZero);
                item.SubTotal = decimal.Round(item.SubTotal * saleNetFactor, 2, MidpointRounding.AwayFromZero);
            }
            ret.ReturnTotal = ret.Items.Sum(i => i.SubTotal);

            var previousReturnTotal = await _db.SaleReturns
                .Where(r => r.SaleId == ret.SaleId && !r.IsDeleted)
                .SumAsync(r => (decimal?)r.ReturnTotal) ?? 0m;
            if (ret.ReturnTotal > netSaleTotal - previousReturnTotal)
                return Conflict(new ApiError("The return value cannot exceed the remaining value of the original sale."));

            _db.SaleReturns.Add(ret);
            // Persist the restored batch quantities before calculating the
            // denormalized Product.StockQuantity. EF's SUM query below runs
            // against SQL and cannot see a tracked-but-unsaved increase to
            // ProductStock.AvailableQuantity.
            await _db.SaveChangesAsync();
            // Keeps Product.StockQuantity (the "Stock" column on the Products
            // page) honest — it's a denormalized SUM of every batch's
            // AvailableQuantity, and only self-heals when something
            // recomputes it. SalesController does this on every sale;
            // returns need the same treatment or the batch-level quantity
            // above is correct but the Products page shows a stale number.
            await RecalculateStockQuantityAsync(affectedProductIds);
            await _db.SaveChangesAsync();
            var cost = ret.Items.Sum(x => x.BaseQuantity * _db.SaleItems.Where(s => s.SaleItemId == x.SaleItemId).Select(s => s.ProductStocks.UnitCost).First());
            // Credit Accounts Receivable first. It either reduces the
            // customer's outstanding due or becomes store credit. A refund
            // is a later, separately auditable cash/bank payment.
            await _accounting.PostAsync(LedgerSourceType.SaleReturn, ret.Id, ret.ReturnDate, $"Sale return {ret.ReturnNo}", ("4100", ret.ReturnTotal, 0), ("1100", 0, ret.ReturnTotal), ("1200", cost, 0), ("5000", 0, cost));
            await _db.SaveChangesAsync();
            await _audit.LogAsync("SaleReturnCreated", "SaleReturn", ret.Id, $"Return total/customer credit: {ret.ReturnTotal}", User.FindFirstValue(ClaimTypes.NameIdentifier));
            await transaction.CommitAsync();

            await _db.Entry(ret).Collection(r => r.Items).Query()
                .Include(i => i.Medicine).Include(i => i.Unit).LoadAsync();

            return CreatedAtAction(nameof(GetById), new { id = ret.Id }, (await ToDtosAsync(new[] { ret })).Single());
        }

        [HttpPost("{id:int}/refunds")]
        public async Task<IActionResult> Refund(int id, [FromBody] SaleReturnRefundDto dto)
        {
            var paymentMethod = await _db.PaymentMethods.AsNoTracking()
                .FirstOrDefaultAsync(method => method.Name == dto.PaymentMethod && method.IsActive);
            if (paymentMethod is null || string.IsNullOrWhiteSpace(paymentMethod.LedgerAccountCode))
                return BadRequest(new ApiError($"'{dto.PaymentMethod}' is not an active payment method mapped to a ledger account."));

            await using var transaction = await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            var ret = await _db.SaleReturns.Include(r => r.Refunds).FirstOrDefaultAsync(r => r.Id == id && !r.IsDeleted);
            if (ret is null) return NotFound(new ApiError($"Sale return {id} not found."));
            var credit = (await CalculateReturnCreditsAsync(new[] { ret.SaleId })).GetValueOrDefault(ret.Id);
            if (dto.Amount > credit.CustomerCredit)
                return BadRequest(new ApiError($"Refund amount cannot exceed the remaining customer credit of {credit.CustomerCredit:0.00}. Any outstanding sale balance is applied first."));
            var refund = new SaleReturnRefund { SaleReturnId = id, Amount = dto.Amount, PaymentMethod = dto.PaymentMethod, Note = dto.Note, RefundedAt = DateTime.UtcNow, RefundedByUserId = User.FindFirstValue(ClaimTypes.NameIdentifier) };
            _db.SaleReturnRefunds.Add(refund);
            await _db.SaveChangesAsync();
            await _accounting.PostAsync(LedgerSourceType.SaleReturnRefund, refund.Id, refund.RefundedAt, $"Customer refund for sale return {ret.ReturnNo} — payment method: {paymentMethod.Name}", ("1100", refund.Amount, 0), (paymentMethod.LedgerAccountCode, 0, refund.Amount));
            await _audit.LogAsync("SaleReturnRefundPaid", "SaleReturn", ret.Id, $"Amount: {refund.Amount}; Method: {dto.PaymentMethod}", refund.RefundedByUserId);
            await transaction.CommitAsync();
            return NoContent();
        }

        // PUT api/salereturns/5 — header fields only (Reason). Use the items
        // endpoints below to add/update/remove line items.
        [Authorize(Roles = "Admin,Manager")]
        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] SaleReturnUpdateDto dto)
        {
            if (await _db.LedgerAccounts.AnyAsync(l => l.SourceType == LedgerSourceType.SaleReturn && l.SourceId == id)) return Conflict(new ApiError("Posted sale returns are immutable."));
            var existing = await _db.SaleReturns.FirstOrDefaultAsync(r => r.Id == id);
            if (existing is null) return NotFound(new ApiError($"Sale return {id} not found."));

            existing.Reason = dto.Reason;
            if (dto.ReceiptImagePath is not null) existing.ReceiptImagePath = dto.ReceiptImagePath;
            if (dto.ReceiptImage is not null) existing.ReceiptImage = dto.ReceiptImage;
            if (dto.ReceiptImageContentType is not null) existing.ReceiptImageContentType = dto.ReceiptImageContentType;
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // DELETE api/salereturns/5 — soft delete (IsDeleted flag), matching
        // the SaleReturn.IsDeleted column already on the model.
        [Authorize(Roles = "Admin")]
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            await using var transaction = await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            var ret = await _db.SaleReturns.Include(r => r.Items).Include(r => r.Refunds).FirstOrDefaultAsync(r => r.Id == id);
            if (ret is null) return NotFound(new ApiError($"Sale return {id} not found."));
            if (ret.IsDeleted) return NoContent();
            if (ret.Refunds.Count > 0)
                return Conflict(new ApiError("A return with a paid refund cannot be deleted. The refund has already been paid; keep this return for the audit trail."));

            var saleItemIds = ret.Items.Select(i => i.SaleItemId).Distinct().ToList();
            var saleItems = await _db.SaleItems.Include(i => i.ProductStocks)
                .Where(i => saleItemIds.Contains(i.SaleItemId)).ToDictionaryAsync(i => i.SaleItemId);
            foreach (var group in ret.Items.GroupBy(i => i.SaleItemId))
            {
                if (!saleItems.TryGetValue(group.Key, out var saleItem))
                    return Conflict(new ApiError("The original sale batch is missing; this return cannot be safely reversed."));
                var quantityToRemove = group.Sum(i => i.BaseQuantity);
                if (saleItem.ProductStocks.AvailableQuantity < quantityToRemove)
                    return Conflict(new ApiError("There is not enough quantity left in the original batch to undo this return safely."));
            }

            var affectedProductIds = new List<int>();
            foreach (var group in ret.Items.GroupBy(i => i.SaleItemId))
            {
                var saleItem = saleItems[group.Key];
                saleItem.ProductStocks.AvailableQuantity -= group.Sum(i => i.BaseQuantity);
                affectedProductIds.Add(saleItem.ProductStocks.ProductId);
            }

            await _accounting.ReversePostingAsync(LedgerSourceType.SaleReturn, ret.Id, User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "system");
            ret.IsDeleted = true;
            var sale = await _db.Sales.Include(s => s.Payments).FirstAsync(s => s.SaleId == ret.SaleId);
            var otherReturns = await _db.SaleReturns
                .Where(r => r.SaleId == ret.SaleId && !r.IsDeleted && r.Id != ret.Id)
                .SumAsync(r => (decimal?)r.ReturnTotal) ?? 0m;
            var paid = sale.Payments.Count == 0 && sale.IsPaid == true
                ? sale.TotalAmount - sale.Discount
                : sale.Payments.Sum(p => p.Amount);
            sale.IsPaid = paid >= Math.Max(0m, sale.TotalAmount - sale.Discount - otherReturns);
            await RecalculateStockQuantityAsync(affectedProductIds);
            await _db.SaveChangesAsync();
            await _audit.LogAsync("SaleReturnDeleted", "SaleReturn", ret.Id, $"Return {ret.ReturnNo} reversed; stock and accounting postings were reversed.", User.FindFirstValue(ClaimTypes.NameIdentifier));
            await transaction.CommitAsync();
            return NoContent();
        }

        // Item-level Add/Update/Remove used to live here as dedicated
        // endpoints. Removed: Add/Update always 400'd anyway (their DTO's
        // MedicineId/UnitId/SalesPrice are [JsonIgnore] on purpose, so the
        // "does this product exist" check below them could never pass), and
        // none of the three — including Remove — adjusted ProductStocks or
        // the ledger to match, unlike Create() which does both. Correcting a
        // wrong return means deleting it (see Delete() above) and creating a
        // fresh one, not editing a line in place.

        // POST api/salereturns/5/receipt-image — upload/replace the receipt
        // image as an actual file (multipart/form-data). In Postman: Body ->
        // form-data -> key "file", type "File" -> pick an image from disk.
       
        [HttpPost("{id:int}/receipt-image")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> UploadReceiptImage(int id, IFormFile file)
        {
            var ret = await _db.SaleReturns.FirstOrDefaultAsync(r => r.Id == id);
            if (ret is null) return NotFound(new ApiError($"Sale return {id} not found."));

            if (file is null || file.Length == 0)
                return BadRequest(new ApiError("No file was uploaded. Send it as form-data with key 'file'."));

            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);
            ret.ReceiptImage = ms.ToArray();
            ret.ReceiptImageContentType = file.ContentType;
            ret.ReceiptImagePath = null;

            await _db.SaveChangesAsync();
            return NoContent();
        }

        // Keeps Product.StockQuantity honest — total AvailableQuantity across
        // ALL ProductStock batches for that product. Same convention as
        // SalesController.RecalculateStockQuantityAsync /
        // PurchaseInvoicesController's version: always recomputed from
        // scratch via SUM, so it self-heals no matter what order things
        // happen in. Callers must SaveChangesAsync separately after this.
        private async Task RecalculateStockQuantityAsync(IEnumerable<int> productIds)
        {
            foreach (var productId in productIds.Distinct())
            {
                var total = await _db.ProductStocks
                    .Where(s => s.ProductId == productId)
                    .SumAsync(s => (decimal?)s.AvailableQuantity) ?? 0m;

                var product = await _db.Products.FindAsync(productId);
                if (product is not null)
                    product.StockQuantity = (int)total;
            }
        }

        // Resolves how a given unit converts to base quantity/price for this
        // product, when the return unit differs from the one it was sold
        // in. Same lookup SalesController uses when adding a new sale line
        // (product's own base unit, or one of its configured ProductPrices
        // packagings) — kept as a local copy since that one is private to
        // SalesController.
        private async Task<(decimal BaseQuantity, decimal UnitPrice)?> GetReturnTermsAsync(int productId, int unitId)
        {
            var product = await _db.Products.AsNoTracking().Include(p => p.ProductPrices)
                .FirstOrDefaultAsync(p => p.Id == productId);
            if (product is null) return null;
            if (product.UnitId == unitId) return (1m, product.SalePrice ?? product.UnitPrice);
            var package = product.ProductPrices.FirstOrDefault(p => p.UnitId == unitId);
            return package is null ? null : (package.BaseQuantity, package.PerUnitPrice);
        }

        private static SaleReturnItemReadDto ItemToDto(SaleReturnItem i) => new()
        {
            Id = i.Id,
            MedicineId = i.MedicineId,
            MedicineName = i.Medicine?.ProductName,
            UnitId = i.UnitId,
            UnitName = i.Unit?.Name,
            Quantity = i.Quantity,
            BaseQuantity = i.BaseQuantity,
            SalesPrice = i.SalesPrice,
            SubTotal = i.SubTotal
        };

        private async Task<List<SaleReturnReadDto>> ToDtosAsync(IEnumerable<SaleReturn> returns)
        {
            var list = returns.ToList();
            var credits = await CalculateReturnCreditsAsync(list.Select(r => r.SaleId));
            return list.Select(r => ToDto(r, credits.GetValueOrDefault(r.Id))).ToList();
        }

        private async Task<Dictionary<int, (decimal AppliedToDue, decimal CustomerCredit)>> CalculateReturnCreditsAsync(IEnumerable<int> saleIds)
        {
            var ids = saleIds.Distinct().ToList();
            if (ids.Count == 0) return new Dictionary<int, (decimal, decimal)>();

            var sales = await _db.Sales.Include(s => s.Payments).Where(s => ids.Contains(s.SaleId)).ToDictionaryAsync(s => s.SaleId);
            var returns = await _db.SaleReturns.Include(r => r.Refunds)
                .Where(r => ids.Contains(r.SaleId) && !r.IsDeleted).ToListAsync();
            var result = new Dictionary<int, (decimal, decimal)>();

            foreach (var saleGroup in returns.GroupBy(r => r.SaleId))
            {
                if (!sales.TryGetValue(saleGroup.Key, out var sale)) continue;
                var due = sale.Payments.Count == 0 && sale.IsPaid == true ? 0m : Math.Max(0m, sale.TotalAmount - sale.Discount);
                var events = sale.Payments.Select(p => (Date: p.ReceivedAt, IsPayment: true, Payment: (SalePayment?)p, Return: (SaleReturn?)null))
                    .Concat(saleGroup.Select(r => (Date: r.ReturnDate, IsPayment: false, Payment: (SalePayment?)null, Return: (SaleReturn?)r)))
                    .OrderBy(e => e.Date).ThenBy(e => e.IsPayment ? 0 : 1);

                foreach (var entry in events)
                {
                    if (entry.IsPayment)
                    {
                        due = Math.Max(0m, due - entry.Payment!.Amount);
                        continue;
                    }

                    var ret = entry.Return!;
                    var appliedToDue = Math.Min(due, ret.ReturnTotal);
                    due -= appliedToDue;
                    var credit = Math.Max(0m, ret.ReturnTotal - appliedToDue - ret.Refunds.Sum(x => x.Amount));
                    result[ret.Id] = (appliedToDue, credit);
                }
            }

            return result;
        }

        private static SaleReturnReadDto ToDto(SaleReturn r, (decimal AppliedToDue, decimal CustomerCredit) credit) => new()
        {
            Id = r.Id,
            ReturnNo = r.ReturnNo,
            ReturnDate = r.ReturnDate,
            SaleId = r.SaleId,
            ReturnTotal = r.ReturnTotal,
            Reason = r.Reason,
            IsDeleted = r.IsDeleted,
            ReceiptImagePath = r.ReceiptImagePath,
            ReceiptImage = r.ReceiptImage,
            ReceiptImageContentType = r.ReceiptImageContentType,
            Items = r.Items.Select(ItemToDto).ToList(),
            RefundedAmount = r.Refunds.Sum(x => x.Amount),
            AppliedToDue = credit.AppliedToDue,
            CustomerCredit = credit.CustomerCredit,
            Refunds = r.Refunds.OrderBy(x => x.RefundedAt).Select(x => new SaleReturnRefundReadDto
            {
                Id = x.Id,
                Amount = x.Amount,
                PaymentMethod = x.PaymentMethod,
                RefundedAt = x.RefundedAt,
                Note = x.Note
            }).ToList()
        };
    }
}
