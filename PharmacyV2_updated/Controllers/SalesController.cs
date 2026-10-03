using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;
using PharmacyV2.DTOs;
using PharmacyV2.Enums;
using PharmacyV2.Models.People;
using PharmacyV2.Models.Payment;
using PharmacyV2.Models.Product;
using PharmacyV2.Models.SaleInvoice;
using PharmacyV2.Services;
using System.Security.Claims;

namespace PharmacyV2.Controllers
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class SalesController : ControllerBase
    {
        private readonly PharmacyDbContext _db;
        private readonly IWebHostEnvironment _env;
        private readonly IAccountingPostingService _accounting;
        private readonly IAuditService _audit;
        private readonly ICodeGeneratorService _codeGenerator;

        private const string SaleReceiptImagesRelativeFolder = "images/sale-receipts";

        public SalesController(PharmacyDbContext db, IWebHostEnvironment env, IAccountingPostingService accounting, IAuditService audit, ICodeGeneratorService codeGenerator)
        {
            _db = db;
            _env = env;
            _accounting = accounting;
            _audit = audit;
            _codeGenerator = codeGenerator;
        }

        private string GetSaleReceiptImagesFolderPath()
        {
            string webRoot = _env.WebRootPath;
            if (string.IsNullOrEmpty(webRoot))
            {
                webRoot = Path.Combine(_env.ContentRootPath, "wwwroot");
            }

            string folderPath = Path.Combine(webRoot, "images", "sale-receipts");

            if (!Directory.Exists(folderPath))
            {
                Directory.CreateDirectory(folderPath);
            }

            return folderPath;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<SaleReadDto>>> GetAll([FromQuery] int? customerId)
        {
            var query = _db.Sales.Where(s => !s.IsVoided).Include(s => s.Prescription).Include(s => s.Items).ThenInclude(i => i.Unit).Include(s => s.Items).ThenInclude(i => i.ProductStocks).ThenInclude(stock => stock.Product).Include(s => s.Customer).Include(s => s.Payments).AsNoTracking().AsQueryable();
            if (customerId is not null) query = query.Where(s => s.CustomerId == customerId);

            var sales = await query.OrderByDescending(s => s.SaleDate).ToListAsync();

            var saleIds = sales.Select(s => s.SaleId).ToList();
            var returnTotals = await _db.SaleReturns.AsNoTracking()
                .Where(r => !r.IsDeleted && saleIds.Contains(r.SaleId))
                .GroupBy(r => r.SaleId)
                .Select(g => new { SaleId = g.Key, Total = g.Sum(x => x.ReturnTotal) })
                .ToListAsync();
            var returnMap = returnTotals.ToDictionary(x => x.SaleId, x => x.Total);

            return Ok(sales.Select(s => ToDto(s, returnMap.GetValueOrDefault(s.SaleId))));
        }

        [HttpGet("{id:int}")]
        public async Task<ActionResult<SaleReadDto>> GetById(int id)
        {
            var sale = await _db.Sales.Include(s => s.Prescription).Include(s => s.Customer).Include(s => s.Items).ThenInclude(i => i.Unit).Include(s => s.Items).ThenInclude(i => i.ProductStocks).ThenInclude(stock => stock.Product).Include(s => s.Customer).Include(s => s.Payments).AsNoTracking()
                .FirstOrDefaultAsync(s => s.SaleId == id);

            if (sale is null) return NotFound();

            var returnedAmount = await _db.SaleReturns.AsNoTracking()
                .Where(r => !r.IsDeleted && r.SaleId == id)
                .SumAsync(r => (decimal?)r.ReturnTotal) ?? 0m;

            return Ok(ToDto(sale, returnedAmount));
        }

        [Authorize(Roles = "Admin,Manager,Cashier")]
        [HttpPost]
        public async Task<ActionResult<SaleReadDto>> Create([FromBody] SaleCreateDto dto)
        {
            if (dto.CustomerId is not null && !await _db.Customers.AnyAsync(c => c.CustomerId == dto.CustomerId))
                return BadRequest(new ApiError($"Customer {dto.CustomerId} does not exist."));
            if (dto.RequiresPrescription && dto.PrescriptionId is null)
                return BadRequest(new ApiError("Select a prescription, or mark this sale as not requiring one."));

            // The payment method must be a real, active PaymentMethods row, and —
            // if this sale is being saved as Paid — that row must carry a ledger
            // account code, since that is what tells the accounting post which
            // cash/bank/MFS account to debit. Checked up front so a bad payment
            // method never leaves half-decremented stock behind.
            var paymentMethodRow = await GetActivePaymentMethodAsync(dto.PaymentMethod);
            if (paymentMethodRow is null)
                return BadRequest(new ApiError($"'{dto.PaymentMethod}' is not an active payment method."));
            if (dto.IsPaid == true && string.IsNullOrWhiteSpace(paymentMethodRow.LedgerAccountCode))
                return BadRequest(new ApiError($"Payment method '{paymentMethodRow.Name}' has no ledger account code configured. Set one on the Payment Methods screen before using it for a paid sale."));

            Prescription? prescription = null;
            if (dto.PrescriptionId is not null)
            {
                prescription = await _db.Prescriptions.FirstOrDefaultAsync(p => p.PrescriptionId == dto.PrescriptionId);
                if (prescription is null)
                    return BadRequest(new ApiError($"Prescription {dto.PrescriptionId} does not exist."));
            }

            var generatedInvoiceNo = await _codeGenerator.GenerateSaleInvoiceNoAsync();

            await using var transaction = await _db.Database.BeginTransactionAsync();

            var sale = new Sale
            {
                InvoiceNo = generatedInvoiceNo,
                CustomerId = dto.CustomerId,
                SaleDate = dto.SaleDate == default ? DateTime.UtcNow : dto.SaleDate,
                PaymentMethod = dto.PaymentMethod,
                CashierId = User.FindFirstValue(ClaimTypes.NameIdentifier),
                CashierName = User.IsInRole("Admin")
                    ? "Sale By Authority"
                    : User.FindFirstValue("name") ?? User.FindFirstValue(ClaimTypes.Name) ?? User.Identity?.Name,
                TermsAndConditions = dto.TermsAndConditions?.Trim(),
                IsPaid = dto.IsPaid ?? false,
                RequiresPrescription = dto.RequiresPrescription,
                PrescriptionId = dto.PrescriptionId,
                Discount = dto.Discount
            };

            var affectedProductIds = new List<int>();
            decimal costOfGoodsSold = 0;

            foreach (var itemDto in dto.Items)
            {

                if (!await _db.Units.AnyAsync(u => u.Id == itemDto.UnitId))
                    return BadRequest(new ApiError($"Unit {itemDto.UnitId} does not exist."));

                var stock = await _db.ProductStocks.FirstOrDefaultAsync(s => s.Id == itemDto.ProductStockId);
                if (stock is null)
                    return BadRequest(new ApiError($"Product stock batch {itemDto.ProductStockId} does not exist."));
                if (!await IsMainWarehouseStockAsync(stock.WarehouseId))
                    return Conflict(new ApiError($"Batch {stock.BatchNumber} is not in the active Main warehouse. Sales can only use Main warehouse stock."));
                var terms = await GetSaleTermsAsync(stock.ProductId, itemDto.UnitId);
                if (terms is null) return BadRequest(new ApiError($"Unit {itemDto.UnitId} is not configured for this product."));
                decimal baseQuantity = itemDto.Quantity * terms.Value.BaseQuantity;
                if (stock.AvailableQuantity < baseQuantity)
                    return Conflict(new ApiError($"Insufficient stock for batch {stock.BatchNumber}: available {stock.AvailableQuantity}, requested {itemDto.Quantity}."));

                var expiryError = await ValidateExpiryAndFefoAsync(stock, itemDto.AllowOutOfOrderBatch);
                if (expiryError is not null)
                    return Conflict(new ApiError(expiryError));

                decimal unitPrice = terms.Value.UnitPrice;

                stock.AvailableQuantity -= baseQuantity;
                costOfGoodsSold += stock.UnitCost * baseQuantity;
                affectedProductIds.Add(stock.ProductId);

                sale.Items.Add(new SaleItem
                {
                    ProductStockId = itemDto.ProductStockId,
                    UnitId = itemDto.UnitId,
                    Quantity = itemDto.Quantity,
                    BaseQuantity = baseQuantity,
                    UnitPrice = unitPrice

                });
            }

            sale.TotalAmount = sale.Items.Sum(i => i.Quantity * i.UnitPrice);

            if (sale.Discount > sale.TotalAmount)
                return BadRequest(new ApiError($"Discount ({sale.Discount:0.00}) cannot exceed the items subtotal ({sale.TotalAmount:0.00})."));

            _db.Sales.Add(sale);
            await _db.SaveChangesAsync();

            if (prescription is not null)
            {
                prescription.SaleId = sale.SaleId;
            }

            var netAmount = sale.TotalAmount - sale.Discount;
            var cashCode = sale.IsPaid == true ? paymentMethodRow.LedgerAccountCode! : "1100";
            await _accounting.PostAsync(LedgerSourceType.Sale, sale.SaleId, sale.SaleDate, $"Sale {sale.SaleId} — payment method: {paymentMethodRow.Name}",
                (cashCode, netAmount, 0), ("4000", 0, netAmount), ("5000", costOfGoodsSold, 0), ("1200", 0, costOfGoodsSold));
            await _db.SaveChangesAsync();

            await RecalculateStockQuantityAsync(affectedProductIds);
            await _db.SaveChangesAsync();
            await _audit.LogAsync("SaleCreated", "Sale", sale.SaleId, $"Total: {sale.TotalAmount}; Discount: {sale.Discount}; Paid: {sale.IsPaid}; Payment method: {sale.PaymentMethod}", sale.CashierId);
            await transaction.CommitAsync();

            await _db.Entry(sale).Reference(s => s.Customer).LoadAsync();
            await _db.Entry(sale).Collection(s => s.Items).LoadAsync();
            foreach (var item in sale.Items)
                await _db.Entry(item).Reference(i => i.Unit).LoadAsync();
            if (prescription is not null)
                await _db.Entry(sale).Reference(s => s.Prescription).LoadAsync();

            return CreatedAtAction(nameof(GetById), new { id = sale.SaleId }, ToDto(sale));
        }

        [HttpPost("{id:int}/payment")]
        public async Task<ActionResult<SaleReadDto>> RecordPayment(int id, [FromBody] SalePaymentDto dto)
        {
            await using var transaction = await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            var sale = await _db.Sales.Include(s => s.Items).ThenInclude(i => i.Unit).Include(s => s.Customer).Include(s => s.Payments)
                .FirstOrDefaultAsync(s => s.SaleId == id);
            if (sale is null) return NotFound(new ApiError($"Sale {id} not found."));
            if (sale.IsVoided) return Conflict(new ApiError("A voided sale cannot receive payment."));
            if (sale.IsPaid == true) return Conflict(new ApiError("This sale has already been paid."));

            var wasPostedToReceivable = await _db.LedgerAccounts
                .Include(l => l.ChartOfAccount)
                .AnyAsync(l => l.SourceType == LedgerSourceType.Sale && l.SourceId == id && l.ChartOfAccount.Code == "1100" && l.DebitAmount > 0);

            // The payment method must be a real, active PaymentMethods row with a
            // ledger account code — a payment is always posted (unlike a sale,
            // which can be left Due), so there is no "skip the check" branch here.
            var paymentMethodRow = await GetActivePaymentMethodAsync(dto.PaymentMethod);
            if (paymentMethodRow is null)
                return BadRequest(new ApiError($"'{dto.PaymentMethod}' is not an active payment method."));
            if (string.IsNullOrWhiteSpace(paymentMethodRow.LedgerAccountCode))
                return BadRequest(new ApiError($"Payment method '{paymentMethodRow.Name}' has no ledger account code configured. Set one on the Payment Methods screen before collecting a payment with it."));

            var netAmount = sale.TotalAmount - sale.Discount;
            var alreadyPaid = sale.Payments.Sum(p => p.Amount);
            var returnedAmount = await _db.SaleReturns
                .Where(r => r.SaleId == id && !r.IsDeleted)
                .SumAsync(r => (decimal?)r.ReturnTotal) ?? 0m;
            var remaining = Math.Max(0m, netAmount - returnedAmount - alreadyPaid);
            var amount = dto.Amount ?? remaining;
            if (amount <= 0 || amount > remaining) return BadRequest(new ApiError($"Payment must be between 0.01 and the remaining due of {remaining:0.00}."));
            if (!wasPostedToReceivable) return Conflict(new ApiError("This legacy sale was not posted to accounts receivable; it cannot be collected again automatically."));

            var payment = new SalePayment
            {
                SaleId = sale.SaleId,
                Amount = amount,
                PaymentMethod = dto.PaymentMethod,
                Note = dto.Note,
                ReceivedAt = DateTime.UtcNow,
                ReceivedByUserId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            };
            _db.SalePayments.Add(payment);
            await _db.SaveChangesAsync();
            await _accounting.PostAsync(LedgerSourceType.CustomerPayment, payment.Id, payment.ReceivedAt, $"Payment received for Sale {sale.SaleId} — payment method: {paymentMethodRow.Name}",
                (paymentMethodRow.LedgerAccountCode!, amount, 0), ("1100", 0, amount));
            sale.PaymentMethod = dto.PaymentMethod;
            sale.IsPaid = alreadyPaid + amount >= Math.Max(0m, netAmount - returnedAmount);
            await _db.SaveChangesAsync();
            await _audit.LogAsync("CustomerPaymentReceived", "Sale", sale.SaleId, $"Amount: {amount}; Method: {dto.PaymentMethod}; Remaining due: {Math.Max(0, remaining - amount)}; Note: {dto.Note}", payment.ReceivedByUserId);
            await transaction.CommitAsync();
            return Ok(ToDto(sale));
        }

        [Authorize(Roles = "Admin")]
        [HttpPost("{id:int}/void")]
        public async Task<IActionResult> Void(int id, [FromBody] SaleVoidDto dto)
        {
            var sale = await _db.Sales.Include(s => s.Items).ThenInclude(i => i.ProductStocks)
                .FirstOrDefaultAsync(s => s.SaleId == id);
            if (sale is null) return NotFound(new ApiError($"Sale {id} not found."));
            if (sale.IsVoided) return Conflict(new ApiError("This sale has already been voided."));
            if (await _db.SaleReturns.AnyAsync(r => r.SaleId == id && !r.IsDeleted))
                return Conflict(new ApiError("A sale with returns cannot be voided. Complete a correcting sale return instead."));

            await using var transaction = await _db.Database.BeginTransactionAsync();
            var affectedProductIds = new List<int>();
            foreach (var item in sale.Items)
            {
                item.ProductStocks.AvailableQuantity += item.BaseQuantity;
                affectedProductIds.Add(item.ProductStocks.ProductId);
            }

            var originalPosting = await _db.LedgerAccounts.Include(l => l.ChartOfAccount)
                .Where(l => l.SourceType == LedgerSourceType.Sale && l.SourceId == id)
                .ToListAsync();
            if (originalPosting.Count > 0)
            {
                await _accounting.PostAsync(LedgerSourceType.SaleVoid, sale.SaleId, DateTime.UtcNow,
                    $"Void Sale {sale.SaleId}: {dto.Reason}", originalPosting
                    .Select(line => (line.ChartOfAccount.Code!, line.CreditAmount, line.DebitAmount)).ToArray());
            }
            sale.IsVoided = true;
            sale.VoidReason = dto.Reason;
            sale.VoidedAt = DateTime.UtcNow;
            sale.VoidedByUserId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            await RecalculateStockQuantityAsync(affectedProductIds);
            await _db.SaveChangesAsync();
            await _audit.LogAsync("SaleVoided", "Sale", sale.SaleId, dto.Reason, sale.VoidedByUserId);
            await transaction.CommitAsync();
            return NoContent();
        }

        [Authorize(Roles = "Admin,Manager")]
        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] SaleUpdateDto dto)
        {
            if (await _db.LedgerAccounts.AnyAsync(l => l.SourceType == LedgerSourceType.Sale && l.SourceId == id))
                return Conflict(new ApiError("Posted sales are immutable. Create a sale return or a correcting sale instead."));
            var existing = await _db.Sales.Include(s => s.Items).FirstOrDefaultAsync(s => s.SaleId == id);
            if (existing is null) return NotFound();

            if (dto.CustomerId is not null && !await _db.Customers.AnyAsync(c => c.CustomerId == dto.CustomerId))
                return BadRequest(new ApiError($"Customer {dto.CustomerId} does not exist."));

            existing.PaymentMethod = dto.PaymentMethod;

            existing.CustomerId = dto.CustomerId;
            existing.IsPaid = dto.IsPaid;

            if (dto.SaleDate is not null)
                existing.SaleDate = dto.SaleDate.Value;

            var affectedProductIds = new List<int>();

            if (dto.Items is not null)
            {
                var incomingIds = dto.Items.Where(i => i.SaleItemId is > 0).Select(i => i.SaleItemId!.Value).ToHashSet();

                var toRemove = existing.Items.Where(i => !incomingIds.Contains(i.SaleItemId)).ToList();
                foreach (var item in toRemove)
                {
                    var stock = await _db.ProductStocks.FirstOrDefaultAsync(s => s.Id == item.ProductStockId);
                    if (stock is not null)
                    {
                        stock.AvailableQuantity += item.BaseQuantity;
                        affectedProductIds.Add(stock.ProductId);
                    }

                    _db.SaleItems.Remove(item);
                    existing.Items.Remove(item);
                }

                foreach (var itemDto in dto.Items)
                {
                    if (itemDto.SaleItemId is > 0)
                    {
                        var existingItem = existing.Items.FirstOrDefault(i => i.SaleItemId == itemDto.SaleItemId);
                        if (existingItem is null)
                            return BadRequest(new ApiError($"Item {itemDto.SaleItemId} does not belong to sale {id}."));

                        if (!await _db.Units.AnyAsync(u => u.Id == itemDto.UnitId))
                            return BadRequest(new ApiError($"Unit {itemDto.UnitId} does not exist."));

                        var oldStock = await _db.ProductStocks.FirstOrDefaultAsync(s => s.Id == existingItem.ProductStockId);
                        if (oldStock is not null)
                        {
                            oldStock.AvailableQuantity += existingItem.BaseQuantity;
                            affectedProductIds.Add(oldStock.ProductId);
                        }

                        var newStock = await _db.ProductStocks.FirstOrDefaultAsync(s => s.Id == itemDto.ProductStockId);
                        if (newStock is null)
                            return BadRequest(new ApiError($"Product stock batch {itemDto.ProductStockId} does not exist."));
                        if (!await IsMainWarehouseStockAsync(newStock.WarehouseId))
                            return Conflict(new ApiError($"Batch {newStock.BatchNumber} is not in the active Main warehouse. Sales can only use Main warehouse stock."));
                        var updateTerms = await GetSaleTermsAsync(newStock.ProductId, itemDto.UnitId);
                        if (updateTerms is null) return BadRequest(new ApiError($"Unit {itemDto.UnitId} is not configured for this product."));
                        decimal updatedBaseQuantity = itemDto.Quantity * updateTerms.Value.BaseQuantity;
                        if (newStock.AvailableQuantity < updatedBaseQuantity)
                            return Conflict(new ApiError($"Insufficient stock for batch {newStock.BatchNumber}: available {newStock.AvailableQuantity}, requested {itemDto.Quantity}."));

                        var updateExpiryError = await ValidateExpiryAndFefoAsync(newStock, itemDto.AllowOutOfOrderBatch);
                        if (updateExpiryError is not null)
                            return Conflict(new ApiError(updateExpiryError));

                        newStock.AvailableQuantity -= updatedBaseQuantity;
                        affectedProductIds.Add(newStock.ProductId);

                        bool priceBasisChanged = existingItem.UnitId != itemDto.UnitId || existingItem.ProductStockId != itemDto.ProductStockId;
                        existingItem.ProductStockId = itemDto.ProductStockId;
                        existingItem.UnitId = itemDto.UnitId;
                        existingItem.Quantity = itemDto.Quantity;
                        existingItem.BaseQuantity = updatedBaseQuantity;
                        if (priceBasisChanged)
                            existingItem.UnitPrice = updateTerms.Value.UnitPrice;
                    }
                    else
                    {
                        if (!await _db.Units.AnyAsync(u => u.Id == itemDto.UnitId))
                            return BadRequest(new ApiError($"Unit {itemDto.UnitId} does not exist."));

                        var stock = await _db.ProductStocks.FirstOrDefaultAsync(s => s.Id == itemDto.ProductStockId);
                        if (stock is null)
                            return BadRequest(new ApiError($"Product stock batch {itemDto.ProductStockId} does not exist."));
                        if (!await IsMainWarehouseStockAsync(stock.WarehouseId))
                            return Conflict(new ApiError($"Batch {stock.BatchNumber} is not in the active Main warehouse. Sales can only use Main warehouse stock."));
                        var addTerms = await GetSaleTermsAsync(stock.ProductId, itemDto.UnitId);
                        if (addTerms is null) return BadRequest(new ApiError($"Unit {itemDto.UnitId} is not configured for this product."));
                        decimal addedBaseQuantity = itemDto.Quantity * addTerms.Value.BaseQuantity;
                        if (stock.AvailableQuantity < addedBaseQuantity)
                            return Conflict(new ApiError($"Insufficient stock for batch {stock.BatchNumber}: available {stock.AvailableQuantity}, requested {itemDto.Quantity}."));

                        var addExpiryError = await ValidateExpiryAndFefoAsync(stock, itemDto.AllowOutOfOrderBatch);
                        if (addExpiryError is not null)
                            return Conflict(new ApiError(addExpiryError));

                        stock.AvailableQuantity -= addedBaseQuantity;
                        affectedProductIds.Add(stock.ProductId);

                        existing.Items.Add(new SaleItem
                        {
                            ProductStockId = itemDto.ProductStockId,
                            UnitId = itemDto.UnitId,
                            Quantity = itemDto.Quantity,
                            BaseQuantity = addedBaseQuantity,
                            UnitPrice = addTerms.Value.UnitPrice

                        });
                    }
                }

                existing.TotalAmount = existing.Items.Sum(i => i.Quantity * i.UnitPrice);
            }

            await _db.SaveChangesAsync();

            if (affectedProductIds.Count > 0)
            {
                await RecalculateStockQuantityAsync(affectedProductIds);
                await _db.SaveChangesAsync();
            }

            return NoContent();
        }
        [Authorize(Roles = "Admin")]
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            if (await _db.LedgerAccounts.AnyAsync(l => l.SourceType == LedgerSourceType.Sale && l.SourceId == id))
                return Conflict(new ApiError("Posted sales cannot be deleted. Use a sale return or an accounting reversal."));
            var sale = await _db.Sales.Include(s => s.Items).FirstOrDefaultAsync(s => s.SaleId == id);
            if (sale is null) return NotFound();

            var affectedProductIds = new List<int>();
            foreach (var item in sale.Items)
            {
                var stock = await _db.ProductStocks.FirstOrDefaultAsync(s => s.Id == item.ProductStockId);
                if (stock is not null)
                {
                    stock.AvailableQuantity += item.BaseQuantity;
                    affectedProductIds.Add(stock.ProductId);
                }
            }

            DeleteReceiptImageFile(sale.ReceiptImagePath);

            _db.Sales.Remove(sale);
            await _db.SaveChangesAsync();

            if (affectedProductIds.Count > 0)
            {
                await RecalculateStockQuantityAsync(affectedProductIds);
                await _db.SaveChangesAsync();
            }

            return NoContent();
        }

        [HttpPost("{id:int}/items")]
        public async Task<ActionResult<SaleItemReadDto>> AddItem(int id, [FromBody] SaleItemWriteDto dto)
        {
            var sale = await _db.Sales.Include(s => s.Items).FirstOrDefaultAsync(s => s.SaleId == id);
            if (sale is null) return NotFound(new ApiError($"Sale {id} not found."));

            if (!await _db.Units.AnyAsync(u => u.Id == dto.UnitId))
                return BadRequest(new ApiError($"Unit {dto.UnitId} does not exist."));

            var stock = await _db.ProductStocks.FirstOrDefaultAsync(s => s.Id == dto.ProductStockId);
            if (stock is null)
                return BadRequest(new ApiError($"Product stock batch {dto.ProductStockId} does not exist."));
            if (!await IsMainWarehouseStockAsync(stock.WarehouseId))
                return Conflict(new ApiError($"Batch {stock.BatchNumber} is not in the active Main warehouse. Sales can only use Main warehouse stock."));
            var terms = await GetSaleTermsAsync(stock.ProductId, dto.UnitId);
            if (terms is null) return BadRequest(new ApiError($"Unit {dto.UnitId} is not configured for this product."));
            decimal baseQuantity = dto.Quantity * terms.Value.BaseQuantity;
            if (stock.AvailableQuantity < baseQuantity)
                return Conflict(new ApiError($"Insufficient stock for batch {stock.BatchNumber}: available {stock.AvailableQuantity}, requested {dto.Quantity}."));

            var expiryError = await ValidateExpiryAndFefoAsync(stock, dto.AllowOutOfOrderBatch);
            if (expiryError is not null)
                return Conflict(new ApiError(expiryError));

            stock.AvailableQuantity -= baseQuantity;

            var item = new SaleItem
            {
                SaleId = id,
                ProductStockId = dto.ProductStockId,
                UnitId = dto.UnitId,
                Quantity = dto.Quantity,
                BaseQuantity = baseQuantity,

                UnitPrice = terms.Value.UnitPrice

            };

            sale.Items.Add(item);
            sale.TotalAmount = sale.Items.Sum(i => i.Quantity * i.UnitPrice);
            await _db.SaveChangesAsync();

            await RecalculateStockQuantityAsync(new[] { stock.ProductId });
            await _db.SaveChangesAsync();

            await _db.Entry(item).ReloadAsync();
            await _db.Entry(item).Reference(i => i.Unit).LoadAsync();

            return CreatedAtAction(nameof(GetById), new { id }, new SaleItemReadDto
            {
                SaleItemId = item.SaleItemId,
                ProductStockId = item.ProductStockId,
                ProductId = stock.ProductId,
                BatchNumber = stock.BatchNumber,
                ManufacturingDate = stock.ManufacturingDate,
                UnitId = item.UnitId,
                UnitName = item.Unit?.Name,
                Quantity = item.Quantity,
                UnitPrice = item.UnitPrice,
                TotalPrice = item.TotalPrice
            });
        }

        [HttpDelete("{id:int}/items/{itemId:int}")]
        public async Task<IActionResult> RemoveItem(int id, int itemId)
        {
            var sale = await _db.Sales.Include(s => s.Items).FirstOrDefaultAsync(s => s.SaleId == id);
            if (sale is null) return NotFound(new ApiError($"Sale {id} not found."));

            var item = sale.Items.FirstOrDefault(i => i.SaleItemId == itemId);
            if (item is null) return NotFound(new ApiError($"Item {itemId} not found for sale {id}."));

            var stock = await _db.ProductStocks.FirstOrDefaultAsync(s => s.Id == item.ProductStockId);
            if (stock is not null) stock.AvailableQuantity += item.BaseQuantity;

            _db.SaleItems.Remove(item);
            sale.Items.Remove(item);
            sale.TotalAmount = sale.Items.Sum(i => i.Quantity * i.UnitPrice);
            await _db.SaveChangesAsync();

            if (stock is not null)
            {
                await RecalculateStockQuantityAsync(new[] { stock.ProductId });
                await _db.SaveChangesAsync();
            }

            return NoContent();
        }
        [HttpPost("{id:int}/image")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> UploadReceiptImage(int id, IFormFile file)
        {
            var sale = await _db.Sales.FirstOrDefaultAsync(s => s.SaleId == id);
            if (sale is null) return NotFound(new ApiError($"Sale {id} not found."));

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

            string folderPath = GetSaleReceiptImagesFolderPath();
            string shortGuid = Guid.NewGuid().ToString("N").Substring(0, 8);
            string fileName = id + "_" + shortGuid + extension;
            string fullFilePath = Path.Combine(folderPath, fileName);

            await System.IO.File.WriteAllBytesAsync(fullFilePath, fileBytes);

            DeleteReceiptImageFile(sale.ReceiptImagePath);

            sale.ReceiptImage = null;
            sale.ReceiptImageContentType = file.ContentType;
            sale.ReceiptImagePath = "/" + SaleReceiptImagesRelativeFolder + "/" + fileName;

            await _db.SaveChangesAsync();
            return Ok(new { sale.SaleId, sale.ReceiptImagePath });
        }
        [Authorize(Roles = "Admin,Manager")]
        [HttpDelete("{id:int}/image")]
        public async Task<IActionResult> DeleteReceiptImage(int id)
        {
            var sale = await _db.Sales.FirstOrDefaultAsync(s => s.SaleId == id);
            if (sale is null) return NotFound(new ApiError($"Sale {id} not found."));

            DeleteReceiptImageFile(sale.ReceiptImagePath);

            sale.ReceiptImagePath = null;
            sale.ReceiptImage = null;
            sale.ReceiptImageContentType = null;

            await _db.SaveChangesAsync();
            return NoContent();
        }

        private void DeleteReceiptImageFile(string? receiptImagePath)
        {
            if (string.IsNullOrWhiteSpace(receiptImagePath))
                return;

            if (receiptImagePath.IndexOf(SaleReceiptImagesRelativeFolder, StringComparison.OrdinalIgnoreCase) < 0)
                return;

            string fileName = Path.GetFileName(receiptImagePath);
            if (string.IsNullOrWhiteSpace(fileName))
                return;

            string folderPath = GetSaleReceiptImagesFolderPath();
            string fullFilePath = Path.Combine(folderPath, fileName);

            if (System.IO.File.Exists(fullFilePath))
            {
                System.IO.File.Delete(fullFilePath);
            }
        }

        private async Task<(decimal BaseQuantity, decimal UnitPrice)?> GetSaleTermsAsync(int productId, int unitId)
        {
            var product = await _db.Products.AsNoTracking().Include(p => p.ProductPrices)
                .FirstOrDefaultAsync(p => p.Id == productId);
            if (product is null) return null;
            if (product.UnitId == unitId) return (1m, product.SalePrice ?? product.UnitPrice);
            var package = product.ProductPrices.FirstOrDefault(p => p.UnitId == unitId);
            return package is null ? null : (package.BaseQuantity, package.PerUnitPrice);
        }

        // Hard-blocks selling an already-expired batch, and (unless the
        // caller opts out via AllowOutOfOrderBatch) enforces FEFO: rejects
        // the sale if a batch of the same product with an earlier expiry
        // date still has stock. Defense-in-depth for the UI's own filtering
        // — this runs no matter which screen or client submitted the sale.
        // Returns null when the batch is OK to sell from, or an error
        // message describing why it isn't.
        private async Task<string?> ValidateExpiryAndFefoAsync(ProductStock stock, bool allowOutOfOrderBatch)
        {
            var today = DateOnly.FromDateTime(DateTime.Today);

            if (stock.ExpiryDate <= today)
                return $"Batch {stock.BatchNumber} of this product expired on {stock.ExpiryDate:yyyy-MM-dd} and cannot be sold.";

            if (!allowOutOfOrderBatch)
            {
                var earlierBatch = await _db.ProductStocks
                    .Where(s => s.ProductId == stock.ProductId
                        && s.WarehouseId == stock.WarehouseId
                        && s.Id != stock.Id
                        && s.AvailableQuantity > 0
                        && s.ExpiryDate > today
                        && s.ExpiryDate < stock.ExpiryDate)
                    .OrderBy(s => s.ExpiryDate)
                    .Select(s => new { s.BatchNumber, s.ExpiryDate })
                    .FirstOrDefaultAsync();

                if (earlierBatch is not null)
                    return $"Batch {stock.BatchNumber} (exp {stock.ExpiryDate:yyyy-MM-dd}) was selected, but batch {earlierBatch.BatchNumber} (exp {earlierBatch.ExpiryDate:yyyy-MM-dd}) expires sooner and still has stock. Sell that batch first (FEFO), or resubmit this line with allowOutOfOrderBatch to override.";
            }

            return null;
        }

        /// <summary>
        /// The single source of truth for "which PaymentMethods row backs this
        /// name" — replaces the old hardcoded Cash/Card/Mobile Banking switch,
        /// which silently posted anything else to the Cash account (1000) and
        /// couldn't see methods added later via the Payment Methods screen.
        /// </summary>
        private async Task<PaymentMethod?> GetActivePaymentMethodAsync(string paymentMethod) =>
            await _db.PaymentMethods.AsNoTracking()
                .FirstOrDefaultAsync(p => p.Name == paymentMethod && p.IsActive);

        private async Task<decimal> GetCurrentSalePriceAsync(int productId)
        {
            var product = await _db.Products.FindAsync(productId);
            return product is null ? 0m : (product.SalePrice ?? product.UnitPrice);
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

        private async Task<bool> IsMainWarehouseStockAsync(int warehouseId)
        {
            var mainWarehouses = await _db.Warehouses
                .Where(w => w.IsActive && w.WarehouseType.Name == "Main")
                .Select(w => new { w.Id, w.Name })
                .ToListAsync();

            var selectedMainWarehouse = mainWarehouses
                .FirstOrDefault(w => w.Name.Trim().ToLower() == "main warehouse")
                ?? (mainWarehouses.Count == 1 ? mainWarehouses[0] : null);

            return selectedMainWarehouse?.Id == warehouseId;
        }

        private static SaleReadDto ToDto(Sale s, decimal returnedAmount = 0)
        {
            var netAmount = s.TotalAmount - s.Discount;
            var totalPaid = s.IsPaid == true && s.Payments.Count == 0 ? netAmount : s.Payments.Sum(p => p.Amount);
            var dueAmount = Math.Max(0m, netAmount - returnedAmount - totalPaid);
            return new SaleReadDto
            {
                SaleId = s.SaleId,
                InvoiceNo = s.InvoiceNo,
                CustomerId = s.CustomerId,
                CustomerName = s.Customer is null ? null : $"{s.Customer.FirstName} {s.Customer.LastName}".Trim(),
                CustomerPhone = s.Customer?.Phone,
                CashierName = s.CashierName,
                TermsAndConditions = s.TermsAndConditions,
                SaleDate = s.SaleDate,
                TotalAmount = s.TotalAmount,
                Discount = s.Discount,
                NetAmount = netAmount,
                PaymentMethod = s.PaymentMethod,
                CashierId = s.CashierId,
                IsPaid = dueAmount == 0m,
                IsVoided = s.IsVoided,
                VoidReason = s.VoidReason,
                VoidedAt = s.VoidedAt,
                TotalPaid = totalPaid,
                DueAmount = dueAmount,
                ReturnedAmount = returnedAmount,
                HasReturns = returnedAmount > 0,
                ReceiptImagePath = s.ReceiptImagePath,
                ReceiptImageContentType = s.ReceiptImageContentType,
                RequiresPrescription = s.RequiresPrescription,
                PrescriptionId = s.PrescriptionId,
                PrescriptionImagePath = s.Prescription?.ImagePath,
                Items = s.Items.Select(i => new SaleItemReadDto
                {
                    SaleItemId = i.SaleItemId,
                    ProductStockId = i.ProductStockId,
                    ProductId = i.ProductStocks?.Product?.Id ?? 0,
                    ProductName = i.ProductStocks?.Product?.ProductName,
                    ProductImagePath = i.ProductStocks?.Product?.ImagePath,
                    BatchNumber = i.ProductStocks?.BatchNumber,
                    ManufacturingDate = i.ProductStocks?.ManufacturingDate,
                    UnitId = i.UnitId,
                    UnitName = i.Unit?.Name,
                    Quantity = i.Quantity,
                    BaseQuantity = i.BaseQuantity,
                    UnitPrice = i.UnitPrice,
                    TotalPrice = i.TotalPrice
                }).ToList()
            };
        }
    }
}
