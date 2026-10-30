using System.Security.Cryptography;
using System.Text;
using WaterWatch.Api.Errors;

namespace WaterWatch.Api.Services;

public sealed class ResidentUploadCapability(IConfiguration configuration)
{
    public const string CookieName = "ww_incident_upload";
    public static readonly TimeSpan Lifetime = TimeSpan.FromHours(2);

    public string Create(Guid incidentId)
    {
        var key = Key();
        var expires = DateTimeOffset.UtcNow.Add(Lifetime).ToUnixTimeSeconds();
        var payload = $"{incidentId:N}.{expires}";
        var signature = HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(payload));
        return $"{payload}.{Convert.ToBase64String(signature).TrimEnd('=').Replace('+', '-').Replace('/', '_')}";
    }

    public bool IsValid(Guid incidentId, string? token)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 200) return false;
        var parts = token.Split('.');
        if (parts.Length != 3 || !Guid.TryParseExact(parts[0], "N", out var scopedId) ||
            scopedId != incidentId || !long.TryParse(parts[1], out var expires) ||
            DateTimeOffset.UtcNow.ToUnixTimeSeconds() > expires)
            return false;
        try
        {
            var supplied = Convert.FromBase64String(parts[2].Replace('-', '+').Replace('_', '/') + new string('=', (4 - parts[2].Length % 4) % 4));
            var payload = $"{parts[0]}.{parts[1]}";
            var expected = HMACSHA256.HashData(Key(), Encoding.UTF8.GetBytes(payload));
            return CryptographicOperations.FixedTimeEquals(expected, supplied);
        }
        catch (FormatException) { return false; }
    }

    public void EnsureConfigured() => _ = Key();

    private byte[] Key()
    {
        var value = configuration["Storage:UploadCapabilityKey"];
        if (string.IsNullOrWhiteSpace(value) || Encoding.UTF8.GetByteCount(value) < 32)
            throw new IncidentWorkflowException(503, "Photo uploads are not configured on this service.");
        return Encoding.UTF8.GetBytes(value);
    }
}
