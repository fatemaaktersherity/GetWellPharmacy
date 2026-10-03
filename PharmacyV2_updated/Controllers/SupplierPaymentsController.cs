using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;
using PharmacyV2.DTOs;
using PharmacyV2.Models.Payment;
using PharmacyV2.Models.Purchase;
using PharmacyV2.Services;
using PharmacyV2.Enums;

namespace PharmacyV2.Controllers
{
    // Master (SupplierPayment) + details (SupplierPaymentDetail) CRUD.
    // Each detail row allocates part of this payment voucher toward a
    // specific PurchaseInvoice. Every write here also keeps that invoice's
    // Due/PaymentStatus fields in sync — see RecalculateInvoiceDueAsync.
    // PurchaseInvoicesController.RecalculateTotalsAsync uses the exact same
    // formula, so the two controllers never disagree about an invoice's Due
    // no matter which one touched it last.
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class SupplierPaymentsController : ControllerBase
    {
        private readonly PharmacyDbContext _db;
        private readonly IAccountingPostingService _accounting;
        public SupplierPaymentsController(PharmacyDbContext db, IAccountingPostingService accounting) { _db = db; _accounting = accounting; }

        // GET api/supplierpayments?supplierId=3 — list vouchers, optionally by supplier.
        [HttpGet]
        public async Task<ActionResult<IEnumerable<SupplierPaymentReadDto>>> GetAll([FromQuery] int? supplierId)
        {
            var query = _db.SupplierPayments
                .Include(p => p.Supplier)
                .Include(p => p.Details).ThenInclude(d => d.PurchaseInvoice)
                .AsNoTracking().AsQueryable();
            if (supplierId is not null) query = query.Where(p => p.SupplierId == supplierId);

            var payments = await query.OrderByDescending(p => p.PaidDate).ToListAsync();
            return Ok(payments.Select(ToDto));
        }

        // GET api/supplierpayments/5
        [HttpGet("{id:int}")]
        public async Task<ActionResult<SupplierPaymentReadDto>> GetById(int id)
        {
            var payment = await _db.SupplierPayments
                .Include(p => p.Supplier)
                .Include(p => p.Details).ThenInclude(d => d.PurchaseInvoice)
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.Id == id);

            return payment is null ? NotFoundResponse($"Supplier payment {id} not found.") : Ok(ToDto(payment));
        }

        // POST api/supplierpayments — record a new payment voucher, header +
        // allocation rows in one call. Every PurchaseInvoiceId in Details
        // must belong to this same SupplierId, and each row's PaidAmount
        // can't exceed that invoice's current Due.
        [Authorize(Roles = "Admin,Manager")]
        [HttpPost]
        public async Task<ActionResult<SupplierPaymentReadDto>> Create([FromBody] SupplierPaymentCreateDto dto)
        {
            if (await _db.SupplierPayments.AnyAsync(p => p.PaidNo == dto.PaidNo))
                return ConflictResponse($"Paid No '{dto.PaidNo}' already exists.");

            if (!await _db.Suppliers.AnyAsync(s => s.SupplierId == dto.SupplierId))
                return BadRequestResponse($"Supplier {dto.SupplierId} does not exist.");

            var paymentMethod = await _db.PaymentMethods.AsNoTracking()
                .FirstOrDefaultAsync(method => method.Name == dto.PaymentMethod && method.IsActive);
            if (paymentMethod is null)
                return BadRequestResponse($"'{dto.PaymentMethod}' is not an active payment method.");
            if (string.IsNullOrWhiteSpace(paymentMethod.LedgerAccountCode))
                return BadRequestResponse($"Payment method '{dto.PaymentMethod}' has no ledger account configured.");

            var payment = new SupplierPayment
            {
                PaidNo = dto.PaidNo,
                PaidDate = dto.PaidDate,
                PaymentMethod = dto.PaymentMethod,
                SupplierId = dto.SupplierId,
                CreatedAt = DateTime.UtcNow,
                ReceiptImagePath = dto.ReceiptImagePath,
                ReceiptImage = dto.ReceiptImage,
                ReceiptImageContentType = dto.ReceiptImageContentType
            };

            var lineNo = 1;
            var touchedInvoiceIds = new List<int>();

            // Cache invoices we've already loaded in this request AND track a
            // running "remaining due" per invoice. This matters as soon as a
            // single voucher carries two or more detail rows against the SAME
            // invoice (installments split across lines): checking each row
            // against invoice.Due straight from the DB would let both rows
            // pass individually even though, added together, they overpay the
            // invoice — the DB value never moves until SaveChangesAsync, so a
            // naive per-row check can't see what earlier rows in this same
            // request already consumed. Tracking it in-memory closes that gap.
            var invoiceCache = new Dictionary<int, PurchaseInvoice>();
            var remainingDue = new Dictionary<int, decimal>();

            foreach (var detailDto in dto.Details)
            {
                if (!invoiceCache.TryGetValue(detailDto.PurchaseInvoiceId, out var invoice))
                {
                    invoice = await _db.PurchaseInvoices.FirstOrDefaultAsync(i => i.Id == detailDto.PurchaseInvoiceId);
                    if (invoice is null)
                        return BadRequestResponse($"Purchase invoice {detailDto.PurchaseInvoiceId} does not exist.");
                    if (invoice.SupplierId != dto.SupplierId)
                        return BadRequestResponse($"Purchase invoice {invoice.Id} belongs to a different supplier, not supplier {dto.SupplierId}.");

                    invoiceCache[invoice.Id] = invoice;
                    remainingDue[invoice.Id] = invoice.Due;
                }

                if (detailDto.PaidAmount > remainingDue[invoice.Id])
                    return ConflictResponse($"Paid amount {detailDto.PaidAmount} exceeds invoice {invoice.Id}'s available due of {remainingDue[invoice.Id]} (current due {invoice.Due}).");

                payment.Details.Add(new SupplierPaymentDetail
                {
                    PurchaseInvoiceId = detailDto.PurchaseInvoiceId,
                    LineNo = lineNo++,
                    TotalAmount = invoice.Total,
                    DueBeforePayment = remainingDue[invoice.Id],
                    PrePaid = detailDto.PrePaid,
                    PaidAmount = detailDto.PaidAmount
                });

                remainingDue[invoice.Id] -= detailDto.PaidAmount;
                touchedInvoiceIds.Add(invoice.Id);
            }

            payment.TotalAmount = payment.Details.Sum(d => d.PaidAmount);

            _db.SupplierPayments.Add(payment);
            await _db.SaveChangesAsync(); // needed first so Detail rows get real Ids / the invoice FK is satisfied

            foreach (var invoiceId in touchedInvoiceIds.Distinct())
                await RecalculateInvoiceDueAsync(invoiceId);
            await _db.SaveChangesAsync();
            await _accounting.PostAsync(LedgerSourceType.SupplierPayment, payment.Id, payment.PaidDate, $"Supplier payment {payment.PaidNo} — payment method: {paymentMethod.Name}",
                ("2000", payment.TotalAmount, 0), (paymentMethod.LedgerAccountCode, 0, payment.TotalAmount));
            await _db.SaveChangesAsync();

            await _db.Entry(payment).Reference(p => p.Supplier).LoadAsync();
            await _db.Entry(payment).Collection(p => p.Details).Query().Include(d => d.PurchaseInvoice).LoadAsync();

            return CreatedAtAction(nameof(GetById), new { id = payment.Id }, ToDto(payment));
        }

        // PUT api/supplierpayments/5 — header fields only (PaidNo/PaidDate,
        // receipt, and cancelling). Use the details endpoints below to
        // add/update/remove allocation rows.
        [Authorize(Roles = "Admin,Manager")]
        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] SupplierPaymentUpdateDto dto)
        {
            if (await _db.LedgerAccounts.AnyAsync(l => l.SourceType == LedgerSourceType.SupplierPayment && l.SourceId == id))
                return ConflictResponse("Posted supplier payments are immutable. Cancel through an accounting reversal instead.");
            var payment = await _db.SupplierPayments.Include(p => p.Details).FirstOrDefaultAsync(p => p.Id == id);
            if (payment is null) return NotFoundResponse($"Supplier payment {id} not found.");

            if (payment.IsCancelled && !dto.IsCancelled)
                return BadRequestResponse("A cancelled payment cannot be un-cancelled. Create a new voucher instead.");

            if (await _db.SupplierPayments.AnyAsync(p => p.PaidNo == dto.PaidNo && p.Id != id))
                return ConflictResponse($"Paid No '{dto.PaidNo}' already exists.");

            payment.PaidNo = dto.PaidNo;
            payment.PaidDate = dto.PaidDate;
            payment.PaymentMethod = dto.PaymentMethod;
            if (dto.ReceiptImagePath is not null) payment.ReceiptImagePath = dto.ReceiptImagePath;
            if (dto.ReceiptImage is not null) payment.ReceiptImage = dto.ReceiptImage;
            if (dto.ReceiptImageContentType is not null) payment.ReceiptImageContentType = dto.ReceiptImageContentType;

            var wasCancelled = payment.IsCancelled;
            payment.IsCancelled = dto.IsCancelled;
            await _db.SaveChangesAsync();

            // Just got cancelled -> every invoice this voucher touched needs
            // its Due restored (RecalculateInvoiceDueAsync automatically
            // excludes cancelled vouchers from the sum).
            if (!wasCancelled && dto.IsCancelled)
            {
                foreach (var invoiceId in payment.Details.Select(d => d.PurchaseInvoiceId).Distinct())
                    await RecalculateInvoiceDueAsync(invoiceId);
                await _db.SaveChangesAsync();
            }

            return NoContent();
        }

        // DELETE api/supplierpayments/5 — hard-deletes the voucher (details
        // cascade-delete with it) and restores Due on every invoice it had
        // touched. Prefer PUT with IsCancelled=true if you want to keep an
        // audit trail instead of erasing the voucher outright.
        [Authorize(Roles = "Admin")]
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            if (await _db.LedgerAccounts.AnyAsync(l => l.SourceType == LedgerSourceType.SupplierPayment && l.SourceId == id))
                return ConflictResponse("Posted supplier payments cannot be deleted. Cancel through an accounting reversal instead.");
            var payment = await _db.SupplierPayments.Include(p => p.Details).FirstOrDefaultAsync(p => p.Id == id);
            if (payment is null) return NotFoundResponse($"Supplier payment {id} not found.");

            var touchedInvoiceIds = payment.Details.Select(d => d.PurchaseInvoiceId).Distinct().ToList();

            _db.SupplierPayments.Remove(payment); // details cascade-delete with it
            await _db.SaveChangesAsync();

            foreach (var invoiceId in touchedInvoiceIds)
                await RecalculateInvoiceDueAsync(invoiceId);
            await _db.SaveChangesAsync();

            return NoContent();
        }

        // POST api/supplierpayments/5/receipt-image — upload/replace the
        // receipt image as an actual file (multipart/form-data). Kept at
        // original resolution (not resized like profile/logo photos) since
        // this is a scanned bank slip / receipt that needs to stay legible.
        // In Postman: Body -> form-data -> key "file", type "File".
        [Authorize(Roles = "Admin,Manager")]
        [HttpPost("{id:int}/receipt-image")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> UploadReceiptImage(int id, IFormFile file)
        {
            var payment = await _db.SupplierPayments.FirstOrDefaultAsync(p => p.Id == id);
            if (payment is null) return NotFoundResponse($"Supplier payment {id} not found.");

            if (file is null || file.Length == 0)
                return BadRequestResponse("No file was uploaded. Send it as form-data with key 'file'.");

            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);
            payment.ReceiptImage = ms.ToArray();
            payment.ReceiptImageContentType = file.ContentType;

            await _db.SaveChangesAsync();
            return NoContent();
        }

        // ---------- Dedicated detail-row endpoints ----------

        // POST api/supplierpayments/5/details — allocate more of this
        // voucher toward another invoice.
        [HttpPost("{id:int}/details")]
        public async Task<ActionResult<SupplierPaymentDetailReadDto>> AddDetail(int id, [FromBody] SupplierPaymentDetailWriteDto dto)
        {
            var payment = await _db.SupplierPayments.Include(p => p.Details).FirstOrDefaultAsync(p => p.Id == id);
            if (payment is null) return NotFoundResponse($"Supplier payment {id} not found.");
            if (payment.IsCancelled) return BadRequestResponse("This payment voucher is cancelled.");

            var invoice = await _db.PurchaseInvoices.FirstOrDefaultAsync(i => i.Id == dto.PurchaseInvoiceId);
            if (invoice is null) return BadRequestResponse($"Purchase invoice {dto.PurchaseInvoiceId} does not exist.");
            if (invoice.SupplierId != payment.SupplierId)
                return BadRequestResponse($"Purchase invoice {invoice.Id} belongs to a different supplier, not supplier {payment.SupplierId}.");
            if (dto.PaidAmount > invoice.Due)
                return ConflictResponse($"Paid amount {dto.PaidAmount} exceeds invoice {invoice.Id}'s current due of {invoice.Due}.");

            var detail = new SupplierPaymentDetail
            {
                SupplierPaymentId = id,
                PurchaseInvoiceId = dto.PurchaseInvoiceId,
                LineNo = payment.Details.Count == 0 ? 1 : payment.Details.Max(d => d.LineNo) + 1,
                TotalAmount = invoice.Total,
                DueBeforePayment = invoice.Due,
                PrePaid = dto.PrePaid,
                PaidAmount = dto.PaidAmount
            };

            _db.SupplierPaymentDetails.Add(detail);
            payment.TotalAmount += detail.PaidAmount;
            await _db.SaveChangesAsync();

            await RecalculateInvoiceDueAsync(invoice.Id);
            await _db.SaveChangesAsync();

            return CreatedAtAction(nameof(GetById), new { id }, new SupplierPaymentDetailReadDto
            {
                Id = detail.Id,
                PurchaseInvoiceId = detail.PurchaseInvoiceId,
                InvoiceNo = invoice.InvoiceNo,
                LineNo = detail.LineNo,
                TotalAmount = detail.TotalAmount,
                DueBeforePayment = detail.DueBeforePayment,
                PrePaid = detail.PrePaid,
                PaidAmount = detail.PaidAmount
            });
        }

        // PUT api/supplierpayments/5/details/9 — change the amount (or, less
        // commonly, which invoice) a single allocation row covers.
        [Authorize(Roles = "Admin,Manager")]
        [HttpPut("{id:int}/details/{detailId:int}")]
        public async Task<IActionResult> UpdateDetail(int id, int detailId, [FromBody] SupplierPaymentDetailWriteDto dto)
        {
            var payment = await _db.SupplierPayments.FirstOrDefaultAsync(p => p.Id == id);
            if (payment is null) return NotFoundResponse($"Supplier payment {id} not found.");
            if (payment.IsCancelled) return BadRequestResponse("This payment voucher is cancelled.");

            var detail = await _db.SupplierPaymentDetails.FirstOrDefaultAsync(d => d.Id == detailId && d.SupplierPaymentId == id);
            if (detail is null) return NotFoundResponse($"Detail {detailId} not found for payment {id}.");

            var newInvoice = await _db.PurchaseInvoices.FirstOrDefaultAsync(i => i.Id == dto.PurchaseInvoiceId);
            if (newInvoice is null) return BadRequestResponse($"Purchase invoice {dto.PurchaseInvoiceId} does not exist.");
            if (newInvoice.SupplierId != payment.SupplierId)
                return BadRequestResponse($"Purchase invoice {newInvoice.Id} belongs to a different supplier, not supplier {payment.SupplierId}.");

            var oldInvoiceId = detail.PurchaseInvoiceId;

            // Validate against the invoice's due AS IF this row's current
            // amount weren't already counted, so editing a row's own amount
            // (without changing invoice) doesn't falsely trip "exceeds due".
            var dueAvailable = newInvoice.Id == oldInvoiceId
                ? newInvoice.Due + detail.PaidAmount
                : newInvoice.Due;
            if (dto.PaidAmount > dueAvailable)
                return ConflictResponse($"Paid amount {dto.PaidAmount} exceeds invoice {newInvoice.Id}'s available due of {dueAvailable}.");

            payment.TotalAmount += dto.PaidAmount - detail.PaidAmount;

            detail.PurchaseInvoiceId = dto.PurchaseInvoiceId;
            detail.TotalAmount = newInvoice.Total;
            detail.DueBeforePayment = newInvoice.Due;
            detail.PrePaid = dto.PrePaid;
            detail.PaidAmount = dto.PaidAmount;

            await _db.SaveChangesAsync();

            await RecalculateInvoiceDueAsync(oldInvoiceId);
            if (newInvoice.Id != oldInvoiceId)
                await RecalculateInvoiceDueAsync(newInvoice.Id);
            await _db.SaveChangesAsync();

            return NoContent();
        }

        // DELETE api/supplierpayments/5/details/9 — remove one allocation
        // row and restore the corresponding amount to the invoice's Due.
        [Authorize(Roles = "Admin")]
        [HttpDelete("{id:int}/details/{detailId:int}")]
        public async Task<IActionResult> RemoveDetail(int id, int detailId)
        {
            var payment = await _db.SupplierPayments.FirstOrDefaultAsync(p => p.Id == id);
            if (payment is null) return NotFoundResponse($"Supplier payment {id} not found.");

            var detail = await _db.SupplierPaymentDetails.FirstOrDefaultAsync(d => d.Id == detailId && d.SupplierPaymentId == id);
            if (detail is null) return NotFoundResponse($"Detail {detailId} not found for payment {id}.");

            var invoiceId = detail.PurchaseInvoiceId;

            payment.TotalAmount -= detail.PaidAmount;
            _db.SupplierPaymentDetails.Remove(detail);
            await _db.SaveChangesAsync();

            await RecalculateInvoiceDueAsync(invoiceId);
            await _db.SaveChangesAsync();

            return NoContent();
        }

        // ---------- helpers ----------

        // The single source of truth for an invoice's Due/PaymentStatus once
        // SupplierPayments exist: Due = Total - Advance - (sum of PaidAmount
        // across all non-cancelled allocations against it). Always recomputed
        // from scratch rather than incremented, so it can never drift no
        // matter what order operations happen in. PurchaseInvoicesController
        // uses this exact same formula in its own RecalculateTotalsAsync, so
        // editing an invoice's items later never erases a payment's effect.
        private async Task RecalculateInvoiceDueAsync(int invoiceId)
        {
            var invoice = await _db.PurchaseInvoices.FirstOrDefaultAsync(i => i.Id == invoiceId);
            if (invoice is null) return;

            var paidViaAllocations = await _db.SupplierPaymentDetails
                .Where(d => d.PurchaseInvoiceId == invoiceId && !d.SupplierPayment.IsCancelled)
                .SumAsync(d => (decimal?)d.PaidAmount) ?? 0m;

            invoice.Due = Math.Max(0, invoice.Total - invoice.Advance - paidViaAllocations);
            invoice.PaymentStatus = invoice.Due <= 0 ? "Complete" : "InComplete";
        }

        private ActionResult NotFoundResponse(string message) => NotFound(new ApiError(message));
        private ActionResult BadRequestResponse(string message) => BadRequest(new ApiError(message));
        private ActionResult ConflictResponse(string message) => Conflict(new ApiError(message));

        private static SupplierPaymentReadDto ToDto(SupplierPayment p) => new()
        {
            Id = p.Id,
            PaidNo = p.PaidNo,
            PaidDate = p.PaidDate,
            PaymentMethod = p.PaymentMethod,
            SupplierId = p.SupplierId,
            SupplierName = p.Supplier?.SupplierName,
            TotalAmount = p.TotalAmount,
            CreatedAt = p.CreatedAt,
            IsCancelled = p.IsCancelled,
            ReceiptImagePath = p.ReceiptImagePath,
            ReceiptImage = p.ReceiptImage,
            ReceiptImageContentType = p.ReceiptImageContentType,
            Details = p.Details.Select(d => new SupplierPaymentDetailReadDto
            {
                Id = d.Id,
                PurchaseInvoiceId = d.PurchaseInvoiceId,
                InvoiceNo = d.PurchaseInvoice?.InvoiceNo,
                LineNo = d.LineNo,
                TotalAmount = d.TotalAmount,
                DueBeforePayment = d.DueBeforePayment,
                PrePaid = d.PrePaid,
                PaidAmount = d.PaidAmount
            }).ToList()
        };
    }
}
