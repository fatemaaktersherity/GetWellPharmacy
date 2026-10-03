using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;
using PharmacyV2.Enums;
using PharmacyV2.Models.Purchase;

namespace PharmacyV2.Services;

/// <summary>Calculates purchase-order receipt progress from linked invoice lines.</summary>
public sealed class PurchaseOrderReceivingService(PharmacyDbContext db)
{
    public async Task<PurchaseOrderStatus> GetEffectiveStatusAsync(PurchaseOrder order)
    {
        // A linked invoice converts the order, regardless of its receiving or payment status.
        return await db.PurchaseInvoices.AnyAsync(i => i.PurchaseOrderId == order.Id)
            ? PurchaseOrderStatus.Converted
            : order.Status;
    }

    public async Task<Dictionary<(int ProductId, int UnitId), decimal>> GetReceivedQuantitiesAsync(
        int purchaseOrderId,
        int? excludingInvoiceId = null)
    {
        var lines = await db.PurchaseInvoiceItems
            .Where(i => i.PurchaseInvoice.PurchaseOrderId == purchaseOrderId &&
                        (!excludingInvoiceId.HasValue || i.PurchaseInvoiceId != excludingInvoiceId.Value))
            .Select(i => new { i.ProductId, i.UnitId, i.ReceivedQty })
            .ToListAsync();

        return lines
            .GroupBy(i => (i.ProductId, i.UnitId))
            .ToDictionary(g => g.Key, g => g.Sum(i => i.ReceivedQty));
    }

    public async Task<string?> ValidateIncomingAsync(
        int purchaseOrderId,
        IEnumerable<(int ProductId, int UnitId, decimal Quantity)> incoming,
        int? excludingInvoiceId = null)
    {
        var orderLines = await db.PurchaseOrderItems
            .Where(i => i.PurchaseOrderId == purchaseOrderId && !i.IsCancelled)
            .Select(i => new OrderLine(i.ProductId, i.UnitId, i.OrderQty))
            .ToListAsync();
        var ordered = orderLines
            .GroupBy(i => (i.ProductId, i.UnitId))
            .ToDictionary(g => g.Key, g => g.Sum(i => i.OrderQty));
        var received = await GetReceivedQuantitiesAsync(purchaseOrderId, excludingInvoiceId);
        var requested = incoming
            .GroupBy(i => (i.ProductId, i.UnitId))
            .ToDictionary(g => g.Key, g => g.Sum(i => i.Quantity));

        foreach (var (key, quantity) in requested)
        {
            if (!ordered.TryGetValue(key, out var orderedQuantity))
                return $"Product {key.ProductId} / unit {key.UnitId} is not an active line on this purchase order.";

            received.TryGetValue(key, out var receivedQuantity);
            var remaining = Math.Max(0, orderedQuantity - receivedQuantity);
            if (quantity > remaining)
                return $"Received quantity for product {key.ProductId} exceeds the remaining ordered quantity ({remaining:0.##}).";
        }

        return null;
    }

    private sealed record OrderLine(int ProductId, int UnitId, decimal OrderQty);
}
