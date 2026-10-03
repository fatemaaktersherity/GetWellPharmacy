using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;
using PharmacyV2.DTOs;
using PharmacyV2.Models.Payment;
using PharmacyV2.Models.Purchase;
using PharmacyV2.Services;
using PharmacyV2.Enums;
using System.Security.Claims;

namespace PharmacyV2.Controllers
{
    // Master-detail-detail trio: PurchaseReturn -> PurchaseReturnItem (what's
    // being returned) and PurchaseReturn -> PurchaseReturnReceive (refund/credit
    // received back from the supplier for the return). The models for this
    // already existed but had no controller — added here.
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class PurchaseReturnsController : ControllerBase
    {
        private readonly PharmacyDbContext _db;
        private readonly IAccountingPostingService _accounting;
        private readonly IAuditService _audit;
        public PurchaseReturnsController(PharmacyDbContext db, IAccountingPostingService accounting, IAuditService audit) { _db = db; _accounting = accounting; _audit = audit; }

        // GET api/purchasereturns?purchaseInvoiceId=3
        [HttpGet]
        public async Task<ActionResult<IEnumerable<PurchaseReturnReadDto>>> GetAll([FromQuery] int? purchaseInvoiceId)
        {
            var query = _db.PurchaseReturns
                .Include(r => r.Items).ThenInclude(i => i.Product)
                .Include(r => r.Items).ThenInclude(i => i.Unit)
                .Include(r => r.Receives)
                .AsNoTracking().AsQueryable();
            if (purchaseInvoiceId is not null) query = query.Where(r => r.PurchaseInvoiceId == purchaseInvoiceId);

            var returns = await query.OrderByDescending(r => r.ReturnDate).ToListAsync();
            return Ok(returns.Select(ToDto));
        }

        // GET api/purchasereturns/5
        [HttpGet("{id:int}")]
        public async Task<ActionResult<PurchaseReturnReadDto>> GetById(int id)
        {
            var ret = await _db.PurchaseReturns
                .Include(r => r.Items).ThenInclude(i => i.Product)
                .Include(r => r.Items).ThenInclude(i => i.Unit)
                .Include(r => r.Receives)
                .AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == id);
            return ret is null ? NotFound(new ApiError($"Purchase return {id} not found.")) : Ok(ToDto(ret));
        }

        // POST api/purchasereturns — header + line items (+ optional receives) in one call.
        // ReturnNo must be unique; PurchaseInvoiceId must already exist.
        // ReturnTotal is always computed server-side from the items.
        [Authorize(Roles = "Admin,Manager")]
        [HttpPost]
        public async Task<ActionResult<PurchaseReturnReadDto>> Create([FromBody] PurchaseReturnCreateDto dto)
        {
            if (await _db.PurchaseReturns.AnyAsync(r => r.ReturnNo == dto.ReturnNo))
                return Conflict(new ApiError($"Return number '{dto.ReturnNo}' already exists."));

            var purchaseInvoice = await _db.PurchaseInvoices.FirstOrDefaultAsync(p => p.Id == dto.PurchaseInvoiceId);
            if (purchaseInvoice is null)
                return BadRequest(new ApiError($"Purchase invoice {dto.PurchaseInvoiceId} does not exist."));

            await using var transaction = await _db.Database.BeginTransactionAsync();
            var affectedProductIds = new List<int>();
            var ret = new PurchaseReturn
            {
                ReturnNo = dto.ReturnNo,
                ReturnDate = dto.ReturnDate,
                PurchaseInvoiceId = dto.PurchaseInvoiceId,
                Reason = dto.Reason,
                ReceiptImagePath = dto.ReceiptImagePath,
                ReceiptImage = dto.ReceiptImage,
                ReceiptImageContentType = dto.ReceiptImageContentType
            };

            if (dto.Items is { Count: > 0 })
            {
                foreach (var itemDto in dto.Items)
                {
                    var source = await _db.PurchaseInvoiceItems.FirstOrDefaultAsync(x => x.Id == itemDto.PurchaseInvoiceItemId && x.PurchaseInvoiceId == dto.PurchaseInvoiceId);
                    if (source is null) return BadRequest(new ApiError("Return item must reference an original purchase invoice item."));
                    var returned = await _db.PurchaseReturnItems.Where(x => x.PurchaseInvoiceItemId == source.Id).SumAsync(x => (decimal?)x.Quantity) ?? 0;
                    if (itemDto.Quantity <= 0 || returned + itemDto.Quantity > source.ReceivedQty) return Conflict(new ApiError("Return quantity exceeds the original purchased quantity."));
                    var baseQuantity = itemDto.Quantity * source.ReceivedQty / source.ReceivedQty;
                    var batchNumber = string.IsNullOrWhiteSpace(source.BatchNumber) ? $"{purchaseInvoice.InvoiceNo}-{source.Id}" : source.BatchNumber;
                    var stock = await _db.ProductStocks.FirstOrDefaultAsync(s => s.ProductId == source.ProductId && s.PurchaseInvoiceId == dto.PurchaseInvoiceId && s.BatchNumber == batchNumber);
                    if (stock is null || stock.AvailableQuantity < baseQuantity) return Conflict(new ApiError("The original purchase batch does not have enough available stock to return."));
                    stock.AvailableQuantity -= baseQuantity;
                    affectedProductIds.Add(source.ProductId);

                    ret.Items.Add(new PurchaseReturnItem
                    {
                        PurchaseInvoiceItemId = source.Id,
                        ProductId = source.ProductId,
                        UnitId = source.UnitId,
                        Quantity = itemDto.Quantity,
                        BaseQuantity = baseQuantity,
                        UnitCost = source.UnitCost,
                        SubTotal = itemDto.Quantity * source.UnitCost
                    });
                }
            }

            if (dto.Receives is { Count: > 0 })
            {
                if (dto.Receives.Any(r => r.ReceivedAmount <= 0))
                    return BadRequest(new ApiError("Refund or supplier credit amount must be greater than zero."));
                if (dto.Receives.Sum(r => r.ReceivedAmount) > ret.Items.Sum(i => i.SubTotal))
                    return BadRequest(new ApiError("Initial refund or supplier credit cannot exceed the purchase-return total."));
                foreach (var receiveDto in dto.Receives)
                {
                    if (receiveDto.PaymentMethod != "Supplier Credit")
                    {
                        var configuredMethod = await _db.PaymentMethods.AsNoTracking()
                            .FirstOrDefaultAsync(method => method.Name == receiveDto.PaymentMethod && method.IsActive);
                        if (configuredMethod is null || string.IsNullOrWhiteSpace(configuredMethod.LedgerAccountCode))
                            return BadRequest(new ApiError($"'{receiveDto.PaymentMethod}' is not an active payment method mapped to a ledger account."));
                    }
                    ret.Receives.Add(new PurchaseReturnReceive
                    {
                        ReceivedAmount = receiveDto.ReceivedAmount,
                        ReceivedDate = receiveDto.ReceivedDate,
                        PaymentMethod = receiveDto.PaymentMethod,
                        ReceivedByUserId = User.FindFirstValue(ClaimTypes.NameIdentifier),
                        Note = receiveDto.Note
                    });
                }
            }

            ret.ReturnTotal = ret.Items.Sum(i => i.SubTotal);

            _db.PurchaseReturns.Add(ret);
            // Persist the reduced batch quantities before recomputing the
            // denormalized Product.StockQuantity below — same ordering
            // SaleReturnsController.Create() uses, so the recalculation's
            // SUM query sees the change.
            await _db.SaveChangesAsync();
            // Keeps Product.StockQuantity (the "Stock" column on the
            // Products page) honest after a supplier return reduces batch
            // stock. This was missing before — every other place that
            // touches ProductStock.AvailableQuantity (Sales, Sale Returns,
            // Purchase Invoices, manual stock edits) already recalculates;
            // this is the same fix applied here.
            await RecalculateStockQuantityAsync(affectedProductIds);
            await _db.SaveChangesAsync();
            await _accounting.PostAsync(LedgerSourceType.PurchaseReturn, ret.Id, ret.ReturnDate, $"Purchase return {ret.ReturnNo}", ("2000", ret.ReturnTotal, 0), ("1200", 0, ret.ReturnTotal));
            foreach (var receive in ret.Receives)
            {
                if (receive.PaymentMethod != "Supplier Credit")
                {
                    var method = await _db.PaymentMethods.AsNoTracking().FirstAsync(item => item.Name == receive.PaymentMethod && item.IsActive);
                    await _accounting.PostAsync(LedgerSourceType.PurchaseReturnRefund, receive.Id, receive.ReceivedDate,
                        $"Supplier refund received for purchase return {ret.ReturnNo} — payment method: {method.Name}", (method.LedgerAccountCode!, receive.ReceivedAmount, 0), ("2000", 0, receive.ReceivedAmount));
                }
                await _audit.LogAsync("PurchaseReturnSettlementRecorded", "PurchaseReturn", ret.Id, $"Amount: {receive.ReceivedAmount}; Type: {receive.PaymentMethod}", receive.ReceivedByUserId);
            }
            ret.IsCompleted = ret.Receives.Sum(r => r.ReceivedAmount) >= ret.ReturnTotal;
            await _db.SaveChangesAsync();
            await _audit.LogAsync("PurchaseReturnCreated", "PurchaseReturn", ret.Id, $"Return total: {ret.ReturnTotal}; Initial refund received: {ret.Receives.Sum(r => r.ReceivedAmount)}", User.FindFirstValue(ClaimTypes.NameIdentifier));
            await transaction.CommitAsync();

            await _db.Entry(ret).Collection(r => r.Items).Query()
                .Include(i => i.Product).Include(i => i.Unit).LoadAsync();
            await _db.Entry(ret).Collection(r => r.Receives).LoadAsync();

            return CreatedAtAction(nameof(GetById), new { id = ret.Id }, ToDto(ret));
        }

        // PUT api/purchasereturns/5 — header fields, plus an optional full
        // sync of Receives (send "receives": [...] to replace the set, or
        // omit it to leave receives untouched). Items still only go through
        // the dedicated /items endpoints below.
        [Authorize(Roles = "Admin,Manager")]
        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] PurchaseReturnUpdateDto dto)
        {
            if (await _db.LedgerAccounts.AnyAsync(l => l.SourceType == LedgerSourceType.PurchaseReturn && l.SourceId == id)) return Conflict(new ApiError("Posted purchase returns are immutable."));
            var existing = await _db.PurchaseReturns
                .Include(r => r.Receives)
                .FirstOrDefaultAsync(r => r.Id == id);
            if (existing is null) return NotFound(new ApiError($"Purchase return {id} not found."));

            existing.Reason = dto.Reason;
            existing.IsCompleted = dto.IsCompleted;

            // Receipt fields are optional on update — only overwrite when the
            // caller actually sends a value, so a PUT that omits them doesn't
            // wipe out a receipt attached earlier.
            if (dto.ReceiptImagePath is not null) existing.ReceiptImagePath = dto.ReceiptImagePath;
            if (dto.ReceiptImage is not null) existing.ReceiptImage = dto.ReceiptImage;
            if (dto.ReceiptImageContentType is not null) existing.ReceiptImageContentType = dto.ReceiptImageContentType;

            // Receives: optional full sync. Omit the field entirely (null) to
            // leave existing receives untouched; send a list (even []) to
            // replace the whole set — no Id/unmatched Id => insert, matching
            // Id => update, existing row missing from the payload => delete.
            if (dto.Receives is not null)
            {
                var incomingIds = dto.Receives.Where(r => r.Id is > 0).Select(r => r.Id!.Value).ToHashSet();
                var toRemove = existing.Receives.Where(r => !incomingIds.Contains(r.Id)).ToList();
                foreach (var receiveToRemove in toRemove)
                {
                    _db.PurchaseReturnReceives.Remove(receiveToRemove);
                    existing.Receives.Remove(receiveToRemove);
                }

                foreach (var receiveDto in dto.Receives)
                {
                    var existingReceive = receiveDto.Id is > 0
                        ? existing.Receives.FirstOrDefault(r => r.Id == receiveDto.Id)
                        : null;

                    if (existingReceive is not null)
                    {
                        existingReceive.ReceivedAmount = receiveDto.ReceivedAmount;
                        existingReceive.ReceivedDate = receiveDto.ReceivedDate;
                        existingReceive.Note = receiveDto.Note;
                    }
                    else
                    {
                        existing.Receives.Add(new PurchaseReturnReceive
                        {
                            ReceivedAmount = receiveDto.ReceivedAmount,
                            ReceivedDate = receiveDto.ReceivedDate,
                            Note = receiveDto.Note
                        });
                    }
                }
            }

            await _db.SaveChangesAsync();
            return NoContent();
        }

        // DELETE api/purchasereturns/5 — items and receives cascade-delete
        // with the return (configured OnDelete(Cascade) in PharmacyDbContext).
        [Authorize(Roles = "Admin")]
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var ret = await _db.PurchaseReturns.FirstOrDefaultAsync(r => r.Id == id);
            if (ret is null) return NotFound(new ApiError($"Purchase return {id} not found."));

            _db.PurchaseReturns.Remove(ret); // items + receives cascade-delete with the return
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // POST api/purchasereturns/5/receipt-image — upload/replace the
        // receipt image as an actual file (multipart/form-data). In Postman:
        // Body -> form-data -> key "file", type "File" -> pick an image.
        [Authorize(Roles = "Admin,Manager")]
        [HttpPost("{id:int}/receipt-image")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> UploadReceiptImage(int id, IFormFile file)
        {
            var ret = await _db.PurchaseReturns.FirstOrDefaultAsync(r => r.Id == id);
            if (ret is null) return NotFound(new ApiError($"Purchase return {id} not found."));

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


        // Item-level Add/Update/Remove used to live here as dedicated
        // endpoints. Removed: Add/Update always 400'd anyway (their DTO's
        // ProductId/UnitId/UnitCost are [JsonIgnore] on purpose, so the
        // "does this product exist" check below them could never pass), and
        // none of the three — including Remove — adjusted ProductStocks or
        // the ledger to match, unlike Create() which does both. Correcting a
        // wrong return means deleting it (see Delete() above) and creating a
        // fresh one, not editing a line in place.

        // ---------- Dedicated detail-row endpoints: receives ----------

        // POST api/purchasereturns/5/receives — record a cash refund or confirm supplier credit.
        [HttpPost("{id:int}/receives")]
        public async Task<ActionResult<PurchaseReturnReceiveReadDto>> AddReceive(int id, [FromBody] PurchaseReturnReceiveWriteDto dto)
        {
            var ret = await _db.PurchaseReturns.Include(r => r.Receives).FirstOrDefaultAsync(r => r.Id == id);
            if (ret is null) return NotFound(new ApiError($"Purchase return {id} not found."));
            var alreadyReceived = ret.Receives.Sum(r => r.ReceivedAmount);
            if (dto.ReceivedAmount <= 0 || dto.ReceivedAmount > ret.ReturnTotal - alreadyReceived)
                return BadRequest(new ApiError("Refund or supplier credit must be positive and cannot exceed the remaining supplier credit."));

            PaymentMethod? paymentMethod = null;
            if (dto.PaymentMethod != "Supplier Credit")
            {
                paymentMethod = await _db.PaymentMethods.AsNoTracking()
                    .FirstOrDefaultAsync(method => method.Name == dto.PaymentMethod && method.IsActive);
                if (paymentMethod is null || string.IsNullOrWhiteSpace(paymentMethod.LedgerAccountCode))
                    return BadRequest(new ApiError($"'{dto.PaymentMethod}' is not an active payment method mapped to a ledger account."));
            }

            await using var transaction = await _db.Database.BeginTransactionAsync();
            var receive = new PurchaseReturnReceive
            {
                PurchaseReturnId = id,
                ReceivedAmount = dto.ReceivedAmount,
                ReceivedDate = dto.ReceivedDate,
                PaymentMethod = dto.PaymentMethod,
                ReceivedByUserId = User.FindFirstValue(ClaimTypes.NameIdentifier),
                Note = dto.Note
            };

            _db.PurchaseReturnReceives.Add(receive);
            await _db.SaveChangesAsync();
            if (receive.PaymentMethod != "Supplier Credit")
            {
                await _accounting.PostAsync(LedgerSourceType.PurchaseReturnRefund, receive.Id, receive.ReceivedDate,
                    $"Supplier refund received for purchase return {ret.ReturnNo} — payment method: {paymentMethod!.Name}", (paymentMethod.LedgerAccountCode!, receive.ReceivedAmount, 0), ("2000", 0, receive.ReceivedAmount));
            }
            await _audit.LogAsync("PurchaseReturnSettlementRecorded", "PurchaseReturn", ret.Id, $"Amount: {receive.ReceivedAmount}; Type: {dto.PaymentMethod}", receive.ReceivedByUserId);
            ret.IsCompleted = alreadyReceived + receive.ReceivedAmount >= ret.ReturnTotal;
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();

            return CreatedAtAction(nameof(GetById), new { id }, ReceiveToDto(receive));
        }

        // DELETE api/purchasereturns/5/receives/7 — remove a receive record.
        [Authorize(Roles = "Admin")]
        [HttpDelete("{id:int}/receives/{receiveId:int}")]
        public async Task<IActionResult> RemoveReceive(int id, int receiveId)
        {
            var ret = await _db.PurchaseReturns
                .Include(r => r.Receives)
                .FirstOrDefaultAsync(r => r.Id == id);
            if (ret is null) return NotFound(new ApiError($"Purchase return {id} not found."));
            var receive = ret.Receives.FirstOrDefault(r => r.Id == receiveId);
            if (receive is null) return NotFound(new ApiError($"Receive {receiveId} not found for purchase return {id}."));

            await using var transaction = await _db.Database.BeginTransactionAsync();
            await _accounting.ReversePostingAsync(
                LedgerSourceType.PurchaseReturnRefund,
                receive.Id,
                User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "system");
            _db.PurchaseReturnReceives.Remove(receive);
            ret.IsCompleted = ret.Receives
                .Where(r => r.Id != receiveId)
                .Sum(r => r.ReceivedAmount) >= ret.ReturnTotal;
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();
            return NoContent();
        }

        // Keeps Product.StockQuantity honest — total AvailableQuantity across
        // ALL ProductStock batches for that product. Same convention as
        // SaleReturnsController / SalesController / PurchaseInvoicesController's
        // versions: always recomputed from scratch via SUM, so it self-heals
        // no matter what order things happen in. Callers must SaveChangesAsync
        // separately after this.
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

        private static PurchaseReturnItemReadDto ItemToDto(PurchaseReturnItem i) => new()
        {
            Id = i.Id,
            ProductId = i.ProductId,
            ProductName = i.Product?.ProductName,
            UnitId = i.UnitId,
            UnitName = i.Unit?.Name,
            Quantity = i.Quantity,
            BaseQuantity = i.BaseQuantity,
            UnitCost = i.UnitCost,
            SubTotal = i.SubTotal
        };

        private static PurchaseReturnReceiveReadDto ReceiveToDto(PurchaseReturnReceive r) => new()
        {
            Id = r.Id,
            ReceivedAmount = r.ReceivedAmount,
            ReceivedDate = r.ReceivedDate,
            PaymentMethod = r.PaymentMethod,
            Note = r.Note
        };

        private static PurchaseReturnReadDto ToDto(PurchaseReturn r) => new()
        {
            Id = r.Id,
            ReturnNo = r.ReturnNo,
            ReturnDate = r.ReturnDate,
            PurchaseInvoiceId = r.PurchaseInvoiceId,
            ReturnTotal = r.ReturnTotal,
            Reason = r.Reason,
            IsCompleted = r.IsCompleted,
            ReceiptImagePath = r.ReceiptImagePath,
            ReceiptImage = r.ReceiptImage,
            ReceiptImageContentType = r.ReceiptImageContentType,
            Items = r.Items.Select(ItemToDto).ToList(),
            Receives = r.Receives.Select(ReceiveToDto).ToList()
        };
    }
}
