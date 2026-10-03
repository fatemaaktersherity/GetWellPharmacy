using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;
using PharmacyV2.DTOs;
using PharmacyV2.Models.Product;
using System.Security.Claims;
using PharmacyV2.Services;
using PharmacyV2.Enums;

namespace PharmacyV2.Controllers
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class ExpiredProductStocksController : ControllerBase
    {
        public const decimal ApprovalThreshold = 5000m;

        private readonly PharmacyDbContext _db;
        private readonly IAccountingPostingService _accounting;

        public ExpiredProductStocksController(PharmacyDbContext db, IAccountingPostingService accounting)
        {
            _db = db;
            _accounting = accounting;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<ExpiredProductStockReadDto>>> GetAll(
            [FromQuery] int? warehouseId, [FromQuery] int? productId, [FromQuery] string? status)
        {
            var query = _db.ExpiredProductStocks
                .AsNoTracking()
                .Include(e => e.Product)
                .Include(e => e.ProductStock)
                .Include(e => e.Warehouse)
                .Include(e => e.RequestedBy)
                .Include(e => e.ApprovedBy)
                .AsQueryable();

            if (warehouseId is not null)
                query = query.Where(e => e.WarehouseId == warehouseId);
            if (productId is not null)
                query = query.Where(e => e.ProductId == productId);
            if (!string.IsNullOrWhiteSpace(status))
                query = query.Where(e => e.ApprovalStatus == status);

            var records = await query
                .OrderByDescending(e => e.DisposalDate)
                .Select(e => MapToReadDto(e))
                .ToListAsync();

            return Ok(records);
        }

        [HttpGet("approval-threshold")]
        public ActionResult<decimal> GetApprovalThreshold() => Ok(ApprovalThreshold);

        [HttpGet("{id:int}")]
        public async Task<ActionResult<ExpiredProductStockReadDto>> GetById(int id)
        {
            var record = await _db.ExpiredProductStocks
                .AsNoTracking()
                .Include(e => e.Product)
                .Include(e => e.ProductStock)
                .Include(e => e.Warehouse)
                .Include(e => e.RequestedBy)
                .Include(e => e.ApprovedBy)
                .FirstOrDefaultAsync(e => e.Id == id);

            if (record is null)
                return NotFoundResponse($"Expired stock record {id} not found.");

            if (record.DisposalMethod == "Damaged" && record.ApprovalStatus == "PendingApproval" &&
                !User.IsInRole("Admin") && !User.IsInRole("Manager"))
                return Forbid();

            return Ok(MapToReadDto(record));
        }

        [HttpPost]
        public async Task<ActionResult<ExpiredProductStockReadDto>> Create([FromBody] ExpiredProductStockCreateDto dto)
        {
            if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var requestedByUserId))
                return Unauthorized();
            var isDamageReport = string.Equals(dto.DisposalMethod, "Damaged", StringComparison.OrdinalIgnoreCase);
            if (isDamageReport && !User.IsInRole("Admin") && !User.IsInRole("Manager") && !User.IsInRole("Cashier"))
                return Forbid();
            if (!isDamageReport && !User.IsInRole("Admin") && !User.IsInRole("Manager"))
                return Forbid();
            var stock = await _db.ProductStocks.FirstOrDefaultAsync(s => s.Id == dto.ProductStockId);
            if (stock is null)
                return BadRequestResponse($"Product stock batch {dto.ProductStockId} does not exist.");

            if (!string.Equals(dto.DisposalMethod, "Damaged", StringComparison.OrdinalIgnoreCase) && stock.ExpiryDate > DateOnly.FromDateTime(DateTime.Today))
                return BadRequestResponse($"Batch '{stock.BatchNumber}' has not expired yet (expires {stock.ExpiryDate:yyyy-MM-dd}).");

            if (dto.Quantity > stock.AvailableQuantity)
                return BadRequestResponse($"Disposal quantity ({dto.Quantity}) exceeds available quantity in this batch ({stock.AvailableQuantity}).");

            var totalCost = dto.Quantity * stock.UnitCost;
            // Every damage report requires an explicit approval, regardless of value.
            // Expired stock disposal retains its configured threshold behavior.
            var needsApproval = isDamageReport || totalCost > ApprovalThreshold;

            var record = new ExpiredProductStock
            {
                ProductId = stock.ProductId,
                ProductStockId = stock.Id,
                WarehouseId = stock.WarehouseId,
                Quantity = dto.Quantity,
                UnitCost = stock.UnitCost,
                TotalCost = totalCost,
                DisposalMethod = dto.DisposalMethod,
                DisposalDate = DateTime.Now,
                RequestedByUserId = requestedByUserId,
                Note = dto.Note,
                ApprovalStatus = needsApproval ? "PendingApproval" : "Approved",
            };

            if (!needsApproval)
            {
                record.ApprovedByUserId = requestedByUserId;
                record.ApprovedDate = DateTime.Now;
                stock.AvailableQuantity -= dto.Quantity;
            }

            _db.ExpiredProductStocks.Add(record);
            await _db.SaveChangesAsync();

            if (!needsApproval)
            {
                await _accounting.PostAsync(LedgerSourceType.Adjustment, record.Id, record.DisposalDate, $"{dto.DisposalMethod}: {stock.BatchNumber}",
                    ("5100", record.TotalCost, 0), ("1200", 0, record.TotalCost));

                await RecomputeStockQuantityAsync(stock.ProductId);
                await _db.SaveChangesAsync();
            }

            await _db.Entry(record).Reference(e => e.Product).LoadAsync();
            await _db.Entry(record).Reference(e => e.ProductStock).LoadAsync();
            await _db.Entry(record).Reference(e => e.Warehouse).LoadAsync();
            await _db.Entry(record).Reference(e => e.RequestedBy).LoadAsync();
            if (record.ApprovedByUserId is not null)
                await _db.Entry(record).Reference(e => e.ApprovedBy).LoadAsync();

            return CreatedAtAction(nameof(GetById), new { id = record.Id }, MapToReadDto(record));
        }

        [Authorize(Roles = "Admin,Manager")]
        [HttpPut("{id:int}")]
        public async Task<IActionResult> UpdateDamageReport(int id, [FromBody] ExpiredProductStockCreateDto dto)
        {
            var record = await _db.ExpiredProductStocks.FirstOrDefaultAsync(e => e.Id == id);
            if (record is null)
                return NotFoundResponse($"Damage report {id} not found.");
            if (record.DisposalMethod != "Damaged" || record.ApprovalStatus != "PendingApproval")
                return ConflictResponse("Only pending damage reports can be edited.");

            var stock = await _db.ProductStocks.FirstOrDefaultAsync(s => s.Id == dto.ProductStockId);
            if (stock is null)
                return BadRequestResponse($"Product stock batch {dto.ProductStockId} does not exist.");
            if (dto.Quantity > stock.AvailableQuantity)
                return BadRequestResponse($"Damage quantity ({dto.Quantity}) exceeds available quantity in this batch ({stock.AvailableQuantity}).");

            record.ProductId = stock.ProductId;
            record.ProductStockId = stock.Id;
            record.WarehouseId = stock.WarehouseId;
            record.Quantity = dto.Quantity;
            record.UnitCost = stock.UnitCost;
            record.TotalCost = dto.Quantity * stock.UnitCost;
            record.Note = dto.Note;

            await _db.SaveChangesAsync();
            return NoContent();
        }

        [Authorize(Roles = "Admin,Manager")]
        [HttpPost("{id:int}/approve")]
        public async Task<ActionResult<ExpiredProductStockReadDto>> Approve(int id)
        {
            if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var approverUserId))
                return Unauthorized();

            var record = await _db.ExpiredProductStocks.FirstOrDefaultAsync(e => e.Id == id);
            if (record is null)
                return NotFoundResponse($"Expired stock record {id} not found.");

            if (record.ApprovalStatus != "PendingApproval")
                return ConflictResponse($"Record {id} is '{record.ApprovalStatus}', not awaiting approval.");

            if (record.RequestedByUserId == approverUserId && !User.IsInRole("Admin") && record.DisposalMethod != "Damaged")
                return ConflictResponse("A Manager cannot approve their own disposal request. Ask another Manager or an Admin to approve it.");

            var stock = await _db.ProductStocks.FirstOrDefaultAsync(s => s.Id == record.ProductStockId);
            if (stock is null)
                return BadRequestResponse($"Product stock batch {record.ProductStockId} no longer exists.");
            if (record.Quantity > stock.AvailableQuantity)
                return ConflictResponse($"Disposal quantity ({record.Quantity}) exceeds this batch's current available quantity ({stock.AvailableQuantity}).");

            stock.AvailableQuantity -= record.Quantity;
            record.ApprovalStatus = "Approved";
            record.ApprovedByUserId = approverUserId;
            record.ApprovedDate = DateTime.Now;

            await _db.SaveChangesAsync();
            await _accounting.PostAsync(LedgerSourceType.Adjustment, record.Id, record.ApprovedDate.Value, $"{record.DisposalMethod}: {stock.BatchNumber}",
                ("5100", record.TotalCost, 0), ("1200", 0, record.TotalCost));

            await RecomputeStockQuantityAsync(stock.ProductId);
            await _db.SaveChangesAsync();

            await _db.Entry(record).Reference(e => e.Product).LoadAsync();
            await _db.Entry(record).Reference(e => e.ProductStock).LoadAsync();
            await _db.Entry(record).Reference(e => e.Warehouse).LoadAsync();
            await _db.Entry(record).Reference(e => e.RequestedBy).LoadAsync();
            await _db.Entry(record).Reference(e => e.ApprovedBy).LoadAsync();

            return Ok(MapToReadDto(record));
        }

        [Authorize(Roles = "Admin,Manager")]
        [HttpPost("{id:int}/reject")]
        public async Task<ActionResult<ExpiredProductStockReadDto>> Reject(int id, [FromBody] ExpiredProductStockRejectDto dto)
        {
            if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var approverUserId))
                return Unauthorized();

            var record = await _db.ExpiredProductStocks.FirstOrDefaultAsync(e => e.Id == id);
            if (record is null)
                return NotFoundResponse($"Expired stock record {id} not found.");

            if (record.ApprovalStatus != "PendingApproval")
                return ConflictResponse($"Record {id} is '{record.ApprovalStatus}', not awaiting approval.");

            if (record.RequestedByUserId == approverUserId && !User.IsInRole("Admin") && record.DisposalMethod != "Damaged")
                return ConflictResponse("A Manager cannot review their own disposal request. Ask another Manager or an Admin to review it.");

            record.ApprovalStatus = "Rejected";
            record.ApprovedByUserId = approverUserId;
            record.ApprovedDate = DateTime.Now;
            record.RejectionReason = dto.Reason;

            await _db.SaveChangesAsync();

            await _db.Entry(record).Reference(e => e.Product).LoadAsync();
            await _db.Entry(record).Reference(e => e.ProductStock).LoadAsync();
            await _db.Entry(record).Reference(e => e.Warehouse).LoadAsync();
            await _db.Entry(record).Reference(e => e.RequestedBy).LoadAsync();
            await _db.Entry(record).Reference(e => e.ApprovedBy).LoadAsync();

            return Ok(MapToReadDto(record));
        }

        [Authorize(Roles = "Admin,Manager")]
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var record = await _db.ExpiredProductStocks.FirstOrDefaultAsync(e => e.Id == id);
            if (record is null)
                return NotFoundResponse($"Expired stock record {id} not found.");

            if (record.ApprovalStatus == "Approved")
            {
                var stock = await _db.ProductStocks.FirstOrDefaultAsync(s => s.Id == record.ProductStockId);
                if (stock is not null)
                    stock.AvailableQuantity += record.Quantity;
            }

            _db.ExpiredProductStocks.Remove(record);
            await _db.SaveChangesAsync();

            await RecomputeStockQuantityAsync(record.ProductId);
            await _db.SaveChangesAsync();

            return NoContent();
        }

        private async Task RecomputeStockQuantityAsync(int productId)
        {
            var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == productId);
            if (product is null) return;

            var total = await _db.ProductStocks
                .Where(s => s.ProductId == productId)
                .SumAsync(s => (decimal?)s.AvailableQuantity) ?? 0;

            product.StockQuantity = (int)total;
        }

        private static ExpiredProductStockReadDto MapToReadDto(ExpiredProductStock e) => new()
        {
            Id = e.Id,
            ProductId = e.ProductId,
            ProductName = e.Product?.ProductName ?? string.Empty,
            ProductStockId = e.ProductStockId,
            BatchNumber = e.ProductStock?.BatchNumber ?? string.Empty,
            ExpiryDate = e.ProductStock?.ExpiryDate ?? default,
            WarehouseId = e.WarehouseId,
            WarehouseName = e.Warehouse?.Name ?? string.Empty,
            Quantity = e.Quantity,
            UnitCost = e.UnitCost,
            TotalCost = e.TotalCost,
            DisposalMethod = e.DisposalMethod,
            DisposalDate = e.DisposalDate,
            RequestedByUserId = e.RequestedByUserId,
            RequestedByName = e.RequestedBy?.FullName ?? string.Empty,
            ApprovedByUserId = e.ApprovedByUserId,
            ApprovedByName = e.ApprovedBy?.FullName,
            ApprovedDate = e.ApprovedDate,
            ApprovalStatus = e.ApprovalStatus,
            RejectionReason = e.RejectionReason,
            Note = e.Note
        };

        private ActionResult NotFoundResponse(string message) => NotFound(new ApiError(message));
        private ActionResult BadRequestResponse(string message) => BadRequest(new ApiError(message));
        private ActionResult ConflictResponse(string message) => Conflict(new ApiError(message));
    }
}
