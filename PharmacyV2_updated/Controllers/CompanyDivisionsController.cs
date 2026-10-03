using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;
using PharmacyV2.DTOs;
using PharmacyV2.Models.Product;

namespace PharmacyV2.Controllers;

[Authorize]
[ApiController]
[Route("api/companies/{companyId:int}/divisions")]
public sealed class CompanyDivisionsController : ControllerBase
{
    private readonly PharmacyDbContext _db;
    public CompanyDivisionsController(PharmacyDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<IEnumerable<CompanyDivisionReadDto>>> GetAll(int companyId)
    {
        if (!await _db.Companies.AnyAsync(c => c.Id == companyId)) return NotFound();
        return Ok(await _db.CompanyDivisions.AsNoTracking()
            .Where(d => d.CompanyId == companyId)
            .OrderBy(d => d.Name)
            .Select(d => new CompanyDivisionReadDto { Id = d.Id, CompanyId = d.CompanyId, Name = d.Name })
            .ToListAsync());
    }

    [Authorize(Roles = "Admin,Manager")]
    [HttpPost]
    public async Task<ActionResult<CompanyDivisionReadDto>> Create(int companyId, CompanyDivisionWriteDto dto)
    {
        if (!await _db.Companies.AnyAsync(c => c.Id == companyId)) return NotFound(new ApiError("Company not found."));
        var name = dto.Name.Trim();
        if (string.IsNullOrWhiteSpace(name)) return BadRequest(new ApiError("Division name is required."));
        if (await _db.CompanyDivisions.AnyAsync(d => d.CompanyId == companyId && d.Name.ToLower() == name.ToLower()))
            return Conflict(new ApiError($"Division '{name}' already exists for this company."));

        var division = new CompanyDivision { CompanyId = companyId, Name = name };
        _db.CompanyDivisions.Add(division);
        await _db.SaveChangesAsync();
        return Ok(new CompanyDivisionReadDto { Id = division.Id, CompanyId = division.CompanyId, Name = division.Name });
    }

    [Authorize(Roles = "Admin,Manager")]
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int companyId, int id, CompanyDivisionWriteDto dto)
    {
        var division = await _db.CompanyDivisions.FirstOrDefaultAsync(d => d.Id == id && d.CompanyId == companyId);
        if (division is null) return NotFound(new ApiError("Division not found for this company."));
        var name = dto.Name.Trim();
        if (string.IsNullOrWhiteSpace(name)) return BadRequest(new ApiError("Division name is required."));
        if (await _db.CompanyDivisions.AnyAsync(d => d.CompanyId == companyId && d.Id != id && d.Name.ToLower() == name.ToLower()))
            return Conflict(new ApiError($"Division '{name}' already exists for this company."));
        division.Name = name;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int companyId, int id)
    {
        var division = await _db.CompanyDivisions.FirstOrDefaultAsync(d => d.Id == id && d.CompanyId == companyId);
        if (division is null) return NotFound(new ApiError("Division not found for this company."));
        if (await _db.ProductGroups.AnyAsync(g => g.CompanyDivisionId == id))
            return Conflict(new ApiError("Cannot delete a division assigned to a product group."));
        _db.CompanyDivisions.Remove(division);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
