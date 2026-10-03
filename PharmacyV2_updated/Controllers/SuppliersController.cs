using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;
using PharmacyV2.DTOs;
using PharmacyV2.Models.People;

namespace PharmacyV2.Controllers
{
    // Master (Supplier) + details (SupplierContact) CRUD.
    // SupplierTypeId is the relational/dropdown field — SupplierType itself
    // has no controller, it's seeded lookup data (see PharmacyDbContext).
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class SuppliersController : ControllerBase
    {
        private readonly PharmacyDbContext _db;
        private readonly IWebHostEnvironment _env;

        // Same pattern as EmployeesController.EmployeeImagesRelativeFolder.
        private const string SupplierImagesRelativeFolder = "images/suppliers";

        public SuppliersController(PharmacyDbContext db, IWebHostEnvironment env)
        {
            _db = db;
            _env = env;
        }

        private string GetSupplierImagesFolderPath()
        {
            string webRoot = string.IsNullOrEmpty(_env.WebRootPath)
                ? Path.Combine(_env.ContentRootPath, "wwwroot")
                : _env.WebRootPath;

            string folderPath = Path.Combine(webRoot, "images", "suppliers");
            if (!Directory.Exists(folderPath))
                Directory.CreateDirectory(folderPath);

            return folderPath;
        }

        // GET api/suppliers?search=beximco — list suppliers, optionally filtered by name.
        [HttpGet]
        public async Task<ActionResult<IEnumerable<SupplierListItemDto>>> GetAll([FromQuery] string? search, [FromQuery] int? companyId)
        {
            var query = _db.Suppliers.AsNoTracking()
                .Include(s => s.SupplierType)
                .Include(s => s.Company)
                .Include(s => s.Contacts)
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(search))
                query = query.Where(s => s.SupplierName.Contains(search));

            if (companyId is not null)
                query = query.Where(s => s.CompanyId == companyId);

            var suppliers = await query
                .OrderBy(s => s.SupplierName)
               .Select(s => new SupplierListItemDto
               {
                   SupplierId = s.SupplierId,
                   SupplierName = s.SupplierName,
                   CompanyId = s.CompanyId,
                   CompanyName = s.Company != null ? s.Company.Name : null,
                   ContactPerson = s.ContactPerson,   // ADD THIS — missing here, present in GetAll
                   Phone = s.Phone,
                   Distributor = s.Distributor,
                   SupplierTypeId = s.SupplierTypeId,
                   SupplierTypeName = s.SupplierType.Name,
                   LogoPath = s.LogoPath,
                   Contacts = s.Contacts.Select(c => new SupplierContactReadDto
                   {
                       Id = c.Id,
                       ContactName = c.ContactName,
                       Designation = c.Designation,
                       Phone = c.Phone,
                       IsPrimary = c.IsPrimary
                   }).ToList()
               })
                .ToListAsync();

            return Ok(suppliers);
        }

        // GET api/suppliers/5
        [HttpGet("{id:int}")]
        public async Task<ActionResult<SupplierReadDto>> GetById(int id)
        {
            var supplier = await _db.Suppliers
                .AsNoTracking()
                .Include(s => s.SupplierType)
                .Include(s => s.Company)
                .Include(s => s.Contacts)
                .FirstOrDefaultAsync(s => s.SupplierId == id);

            if (supplier is null)
                return NotFoundResponse($"Supplier {id} not found.");

            return Ok(MapToReadDto(supplier));
        }

        // POST api/suppliers — register a new supplier.
        [Authorize(Roles = "Admin,Manager")]
        [HttpPost]
        public async Task<ActionResult<SupplierReadDto>> Create([FromBody] SupplierCreateDto dto)
        {
            var typeExists = await _db.SupplierTypes.AnyAsync(t => t.Id == dto.SupplierTypeId);
            if (!typeExists)
                return BadRequestResponse($"Supplier type {dto.SupplierTypeId} does not exist.");

            if (dto.CompanyId is not null && !await _db.Companies.AnyAsync(c => c.Id == dto.CompanyId))
                return BadRequestResponse($"Company {dto.CompanyId} does not exist.");

            var supplier = new Supplier
            {
                SupplierName = dto.SupplierName,
                CompanyId = dto.CompanyId,
                ContactPerson = dto.CompanyId is null && string.IsNullOrWhiteSpace(dto.ContactPerson)
                                    ? dto.SupplierName
                                    : dto.ContactPerson,
                Phone = dto.Phone,
                Email = dto.Email,
                Address = dto.Address,
                Distributor = dto.Distributor,
                OpeningBalance = dto.OpeningBalance,
                Logo = dto.Logo,
                LogoContentType = dto.LogoContentType,
                SupplierTypeId = dto.SupplierTypeId,
                // Client-supplied date/time wins if sent; otherwise default to now (UTC).
                CreatedAt = dto.CreatedAt ?? DateTime.UtcNow
            };

            if (dto.Contacts is { Count: > 0 })
            {
                foreach (var contactDto in dto.Contacts)
                {
                    supplier.Contacts.Add(new SupplierContact
                    {
                        ContactName = contactDto.ContactName,
                        Designation = contactDto.Designation,
                        Phone = contactDto.Phone,
                        IsPrimary = contactDto.IsPrimary
                    });
                }

                NormalizePrimaryContact(supplier.Contacts);
            }

            _db.Suppliers.Add(supplier);
            await _db.SaveChangesAsync();

            await _db.Entry(supplier).Reference(s => s.SupplierType).LoadAsync();
            if (supplier.CompanyId is not null)
                await _db.Entry(supplier).Reference(s => s.Company).LoadAsync();

            return CreatedAtAction(nameof(GetById), new { id = supplier.SupplierId }, MapToReadDto(supplier));
        }

        // PUT api/suppliers/5 — full update of master fields, with a full
        // add/update/delete sync of the Contacts collection.
        [Authorize(Roles = "Admin,Manager")]
        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] SupplierUpdateDto dto)
        {
            var supplier = await _db.Suppliers
                .Include(s => s.Contacts)
                .FirstOrDefaultAsync(s => s.SupplierId == id);

            if (supplier is null)
                return NotFoundResponse($"Supplier {id} not found.");

            var typeExists = await _db.SupplierTypes.AnyAsync(t => t.Id == dto.SupplierTypeId);
            if (!typeExists)
                return BadRequestResponse($"Supplier type {dto.SupplierTypeId} does not exist.");

            if (dto.CompanyId is not null && !await _db.Companies.AnyAsync(c => c.Id == dto.CompanyId))
                return BadRequestResponse($"Company {dto.CompanyId} does not exist.");

            supplier.SupplierName = dto.SupplierName;
            supplier.CompanyId = dto.CompanyId;
            supplier.ContactPerson = dto.CompanyId is null && string.IsNullOrWhiteSpace(dto.ContactPerson)
                                    ? dto.SupplierName
                                    : dto.ContactPerson;
            supplier.Phone = dto.Phone;
            supplier.Email = dto.Email;
            supplier.Address = dto.Address;
            supplier.Distributor = dto.Distributor;
            supplier.OpeningBalance = dto.OpeningBalance;
            if (dto.Logo is not null) supplier.Logo = dto.Logo;
            if (dto.LogoContentType is not null) supplier.LogoContentType = dto.LogoContentType;
            supplier.SupplierTypeId = dto.SupplierTypeId;

            // Only touch CreatedAt if the caller actually sent a value.
            if (dto.CreatedAt.HasValue)
                supplier.CreatedAt = dto.CreatedAt.Value;

            if (dto.Contacts is not null)
            {
                var incomingIds = dto.Contacts.Where(c => c.Id is > 0).Select(c => c.Id!.Value).ToHashSet();

                var toRemove = supplier.Contacts.Where(c => !incomingIds.Contains(c.Id)).ToList();
                foreach (var contact in toRemove)
                    supplier.Contacts.Remove(contact);

                foreach (var contactDto in dto.Contacts)
                {
                    if (contactDto.Id is > 0)
                    {
                        var existingContact = supplier.Contacts.FirstOrDefault(c => c.Id == contactDto.Id);
                        if (existingContact is null)
                            return BadRequestResponse($"Contact {contactDto.Id} does not belong to supplier {id}.");

                        existingContact.ContactName = contactDto.ContactName;
                        existingContact.Designation = contactDto.Designation;
                        existingContact.Phone = contactDto.Phone;
                        existingContact.IsPrimary = contactDto.IsPrimary;
                    }
                    else
                    {
                        supplier.Contacts.Add(new SupplierContact
                        {
                            ContactName = contactDto.ContactName,
                            Designation = contactDto.Designation,
                            Phone = contactDto.Phone,
                            IsPrimary = contactDto.IsPrimary
                        });
                    }
                }

                NormalizePrimaryContact(supplier.Contacts);
            }

            await _db.SaveChangesAsync();
            return NoContent();
        }

        // DELETE api/suppliers/5 — blocked once the supplier has purchase history;
        // contacts cascade-delete with the supplier otherwise.
        [Authorize(Roles = "Admin")]
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var supplier = await _db.Suppliers.FirstOrDefaultAsync(s => s.SupplierId == id);
            if (supplier is null)
                return NotFoundResponse($"Supplier {id} not found.");

            if (await _db.PurchaseInvoices.AnyAsync(p => p.SupplierId == id))
                return ConflictResponse("Cannot delete a supplier with existing purchase invoices.");

            _db.Suppliers.Remove(supplier);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // POST api/suppliers/5/logo — upload/replace the supplier's logo as a
        // real file (multipart/form-data). In Postman: Body -> form-data ->
        // key "file", type "File" -> pick an image from disk.
        [Authorize(Roles = "Admin,Manager")]
        [HttpPost("{id:int}/logo")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> UploadLogo(int id, IFormFile file)
        {
            var supplier = await _db.Suppliers.FindAsync(id);
            if (supplier is null) return NotFoundResponse($"Supplier {id} not found.");

            if (file is null || file.Length == 0)
                return BadRequestResponse("No file was uploaded. Send it as form-data with key 'file'.");

            string extension = Path.GetExtension(file.FileName);
            if (string.IsNullOrWhiteSpace(extension)) extension = ".jpg";

            string[] allowed = { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp" };
            if (!allowed.Contains(extension, StringComparer.OrdinalIgnoreCase))
                return BadRequestResponse("Unsupported image type. Allowed: jpg, jpeg, png, gif, webp, bmp.");

            string folderPath = GetSupplierImagesFolderPath();
            string fileName = id + "_" + Guid.NewGuid().ToString("N")[..8] + extension;
            string fullFilePath = Path.Combine(folderPath, fileName);

            using (var stream = System.IO.File.Create(fullFilePath))
                await file.CopyToAsync(stream);

            DeleteSupplierLogoFile(supplier.LogoPath);

            supplier.Logo = null; // stop keeping raw bytes in the DB now that we have a file on disk
            supplier.LogoContentType = file.ContentType;
            supplier.LogoPath = "/" + SupplierImagesRelativeFolder + "/" + fileName;

            await _db.SaveChangesAsync();
            return Ok(new { supplier.SupplierId, supplier.LogoPath });
        }

        // DELETE api/suppliers/5/logo
        [Authorize(Roles = "Admin,Manager")]
        [HttpDelete("{id:int}/logo")]
        public async Task<IActionResult> DeleteLogo(int id)
        {
            var supplier = await _db.Suppliers.FindAsync(id);
            if (supplier is null) return NotFoundResponse($"Supplier {id} not found.");

            DeleteSupplierLogoFile(supplier.LogoPath);

            supplier.Logo = null;
            supplier.LogoContentType = null;
            supplier.LogoPath = null;

            await _db.SaveChangesAsync();
            return NoContent();
        }

        // ---------- Dedicated detail-row endpoints ----------

        // POST api/suppliers/5/contacts
        [Authorize(Roles = "Admin,Manager")]
        [HttpPost("{supplierId:int}/contacts")]
        public async Task<ActionResult<SupplierContactReadDto>> AddContact(int supplierId, [FromBody] SupplierContactWriteDto dto)
        {
            var supplier = await _db.Suppliers.FirstOrDefaultAsync(s => s.SupplierId == supplierId);
            if (supplier is null)
                return NotFoundResponse($"Supplier {supplierId} not found.");

            var contact = new SupplierContact
            {
                SupplierId = supplierId,
                ContactName = dto.ContactName,
                Designation = dto.Designation,
                Phone = dto.Phone,
                IsPrimary = dto.IsPrimary
            };

            _db.SupplierContacts.Add(contact);
            await _db.SaveChangesAsync();

            if (contact.IsPrimary)
            {
                await ClearOtherPrimaryContactsAsync(supplierId, contact.Id);
                await _db.SaveChangesAsync();
            }

            return CreatedAtAction(nameof(GetById), new { id = supplierId }, MapContactToReadDto(contact));
        }

        // PUT api/suppliers/5/contacts/9
        [Authorize(Roles = "Admin,Manager")]
        [HttpPut("{supplierId:int}/contacts/{contactId:int}")]
        public async Task<IActionResult> UpdateContact(int supplierId, int contactId, [FromBody] SupplierContactWriteDto dto)
        {
            var contact = await _db.SupplierContacts
                .FirstOrDefaultAsync(c => c.Id == contactId && c.SupplierId == supplierId);

            if (contact is null)
                return NotFoundResponse($"Contact {contactId} not found for supplier {supplierId}.");

            contact.ContactName = dto.ContactName;
            contact.Designation = dto.Designation;
            contact.Phone = dto.Phone;
            contact.IsPrimary = dto.IsPrimary;

            await _db.SaveChangesAsync();
            if (contact.IsPrimary)
            {
                await ClearOtherPrimaryContactsAsync(supplierId, contact.Id);
                await _db.SaveChangesAsync();
            }
            return NoContent();
        }

        // DELETE api/suppliers/5/contacts/9
        [Authorize(Roles = "Admin")]
        [HttpDelete("{supplierId:int}/contacts/{contactId:int}")]
        public async Task<IActionResult> DeleteContact(int supplierId, int contactId)
        {
            var contact = await _db.SupplierContacts
                .FirstOrDefaultAsync(c => c.Id == contactId && c.SupplierId == supplierId);

            if (contact is null)
                return NotFoundResponse($"Contact {contactId} not found for supplier {supplierId}.");

            _db.SupplierContacts.Remove(contact);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // GET api/suppliers/by-company/5 — company-র অধীনে যত supplier আছে (Company
        // drill-down page + Purchase page-এর company-wise supplier column দুটোতেই ব্যবহার হবে)
        [HttpGet("by-company/{companyId:int}")]
        public async Task<ActionResult<IEnumerable<SupplierListItemDto>>> GetByCompany(int companyId)
        {
            if (!await _db.Companies.AnyAsync(c => c.Id == companyId))
                return NotFoundResponse($"Company {companyId} not found.");

            var suppliers = await _db.Suppliers.AsNoTracking()
                .Include(s => s.SupplierType).Include(s => s.Company).Include(s => s.Contacts)
                .Where(s => s.CompanyId == companyId)
                .OrderBy(s => s.SupplierName)
                .Select(s => new SupplierListItemDto
                {
                    SupplierId = s.SupplierId,
                    SupplierName = s.SupplierName,
                    CompanyId = s.CompanyId,
                    CompanyName = s.Company != null ? s.Company.Name : null,
                    ContactPerson = s.ContactPerson,
                    Phone = s.Phone,
                    Distributor = s.Distributor,
                    SupplierTypeId = s.SupplierTypeId,
                    SupplierTypeName = s.SupplierType.Name,
                    LogoPath = s.LogoPath,
                    Contacts = s.Contacts.Select(c => new SupplierContactReadDto
                    {
                        Id = c.Id,
                        ContactName = c.ContactName,
                        Designation = c.Designation,
                        Phone = c.Phone,
                        IsPrimary = c.IsPrimary
                    }).ToList()
                })
                .ToListAsync();

            return Ok(suppliers);
        }

        // ---------- helpers ----------

        private ActionResult NotFoundResponse(string message) => NotFound(new ApiError(message));
        private ActionResult BadRequestResponse(string message) => BadRequest(new ApiError(message));
        private ActionResult ConflictResponse(string message) => Conflict(new ApiError(message));

        private static void NormalizePrimaryContact(ICollection<SupplierContact> contacts)
        {
            var primaryContact = contacts.LastOrDefault(c => c.IsPrimary) ?? contacts.FirstOrDefault();
            foreach (var contact in contacts)
                contact.IsPrimary = ReferenceEquals(contact, primaryContact);
        }

        private async Task ClearOtherPrimaryContactsAsync(int supplierId, int keepContactId)
        {
            var others = await _db.SupplierContacts
                .Where(c => c.SupplierId == supplierId && c.Id != keepContactId && c.IsPrimary)
                .ToListAsync();
            foreach (var other in others)
                other.IsPrimary = false;
        }

        // Deletes the physical file behind a LogoPath, if any. Safe to call
        // with null/empty/unrelated paths — does nothing in that case.
        private void DeleteSupplierLogoFile(string? logoPath)
        {
            if (string.IsNullOrWhiteSpace(logoPath)) return;
            if (logoPath.IndexOf(SupplierImagesRelativeFolder, StringComparison.OrdinalIgnoreCase) < 0) return;

            string fileName = Path.GetFileName(logoPath);
            if (string.IsNullOrWhiteSpace(fileName)) return;

            string fullFilePath = Path.Combine(GetSupplierImagesFolderPath(), fileName);
            if (System.IO.File.Exists(fullFilePath))
                System.IO.File.Delete(fullFilePath);
        }

        private static SupplierReadDto MapToReadDto(Supplier supplier) => new()
        {
            SupplierId = supplier.SupplierId,
            SupplierName = supplier.SupplierName,
            CompanyId = supplier.CompanyId,
            CompanyName = supplier.Company?.Name,
            ContactPerson = supplier.ContactPerson,
            Phone = supplier.Phone,
            Email = supplier.Email,
            Address = supplier.Address,
            Distributor = supplier.Distributor,
            CreatedAt = supplier.CreatedAt,
            OpeningBalance = supplier.OpeningBalance,
            Logo = supplier.Logo,
            LogoContentType = supplier.LogoContentType,
            LogoPath = supplier.LogoPath,
            SupplierTypeId = supplier.SupplierTypeId,
            SupplierTypeName = supplier.SupplierType?.Name ?? string.Empty,
            Contacts = supplier.Contacts.Select(MapContactToReadDto).ToList()
        };

        private static SupplierContactReadDto MapContactToReadDto(SupplierContact contact) => new()
        {
            Id = contact.Id,
            ContactName = contact.ContactName,
            Designation = contact.Designation,
            Phone = contact.Phone,
            IsPrimary = contact.IsPrimary
        };
    }
}