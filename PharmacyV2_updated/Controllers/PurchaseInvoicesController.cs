using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;
using PharmacyV2.DTOs;
using PharmacyV2.Models.Product;
using PharmacyV2.Models.Payment;
using PharmacyV2.Models.Purchase;
using PharmacyV2.Services;
using PharmacyV2.Enums;

namespace PharmacyV2.Controllers
{
    // The actual recorded purchase (goods received + supplier invoice), as
    // opposed to PurchaseOrder which is the request that preceded it.
    // Master-detail pair: PurchaseInvoice -> PurchaseInvoiceItem.
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class PurchaseInvoicesController : ControllerBase
    {
        private readonly PharmacyDbContext _db;
        private readonly IWebHostEnvironment _env;
        private readonly IAccountingPostingService _accounting;
        private readonly ICodeGeneratorService _codeGenerator;
        private readonly PurchaseOrderReceivingService _receiving;

        private const string PurchaseReceiptImagesRelativeFolder = "images/purchase-receipts";

        public PurchaseInvoicesController(PharmacyDbContext db, IWebHostEnvironment env, IAccountingPostingService accounting, ICodeGeneratorService codeGenerator, PurchaseOrderReceivingService receiving)
        {
            _db = db;
            _env = env;
            _accounting = accounting;
            _codeGenerator = codeGenerator;
            _receiving = receiving;
        }

        private string GetPurchaseReceiptImagesFolderPath()
        {
            string webRoot = _env.WebRootPath;
            if (string.IsNullOrEmpty(webRoot))
            {
                webRoot = Path.Combine(_env.ContentRootPath, "wwwroot");
            }

            string folderPath = Path.Combine(webRoot, "images", "purchase-receipts");

            if (!Directory.Exists(folderPath))
            {
                Directory.CreateDirectory(folderPath);
            }

            return folderPath;
        }

        // GET api/purchaseinvoices?supplierId=3 — list invoices, optionally by supplier.
        [HttpGet]
        public async Task<ActionResult<IEnumerable<PurchaseInvoiceReadDto>>> GetAll([FromQuery] int? supplierId)
        {
            var query = _db.PurchaseInvoices
                .Include(p => p.Supplier).ThenInclude(s => s.Company)
                .Include(p => p.Warehouse)
                .Include(p => p.Items).ThenInclude(i => i.Product)
                .Include(p => p.Items).ThenInclude(i => i.Unit)
                .AsNoTracking().AsQueryable();
            if (supplierId is not null) query = query.Where(p => p.SupplierId == supplierId);

            var invoices = await query
                .OrderByDescending(p => p.PurchaseDate)
                .ThenByDescending(p => p.Id)
                .ToListAsync();
            var paymentMethods = await LoadPaymentMethodsAsync(invoices);
            return Ok(invoices.Select(invoice => ToDto(invoice, paymentMethods[invoice.Id])));
        }

        // GET api/purchaseinvoices/5
        [HttpGet("{id:int}")]
        public async Task<ActionResult<PurchaseInvoiceReadDto>> GetById(int id)
        {
            var invoice = await _db.PurchaseInvoices
                .Include(p => p.Supplier).ThenInclude(s => s.Company)
                .Include(p => p.Warehouse)
                .Include(p => p.Items).ThenInclude(i => i.Product)
                .Include(p => p.Items).ThenInclude(i => i.Unit)
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.Id == id);
            if (invoice is null) return NotFound(new ApiError($"Purchase invoice {id} not found."));
            var paymentMethods = await LoadPaymentMethodsAsync(new[] { invoice });
            return Ok(ToDto(invoice, paymentMethods[invoice.Id]));
        }

        // POST api/purchaseinvoices — record a new purchase, header + line
        // items in one call (same convention as PurchaseOrders). InvoiceNo
        // must be unique; Supplier, Warehouse and each item's Product/Unit
        // must already exist. Due is computed as Total - Advance - Discount +
        // TaxOrOthers if the caller doesn't set it explicitly. Each item's
        // SubTotal is always computed server-side as ReceivedQty * UnitCost.
        [Authorize(Roles = "Admin,Manager")]
        [HttpPost]
        public async Task<ActionResult<PurchaseInvoiceReadDto>> Create([FromBody] PurchaseInvoiceCreateDto dto)
        {
            var generatedInvoiceNo = await _codeGenerator.GeneratePurchaseInvoiceNoAsync();

            if (!IsValidReceivingStatus(dto.ReceivingStatus))
                return BadRequest(new ApiError("Receiving status must be Completed or Partially Received."));

            var initialPaymentMethod = await GetActivePaymentMethodAsync(dto.PaymentMethod);
            if (initialPaymentMethod is null)
                return BadRequest(new ApiError($"'{dto.PaymentMethod}' is not an active payment method."));
            if (string.IsNullOrWhiteSpace(initialPaymentMethod.LedgerAccountCode))
                return BadRequest(new ApiError($"Payment method '{dto.PaymentMethod}' has no ledger account configured."));

            if (dto.SupplierId is not null && !await _db.Suppliers.AnyAsync(s => s.SupplierId == dto.SupplierId))
                return BadRequest(new ApiError($"Supplier {dto.SupplierId} does not exist."));

            if (!await _db.Warehouses.AnyAsync(w => w.Id == dto.WarehouseId))
                return BadRequest(new ApiError($"Warehouse {dto.WarehouseId} does not exist."));

            PurchaseOrder? sourceOrderToConvert = null;
            if (dto.PurchaseOrderId is int purchaseOrderId)
            {
                var sourceOrder = await _db.PurchaseOrders.FirstOrDefaultAsync(o => o.Id == purchaseOrderId);
                if (sourceOrder is null)
                    return BadRequest(new ApiError($"Purchase order {purchaseOrderId} does not exist."));

                var effectiveStatus = await _receiving.GetEffectiveStatusAsync(sourceOrder);
                if (effectiveStatus != PurchaseOrderStatus.Checked)
                    return BadRequest(new ApiError("Only checked purchase orders can be invoiced."));

                var quantityError = await _receiving.ValidateIncomingAsync(
                    purchaseOrderId,
                    (dto.Items ?? new()).Select(i => (i.ProductId, i.UnitId, i.ReceivedQty)));
                if (quantityError is not null) return BadRequest(new ApiError(quantityError));
                sourceOrderToConvert = sourceOrder;
            }

            if (dto.Items is { Count: > 0 })
            {
                var seenKeys = new HashSet<(int ProductId, string BatchNumber)>();
                foreach (var itemDto in dto.Items)
                {
                    var dateError = ValidateManufacturingDate(itemDto.ManufacturingDate, itemDto.ExpiryDate);
                    if (dateError is not null)
                        return BadRequest(new ApiError($"Product {itemDto.ProductId}: {dateError}"));

                    if (string.IsNullOrWhiteSpace(itemDto.BatchNumber)) continue;

                    var key = (itemDto.ProductId, itemDto.BatchNumber!);
                    if (!seenKeys.Add(key))
                        return BadRequest(new ApiError(
                            $"Duplicate line items for product {itemDto.ProductId} with batch number '{itemDto.BatchNumber}' — a batch number must be unique per product."));

                    if (await _db.ProductStocks.AnyAsync(s => s.ProductId == itemDto.ProductId && s.BatchNumber == itemDto.BatchNumber))
                        return Conflict(new ApiError(
                            $"Batch number '{itemDto.BatchNumber}' is already in use for product {itemDto.ProductId}. " +
                            "Each batch number must be unique per product — use a different batch number, or omit it to have one generated automatically."));
                }
            }

            await using var transaction = await _db.Database.BeginTransactionAsync();

            var invoice = new PurchaseInvoice
            {
                InvoiceNo = generatedInvoiceNo,
                PurchaseDate = dto.PurchaseDate,
                SupplierId = dto.SupplierId,
                PurchaseOrderId = dto.PurchaseOrderId,
                WarehouseId = dto.WarehouseId,
                PaymentMethod = dto.PaymentMethod,
                Advance = dto.Advance,
                Total = dto.Total,
                Discount = dto.Discount,
                TaxOrOthers = dto.TaxOrOthers,
                ReceivingStatus = dto.ReceivingStatus,
                IsSupplierWise = dto.IsSupplierWise,
                CreatedAt = DateTime.UtcNow
            };

            if (dto.Items is { Count: > 0 })
            {
                var orderedQtyPool = await LoadOrderedQtyPoolAsync(dto.PurchaseOrderId);

                foreach (var itemDto in dto.Items)
                {
                    if (!await _db.Products.AnyAsync(p => p.Id == itemDto.ProductId))
                        return BadRequest(new ApiError($"Product {itemDto.ProductId} does not exist."));
                    if (!await _db.Units.AnyAsync(u => u.Id == itemDto.UnitId))
                        return BadRequest(new ApiError($"Unit {itemDto.UnitId} does not exist."));

                    invoice.Items.Add(new PurchaseInvoiceItem
                    {
                        ProductId = itemDto.ProductId,
                        UnitId = itemDto.UnitId,
                        ReceivedQty = itemDto.ReceivedQty,
                        OrderedQty = ConsumeOrderedQty(orderedQtyPool, itemDto.ProductId, itemDto.UnitId),
                        UnitCost = itemDto.UnitCost,
                        SubTotal = itemDto.ReceivedQty * itemDto.UnitCost,
                        BatchNumber = string.IsNullOrWhiteSpace(itemDto.BatchNumber)
                            ? await _codeGenerator.GenerateBatchNumberAsync()
                            : itemDto.BatchNumber,
                        ExpiryDate = itemDto.ExpiryDate,
                        ManufacturingDate = itemDto.ManufacturingDate
                    });
                }
            }

            invoice.Total = invoice.Items.Count > 0
                ? invoice.Items.Sum(i => i.SubTotal) - invoice.Discount + invoice.TaxOrOthers
                : invoice.Total - invoice.Discount + invoice.TaxOrOthers;
            invoice.Due = Math.Max(0, invoice.Total - invoice.Advance);
            invoice.PaymentStatus = invoice.Due <= 0 ? "Complete" : "InComplete";

            // Linking a checked purchase order to its first invoice converts it
            // automatically. Receipt and payment progress remain invoice data.
            if (sourceOrderToConvert is not null)
                sourceOrderToConvert.Status = PurchaseOrderStatus.Converted;

            _db.PurchaseInvoices.Add(invoice);
            await _db.SaveChangesAsync();

            var affectedProductIds = invoice.Items.Select(i => i.ProductId).ToList();

            foreach (var item in invoice.Items)
                await UpsertSupplierProductFromInvoiceItemAsync(invoice.SupplierId, item, invoice.PurchaseDate);
            await _db.SaveChangesAsync();

            await RecalculatePurchaseQtyAsync(affectedProductIds);

            foreach (var item in invoice.Items)
                await SyncStockBatchForItemAsync(item, invoice);
            await _db.SaveChangesAsync();

            await RecalculateStockQuantityAsync(affectedProductIds);
            await _db.SaveChangesAsync();

            var payable = Math.Max(0, invoice.Due);
            var paid = Math.Min(invoice.Advance, invoice.Total);
            await _accounting.PostAsync(LedgerSourceType.Purchase, invoice.Id, invoice.PurchaseDate, $"Purchase {invoice.InvoiceNo} — payment method: {initialPaymentMethod.Name}",
                ("1200", invoice.Total, 0), (initialPaymentMethod.LedgerAccountCode, 0, paid), ("2000", 0, payable));
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();

            // Local variable so the compiler can correctly narrow it as
            // non-null inside the `if` below — re-reading the `invoice.Supplier`
            // property directly here would trigger CS8602 (possibly null
            // reference) even right after the LoadAsync() call above.
            await _db.Entry(invoice).Reference(i => i.Supplier).LoadAsync();
            var supplier = invoice.Supplier;
            if (supplier?.CompanyId is not null)
                await _db.Entry(supplier).Reference(s => s.Company).LoadAsync();
            await _db.Entry(invoice).Reference(i => i.Warehouse).LoadAsync();
            await _db.Entry(invoice).Collection(i => i.Items).Query()
                .Include(i => i.Product).Include(i => i.Unit).LoadAsync();

            return CreatedAtAction(nameof(GetById), new { id = invoice.Id }, ToDto(invoice));
        }

        // PUT api/purchaseinvoices/5 — metadata-only edit. Supplier,
        // warehouse, purchase date, and each line's product/unit/batch/
        // expiry/manufacturing date can be changed. Received qty, unit cost,
        // discount, advance, tax/other, payment method, and adding/removing
        // line items are rejected (409) if the request tries to change
        // them — this invoice's postings stay exactly as originally booked.
        // Open to any authenticated user (same as the rest of this
        // controller — no extra role requirement).
        [Authorize(Roles = "Admin,Manager")]
        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] PurchaseInvoiceUpdateDto dto)
            => await UpdateCoreAsync(id, dto, allowMoneyChanges: false);

        // PUT api/purchaseinvoices/5/full-edit — same as above, but money
        // fields are allowed too: quantity, unit cost, discount, advance,
        // tax/other, payment method, and adding/removing line items. If the
        // edit changes Total, Advance, or PaymentMethod, the invoice's
        // original ledger posting is reversed and a fresh one is posted for
        // the new numbers (see AccountingPostingService.ReversePostingAsync)
        // — nothing is deleted or edited in place, the original lines stay
        // for audit, just flagged IsReversed.
        // Admin-only: this is the endpoint that can rewrite an invoice's
        // financials after it's been posted, so it needs the "Admin" role
        // claim in the caller's JWT (see TokenService — issued automatically
        // for any user whose AppUser.Role is "Admin"). A non-admin token
        // gets a 403 Forbidden before this method body even runs.
        [Authorize(Roles = "Admin")]
        [HttpPut("{id:int}/full-edit")]
        public async Task<IActionResult> UpdateFull(int id, [FromBody] PurchaseInvoiceUpdateDto dto)
            => await UpdateCoreAsync(id, dto, allowMoneyChanges: true);

        private async Task<IActionResult> UpdateCoreAsync(int id, PurchaseInvoiceUpdateDto dto, bool allowMoneyChanges)
        {
            var existing = await _db.PurchaseInvoices.Include(p => p.Items).FirstOrDefaultAsync(p => p.Id == id);
            if (existing is null) return NotFound(new ApiError($"Purchase invoice {id} not found."));

            if (dto.SupplierId is not null && !await _db.Suppliers.AnyAsync(s => s.SupplierId == dto.SupplierId))
                return BadRequest(new ApiError($"Supplier {dto.SupplierId} does not exist."));

            if (!await _db.Warehouses.AnyAsync(w => w.Id == dto.WarehouseId))
                return BadRequest(new ApiError($"Warehouse {dto.WarehouseId} does not exist."));

            PaymentMethod? initialPaymentMethod = null;
            if (allowMoneyChanges)
            {
                initialPaymentMethod = await GetActivePaymentMethodAsync(dto.PaymentMethod);
                if (initialPaymentMethod is null)
                    return BadRequest(new ApiError($"'{dto.PaymentMethod}' is not an active payment method."));
                if (string.IsNullOrWhiteSpace(initialPaymentMethod.LedgerAccountCode))
                    return BadRequest(new ApiError($"Payment method '{dto.PaymentMethod}' has no ledger account configured."));
            }

            // Checked BEFORE any mutation below, so a rejected request
            // leaves the invoice completely untouched.
            if (!allowMoneyChanges)
            {
                var moneyFieldChanged =
                    dto.Advance != existing.Advance ||
                    dto.Discount != existing.Discount ||
                    dto.TaxOrOthers != existing.TaxOrOthers ||
                    dto.PaymentMethod != existing.PaymentMethod;

                if (dto.Items is null)
                {
                    if (dto.Total != existing.Total) moneyFieldChanged = true;
                }
                else
                {
                    var incomingWithId = dto.Items.Where(i => i.Id is > 0).ToList();
                    var addingOrRemovingLines =
                        dto.Items.Any(i => i.Id is null or 0) ||
                        incomingWithId.Count != existing.Items.Count;

                    if (addingOrRemovingLines)
                    {
                        moneyFieldChanged = true;
                    }
                    else
                    {
                        var existingById = existing.Items.ToDictionary(i => i.Id);
                        foreach (var itemDto in incomingWithId)
                        {
                            if (!existingById.TryGetValue(itemDto.Id!.Value, out var existingItem) ||
                                itemDto.ReceivedQty != existingItem.ReceivedQty ||
                                itemDto.UnitCost != existingItem.UnitCost)
                            {
                                moneyFieldChanged = true;
                                break;
                            }
                        }
                    }
                }

                if (moneyFieldChanged)
                {
                    return Conflict(new ApiError(
                        "This invoice's amounts are locked: received quantity, unit cost, discount, advance, tax/other, " +
                        "payment method, and adding/removing line items can't be changed on this endpoint — use " +
                        "PUT /api/purchaseinvoices/{id}/full-edit instead (Admin role required). Supplier, " +
                        "warehouse, purchase date, product/unit selection, batch number, expiry date, and " +
                        "manufacturing date can still be edited here."));
                }
            }

            if (dto.ReceivingStatus is not null && !IsValidReceivingStatus(dto.ReceivingStatus))
                return BadRequest(new ApiError("Receiving status must be Completed or Partially Received."));

            if (existing.PurchaseOrderId is int linkedOrderId && dto.Items is not null)
            {
                var quantityError = await _receiving.ValidateIncomingAsync(
                    linkedOrderId,
                    dto.Items.Select(i => (i.ProductId, i.UnitId, i.ReceivedQty)),
                    excludingInvoiceId: id);
                if (quantityError is not null) return BadRequest(new ApiError(quantityError));
            }

            // Only relevant when allowMoneyChanges is true — captured here,
            // before mutation, so the ledger reconciliation block near the
            // end of this method knows what actually changed.
            var previousTotal = existing.Total;
            var previousAdvance = existing.Advance;
            var previousPaymentMethod = existing.PaymentMethod;

            existing.PurchaseDate = dto.PurchaseDate;
            existing.SupplierId = dto.SupplierId;
            existing.WarehouseId = dto.WarehouseId;
            existing.Advance = dto.Advance;
            existing.Discount = dto.Discount;
            existing.TaxOrOthers = dto.TaxOrOthers;
            existing.PaymentMethod = dto.PaymentMethod;
            if (dto.ReceivingStatus is not null)
                existing.ReceivingStatus = dto.ReceivingStatus;

            var affectedProductIds = new HashSet<int>();

            if (dto.Items is not null)
            {
                foreach (var itemDto in dto.Items)
                {
                    if (!await _db.Products.AnyAsync(p => p.Id == itemDto.ProductId))
                        return BadRequest(new ApiError($"Product {itemDto.ProductId} does not exist."));
                    if (!await _db.Units.AnyAsync(u => u.Id == itemDto.UnitId))
                        return BadRequest(new ApiError($"Unit {itemDto.UnitId} does not exist."));

                    var dateError = ValidateManufacturingDate(itemDto.ManufacturingDate, itemDto.ExpiryDate);
                    if (dateError is not null)
                        return BadRequest(new ApiError($"Product {itemDto.ProductId}: {dateError}"));
                }

                var incomingIds = dto.Items.Where(i => i.Id is > 0).Select(i => i.Id!.Value).ToHashSet();

                var resolvedKeys = new HashSet<(int ProductId, string BatchNumber)>();
                foreach (var itemDto in dto.Items)
                {
                    var existingMatch = itemDto.Id is > 0
                        ? existing.Items.FirstOrDefault(i => i.Id == itemDto.Id)
                        : null;
                    var effectiveBatch = string.IsNullOrWhiteSpace(itemDto.BatchNumber)
                        ? $"{existing.InvoiceNo}-{(existingMatch?.Id.ToString() ?? "new")}"
                        : itemDto.BatchNumber;
                    var key = (itemDto.ProductId, effectiveBatch);

                    if (!string.IsNullOrWhiteSpace(itemDto.BatchNumber) && !resolvedKeys.Add(key))
                    {
                        return BadRequest(new ApiError(
                            $"Duplicate line items for product {itemDto.ProductId} with batch number '{itemDto.BatchNumber}' — a batch number must be unique per product."));
                    }
                }

                var plannedRemovalIds = existing.Items
                    .Where(i => !incomingIds.Contains(i.Id))
                    .Select(i => i.Id)
                    .ToHashSet();

                foreach (var itemDto in dto.Items.Where(i => !string.IsNullOrWhiteSpace(i.BatchNumber)))
                {
                    var conflicting = await _db.ProductStocks.FirstOrDefaultAsync(s =>
                        s.ProductId == itemDto.ProductId && s.BatchNumber == itemDto.BatchNumber);

                    if (conflicting is null) continue;

                    var owningItem = conflicting.PurchaseInvoiceId == id
                        ? existing.Items.FirstOrDefault(i =>
                            i.ProductId == conflicting.ProductId &&
                            ResolveBatchNumber(i, existing.InvoiceNo) == conflicting.BatchNumber)
                        : null;

                    var isSelf = owningItem is not null && itemDto.Id is > 0 && owningItem.Id == itemDto.Id;
                    var isBeingRemoved = owningItem is not null && plannedRemovalIds.Contains(owningItem.Id);

                    if (!isSelf && !isBeingRemoved)
                    {
                        return Conflict(new ApiError(
                            $"Batch number '{itemDto.BatchNumber}' is already in use for product {itemDto.ProductId} (invoice {conflicting.PurchaseInvoiceId}). Batch numbers must be unique per product."));
                    }
                }

                var toRemove = existing.Items.Where(i => !incomingIds.Contains(i.Id)).ToList();
                foreach (var item in toRemove)
                {
                    var batchNumber = ResolveBatchNumber(item, existing.InvoiceNo);
                    var stock = await _db.ProductStocks.FirstOrDefaultAsync(s =>
                        s.ProductId == item.ProductId && s.BatchNumber == batchNumber && s.PurchaseInvoiceId == id);

                    if (stock is not null)
                    {
                        if (stock.AvailableQuantity < stock.Quantity)
                        {
                            return Conflict(new ApiError(
                                $"Cannot remove line item {item.Id} — {stock.Quantity - stock.AvailableQuantity} unit(s) from batch '{stock.BatchNumber}' have already been sold or transferred out."));
                        }
                        _db.ProductStocks.Remove(stock);
                    }

                    affectedProductIds.Add(item.ProductId);
                    _db.PurchaseInvoiceItems.Remove(item);
                    existing.Items.Remove(item);
                }

                if (toRemove.Count > 0)
                    await _db.SaveChangesAsync();

                // Recomputed fresh from the order on every full sync (rather than
                // left as whatever was snapshotted before) so OrderedQty stays
                // correct if items were reordered, added, or removed — the whole
                // point of this endpoint. Consumed in the same pass across the
                // updated-existing items followed by the new items below, so one
                // order line is never snapshotted onto two invoice lines.
                var orderedQtyPool = await LoadOrderedQtyPoolAsync(existing.PurchaseOrderId);

                foreach (var itemDto in dto.Items.Where(i => i.Id is > 0))
                {
                    var item = existing.Items.FirstOrDefault(i => i.Id == itemDto.Id);
                    if (item is null) continue;

                    var oldProductId = item.ProductId;
                    var oldBatchNumber = ResolveBatchNumber(item, existing.InvoiceNo);

                    item.ProductId = itemDto.ProductId;
                    item.UnitId = itemDto.UnitId;
                    item.ReceivedQty = itemDto.ReceivedQty;
                    item.OrderedQty = ConsumeOrderedQty(orderedQtyPool, itemDto.ProductId, itemDto.UnitId);
                    item.UnitCost = itemDto.UnitCost;
                    item.SubTotal = itemDto.ReceivedQty * itemDto.UnitCost;
                    if (!string.IsNullOrWhiteSpace(itemDto.BatchNumber))
                        item.BatchNumber = itemDto.BatchNumber;
                    item.ExpiryDate = itemDto.ExpiryDate;
                    item.ManufacturingDate = itemDto.ManufacturingDate;

                    affectedProductIds.Add(oldProductId);
                    affectedProductIds.Add(item.ProductId);

                    await SyncStockBatchForItemAsync(item, existing, oldProductId, oldBatchNumber);
                }

                var newItems = new List<PurchaseInvoiceItem>();
                foreach (var itemDto in dto.Items.Where(i => i.Id is null or 0))
                {
                    var newItem = new PurchaseInvoiceItem
                    {
                        ProductId = itemDto.ProductId,
                        UnitId = itemDto.UnitId,
                        ReceivedQty = itemDto.ReceivedQty,
                        OrderedQty = ConsumeOrderedQty(orderedQtyPool, itemDto.ProductId, itemDto.UnitId),
                        UnitCost = itemDto.UnitCost,
                        SubTotal = itemDto.ReceivedQty * itemDto.UnitCost,
                        BatchNumber = string.IsNullOrWhiteSpace(itemDto.BatchNumber)
                            ? await _codeGenerator.GenerateBatchNumberAsync()
                            : itemDto.BatchNumber,
                        ExpiryDate = itemDto.ExpiryDate,
                        ManufacturingDate = itemDto.ManufacturingDate
                    };
                    existing.Items.Add(newItem);
                    newItems.Add(newItem);
                    affectedProductIds.Add(newItem.ProductId);
                }

                if (newItems.Count > 0)
                {
                    await _db.SaveChangesAsync();
                    foreach (var newItem in newItems)
                        await SyncStockBatchForItemAsync(newItem, existing);
                }

                existing.Total = existing.Items.Sum(i => i.SubTotal) - existing.Discount + existing.TaxOrOthers;
            }
            else
            {
                existing.Total = dto.Total;
            }

            var paidViaAllocations = await _db.SupplierPaymentDetails
                .Where(d => d.PurchaseInvoiceId == id && !d.SupplierPayment.IsCancelled)
                .SumAsync(d => (decimal?)d.PaidAmount) ?? 0m;
            existing.Due = Math.Max(0, existing.Total - existing.Advance - paidViaAllocations);
            existing.PaymentStatus = existing.Due <= 0 ? "Complete" : "InComplete";

            await _db.SaveChangesAsync();

            foreach (var item in existing.Items)
                await UpsertSupplierProductFromInvoiceItemAsync(existing.SupplierId, item, existing.PurchaseDate);
            await _db.SaveChangesAsync();

            if (affectedProductIds.Count > 0)
            {
                await RecalculatePurchaseQtyAsync(affectedProductIds);
                await RecalculateStockQuantityAsync(affectedProductIds);
                await _db.SaveChangesAsync();
            }

            // Keep the ledger in sync with the edit: reverse the invoice's
            // old posting and post a fresh one for the current totals,
            // whenever Total, Advance, or PaymentMethod actually changed.
            // Nothing is deleted or edited in place — the original lines
            // stay for audit, just flagged IsReversed. Only relevant for
            // the full-edit endpoint — the metadata-only endpoint already
            // rejected the request above if any of these would've changed.
            if (allowMoneyChanges &&
                (existing.Total != previousTotal ||
                 existing.Advance != previousAdvance ||
                 existing.PaymentMethod != previousPaymentMethod))
            {
                await _accounting.ReversePostingAsync(LedgerSourceType.Purchase, id, User.Identity?.Name ?? "system");

                var initialPaid = Math.Min(existing.Advance, existing.Total);
                var payable = Math.Max(0, existing.Total - initialPaid);
                await _accounting.PostAsync(LedgerSourceType.Purchase, id, existing.PurchaseDate, $"Purchase {existing.InvoiceNo} (edited) — payment method: {initialPaymentMethod!.Name}",
                    ("1200", existing.Total, 0), (initialPaymentMethod!.LedgerAccountCode!, 0, initialPaid), ("2000", 0, payable));
                await _db.SaveChangesAsync();
            }

            return NoContent();
        }

        // DELETE api/purchaseinvoices/5
        // Deletes the invoice and everything it created, all in one
        // transaction: its stock batches, its ledger entries (removed
        // outright, including any earlier edit/reversal rows), and its share
        // of any supplier payment vouchers.
        // Still refused when the goods can no longer be taken back out of
        // stock (units already sold/transferred) or a purchase return exists.
        [Authorize(Roles = "Admin")]
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var invoice = await _db.PurchaseInvoices.Include(p => p.Items).FirstOrDefaultAsync(p => p.Id == id);
            if (invoice is null) return NotFound(new ApiError($"Purchase invoice {id} not found."));

            if (await _db.PurchaseReturns.AnyAsync(r => r.PurchaseInvoiceId == id))
                return Conflict(new ApiError("Cannot delete this invoice — a purchase return has been recorded against it."));

            var batches = await _db.ProductStocks
                .Where(s => s.PurchaseInvoiceId == id)
                .ToListAsync();

            var partiallyConsumed = batches.Where(s => s.AvailableQuantity < s.Quantity).ToList();
            if (partiallyConsumed.Count > 0)
            {
                var batchList = string.Join(", ", partiallyConsumed.Select(s => s.BatchNumber));
                return Conflict(new ApiError(
                    $"Cannot delete this invoice — batch(es) {batchList} already have units sold or transferred out."));
            }

            var allocations = await _db.SupplierPaymentDetails
                .Include(d => d.SupplierPayment)
                .Where(d => d.PurchaseInvoiceId == id)
                .ToListAsync();

            var affectedProductIds = invoice.Items.Select(i => i.ProductId).Distinct().ToList();
            var receiptPath = invoice.ReceiptImagePath;
            var touchedAccountIds = new HashSet<int>();

            await using var transaction = await _db.Database.BeginTransactionAsync();

            // 1) Take this invoice's share out of each supplier payment voucher.
            //    A voucher posts one ledger entry for its whole total, so remove
            //    it, drop this invoice's allocation(s), and re-post what remains.
            foreach (var group in allocations.GroupBy(d => d.SupplierPaymentId))
            {
                var payment = group.First().SupplierPayment;
                var removed = group.ToList();

                var paymentRows = await _db.LedgerAccounts
                    .Where(l => l.SourceType == LedgerSourceType.SupplierPayment && l.SourceId == payment.Id)
                    .ToListAsync();
                touchedAccountIds.UnionWith(paymentRows.Select(l => l.ChartOfAccountId));
                _db.LedgerAccounts.RemoveRange(paymentRows);

                var paymentAccountCode = await _db.PaymentMethods.AsNoTracking()
                    .Where(method => method.Name == payment.PaymentMethod)
                    .Select(method => method.LedgerAccountCode)
                    .FirstOrDefaultAsync();
                if (string.IsNullOrWhiteSpace(paymentAccountCode) && paymentRows.Any(row => row.CreditAmount > 0))
                {
                    var priorCreditAccountId = paymentRows.First(row => row.CreditAmount > 0).ChartOfAccountId;
                    paymentAccountCode = await _db.ChartOfAccounts.AsNoTracking()
                        .Where(account => account.Id == priorCreditAccountId)
                        .Select(account => account.Code)
                        .FirstOrDefaultAsync();
                }

                payment.TotalAmount -= removed.Sum(d => d.PaidAmount);
                _db.SupplierPaymentDetails.RemoveRange(removed);
                if (payment.TotalAmount <= 0) payment.IsCancelled = true; // nothing left on this voucher
                await _db.SaveChangesAsync();

                if (!payment.IsCancelled && payment.TotalAmount > 0)
                {
                    if (string.IsNullOrWhiteSpace(paymentAccountCode))
                        return Conflict(new ApiError($"Payment method '{payment.PaymentMethod}' has no ledger account configured; invoice cannot be deleted safely."));

                    await _accounting.PostAsync(LedgerSourceType.SupplierPayment, payment.Id, payment.PaidDate,
                        $"Supplier payment {payment.PaidNo} — payment method: {payment.PaymentMethod}",
                        ("2000", payment.TotalAmount, 0), (paymentAccountCode, 0, payment.TotalAmount));
                    await _db.SaveChangesAsync();
                }
            }

            // 2) Delete the purchase's own ledger entries (original and any
            //    earlier reversal rows from edits).
            var purchaseRows = await _db.LedgerAccounts
                .Where(l => l.SourceType == LedgerSourceType.Purchase && l.SourceId == id)
                .ToListAsync();
            touchedAccountIds.UnionWith(purchaseRows.Select(l => l.ChartOfAccountId));
            _db.LedgerAccounts.RemoveRange(purchaseRows);

            // 3) Remove stock batches and the invoice itself.
            _db.ProductStocks.RemoveRange(batches);
            _db.PurchaseInvoices.Remove(invoice);
            await _db.SaveChangesAsync();

            await RecalculatePurchaseQtyAsync(affectedProductIds);
            await RecalculateStockQuantityAsync(affectedProductIds);
            await _db.SaveChangesAsync();

            // Rebuild running balances now that rows are gone.
            await _accounting.RecalculateRunningBalancesAsync(touchedAccountIds);

            await transaction.CommitAsync();

            // Only delete the receipt file once everything above has committed.
            DeleteReceiptImageFile(receiptPath);
            return NoContent();
        }

        [Authorize(Roles = "Admin,Manager")]
        [HttpPost("{id:int}/receipt-image")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> UploadReceiptImage(int id, IFormFile file)
        {
            var invoice = await _db.PurchaseInvoices.FirstOrDefaultAsync(p => p.Id == id);
            if (invoice is null) return NotFound(new ApiError($"Purchase invoice {id} not found."));

            if (file is null || file.Length == 0)
                return BadRequest(new ApiError("No file was uploaded. Send it as form-data with key 'file'."));

            string extension = Path.GetExtension(file.FileName);
            if (string.IsNullOrWhiteSpace(extension))
                extension = ".jpg";

            string[] allowedExtensions = { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp" };
            bool isAllowed = false;
            foreach (var allowedExtension in allowedExtensions)
            {
                if (string.Equals(extension, allowedExtension, StringComparison.OrdinalIgnoreCase))
                {
                    isAllowed = true;
                    break;
                }
            }
            if (!isAllowed)
                return BadRequest(new ApiError("Unsupported image type. Allowed: jpg, jpeg, png, gif, webp, bmp."));

            byte[] fileBytes;
            using (var ms = new MemoryStream())
            {
                await file.CopyToAsync(ms);
                fileBytes = ms.ToArray();
            }

            string folderPath = GetPurchaseReceiptImagesFolderPath();
            string shortGuid = Guid.NewGuid().ToString("N").Substring(0, 8);
            string fileName = id + "_" + shortGuid + extension;
            string fullFilePath = Path.Combine(folderPath, fileName);

            await System.IO.File.WriteAllBytesAsync(fullFilePath, fileBytes);

            DeleteReceiptImageFile(invoice.ReceiptImagePath);

            invoice.ReceiptImage = null;
            invoice.ReceiptImageContentType = file.ContentType;
            invoice.ReceiptImagePath = "/" + PurchaseReceiptImagesRelativeFolder + "/" + fileName;

            await _db.SaveChangesAsync();
            return Ok(new { invoice.Id, invoice.ReceiptImagePath });
        }

        [Authorize(Roles = "Admin,Manager")]
        [HttpDelete("{id:int}/receipt-image")]
        public async Task<IActionResult> DeleteReceiptImage(int id)
        {
            var invoice = await _db.PurchaseInvoices.FirstOrDefaultAsync(p => p.Id == id);
            if (invoice is null) return NotFound(new ApiError($"Purchase invoice {id} not found."));

            DeleteReceiptImageFile(invoice.ReceiptImagePath);

            invoice.ReceiptImagePath = null;
            invoice.ReceiptImage = null;
            invoice.ReceiptImageContentType = null;

            await _db.SaveChangesAsync();
            return NoContent();
        }

        [Authorize(Roles = "Admin,Manager")]
        [HttpPost("{id:int}/items")]
        public async Task<ActionResult<PurchaseInvoiceItemReadDto>> AddItem(int id, [FromBody] PurchaseInvoiceItemWriteDto dto)
        {
            var invoice = await _db.PurchaseInvoices.Include(p => p.Items).FirstOrDefaultAsync(p => p.Id == id);
            if (invoice is null) return NotFound(new ApiError($"Purchase invoice {id} not found."));

            if (!await _db.Products.AnyAsync(p => p.Id == dto.ProductId))
                return BadRequest(new ApiError($"Product {dto.ProductId} does not exist."));
            if (!await _db.Units.AnyAsync(u => u.Id == dto.UnitId))
                return BadRequest(new ApiError($"Unit {dto.UnitId} does not exist."));

            var manufacturingDateError = ValidateManufacturingDate(dto.ManufacturingDate, dto.ExpiryDate);
            if (manufacturingDateError is not null)
                return BadRequest(new ApiError(manufacturingDateError));

            if (!string.IsNullOrWhiteSpace(dto.BatchNumber) &&
                await _db.ProductStocks.AnyAsync(s => s.ProductId == dto.ProductId && s.BatchNumber == dto.BatchNumber))
            {
                return Conflict(new ApiError(
                    $"Batch number '{dto.BatchNumber}' is already in use for product {dto.ProductId}. " +
                    "Each batch number must be unique per product — use a different batch number, or omit it to have one generated automatically."));
            }

            var orderedQtyPool = await LoadOrderedQtyPoolAsync(invoice.PurchaseOrderId);
            // Reconstruct pool state past this invoice's existing items (in the
            // same order they were originally consumed) before matching the new
            // one, so an order line already snapshotted onto an existing line
            // isn't handed out again here.
            foreach (var existingItem in invoice.Items)
                ConsumeOrderedQty(orderedQtyPool, existingItem.ProductId, existingItem.UnitId);

            if (invoice.PurchaseOrderId is int purchaseOrderId)
            {
                var quantityError = await _receiving.ValidateIncomingAsync(
                    purchaseOrderId,
                    invoice.Items.Select(i => (i.ProductId, i.UnitId, i.ReceivedQty))
                        .Append((dto.ProductId, dto.UnitId, dto.ReceivedQty)),
                    excludingInvoiceId: id);
                if (quantityError is not null) return BadRequest(new ApiError(quantityError));
            }

            var item = new PurchaseInvoiceItem
            {
                PurchaseInvoiceId = id,
                ProductId = dto.ProductId,
                UnitId = dto.UnitId,
                ReceivedQty = dto.ReceivedQty,
                OrderedQty = ConsumeOrderedQty(orderedQtyPool, dto.ProductId, dto.UnitId),
                UnitCost = dto.UnitCost,
                SubTotal = dto.ReceivedQty * dto.UnitCost,
                BatchNumber = string.IsNullOrWhiteSpace(dto.BatchNumber)
                    ? await _codeGenerator.GenerateBatchNumberAsync()
                    : dto.BatchNumber,
                ExpiryDate = dto.ExpiryDate,
                ManufacturingDate = dto.ManufacturingDate
            };

            invoice.Items.Add(item);
            await RecalculateTotalsAsync(invoice);
            await _db.SaveChangesAsync();

            await RecalculatePurchaseQtyAsync(new[] { item.ProductId });

            await SyncStockBatchForItemAsync(item, invoice);
            await _db.SaveChangesAsync();

            await RecalculateStockQuantityAsync(new[] { item.ProductId });
            await _db.SaveChangesAsync();

            await _db.Entry(item).Reference(i => i.Product).LoadAsync();
            await _db.Entry(item).Reference(i => i.Unit).LoadAsync();

            return CreatedAtAction(nameof(GetById), new { id }, ItemToDto(item));
        }

        [Authorize(Roles = "Admin,Manager")]
        [HttpPut("{id:int}/items/{itemId:int}")]
        public async Task<IActionResult> UpdateItem(int id, int itemId, [FromBody] PurchaseInvoiceItemWriteDto dto)
        {
            var invoice = await _db.PurchaseInvoices.Include(p => p.Items).FirstOrDefaultAsync(p => p.Id == id);
            if (invoice is null) return NotFound(new ApiError($"Purchase invoice {id} not found."));

            var item = invoice.Items.FirstOrDefault(i => i.Id == itemId);
            if (item is null) return NotFound(new ApiError($"Item {itemId} not found for invoice {id}."));

            if (!await _db.Products.AnyAsync(p => p.Id == dto.ProductId))
                return BadRequest(new ApiError($"Product {dto.ProductId} does not exist."));
            if (!await _db.Units.AnyAsync(u => u.Id == dto.UnitId))
                return BadRequest(new ApiError($"Unit {dto.UnitId} does not exist."));

            var manufacturingDateError = ValidateManufacturingDate(dto.ManufacturingDate, dto.ExpiryDate);
            if (manufacturingDateError is not null)
                return BadRequest(new ApiError(manufacturingDateError));

            var oldProductId = item.ProductId;
            var oldBatchNumber = ResolveBatchNumber(item, invoice.InvoiceNo);

            if (!string.IsNullOrWhiteSpace(dto.BatchNumber) && dto.BatchNumber != oldBatchNumber)
            {
                var conflicting = await _db.ProductStocks.AnyAsync(s =>
                    s.ProductId == dto.ProductId && s.BatchNumber == dto.BatchNumber);
                if (conflicting)
                    return Conflict(new ApiError(
                        $"Batch number '{dto.BatchNumber}' is already in use for product {dto.ProductId}. Batch numbers must be unique per product."));
            }

            var orderedQtyPool = await LoadOrderedQtyPoolAsync(invoice.PurchaseOrderId);
            // Reconstruct the pool as if every OTHER item on this invoice had
            // already claimed its match, then match this item's (possibly new)
            // product/unit against what's left — handles the product/unit
            // itself changing here, not just the quantity.
            foreach (var other in invoice.Items.Where(i => i.Id != item.Id))
                ConsumeOrderedQty(orderedQtyPool, other.ProductId, other.UnitId);

            if (invoice.PurchaseOrderId is int purchaseOrderId)
            {
                var quantityError = await _receiving.ValidateIncomingAsync(
                    purchaseOrderId,
                    invoice.Items.Where(i => i.Id != item.Id)
                        .Select(i => (i.ProductId, i.UnitId, i.ReceivedQty))
                        .Append((dto.ProductId, dto.UnitId, dto.ReceivedQty)),
                    excludingInvoiceId: id);
                if (quantityError is not null) return BadRequest(new ApiError(quantityError));
            }

            item.ProductId = dto.ProductId;
            item.UnitId = dto.UnitId;
            item.ReceivedQty = dto.ReceivedQty;
            item.OrderedQty = ConsumeOrderedQty(orderedQtyPool, dto.ProductId, dto.UnitId);
            item.UnitCost = dto.UnitCost;
            item.SubTotal = dto.ReceivedQty * dto.UnitCost;
            if (!string.IsNullOrWhiteSpace(dto.BatchNumber))
                item.BatchNumber = dto.BatchNumber;
            item.ExpiryDate = dto.ExpiryDate;
            item.ManufacturingDate = dto.ManufacturingDate;

            await RecalculateTotalsAsync(invoice);
            await _db.SaveChangesAsync();

            await RecalculatePurchaseQtyAsync(new[] { oldProductId, item.ProductId });

            await SyncStockBatchForItemAsync(item, invoice, oldProductId, oldBatchNumber);
            await _db.SaveChangesAsync();

            await RecalculateStockQuantityAsync(new[] { oldProductId, item.ProductId });
            await _db.SaveChangesAsync();
            return NoContent();
        }

        [Authorize(Roles = "Admin")]
        [HttpDelete("{id:int}/items/{itemId:int}")]
        public async Task<IActionResult> RemoveItem(int id, int itemId)
        {
            var invoice = await _db.PurchaseInvoices.Include(p => p.Items).FirstOrDefaultAsync(p => p.Id == id);
            if (invoice is null) return NotFound(new ApiError($"Purchase invoice {id} not found."));

            var item = invoice.Items.FirstOrDefault(i => i.Id == itemId);
            if (item is null) return NotFound(new ApiError($"Item {itemId} not found for invoice {id}."));

            var removedProductId = item.ProductId;
            var batchNumber = ResolveBatchNumber(item, invoice.InvoiceNo);

            var stock = await _db.ProductStocks.FirstOrDefaultAsync(s =>
                s.ProductId == item.ProductId && s.BatchNumber == batchNumber && s.PurchaseInvoiceId == id);

            if (stock is not null)
            {
                if (stock.AvailableQuantity < stock.Quantity)
                {
                    return Conflict(new ApiError(
                        $"Cannot remove this line — {stock.Quantity - stock.AvailableQuantity} unit(s) from batch '{stock.BatchNumber}' have already been sold or transferred out."));
                }
                _db.ProductStocks.Remove(stock);
            }

            _db.PurchaseInvoiceItems.Remove(item);
            invoice.Items.Remove(item);
            await RecalculateTotalsAsync(invoice);
            await _db.SaveChangesAsync();

            await RecalculatePurchaseQtyAsync(new[] { removedProductId });
            await RecalculateStockQuantityAsync(new[] { removedProductId });
            await _db.SaveChangesAsync();
            return NoContent();
        }

        private async Task RecalculateTotalsAsync(PurchaseInvoice invoice)
        {
            invoice.Total = invoice.Items.Sum(i => i.SubTotal) - invoice.Discount + invoice.TaxOrOthers;

            var paidViaAllocations = await _db.SupplierPaymentDetails
                .Where(d => d.PurchaseInvoiceId == invoice.Id && !d.SupplierPayment.IsCancelled)
                .SumAsync(d => (decimal?)d.PaidAmount) ?? 0m;

            invoice.Due = Math.Max(0, invoice.Total - invoice.Advance - paidViaAllocations);
            invoice.PaymentStatus = invoice.Due <= 0 ? "Complete" : "InComplete";
        }

        private async Task RecalculatePurchaseQtyAsync(IEnumerable<int> productIds)
        {
            foreach (var productId in productIds.Distinct())
            {
                var total = await _db.PurchaseInvoiceItems
                    .Where(i => i.ProductId == productId)
                    .SumAsync(i => (decimal?)i.ReceivedQty) ?? 0m;

                var product = await _db.Products.FindAsync(productId);
                if (product is not null)
                    product.PurchaseQty = (int)total;
            }
        }

        private static string ResolveBatchNumber(PurchaseInvoiceItem item, string invoiceNo) =>
            string.IsNullOrWhiteSpace(item.BatchNumber) ? $"{invoiceNo}-{item.Id}" : item.BatchNumber;

        private static DateOnly ResolveExpiryDate(PurchaseInvoiceItem item) =>
            item.ExpiryDate.HasValue
                ? DateOnly.FromDateTime(item.ExpiryDate.Value)
                : DateOnly.FromDateTime(DateTime.UtcNow.AddYears(2));

        private static DateOnly? ResolveManufacturingDate(PurchaseInvoiceItem item) =>
            item.ManufacturingDate.HasValue
                ? DateOnly.FromDateTime(item.ManufacturingDate.Value)
                : null;

        private async Task UpsertSupplierProductFromInvoiceItemAsync(int? supplierId, PurchaseInvoiceItem item, DateTime purchaseDate)
        {
            if (supplierId is null) return;

            var link = await _db.SupplierProducts
                .Include(sp => sp.Prices)
                .FirstOrDefaultAsync(sp => sp.SupplierId == supplierId && sp.ProductId == item.ProductId);

            if (link is null)
            {
                link = new PharmacyV2.Models.People.SupplierProduct
                {
                    SupplierId = supplierId.Value,
                    ProductId = item.ProductId,
                    IsActive = true
                };
                _db.SupplierProducts.Add(link);
            }

            link.LastPurchaseDate = purchaseDate;
            link.LastPurchaseUnitCost = item.UnitCost;
            link.LastPurchaseUnitId = item.UnitId;

            var unitPrice = link.Prices.FirstOrDefault(p => p.UnitId == item.UnitId);
            if (unitPrice is null)
            {
                link.Prices.Add(new PharmacyV2.Models.People.SupplierProductPrice
                {
                    UnitId = item.UnitId,
                    BaseQuantity = 1,
                    PurchasePrice = item.UnitCost
                });

                _db.Add(new ProductPriceHistory
                {
                    ProductId = item.ProductId,
                    SupplierId = supplierId.Value,
                    UnitId = item.UnitId,
                    PriceType = "SupplierPurchase",
                    PreviousPrice = null,
                    NewPrice = item.UnitCost,
                    ChangedAt = DateTime.UtcNow
                });
            }
            else if (unitPrice.PurchasePrice != item.UnitCost)
            {
                _db.Add(new ProductPriceHistory
                {
                    ProductId = item.ProductId,
                    SupplierId = supplierId.Value,
                    UnitId = item.UnitId,
                    PriceType = "SupplierPurchase",
                    PreviousPrice = unitPrice.PurchasePrice,
                    NewPrice = item.UnitCost,
                    ChangedAt = DateTime.UtcNow
                });

                unitPrice.PurchasePrice = item.UnitCost;
                unitPrice.UpdatedAt = DateTime.UtcNow;
            }
        }

        private async Task SyncStockBatchForItemAsync(
            PurchaseInvoiceItem item,
            PurchaseInvoice invoice,
            int? previousProductId = null,
            string? previousBatchNumber = null)
        {
            string batchNumber = ResolveBatchNumber(item, invoice.InvoiceNo);
            DateOnly expiryDate = ResolveExpiryDate(item);
            DateOnly? manufacturingDate = ResolveManufacturingDate(item);
            DateOnly receivedDate = DateOnly.FromDateTime(invoice.PurchaseDate);

            ProductStock? stock = null;
            if (previousProductId is not null && previousBatchNumber is not null)
            {
                stock = await _db.ProductStocks.FirstOrDefaultAsync(s =>
                    s.ProductId == previousProductId && s.BatchNumber == previousBatchNumber && s.PurchaseInvoiceId == invoice.Id);
            }
            stock ??= await _db.ProductStocks.FirstOrDefaultAsync(s =>
                s.ProductId == item.ProductId && s.BatchNumber == batchNumber && s.PurchaseInvoiceId == invoice.Id);

            if (stock is null)
            {
                _db.ProductStocks.Add(new ProductStock
                {
                    ProductId = item.ProductId,
                    WarehouseId = invoice.WarehouseId,
                    BatchNumber = batchNumber,
                    Quantity = item.ReceivedQty,
                    AvailableQuantity = item.ReceivedQty,
                    ExpiryDate = expiryDate,
                    ManufacturingDate = manufacturingDate,
                    SupplierId = invoice.SupplierId,
                    PurchaseInvoiceId = invoice.Id,
                    ReceivedDate = receivedDate,
                    UnitCost = item.UnitCost
                });
            }
            else
            {
                decimal alreadySold = stock.Quantity - stock.AvailableQuantity;
                stock.ProductId = item.ProductId;
                stock.WarehouseId = invoice.WarehouseId;
                stock.BatchNumber = batchNumber;
                stock.Quantity = item.ReceivedQty;
                stock.AvailableQuantity = Math.Max(0, item.ReceivedQty - alreadySold);
                stock.UnitCost = item.UnitCost;
                stock.ExpiryDate = expiryDate;
                stock.ManufacturingDate = manufacturingDate;
                stock.SupplierId = invoice.SupplierId;
                stock.ReceivedDate = receivedDate;
            }
        }

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

        private void DeleteReceiptImageFile(string? receiptImagePath)
        {
            if (string.IsNullOrWhiteSpace(receiptImagePath))
                return;

            if (receiptImagePath.IndexOf(PurchaseReceiptImagesRelativeFolder, StringComparison.OrdinalIgnoreCase) < 0)
                return;

            string fileName = Path.GetFileName(receiptImagePath);
            if (string.IsNullOrWhiteSpace(fileName))
                return;

            string folderPath = GetPurchaseReceiptImagesFolderPath();
            string fullFilePath = Path.Combine(folderPath, fileName);

            if (System.IO.File.Exists(fullFilePath))
            {
                System.IO.File.Delete(fullFilePath);
            }
        }

        // Loads the uncancelled items of the purchase order this invoice is
        // raised against, as a consumable pool for ConsumeOrderedQty below.
        // Returns an empty pool (never null) when there's no linked order, so
        // callers don't need a separate null check.
        private async Task<List<PurchaseOrderItem>> LoadOrderedQtyPoolAsync(int? purchaseOrderId)
        {
            if (purchaseOrderId is null) return new List<PurchaseOrderItem>();
            return await _db.PurchaseOrderItems
                .Where(i => i.PurchaseOrderId == purchaseOrderId && !i.IsCancelled)
                .ToListAsync();
        }

        // Matches one order line to this invoice line by product + unit and
        // removes it from the pool, so the same order line is never snapshotted
        // onto two different invoice lines. Returns null (leaving OrderedQty
        // unset) when nothing in the pool matches — a direct purchase with no
        // order, or a product/unit that wasn't actually on the order.
        private static decimal? ConsumeOrderedQty(List<PurchaseOrderItem> pool, int productId, int unitId)
        {
            var idx = pool.FindIndex(o => o.ProductId == productId && o.UnitId == unitId);
            if (idx < 0) return null;
            var qty = pool[idx].OrderQty;
            pool.RemoveAt(idx);
            return qty;
        }

        private static PurchaseInvoiceItemReadDto ItemToDto(PurchaseInvoiceItem i) => new()
        {
            Id = i.Id,
            ProductId = i.ProductId,
            ProductName = i.Product?.ProductName,
            UnitId = i.UnitId,
            UnitName = i.Unit?.Name,
            ReceivedQty = i.ReceivedQty,
            OrderedQty = i.OrderedQty,
            UnitCost = i.UnitCost,
            SubTotal = i.SubTotal,
            BatchNumber = i.BatchNumber,
            ExpiryDate = i.ExpiryDate,
            ManufacturingDate = i.ManufacturingDate
        };

        private async Task<Dictionary<int, List<string>>> LoadPaymentMethodsAsync(IEnumerable<PurchaseInvoice> invoices)
        {
            var invoiceList = invoices.ToList();
            var methodsByInvoice = invoiceList.ToDictionary(
                invoice => invoice.Id,
                invoice => ParsePaymentMethods(invoice.PaymentMethod));
            var invoiceIds = methodsByInvoice.Keys.ToList();
            if (invoiceIds.Count == 0) return methodsByInvoice;

            var voucherMethods = await _db.SupplierPaymentDetails
                .AsNoTracking()
                .Where(detail => invoiceIds.Contains(detail.PurchaseInvoiceId) && !detail.SupplierPayment.IsCancelled)
                .OrderBy(detail => detail.SupplierPayment.PaidDate)
                .ThenBy(detail => detail.SupplierPayment.Id)
                .Select(detail => new
                {
                    detail.PurchaseInvoiceId,
                    detail.SupplierPayment.PaymentMethod
                })
                .ToListAsync();

            foreach (var voucher in voucherMethods)
            {
                var methods = methodsByInvoice[voucher.PurchaseInvoiceId];
                foreach (var method in ParsePaymentMethods(voucher.PaymentMethod))
                {
                    if (!methods.Contains(method, StringComparer.OrdinalIgnoreCase))
                        methods.Add(method);
                }
            }

            return methodsByInvoice;
        }

        private static List<string> ParsePaymentMethods(string? methods) =>
            (methods ?? string.Empty)
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

        private static PurchaseInvoiceReadDto ToDto(PurchaseInvoice p, List<string>? paymentMethods = null) => new()
        {
            Id = p.Id,
            InvoiceNo = p.InvoiceNo,
            PurchaseDate = p.PurchaseDate,
            SupplierId = p.SupplierId,
            SupplierName = p.Supplier?.SupplierName,
            CompanyId = p.Supplier?.CompanyId,
            CompanyName = p.Supplier?.Company?.Name,
            PurchaseOrderId = p.PurchaseOrderId,
            WarehouseId = p.WarehouseId,
            WarehouseName = p.Warehouse?.Name,
            PaymentMethod = p.PaymentMethod,
            PaymentMethods = paymentMethods ?? ParsePaymentMethods(p.PaymentMethod),
            Advance = p.Advance,
            Due = p.Due,
            Total = p.Total,
            Discount = p.Discount,
            TaxOrOthers = p.TaxOrOthers,
            PaymentStatus = p.PaymentStatus,
            IsPaymentComplete = p.Due <= 0,
            ReceivingStatus = p.ReceivingStatus,
            IsSupplierWise = p.IsSupplierWise,
            CreatedAt = p.CreatedAt,
            ReceiptImagePath = p.ReceiptImagePath,
            ReceiptImageContentType = p.ReceiptImageContentType,
            Items = p.Items.Select(ItemToDto).ToList()
        };

        private static bool IsValidReceivingStatus(string status) =>
            status is "Completed" or "Partially Received";

        private Task<PaymentMethod?> GetActivePaymentMethodAsync(string paymentMethod) =>
            _db.PaymentMethods.AsNoTracking()
                .FirstOrDefaultAsync(method => method.Name == paymentMethod && method.IsActive);

        private static string? ValidateManufacturingDate(DateTime? manufacturingDate, DateTime? expiryDate)
        {
            if (manufacturingDate is null) return null;

            if (manufacturingDate.Value.Date > DateTime.UtcNow.Date)
                return "Manufacturing date cannot be in the future.";

            if (expiryDate.HasValue && manufacturingDate.Value.Date > expiryDate.Value.Date)
                return "Manufacturing date cannot be after the expiry date.";

            return null;
        }
    }
}
