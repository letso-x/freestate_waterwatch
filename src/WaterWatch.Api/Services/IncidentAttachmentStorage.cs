using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using WaterWatch.Api.Errors;

namespace WaterWatch.Api.Services;

public sealed class IncidentAttachmentStorage(IConfiguration configuration, IHttpClientFactory clients)
{
    public const string Bucket = "incident-evidence";

    public async Task StoreAsync(string path, byte[] bytes, string contentType, CancellationToken cancellationToken)
    {
        await EnsurePrivateBucketAsync(cancellationToken);
        using var request = new HttpRequestMessage(HttpMethod.Post, ObjectUri(path));
        AddCredentials(request);
        request.Headers.TryAddWithoutValidation("x-upsert", "false");
        request.Content = new ByteArrayContent(bytes);
        request.Content.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        using var response = await clients.CreateClient("EvidenceStorage").SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new IncidentWorkflowException(response.StatusCode == HttpStatusCode.Conflict ? 409 : 503,
                response.StatusCode == HttpStatusCode.Conflict ? "This photo was already stored." : "Photo storage is temporarily unavailable.");
    }

    public async Task<byte[]> RetrieveAsync(string path, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, ObjectUri(path));
        AddCredentials(request);
        using var response = await clients.CreateClient("EvidenceStorage").SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound)
            throw new IncidentWorkflowException(404, "This evidence photo is unavailable.");
        if (!response.IsSuccessStatusCode)
            throw new IncidentWorkflowException(503, "Photo storage is temporarily unavailable.");
        if (response.Content.Headers.ContentLength is > ImagePayloadValidator.MaximumBytes)
            throw new IncidentWorkflowException(503, "The stored evidence photo exceeds the allowed size.");
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var output = new MemoryStream();
        var buffer = new byte[81920];
        int read;
        while ((read = await stream.ReadAsync(buffer, cancellationToken)) > 0)
        {
            if (output.Length + read > ImagePayloadValidator.MaximumBytes)
                throw new IncidentWorkflowException(503, "The stored evidence photo exceeds the allowed size.");
            await output.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
        }
        return output.ToArray();
    }

    public async Task DeleteAsync(string path, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Delete, ObjectUri(path));
        AddCredentials(request);
        using var response = await clients.CreateClient("EvidenceStorage").SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode && response.StatusCode != HttpStatusCode.NotFound)
            throw new HttpRequestException($"Storage cleanup failed with HTTP {(int)response.StatusCode}.");
    }

    public void EnsureConfigured() => _ = Settings();

    private async Task EnsurePrivateBucketAsync(CancellationToken cancellationToken)
    {
        var (url, key) = Settings();
        using var check = new HttpRequestMessage(HttpMethod.Get, url + "/storage/v1/bucket/" + Bucket);
        AddCredentials(check, key);
        using var response = await clients.CreateClient("EvidenceStorage").SendAsync(check, cancellationToken);
        if (response.IsSuccessStatusCode)
        {
            using var current = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await System.Text.Json.JsonDocument.ParseAsync(current, cancellationToken: cancellationToken);
            if (!document.RootElement.TryGetProperty("public", out var isPublic) || isPublic.ValueKind != System.Text.Json.JsonValueKind.False)
                throw new IncidentWorkflowException(503, "The evidence storage bucket must be private.");
            return;
        }
        var missingBucket = response.StatusCode == HttpStatusCode.NotFound;
        if (response.StatusCode == HttpStatusCode.BadRequest)
        {
            using var error = await System.Text.Json.JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
            missingBucket = error.RootElement.TryGetProperty("code", out var code) && code.GetString() == "NoSuchBucket";
        }
        if (!missingBucket) throw new IncidentWorkflowException(503, "Photo storage is temporarily unavailable.");
        using var create = new HttpRequestMessage(HttpMethod.Post, url + "/storage/v1/bucket")
        {
            Content = JsonContent.Create(new
            {
                id = Bucket,
                name = Bucket,
                @public = false,
                file_size_limit = ImagePayloadValidator.MaximumBytes,
                allowed_mime_types = new[] { "image/jpeg", "image/png", "image/webp" }
            })
        };
        AddCredentials(create, key);
        using var created = await clients.CreateClient("EvidenceStorage").SendAsync(create, cancellationToken);
        if (!created.IsSuccessStatusCode)
            throw new IncidentWorkflowException(503, "Photo storage is temporarily unavailable.");
    }

    private Uri ObjectUri(string path)
    {
        var (baseUrl, _) = Settings();
        var escapedPath = string.Join('/', path.Split('/').Select(Uri.EscapeDataString));
        return new Uri(baseUrl.TrimEnd('/') + "/storage/v1/object/" + Bucket + "/" + escapedPath);
    }

    private void AddCredentials(HttpRequestMessage request)
    {
        var (_, key) = Settings();
        AddCredentials(request, key);
    }

    private static void AddCredentials(HttpRequestMessage request, string key)
    {
        request.Headers.TryAddWithoutValidation("apikey", key);
        if (!key.StartsWith("sb_secret_", StringComparison.Ordinal))
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
    }

    private (string Url, string Key) Settings()
    {
        var url = configuration["Storage:SupabaseUrl"]?.TrimEnd('/');
        var key = configuration["Storage:ServiceRoleKey"]?.Trim();
        if (!Uri.TryCreate(url, UriKind.Absolute, out var parsed) || parsed.Scheme != Uri.UriSchemeHttps || !string.IsNullOrEmpty(parsed.UserInfo) ||
            !string.IsNullOrEmpty(parsed.Query) || !string.IsNullOrEmpty(parsed.Fragment) || parsed.AbsolutePath != "/" ||
            string.IsNullOrWhiteSpace(key))
            throw new IncidentWorkflowException(503, "Photo storage is not configured on this service.");
        return (url!, key);
    }
}
